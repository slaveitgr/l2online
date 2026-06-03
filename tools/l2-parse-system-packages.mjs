#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SYSTEM_DIR = join(ROOT, "system");
const OUT_DIR = join(ROOT, ".l2system-index", "packages");
const UE2_TAG = 0x9e2a83c1;
const UE2_TAG_BYTES = [0xc1, 0x83, 0x2a, 0x9e];

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

function sig(raw) {
  let out = "";
  for (let i = 0; i < 14 && i * 2 + 1 < raw.length; i++) {
    const c = raw[i * 2] | (raw[i * 2 + 1] << 8);
    if (c < 32 || c > 126) break;
    out += String.fromCharCode(c);
  }
  return out;
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
      if (!(bb & 0x80)) break;
      if (size >= 5) break;
    }
  }
  return [sign ? -val : val, size];
}

function decryptPackage(raw) {
  const signature = sig(raw);
  let start = signature.startsWith("Lineage2Ver") ? 28 : 0;
  const plainTag = raw.length >= 4 ? (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 : 0;
  if (plainTag === UE2_TAG) return { signature, encryption: "none", xorKey: 0, bytes: raw };
  const key = raw[start] ^ UE2_TAG_BYTES[0];
  const ok = [0, 1, 2, 3].every((i) => (raw[start + i] ^ key) === UE2_TAG_BYTES[i]);
  if (!ok) throw new Error(`UE2 XOR magic mismatch; signature=${signature || "(none)"}`);
  const dec = Buffer.alloc(raw.length - start);
  for (let i = 0; i < dec.length; i++) dec[i] = raw[start + i] ^ key;
  return { signature, encryption: "xor", xorKey: key, bytes: dec };
}

function parsePackage(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = dv.getUint32(0, true);
  if (tag !== UE2_TAG) throw new Error(`UE2 tag mismatch 0x${tag.toString(16)}`);
  const packageVersion = dv.getUint16(4, true);
  const licenseeVersion = dv.getUint16(6, true);
  const flags = dv.getUint32(8, true);
  const nameCount = dv.getUint32(12, true);
  const nameOffset = dv.getUint32(16, true);
  const exportCount = dv.getUint32(20, true);
  const exportOffset = dv.getUint32(24, true);
  const importCount = dv.getUint32(28, true);
  const importOffset = dv.getUint32(32, true);

  const names = [];
  let o = nameOffset;
  for (let i = 0; i < nameCount; i++) {
    const [len, s] = readCompat32(bytes, o);
    o += s;
    let name = "";
    if (len > 0 && o + len <= bytes.length) {
      name = bytes.subarray(o, o + len - 1).toString("latin1");
      o += len;
    }
    const nameFlags = o + 4 <= bytes.length ? dv.getUint32(o, true) : 0;
    o += 4;
    names.push({ name, flags: nameFlags });
  }

  const nm = (i) => (i >= 0 && i < names.length ? names[i].name : "?");

  const imports = [];
  o = importOffset;
  for (let i = 0; i < importCount; i++) {
    const [classPackage, s1] = readCompat32(bytes, o); o += s1;
    const [className, s2] = readCompat32(bytes, o); o += s2;
    const outer = dv.getInt32(o, true); o += 4;
    const [objectName, s3] = readCompat32(bytes, o); o += s3;
    imports.push({ classPackage: nm(classPackage), className: nm(className), outer, objectName: nm(objectName) });
  }

  const exports = [];
  const classHistogram = {};
  o = exportOffset;
  for (let i = 0; i < exportCount; i++) {
    const [idClass, s1] = readCompat32(bytes, o); o += s1;
    const [, s2] = readCompat32(bytes, o); o += s2;
    o += 4;
    const [idObjectName, s4] = readCompat32(bytes, o); o += s4;
    const exportFlags = dv.getUint32(o, true); o += 4;
    const [size, s5] = readCompat32(bytes, o); o += s5;
    let offset = 0;
    if (size > 0) {
      const [off, s6] = readCompat32(bytes, o); o += s6;
      offset = off;
    }
    let className = "Class";
    if (idClass < 0) className = imports[-idClass - 1]?.objectName ?? "?";
    else if (idClass > 0) className = exports[idClass - 1]?.objectName ?? "(export)";
    const objectName = nm(idObjectName);
    classHistogram[className] = (classHistogram[className] ?? 0) + 1;
    exports.push({ className, objectName, flags: exportFlags, size, offset });
  }

  return {
    packageVersion,
    licenseeVersion,
    flags,
    nameCount,
    importCount,
    exportCount,
    names: names.map((n) => n.name),
    imports,
    exports,
    classHistogram,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await walk(SYSTEM_DIR)).filter((f) => f.toLowerCase().endsWith(".u"));
  const summaries = [];
  for (const file of files) {
    const rel = relative(SYSTEM_DIR, file);
    try {
      const raw = await readFile(file);
      const dec = decryptPackage(raw);
      const parsed = parsePackage(dec.bytes);
      const summary = {
        path: rel,
        signature: dec.signature,
        encryption: dec.encryption,
        xorKey: dec.xorKey,
        packageVersion: parsed.packageVersion,
        licenseeVersion: parsed.licenseeVersion,
        nameCount: parsed.nameCount,
        importCount: parsed.importCount,
        exportCount: parsed.exportCount,
        classHistogram: parsed.classHistogram,
      };
      summaries.push(summary);
      await writeFile(join(OUT_DIR, `${basename(file)}.json`), JSON.stringify({ ...summary, parsed }, null, 2));
    } catch (err) {
      summaries.push({ path: rel, error: err.message });
    }
  }
  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summaries, null, 2));
  const totals = {
    packages: summaries.length,
    parsed: summaries.filter((s) => !s.error).length,
    failed: summaries.filter((s) => s.error).length,
    exports: summaries.reduce((n, s) => n + (s.exportCount ?? 0), 0),
    imports: summaries.reduce((n, s) => n + (s.importCount ?? 0), 0),
    names: summaries.reduce((n, s) => n + (s.nameCount ?? 0), 0),
  };
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
