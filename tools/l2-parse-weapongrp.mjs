#!/usr/bin/env node
/**
 * l2-parse-weapongrp.mjs — heuristic Weapongrp.dat → public/models/weapongrp.json.
 *
 * Same heuristic approach as l2-parse-armorgrp.mjs: scan name-table indices,
 * collect weapon mesh names, pair with itemId and texture by proximity.
 *
 * Validation: item 81166 (R97_ReitermirrorCane) should land in
 * LineageWeapons2.ukx and the extractor should yield 299 verts / 438 tris.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const L2 = process.env.L2_SYSTEM ?? "/sessions/optimistic-focused-wozniak/mnt/L2Slave/system/eu";
const OUT = join(ROOT, "public", "models", "weapongrp.json");

const LJS = Buffer.from(
  "75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039",
  "hex",
);
const bI = (b) => BigInt("0x" + b.toString("hex"));
const bB = (x, m = 0) => { let h = x.toString(16); if (h.length % 2) h = "0" + h; const b = Buffer.from(h, "hex"); return b.length >= m ? b : Buffer.concat([Buffer.alloc(m - b.length), b]); };
const mpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; e >>= 1n; b = b * b % m; } return r; };

function decode413(buf) {
  let end = 0; while (end + 1 < 64) { const c = buf.readUInt16LE(end); if (c < 32 || c > 126) break; end += 2; }
  const pay = buf.subarray(end), blocks = Math.floor(pay.length / 128), mod = bI(LJS), ch = [];
  for (let i = 0; i < blocks; i++) {
    const enc = pay.subarray(i * 128, i * 128 + 128);
    const dec = bB(mpow(bI(enc), 0x1dn, mod), 128);
    const sz = dec[3]; const off = 128 - sz - ((124 - sz) % 4);
    ch.push(dec.subarray(off, off + sz));
  }
  return inflateSync(Buffer.concat(ch).subarray(4));
}
function loadNames() {
  const d = decode413(readFileSync(join(L2, "L2GameDataName.dat")));
  let o = 0; const count = d.readUInt32LE(o); o += 4; const names = [];
  for (let j = 0; j < count; j++) { const size = d.readUInt32LE(o); o += 4; if (size <= 0) { names.push(""); continue; } names.push(d.subarray(o, o + size).toString("utf16le").replace(/\0+$/, "")); o += size; }
  return names;
}

const PKG_MAP = [
  { test: /^R\d+_/i,        p: "LineageWeapons2.ukx", tp: "LineageWeaponsTex2.utx" },
  { test: /^Weapon_/i,      p: "LineageWeapons.ukx",  tp: "LineageWeaponsTex.utx" },
  { test: /^(Sword|Bow|Dagger|Pole|Blunt|Staff|Dual)_/i, p: "LineageWeapons.ukx", tp: "LineageWeaponsTex.utx" },
];
function pkgFor(meshName) {
  for (const r of PKG_MAP) if (r.test.test(meshName)) return { p: r.p, tp: r.tp };
  return { p: null, tp: null };
}

function main() {
  const names = loadNames();
  const d = decode413(readFileSync(join(L2, "Weapongrp.dat")));
  // Weapon mesh names are extremely varied; capture anything that looks like
  // a weapon: starts with R<digits>_, or contains _wp, _mh, weapon_, etc.
  const meshRe = /^(R\d+_[A-Za-z0-9]+|Weapon_[A-Za-z0-9]+|[A-Z][A-Za-z]+_(?:sword|bow|dagger|pole|blunt|staff|dual|fist)\d*)$/i;
  const texRe  = /^(?:R\d+_[A-Za-z0-9]+_t\d*|Weapon_[A-Za-z0-9]+_t|[A-Z][A-Za-z]+_t\d+)$/;

  const hits = [];
  for (let off = 0; off + 4 <= d.length; off += 4) {
    const idx = d.readUInt32LE(off);
    if (idx > 0 && idx < names.length) {
      const nm = names[idx];
      if (!nm) continue;
      if (meshRe.test(nm)) hits.push({ off, kind: "m", name: nm });
      else if (texRe.test(nm)) hits.push({ off, kind: "t", name: nm });
    }
  }

  const out = {};
  for (const h of hits) {
    if (h.kind !== "m") continue;
    let id = 0;
    for (let p = Math.max(0, h.off - 128); p < h.off; p += 4) {
      const v = d.readUInt32LE(p);
      if (v > 0 && v < 0xfffff) id = v;
    }
    if (!id || out[id]) continue;
    let tex = null, bestDx = Infinity;
    for (const t of hits) {
      if (t.kind !== "t") continue;
      const dx = Math.abs(t.off - h.off);
      if (dx < bestDx) { bestDx = dx; tex = t.name; }
    }
    const { p, tp } = pkgFor(h.name);
    out[id] = { m: h.name, ...(tex ? { t: tex } : {}), ...(p ? { p } : {}), ...(tp ? { tp } : {}) };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.error(`weapongrp: ${Object.keys(out).length} rows → ${OUT}`);
  if (out["81166"]) console.error("  check 81166:", JSON.stringify(out["81166"]));
}
main();
