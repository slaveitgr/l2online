#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = join(ROOT, ".l2system-index", "terrain-collision-audit");
const UE2_TAG = 0x9e2a83c1;
const UE2_TAG_BYTES = [0xc1, 0x83, 0x2a, 0x9e];
const RF_HAS_STACK = 0x02000000;
const STATIC_SIZES = { 0x00: 1, 0x10: 2, 0x20: 4, 0x30: 12, 0x40: 16 };
const TARGET_CLASSES = new Set(["TerrainInfo", "TerrainSector", "BlockingVolume", "Brush", "Model", "Polys"]);

function signature(raw) {
  let out = "";
  for (let i = 0; i < 14 && i * 2 + 1 < raw.length; i++) {
    const c = raw[i * 2] | (raw[i * 2 + 1] << 8);
    if (c < 32 || c > 126) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function readCompat32(b, cur) {
  const b0 = b[cur.o++];
  const signed = (b0 & 0x80) !== 0;
  let out = b0 & 0x3f;
  if (b0 & 0x40) {
    let shift = 6;
    for (let i = 1; i < 5; i++) {
      const x = b[cur.o++];
      out |= (i === 4 ? x & 0x1f : x & 0x7f) << shift;
      shift += 7;
      if ((x & 0x80) === 0) break;
    }
  }
  return signed ? -out : out;
}

function decryptPackage(raw) {
  const sig = signature(raw);
  const start = sig.startsWith("Lineage2Ver") ? 28 : 0;
  const plainTag = raw.length >= 4 ? (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 : 0;
  if (plainTag === UE2_TAG) return raw;
  const key = raw[start] ^ UE2_TAG_BYTES[0];
  const ok = [0, 1, 2, 3].every((i) => (raw[start + i] ^ key) === UE2_TAG_BYTES[i]);
  if (!ok) throw new Error(`UE2 XOR magic mismatch; signature=${sig || "(none)"}`);
  const dec = Buffer.allocUnsafe(raw.length - start);
  for (let i = 0; i < dec.length; i++) dec[i] = raw[start + i] ^ key;
  return dec;
}

function parsePackage(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = dv.getUint32(0, true);
  if (tag !== UE2_TAG) throw new Error(`UE2 tag mismatch 0x${tag.toString(16)}`);
  const nameCount = dv.getUint32(12, true);
  const nameOffset = dv.getUint32(16, true);
  const exportCount = dv.getUint32(20, true);
  const exportOffset = dv.getUint32(24, true);
  const importCount = dv.getUint32(28, true);
  const importOffset = dv.getUint32(32, true);

  const names = [];
  let o = nameOffset;
  for (let i = 0; i < nameCount; i++) {
    const cur = { o };
    const len = readCompat32(bytes, cur);
    o = cur.o;
    let name = "";
    if (len > 0) {
      name = bytes.subarray(o, o + len - 1).toString("latin1");
      o += len;
    } else if (len < 0) {
      const chars = [];
      for (let c = 0; c < -len - 1; c++) chars.push(dv.getUint16(o + c * 2, true));
      name = String.fromCharCode(...chars);
      o += -len * 2;
    }
    o += 4;
    names.push(name);
  }
  const nm = (i) => (i >= 0 && i < names.length ? names[i] : "?");

  const imports = [];
  o = importOffset;
  for (let i = 0; i < importCount; i++) {
    const cur = { o };
    const classPackage = readCompat32(bytes, cur);
    const className = readCompat32(bytes, cur);
    const outer = dv.getInt32(cur.o, true); cur.o += 4;
    const objectName = readCompat32(bytes, cur);
    o = cur.o;
    imports.push({ classPackage: nm(classPackage), className: nm(className), outer, objectName: nm(objectName) });
  }

  const exports = [];
  o = exportOffset;
  for (let i = 0; i < exportCount; i++) {
    const cur = { o };
    const idClass = readCompat32(bytes, cur);
    readCompat32(bytes, cur);
    cur.o += 4;
    const idObjectName = readCompat32(bytes, cur);
    const flags = dv.getUint32(cur.o, true); cur.o += 4;
    const size = readCompat32(bytes, cur);
    let offset = 0;
    if (size > 0) offset = readCompat32(bytes, cur);
    o = cur.o;
    let className = "Class";
    if (idClass < 0) className = imports[-idClass - 1]?.objectName ?? "?";
    else if (idClass > 0) className = exports[idClass - 1]?.objectName ?? "(export)";
    exports.push({ className, objectName: nm(idObjectName), flags, size, offset });
  }

  const resolveRef = (idx) => {
    if (idx < 0) {
      const imp = imports[-idx - 1];
      if (!imp) return { name: "?", pkg: "?", className: "?" };
      let outer = imp.outer;
      let pkg = "?";
      for (let i = 0; i < 8 && outer < 0; i++) {
        const p = imports[-outer - 1];
        if (!p) break;
        pkg = p.objectName;
        outer = p.outer;
      }
      return { name: imp.objectName, pkg, className: imp.className };
    }
    if (idx > 0) return { name: exports[idx - 1]?.objectName ?? "?", pkg: "(this)", className: exports[idx - 1]?.className ?? "?" };
    return { name: "", pkg: "", className: "" };
  };

  return { bytes, dv, names, exports, nm, resolveRef };
}

function propSize(pkg, cur, code) {
  if (code in STATIC_SIZES) return STATIC_SIZES[code];
  if (code === 0x50) return pkg.bytes[cur.o++];
  if (code === 0x60) { const v = pkg.dv.getUint16(cur.o, true); cur.o += 2; return v; }
  if (code === 0x70) { const v = pkg.dv.getUint32(cur.o, true); cur.o += 4; return v; }
  return 0;
}

function propValue(pkg, type, structName, valueOffset, size) {
  if (type === 0x01 && size >= 1) return pkg.bytes[valueOffset];
  if (type === 0x02 && size >= 4) return pkg.dv.getInt32(valueOffset, true);
  if (type === 0x04 && size >= 4) return pkg.dv.getFloat32(valueOffset, true);
  if (type === 0x05) return pkg.resolveRef(readCompat32(pkg.bytes, { o: valueOffset }));
  if (type === 0x06) return pkg.nm(readCompat32(pkg.bytes, { o: valueOffset }));
  if (type === 0x09) return { arrayBytes: size, countPrefix: readCompat32(pkg.bytes, { o: valueOffset }) };
  if (type === 0x0a && structName === "Vector" && size >= 12) {
    return [pkg.dv.getFloat32(valueOffset, true), pkg.dv.getFloat32(valueOffset + 4, true), pkg.dv.getFloat32(valueOffset + 8, true)];
  }
  if (type === 0x0a && structName === "Rotator" && size >= 12) {
    return [pkg.dv.getInt32(valueOffset, true), pkg.dv.getInt32(valueOffset + 4, true), pkg.dv.getInt32(valueOffset + 8, true)];
  }
  return null;
}

function readProps(pkg, exp) {
  const out = [];
  const cur = { o: exp.offset };
  const end = exp.offset + exp.size;
  if (exp.flags & RF_HAS_STACK) {
    const node = readCompat32(pkg.bytes, cur);
    readCompat32(pkg.bytes, cur);
    cur.o += 12;
    if (node !== 0 && cur.o < end) readCompat32(pkg.bytes, cur);
  }
  let guard = 0;
  while (cur.o < end && guard++ < 1000) {
    const name = pkg.nm(readCompat32(pkg.bytes, cur));
    if (name === "None") break;
    const info = pkg.bytes[cur.o++];
    const type = info & 0x0f;
    const sizeCode = info & 0x70;
    const flag = (info & 0x80) !== 0;
    let structName = null;
    if (type === 0x0a) structName = pkg.nm(readCompat32(pkg.bytes, cur));
    const size = propSize(pkg, cur, sizeCode);
    if (flag && type !== 0x03) cur.o++;
    const valueOffset = cur.o;
    const value = type === 0x03 ? flag : propValue(pkg, type, structName, valueOffset, size);
    out.push({ name, type, structName, size, value });
    if (type !== 0x03) cur.o = valueOffset + size;
  }
  return out;
}

function compactProps(props) {
  const wanted = new Set([
    "Location", "Rotation", "DrawScale", "DrawScale3D", "TerrainMap", "TerrainScale", "QuadVisibilityBitmap",
    "EdgeTurnBitmap", "MapX", "MapY", "Layers", "Brush", "bHidden", "bDeleteMe", "bCollideActors",
    "bBlockActors", "bBlockPlayers",
  ]);
  return props.filter((p) => wanted.has(p.name)).map((p) => ({
    name: p.name,
    type: p.type,
    structName: p.structName,
    size: p.size,
    value: p.value,
  }));
}

async function auditMap(path) {
  const raw = await readFile(path);
  const pkg = parsePackage(decryptPackage(raw));
  const classCounts = {};
  const samples = {};
  for (const exp of pkg.exports) {
    if (!TARGET_CLASSES.has(exp.className)) continue;
    classCounts[exp.className] = (classCounts[exp.className] ?? 0) + 1;
    if (samples[exp.className] || exp.size <= 0) continue;
    samples[exp.className] = {
      objectName: exp.objectName,
      size: exp.size,
      properties: compactProps(readProps(pkg, exp)),
    };
  }
  return {
    path: path.replace(ROOT + "/", ""),
    classCounts,
    samples,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const targets = process.argv.slice(2);
  const maps = targets.length ? targets : [
    join(ROOT, "Maps", "17_25.unr"),
    join(ROOT, "Maps", "22_22.unr"),
    join(ROOT, "Maps", "12_24.unr"),
  ];
  const results = [];
  for (const map of maps) results.push(await auditMap(map.startsWith("/") ? map : join(ROOT, map)));
  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
