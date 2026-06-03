#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = join(ROOT, ".l2system-index", "ui-textures");
const XDAT_DIR = join(ROOT, ".l2system-index", "xdat");
const UE2_TAG = 0x9e2a83c1;
const UE2_TAG_BYTES = [0xc1, 0x83, 0x2a, 0x9e];
const SKIP_DIRS = new Set([".git", ".l2system-index", "tools", "l2online"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function signature(raw) {
  let out = "";
  for (let i = 0; i < 14 && i * 2 + 1 < raw.length; i++) {
    const c = raw[i * 2] | (raw[i * 2 + 1] << 8);
    if (c < 32 || c > 126) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function decryptPackage(raw) {
  const sig = signature(raw);
  const start = sig.startsWith("Lineage2Ver") ? 28 : 0;
  const plainTag = raw.length >= 4 ? (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 : 0;
  if (plainTag === UE2_TAG) return raw;
  const key = raw[start] ^ UE2_TAG_BYTES[0];
  const ok = [0, 1, 2, 3].every((i) => (raw[start + i] ^ key) === UE2_TAG_BYTES[i]);
  if (!ok) throw new Error("UE2 XOR magic mismatch");
  const dec = Buffer.allocUnsafe(raw.length - start);
  for (let i = 0; i < dec.length; i++) dec[i] = raw[start + i] ^ key;
  return dec;
}

function readCompat32(b, off) {
  const b0 = b[off];
  const sign = b0 & 0x80;
  let val = b0 & 0x3f;
  let size = 1;
  if (b0 & 0x40) {
    let shift = 6;
    for (;;) {
      const bb = b[off + size];
      size++;
      val |= (bb & 0x7f) << shift;
      shift += 7;
      if (!(bb & 0x80) || size >= 5) break;
    }
  }
  return [sign ? -val : val, size];
}

function parseNames(bytes, dv, count, offset) {
  const names = [];
  let o = offset;
  for (let i = 0; i < count; i++) {
    const [len, s] = readCompat32(bytes, o);
    o += s;
    let name = "";
    if (len > 0 && o + len <= bytes.length) {
      name = bytes.subarray(o, o + len - 1).toString("latin1");
      o += len;
    } else if (len < 0 && o + -len * 2 <= bytes.length) {
      const chars = [];
      for (let c = 0; c < -len - 1; c++) chars.push(dv.getUint16(o + c * 2, true));
      name = String.fromCharCode(...chars);
      o += -len * 2;
    }
    o += 4;
    names.push(name);
  }
  return names;
}

function parsePackageExports(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = dv.getUint32(0, true);
  if (tag !== UE2_TAG) throw new Error(`UE2 tag mismatch 0x${tag.toString(16)}`);
  const nameCount = dv.getUint32(12, true);
  const nameOffset = dv.getUint32(16, true);
  const exportCount = dv.getUint32(20, true);
  const exportOffset = dv.getUint32(24, true);
  const importCount = dv.getUint32(28, true);
  const importOffset = dv.getUint32(32, true);
  const names = parseNames(bytes, dv, nameCount, nameOffset);
  const nm = (i) => (i >= 0 && i < names.length ? names[i] : "?");

  const imports = [];
  let o = importOffset;
  for (let i = 0; i < importCount; i++) {
    const [, s1] = readCompat32(bytes, o); o += s1;
    const [, s2] = readCompat32(bytes, o); o += s2;
    o += 4;
    const [objectName, s3] = readCompat32(bytes, o); o += s3;
    imports.push({ objectName: nm(objectName) });
  }

  const exports = [];
  o = exportOffset;
  for (let i = 0; i < exportCount; i++) {
    const [idClass, s1] = readCompat32(bytes, o); o += s1;
    const [, s2] = readCompat32(bytes, o); o += s2;
    o += 4;
    const [idObjectName, s4] = readCompat32(bytes, o); o += s4;
    const flags = dv.getUint32(o, true); o += 4;
    const [size, s5] = readCompat32(bytes, o); o += s5;
    let offset = 0;
    if (size > 0) {
      const [off, s6] = readCompat32(bytes, o); o += s6;
      offset = off;
    }
    let className = "Class";
    if (idClass < 0) className = imports[-idClass - 1]?.objectName ?? "?";
    else if (idClass > 0) className = exports[idClass - 1]?.objectName ?? "(export)";
    exports.push({ className, objectName: nm(idObjectName), flags, size, offset });
  }
  return exports;
}

function normalizeRef(texture) {
  if (!texture || !texture.includes(".")) return null;
  const parts = texture.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return {
    raw: texture,
    packageName: parts[0],
    groupPath: parts.slice(1, -1).join("."),
    objectName: parts.at(-1),
  };
}

function packageAliases(packageName) {
  const lower = packageName.toLowerCase();
  const aliases = [lower];
  if (lower === "ui_epic") aliases.push("l2ui_epic");
  if (lower === "ui_ct1" || lower === "2ui_ct1") aliases.push("l2ui_ct1");
  if (lower === "ui_newtex") aliases.push("l2ui_newtex");
  return aliases;
}

async function loadTextureRefs() {
  const files = (await readdir(XDAT_DIR)).filter((name) => name.endsWith(".controls-flat.json"));
  const refs = new Map();
  for (const name of files) {
    const parsed = JSON.parse(await readFile(join(XDAT_DIR, name), "utf8"));
    for (const control of parsed.controls ?? []) {
      const ref = normalizeRef(control.texture);
      if (!ref) continue;
      const key = `${ref.packageName.toLowerCase()}.${ref.objectName.toLowerCase()}`;
      const cur = refs.get(key) ?? { ...ref, count: 0, windows: {}, controls: [] };
      cur.count++;
      if (control.parent) cur.windows[control.parent] = (cur.windows[control.parent] ?? 0) + 1;
      if (cur.controls.length < 20) {
        cur.controls.push({ xdat: parsed.path, parent: control.parent, type: control.type, name: control.name });
      }
      refs.set(key, cur);
    }
  }
  return refs;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const refs = await loadTextureRefs();
  const utxFiles = (await walk(ROOT)).filter((file) => extname(file).toLowerCase() === ".utx");
  const exportIndex = new Map();
  const objectIndex = new Map();
  const packages = [];

  for (const file of utxFiles) {
    const packageName = basename(file, extname(file));
    try {
      const exports = parsePackageExports(decryptPackage(await readFile(file))).filter((e) => e.className === "Texture");
      packages.push({ path: relative(ROOT, file), packageName, textures: exports.length });
      for (const exp of exports) {
        const key = `${packageName.toLowerCase()}.${exp.objectName.toLowerCase()}`;
        const indexed = { packagePath: relative(ROOT, file), packageName, ...exp };
        exportIndex.set(key, indexed);
        const objectKey = exp.objectName.toLowerCase();
        const matches = objectIndex.get(objectKey) ?? [];
        matches.push(indexed);
        objectIndex.set(objectKey, matches);
      }
    } catch (err) {
      packages.push({ path: relative(ROOT, file), packageName, error: err.message });
    }
  }

  const textures = [...refs.values()]
    .map((ref) => {
      let match = null;
      for (const alias of packageAliases(ref.packageName)) {
        match = exportIndex.get(`${alias}.${ref.objectName.toLowerCase()}`) ?? null;
        if (match) break;
      }
      if (!match) {
        const objectMatches = objectIndex.get(ref.objectName.toLowerCase()) ?? [];
        if (objectMatches.length === 1) match = objectMatches[0];
      }
      return {
        ...ref,
        found: !!match,
        packagePath: match?.packagePath ?? null,
        export: match ? { className: match.className, objectName: match.objectName, size: match.size, offset: match.offset } : null,
        windows: Object.entries(ref.windows).sort((a, b) => b[1] - a[1]).slice(0, 25),
      };
    })
    .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw));

  const report = {
    generatedAt: new Date().toISOString(),
    xdatTextureRefs: textures.length,
    found: textures.filter((t) => t.found).length,
    missing: textures.filter((t) => !t.found).length,
    packages,
    topMissing: textures.filter((t) => !t.found).slice(0, 60),
    topUsed: textures.slice(0, 100),
  };

  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(textures, null, 2));
  await writeFile(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    xdatTextureRefs: report.xdatTextureRefs,
    found: report.found,
    missing: report.missing,
    topMissing: report.topMissing.slice(0, 25).map((t) => ({
      raw: t.raw,
      count: t.count,
      windows: t.windows.slice(0, 3),
    })),
    topUsed: report.topUsed.slice(0, 25).map((t) => ({
      raw: t.raw,
      count: t.count,
      found: t.found,
      packagePath: t.packagePath,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
