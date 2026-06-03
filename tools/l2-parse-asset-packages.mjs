#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = join(ROOT, ".l2system-index", "asset-packages");
const UE2_TAG = 0x9e2a83c1;
const UE2_TAG_BYTES = [0xc1, 0x83, 0x2a, 0x9e];
const PACKAGE_EXTS = new Set([".unr", ".utx", ".usx", ".ukx", ".uax", ".umx"]);
const SKIP_DIRS = new Set([".git", ".l2system-index", "tools", "l2online"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && PACKAGE_EXTS.has(extname(entry.name).toLowerCase())) files.push(path);
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
  const sig = signature(raw);
  const start = sig.startsWith("Lineage2Ver") ? 28 : 0;
  const plainTag = raw.length >= 4 ? (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 : 0;
  if (plainTag === UE2_TAG) return { signature: sig, encryption: "none", xorKey: 0, bytes: raw };
  if (raw.length < start + 4) throw new Error(`too small; signature=${sig || "(none)"}`);
  const key = raw[start] ^ UE2_TAG_BYTES[0];
  const ok = [0, 1, 2, 3].every((i) => (raw[start + i] ^ key) === UE2_TAG_BYTES[i]);
  if (!ok) throw new Error(`UE2 XOR magic mismatch; signature=${sig || "(none)"}`);
  const dec = Buffer.allocUnsafe(raw.length - start);
  for (let i = 0; i < dec.length; i++) dec[i] = raw[start + i] ^ key;
  return { signature: sig, encryption: "xor", xorKey: key, bytes: dec };
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
    } else if (len < 0 && o + -len * 2 <= bytes.length) {
      const chars = [];
      for (let c = 0; c < -len - 1; c++) chars.push(dv.getUint16(o + c * 2, true));
      name = String.fromCharCode(...chars);
      o += -len * 2;
    }
    const nameFlags = o + 4 <= bytes.length ? dv.getUint32(o, true) : 0;
    o += 4;
    names.push({ name, flags: nameFlags });
  }

  const nm = (i) => (i >= 0 && i < names.length ? names[i].name : "?");

  const imports = [];
  const importPackages = {};
  o = importOffset;
  for (let i = 0; i < importCount; i++) {
    const [classPackage, s1] = readCompat32(bytes, o); o += s1;
    const [className, s2] = readCompat32(bytes, o); o += s2;
    const outer = dv.getInt32(o, true); o += 4;
    const [objectName, s3] = readCompat32(bytes, o); o += s3;
    const imp = { classPackage: nm(classPackage), className: nm(className), outer, objectName: nm(objectName) };
    imports.push(imp);
    if (imp.className === "Package") importPackages[imp.objectName] = (importPackages[imp.objectName] ?? 0) + 1;
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
    importPackages,
    classHistogram,
    topExports: exports
      .filter((e) => e.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 25)
      .map((e) => ({ className: e.className, objectName: e.objectName, size: e.size })),
  };
}

function topEntries(obj, n = 40) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = await walk(ROOT);
  const summaries = [];
  const byExt = {};
  const globalClasses = {};
  const globalImports = {};

  for (const file of files) {
    const rel = relative(ROOT, file);
    const ext = extname(file).toLowerCase();
    byExt[ext] = (byExt[ext] ?? 0) + 1;
    try {
      const raw = await readFile(file);
      const dec = decryptPackage(raw);
      const parsed = parsePackage(dec.bytes);
      for (const [k, v] of Object.entries(parsed.classHistogram)) globalClasses[k] = (globalClasses[k] ?? 0) + v;
      for (const [k, v] of Object.entries(parsed.importPackages)) globalImports[k] = (globalImports[k] ?? 0) + v;
      summaries.push({
        path: rel,
        ext,
        bytes: raw.length,
        signature: dec.signature,
        encryption: dec.encryption,
        xorKey: dec.xorKey,
        ...parsed,
      });
    } catch (err) {
      summaries.push({ path: rel, ext, error: err.message });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalFiles: summaries.length,
    parsed: summaries.filter((s) => !s.error).length,
    failed: summaries.filter((s) => s.error).length,
    byExt,
    totals: {
      names: summaries.reduce((n, s) => n + (s.nameCount ?? 0), 0),
      imports: summaries.reduce((n, s) => n + (s.importCount ?? 0), 0),
      exports: summaries.reduce((n, s) => n + (s.exportCount ?? 0), 0),
    },
    topClasses: topEntries(globalClasses, 60),
    topImportPackages: topEntries(globalImports, 60),
    failures: summaries.filter((s) => s.error),
  };

  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summaries, null, 2));
  await writeFile(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
