#!/usr/bin/env node
/**
 * l2-extract-character-meshes.mjs — extract real L2 character body meshes from the
 * race .ukx packages (Animations/<Race>.ukx) into compact JSON the browser can load.
 *
 * The .ukx are 60–135 MB each (full body + animations); we only need the LOD0 render
 * geometry of the default body parts, which is a few thousand triangles → a tiny JSON.
 *
 * USKeletalMesh geometry is located robustly by scanning for the top-level chained
 * lazy-array triple points(FVector,12B) → wedges(FMeshWedge,10B) → faces(FTriangle,12B),
 * which is version-independent (validated on Ertheia/Fighter/Dwarf, Lineage2Ver111).
 *
 * Output (per race/gender):  public/models/<race>_<gender>.json
 *   { parts:[{ name, material, positions:[..], uvs:[..], indices:[..] }], bbox }
 *
 * Usage:
 *   node tools/l2-extract-character-meshes.mjs            # all races, both genders
 *   node tools/l2-extract-character-meshes.mjs Ertheia F  # one
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ANIM_DIR = join(ROOT, "Animations");
const OUT_DIR = join(ROOT, "public", "models");
const TAG = [0xc1, 0x83, 0x2a, 0x9e];

const RACES = ["Human", "Elf", "DarkElf", "Orc", "Dwarf", "Kamael", "Ertheia"];
// race → .ukx file (Human's base body lives in Fighter.ukx)
const RACE_UKX = { Human: "fighter", Elf: "elf", DarkElf: "darkelf", Orc: "orc", Dwarf: "dwarf", Kamael: "kamael", Ertheia: "ertheia" };
// default appearance: take the lowest mesh-id set of base body parts (chest/legs/gloves/feet/upper)
const PART_RE = /_m0\d\d(_\w+)?$/i;

function decode(raw) {
  const hs = 28, key = raw[hs] ^ TAG[0];
  const ok = [0, 1, 2, 3].every((i) => (raw[hs + i] ^ key) === TAG[i]);
  const b = ok ? new Uint8Array(raw.length - hs) : raw;
  if (ok) for (let i = 0; i < b.length; i++) b[i] = raw[hs + i] ^ key;
  return b;
}
function reader(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const c32 = (p) => { let b0 = b[p], s = b0 & 0x80, v = b0 & 0x3f, sz = 1; if (b0 & 0x40) { let sh = 6; for (;;) { const x = b[p + sz]; sz++; v |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; if (sz >= 5) break; } } return [s ? -v : v, sz]; };
  return { dv, c32 };
}

function parsePackage(b) {
  const { dv, c32 } = reader(b);
  const nameC = dv.getUint32(12, true), nameO = dv.getUint32(16, true);
  const expC = dv.getUint32(20, true), expO = dv.getUint32(24, true);
  const impC = dv.getUint32(28, true), impO = dv.getUint32(32, true);
  let o = nameO; const names = [];
  for (let i = 0; i < nameC; i++) { const [L, s] = c32(o); o += s; if (L < 0 || L > 1024 || o + L + 4 > b.length) throw new Error(`bad name #${i} len=${L}`); let nm = ""; for (let c = 0; c < L - 1; c++) nm += String.fromCharCode(b[o + c]); o += L + 4; names.push(nm); }
  o = impO; const imps = [];
  for (let i = 0; i < impC; i++) { o += c32(o)[1]; const [cn, s2] = c32(o); o += s2; o += 4; const [on, s3] = c32(o); o += s3; imps.push(names[on]); }
  o = expO; const exps = [];
  for (let i = 0; i < expC; i++) { const [cls, s1] = c32(o); o += s1; o += c32(o)[1]; o += 4; const [on, s4] = c32(o); o += s4; const flags = dv.getUint32(o, true); o += 4; const [sz, s5] = c32(o); o += s5; let off = 0; if (sz > 0) { const [o2, s6] = c32(o); o += s6; off = o2; } exps.push({ objectName: names[on], className: cls < 0 ? imps[-cls - 1] : cls > 0 ? names[on] : "Class", flags, size: sz, offset: off }); }
  return { dv, c32, names, exps };
}

/** Locate the top-level render geometry (points/wedges/faces) of a SkeletalMesh export. */
function readSkeletalGeometry(pkg, exp) {
  const { dv, c32 } = pkg;
  const start = exp.offset, end = exp.offset + exp.size;
  const cand = [];
  for (let p = start; p < end - 8; p++) {
    const skip = dv.getInt32(p, true);
    if (skip <= p + 5 || skip > end) continue;
    const [cnt, cs] = c32(p + 4);
    if (cnt <= 0 || cnt > 500000) continue;
    const data = p + 4 + cs, span = skip - data;
    if (span <= 0 || span % cnt !== 0) continue;
    const elem = span / cnt;
    if (elem === 12 || elem === 10) cand.push({ p, skip, cnt, elem, data });
  }
  let g = null;
  for (let i = 0; i < cand.length - 2; i++) {
    const a = cand[i], bb = cand[i + 1], cc = cand[i + 2];
    if (a.elem === 12 && bb.elem === 10 && cc.elem === 12 && a.skip === bb.p && bb.skip === cc.p) g = { pts: a, wed: bb, fac: cc };
  }
  if (!g) return null;
  const pts = new Float32Array(g.pts.cnt * 3);
  { let p = g.pts.data; for (let i = 0; i < g.pts.cnt; i++) { pts[i * 3] = dv.getFloat32(p, true); pts[i * 3 + 1] = dv.getFloat32(p + 4, true); pts[i * 3 + 2] = dv.getFloat32(p + 8, true); p += 12; } }
  const wWedge = new Uint16Array(g.wed.cnt), wU = new Float32Array(g.wed.cnt), wV = new Float32Array(g.wed.cnt);
  { let p = g.wed.data; for (let i = 0; i < g.wed.cnt; i++) { wWedge[i] = dv.getUint16(p, true); wU[i] = dv.getFloat32(p + 2, true); wV[i] = dv.getFloat32(p + 6, true); p += 10; } }
  // build per-wedge vertex buffer + indices from faces
  const positions = new Float32Array(g.wed.cnt * 3), uvs = new Float32Array(g.wed.cnt * 2);
  for (let i = 0; i < g.wed.cnt; i++) { const vi = wWedge[i]; positions[i * 3] = pts[vi * 3]; positions[i * 3 + 1] = pts[vi * 3 + 1]; positions[i * 3 + 2] = pts[vi * 3 + 2]; uvs[i * 2] = wU[i]; uvs[i * 2 + 1] = wV[i]; }
  const indices = new Uint32Array(g.fac.cnt * 3);
  { let p = g.fac.data; for (let i = 0; i < g.fac.cnt; i++) { indices[i * 3] = dv.getUint16(p, true); indices[i * 3 + 1] = dv.getUint16(p + 2, true); indices[i * 3 + 2] = dv.getUint16(p + 4, true); p += 12; } }
  return { positions, uvs, indices, wedgeCount: g.wed.cnt, faceCount: g.fac.cnt };
}

