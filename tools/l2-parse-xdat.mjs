#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SYSTEM_DIR = join(ROOT, "system");
const OUT_DIR = join(ROOT, ".l2system-index", "xdat");

const CONTROL_TYPES = new Set([
  "Window",
  "Button",
  "Texture",
  "TextBox",
  "Text",
  "EditBox",
  "CheckBox",
  "StatusBar",
  "SliderCtrl",
  "ListCtrl",
  "RichListCtrl",
  "ScrollArea",
  "StatusIconCtrl",
  "Tab",
  "ProgressBar",
  "DrawPanel",
  "ItemWindow",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function readLenString(buf, off) {
  if (off >= buf.length) return null;
  const len = buf[off];
  if (len <= 0 || off + 1 + len > buf.length) return null;
  const raw = buf.subarray(off + 1, off + 1 + len);
  const nul = raw.indexOf(0);
  const text = raw.subarray(0, nul === -1 ? raw.length : nul).toString("utf8");
  if (!/^[\x20-\x7e]*$/.test(text)) return null;
  return { text, next: off + 1 + len, length: len };
}

function readControlString(buf, off) {
  if (off < 0 || off + 1 > buf.length) return null;
  const len = buf[off];
  if (len < 1 || off + 1 + len > buf.length) return null;
  let raw = buf.subarray(off + 1, off + 1 + len);
  if (raw.length && raw[raw.length - 1] === 0) raw = raw.subarray(0, raw.length - 1);
  const text = raw.toString("latin1");
  if (!/^[\x20-\x7e]+$/.test(text)) return null;
  return { text, next: off + 1 + len };
}

function plausibleRecordStart(buf, off) {
  const s = readLenString(buf, off);
  return !!s && s.text.length > 0;
}

function parseXdat(buf) {
  const count = buf.length >= 4 ? buf.readUInt32LE(0) : 0;
  const records = [];
  let off = 4;
  for (let i = 0; i < count && off < buf.length; i++) {
    const start = off;
    const primary = readLenString(buf, off);
    if (!primary) break;
    off = primary.next;
    const secondary = readLenString(buf, off);
    if (!secondary) break;
    off = secondary.next;

    const dataStart = off;
    let next = buf.length;
    for (let p = off; p < Math.min(buf.length, off + 64); p++) {
      if (plausibleRecordStart(buf, p)) {
        next = p;
        break;
      }
    }
    const data = buf.subarray(dataStart, next);
    const fields = [];
    for (let p = 0; p + 4 <= data.length; p += 4) fields.push(data.readUInt32LE(p));
    records.push({
      index: i,
      offset: start,
      primary: primary.text,
      secondary: secondary.text,
      rawDataHex: data.toString("hex"),
      fields,
    });
    off = next;
  }
  return { count, parsedRecords: records.length, records };
}

function controlAt(buf, off) {
  const type = readControlString(buf, off);
  if (!type || !CONTROL_TYPES.has(type.text)) return null;
  const name = readControlString(buf, type.next);
  if (!name) return null;
  return { type: type.text, name: name.text, fieldsStart: name.next };
}

function tokenizeControlFields(buf, start, end) {
  const tokens = [];
  let off = start;
  while (off < end) {
    const str = readControlString(buf, off);
    if (str && str.text.length >= 2) {
      tokens.push({ kind: "string", value: str.text, offset: off });
      off = str.next;
    } else if (off + 4 <= end) {
      tokens.push({ kind: "int32", value: buf.readInt32LE(off), offset: off });
      off += 4;
    } else {
      off += 1;
    }
  }
  return tokens;
}

function looksLikeTextureRef(value) {
  return value.includes(".") || /l2/i.test(value);
}

function parseControls(buf, start = 1000, end = buf.length) {
  const controls = [];
  let off = start;
  while (off < end) {
    const ctrl = controlAt(buf, off);
    if (!ctrl) {
      off += 1;
      continue;
    }

    let next = ctrl.fieldsStart;
    const limit = Math.min(end, ctrl.fieldsStart + 320);
    while (next < limit && !controlAt(buf, next)) next += 1;

    const tokens = tokenizeControlFields(buf, ctrl.fieldsStart, next);
    const strings = tokens
      .filter((token) => token.kind === "string" && token.value !== "undefined")
      .map((token) => token.value);
    const ints = tokens.filter((token) => token.kind === "int32").map((token) => token.value);
    const parent = strings[0] ?? null;
    let texture = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (token.kind === "string" && looksLikeTextureRef(token.value)) {
        texture = token.value;
        break;
      }
    }
    const dims = ints.filter((value) => value >= 1 && value <= 4096).slice(0, 4);
    const positions = ints.filter((value) => (value >= -20000 && value <= 20000) || value === -9999).slice(0, 8);

    controls.push({
      type: ctrl.type,
      name: ctrl.name,
      offset: off,
      parent,
      texture,
      dims,
      positions,
    });
    off = Math.max(next, ctrl.fieldsStart + 1);
  }
  return controls;
}

function groupControls(controls) {
  const byWindow = {};
  const byType = {};
  let textured = 0;
  for (const control of controls) {
    byType[control.type] = (byType[control.type] ?? 0) + 1;
    if (control.texture) textured++;
    if (!control.parent) continue;
    (byWindow[control.parent] ??= []).push({
      type: control.type,
      name: control.name,
      texture: control.texture,
      dims: control.dims,
      positions: control.positions,
      offset: control.offset,
    });
  }
  return { byWindow, byType, textured };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await walk(SYSTEM_DIR)).filter((f) => f.toLowerCase().endsWith(".xdat"));
  const summary = [];
  for (const file of files) {
    const buf = await readFile(file);
    const parsed = parseXdat(buf);
    const controls = parseControls(buf);
    const grouped = groupControls(controls);
    const rel = relative(SYSTEM_DIR, file);
    summary.push({
      path: rel,
      count: parsed.count,
      parsedRecords: parsed.parsedRecords,
      controls: controls.length,
      windows: Object.keys(grouped.byWindow).length,
      texturedControls: grouped.textured,
      controlTypes: grouped.byType,
    });
    await writeFile(join(OUT_DIR, `${basename(file)}.json`), JSON.stringify({ path: rel, ...parsed }, null, 2));
    await writeFile(join(OUT_DIR, `${basename(file)}.controls.json`), JSON.stringify(grouped.byWindow, null, 2));
    await writeFile(join(OUT_DIR, `${basename(file)}.controls-flat.json`), JSON.stringify({ path: rel, controls }, null, 2));
  }
  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ files: files.length, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
