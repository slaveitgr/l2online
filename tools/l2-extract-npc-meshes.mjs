#!/usr/bin/env node
/**
 * l2-extract-npc-meshes.mjs — extract the exact NPC skeletal meshes referenced
 * by npc-mesh-map.json (from the real npcgrp) into per-package bundles the
 * browser lazy-loads.
 *
 * Output: public/models/npc/pkg/<Package>.json  { "<export>": { parts:[{positions,uvs,indices}], bbox }, … }
 * Usage:  node tools/l2-extract-npc-meshes.mjs [Pkg1 Pkg2 …]   (default: town NPC packages)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const ANIM = "/sessions/optimistic-focused-wozniak/mnt/L2Slave/Animations";
const OUTDIR = join(ROOT, "public", "models", "npc", "pkg");

// Default: extract every Lineage NPC/Monster package referenced by the map.
// (Pass explicit names on argv to extract a subset.)
const TOWN = [
  "LineageNPCs", "LineageNPCs2", "LineageNPCs3", "LineageNPCs4", "LineageNPCs5",
  "LineageNpcsEV", "LineageNPCsEV",
  "LineageMonsters", "LineageMonsters2", "LineageMonsters3", "LineageMonsters4",
  "LineageMonsters5", "LineageMonsters6", "LineageMonsters7", "LineageMonsters8",
  "LineageMonsters9", "LineageMonsters10", "LineageMonsters11", "LineageMonsters12",
  "LineageMonsters13", "LineageMonsters14", "LineageMonsters15", "LineageMonsters16",
];

const TAG = [0xc1, 0x83, 0x2a, 0x9e];
function decode(raw) { const hs = 28, key = raw[hs] ^ TAG[0]; const ok = [0, 1, 2, 3].every((i) => (raw[hs + i] ^ key) === TAG[i]); const b = ok ? new Uint8Array(raw.length - hs) : raw; if (ok) for (let i = 0; i < b.length; i++) b[i] = raw[hs + i] ^ key; return b; }
function c32(b, p) { let b0 = b[p], s = b0 & 0x80, v = b0 & 0x3f, sz = 1; if (b0 & 0x40) { let sh = 6; for (;;) { const x = b[p + sz]; sz++; v |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; if (sz >= 5) break; } } return [s ? -v : v, sz]; }
function parsePackage(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nameC = dv.getUint32(12, true), nameO = dv.getUint32(16, true), expC = dv.getUint32(20, true), expO = dv.getUint32(24, true), impC = dv.getUint32(28, true), impO = dv.getUint32(32, true);
  let o = nameO; const names = [];
  for (let i = 0; i < nameC; i++) { const [L, s] = c32(b, o); o += s; let nm = ""; for (let c = 0; c < L - 1; c++) nm += String.fromCharCode(b[o + c]); o += L + 4; names.push(nm); }
  o = impO; const imps = [];
  for (let i = 0; i < impC; i++) { o += c32(b, o)[1]; o += c32(b, o)[1]; o += 4; const [on, s3] = c32(b, o); o += s3; imps.push(names[on]); }
  o = expO; const exps = [];
  for (let i = 0; i < expC; i++) { const [cls, s1] = c32(b, o); o += s1; o += c32(b, o)[1]; o += 4; const [on, s4] = c32(b, o); o += s4; o += 4; const [sz, s5] = c32(b, o); o += s5; let off = 0; if (sz > 0) { const [o2, s6] = c32(b, o); o += s6; off = o2; } exps.push({ objectName: names[on], className: cls < 0 ? imps[-cls - 1] : "?", size: sz, offset: off }); }
  return { dv, c32, exps };
}
function readGeom(pkg, exp) {
  const { dv } = pkg; const start = exp.offset, end = exp.offset + exp.size; const cand = [];
  for (let p = start; p < end - 8; p++) { const skip = dv.getInt32(p, true); if (skip <= p + 5 || skip > end) continue; const [cnt, cs] = c32(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), p + 4); if (cnt <= 0 || cnt > 500000) continue; const data = p + 4 + cs, span = skip - data; if (span <= 0 || span % cnt !== 0) continue; const elem = span / cnt; if (elem === 12 || elem === 10) cand.push({ p, skip, cnt, elem, data }); }
  let g = null;
  for (let i = 0; i < cand.length - 2; i++) { const a = cand[i], bb = cand[i + 1], cc = cand[i + 2]; if (a.elem === 12 && bb.elem === 10 && cc.elem === 12 && a.skip === bb.p && bb.skip === cc.p) g = { pts: a, wed: bb, fac: cc }; }
  if (!g) return null;
  const pts = new Float32Array(g.pts.cnt * 3); { let p = g.pts.data; for (let i = 0; i < g.pts.cnt; i++) { pts[i * 3] = dv.getFloat32(p, true); pts[i * 3 + 1] = dv.getFloat32(p + 4, true); pts[i * 3 + 2] = dv.getFloat32(p + 8, true); p += 12; } }
  const wWed = new Uint16Array(g.wed.cnt), wU = new Float32Array(g.wed.cnt), wV = new Float32Array(g.wed.cnt); { let p = g.wed.data; for (let i = 0; i < g.wed.cnt; i++) { wWed[i] = dv.getUint16(p, true); wU[i] = dv.getFloat32(p + 2, true); wV[i] = dv.getFloat32(p + 6, true); p += 10; } }
  const positions = new Float32Array(g.wed.cnt * 3), uvs = new Float32Array(g.wed.cnt * 2);
  for (let i = 0; i < g.wed.cnt; i++) { const vi = wWed[i]; positions[i * 3] = pts[vi * 3]; positions[i * 3 + 1] = pts[vi * 3 + 1]; positions[i * 3 + 2] = pts[vi * 3 + 2]; uvs[i * 2] = wU[i]; uvs[i * 2 + 1] = wV[i]; }
  const indices = new Uint32Array(g.fac.cnt * 3); { let p = g.fac.data; for (let i = 0; i < g.fac.cnt; i++) { indices[i * 3] = dv.getUint16(p, true); indices[i * 3 + 1] = dv.getUint16(p + 2, true); indices[i * 3 + 2] = dv.getUint16(p + 4, true); p += 12; } }
  return { positions: Array.from(positions), uvs: Array.from(uvs), indices: Array.from(indices) };
}

function main() {
  const map = JSON.parse(readFileSync(join(ROOT, "public/models/npc-mesh-map.json"), "utf8"));
  const want = {}; // package -> Set(export)
  for (const v of Object.values(map)) { const m = v.m; if (!m.includes(".")) continue; const [pk, ex] = [m.split(".")[0], m.split(".").slice(1).join(".")]; (want[pk] ??= new Set()).add(ex); }
  const ukx = readdirSync(ANIM).filter((f) => f.endsWith(".ukx"));
  const target = process.argv.slice(2).length ? process.argv.slice(2) : TOWN;
  mkdirSync(OUTDIR, { recursive: true });
  for (const pk of target) {
    const set = want[pk]; if (!set) { console.error(`  ${pk}: not referenced`); continue; }
    const file = ukx.find((f) => f.toLowerCase() === `${pk.toLowerCase()}.ukx`);
    if (!file) { console.error(`  ${pk}: .ukx not found`); continue; }
    const pkg = parsePackage(decode(new Uint8Array(readFileSync(join(ANIM, file)))));
    const out = {}; let got = 0;
    for (const e of pkg.exps) {
      if (e.className !== "SkeletalMesh" || !set.has(e.objectName) || out[e.objectName]) continue;
      const g = readGeom(pkg, e); if (!g) continue;
      const bbox = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
      for (let i = 0; i < g.positions.length; i += 3) for (let k = 0; k < 3; k++) { bbox.min[k] = Math.min(bbox.min[k], g.positions[i + k]); bbox.max[k] = Math.max(bbox.max[k], g.positions[i + k]); }
      out[e.objectName] = { parts: [g], bbox }; got++;
    }
    const of = join(OUTDIR, `${pk}.json`);
    writeFileSync(of, JSON.stringify(out));
    console.error(`  ${pk}: ${got}/${set.size} meshes → ${pk}.json (${(JSON.stringify(out).length / 1048576).toFixed(1)}MB)`);
  }
}
main();