function pickDefaultParts(exps, gender) {
  // gender prefix: F = female, M = male
  const skel = exps.filter((e) => e.className === "SkeletalMesh" && PART_RE.test(e.objectName) && new RegExp(`^${gender}`, "i").test(e.objectName));
  if (!skel.length) return [];
  // group by mesh-id (the m0NN token); choose the smallest id present for a clean base set
  const idOf = (n) => { const m = n.match(/_m0(\d\d)/i); return m ? parseInt(m[1], 10) : 999; };
  const ids = [...new Set(skel.map((e) => idOf(e.objectName)))].sort((a, b) => a - b);
  const baseId = ids[0];
  return skel.filter((e) => idOf(e.objectName) === baseId);
}

async function extractRace(file, race, gender) {
  const raw = new Uint8Array((await readFile(file)).buffer);
  const b = decode(raw);
  const pkg = parsePackage(b);
  const parts = pickDefaultParts(pkg.exps, gender);
  if (!parts.length) { console.log(`  ${race} ${gender}: no parts`); return; }
  const out = { race, gender, parts: [], bbox: { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] } };
  for (const e of parts) {
    const g = readSkeletalGeometry(pkg, e);
    if (!g) continue;
    for (let i = 0; i < g.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      out.bbox.min[k] = Math.min(out.bbox.min[k], g.positions[i + k]);
      out.bbox.max[k] = Math.max(out.bbox.max[k], g.positions[i + k]);
    }
    out.parts.push({ name: e.objectName, positions: Array.from(g.positions), uvs: Array.from(g.uvs), indices: Array.from(g.indices) });
  }
  await mkdir(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${race}_${gender}.json`);
  await writeFile(outFile, JSON.stringify(out));
  const tris = out.parts.reduce((a, p) => a + p.indices.length / 3, 0);
  console.log(`  ${race} ${gender}: ${out.parts.length} parts / ${tris} tris → ${basename(outFile)} (${(JSON.stringify(out).length / 1024 | 0)}KB)`);
}

async function main() {
  const [argRace, argGender] = process.argv.slice(2);
  const files = await readdir(ANIM_DIR).catch(() => []);
  const races = argRace ? [argRace] : RACES;
  for (const race of races) {
    const want = `${(RACE_UKX[race] ?? race.toLowerCase())}.ukx`;
    const f = files.find((x) => x.toLowerCase() === want);
    if (!f) { console.log(`  ${race}: ${want} not found`); continue; }
    for (const gender of argGender ? [argGender] : ["F", "M"]) {
      await extractRace(join(ANIM_DIR, f), race, gender).catch((e) => console.log(`  ${race} ${gender}: ${e.message}`));
    }
  }
}
main();
