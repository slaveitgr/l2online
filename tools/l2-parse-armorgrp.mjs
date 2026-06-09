#!/usr/bin/env node
/**
 * l2-parse-armorgrp.mjs — heuristic Armorgrp.dat → public/models/armorgrp.json.
 *
 * Decrypts system/eu/Armorgrp.dat (Lineage2Ver413 RSA+zlib, same scheme as
 * Npcgrp). The exact row layout varies wildly by chronicle, so this parser
 * uses the documented heuristic: scan all u32 name-table indices in the
 * decrypted stream, collect strings matching <Prefix>_m(\d+)_[uglb] and
 * pair them with the nearest preceding u32 in the plausible itemId range
 * (1..0xFFFFFF). Each (itemId, slot) takes the first match; the matching
 * <Prefix>_t(\d+) texture (or _t<NNN>) is paired by number.
 *
 * Output schema (per row):
 *   { m, t?, p?, tp?, s: "u"|"l"|"g"|"b", bp }
 *
 * Update PKG_MAP below when new armor packages ship.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const L2 = process.env.L2_SYSTEM ?? "/sessions/optimistic-focused-wozniak/mnt/L2Slave/system/eu";
const OUT = join(ROOT, "public", "models", "armorgrp.json");

// Same Ver413 helpers as l2-parse-npcgrp.mjs.
const LJS = Buffer.from(
  "75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039",
  "hex",
);
const bI = (b) => BigInt("0x" + b.toString("hex"));
const bB = (x, m = 0) => {
  let h = x.toString(16); if (h.length % 2) h = "0" + h;
  const b = Buffer.from(h, "hex");
  return b.length >= m ? b : Buffer.concat([Buffer.alloc(m - b.length), b]);
};
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
  for (let j = 0; j < count; j++) {
    const size = d.readUInt32LE(o); o += 4;
    if (size <= 0) { names.push(""); continue; }
    names.push(d.subarray(o, o + size).toString("utf16le").replace(/\0+$/, ""));
    o += size;
  }
  return names;
}

// Heuristic: mesh names look like "FMagic_m042_u" and live in known .ukx
// packages. Extend this map when new sets ship.
const PKG_MAP = [
  { test: /^(F|M)Magic_m/i,    p: "LineageUnique3.ukx",   tp: "LineageUniqueTex3.utx" },
  { test: /^(F|M)Heavy_m/i,    p: "LineageUnique3.ukx",   tp: "LineageUniqueTex3.utx" },
  { test: /^(F|M)Light_m/i,    p: "LineageUnique3.ukx",   tp: "LineageUniqueTex3.utx" },
  { test: /^Unique_/i,         p: "LineageUnique3.ukx",   tp: "LineageUniqueTex3.utx" },
];

function pkgFor(meshName) {
  for (const r of PKG_MAP) if (r.test.test(meshName)) return { p: r.p, tp: r.tp };
  return { p: null, tp: null };
}

function main() {
  const names = loadNames();
  const d = decode413(readFileSync(join(L2, "Armorgrp.dat")));
  const meshRe = /^([A-Z][A-Za-z]+)_m(\d+)_([uglb])$/;
  const texRe  = /^([A-Z][A-Za-z]+)_t(\d+)$/;

  // Scan u32 indices on every byte alignment; collect (offset, nameIdx).
  // The name table is large; only accept indices in range.
  const hits = []; // { off, kind:'m'|'t'|'id', name, prefix?, num?, slot? }
  for (let off = 0; off + 4 <= d.length; off += 4) {
    const idx = d.readUInt32LE(off);
    if (idx > 0 && idx < names.length) {
      const nm = names[idx];
      if (!nm) continue;
      let m;
      if ((m = meshRe.exec(nm))) {
        hits.push({ off, kind: "m", name: nm, prefix: m[1], num: +m[2], slot: m[3] });
      } else if ((m = texRe.exec(nm))) {
        hits.push({ off, kind: "t", name: nm, prefix: m[1], num: +m[2] });
      }
    }
  }

  // For each mesh hit, find the nearest preceding plausible itemId u32.
  const out = {};
  let lastItemId = 0;
  for (const h of hits) {
    if (h.kind !== "m") continue;
    // walk backwards in 4-byte steps up to 128 B for a plausible itemId.
    let id = 0;
    for (let p = Math.max(0, h.off - 128); p < h.off; p += 4) {
      const v = d.readUInt32LE(p);
      if (v > 0 && v < 0xfffff) { id = v; }
    }
    if (!id) continue;
    if (out[id]) continue;
    // pair with the nearest texture in same prefix + number window.
    let tex = null;
    let bestDx = Infinity;
    for (const t of hits) {
      if (t.kind !== "t") continue;
      if (t.prefix !== h.prefix) continue;
      const dx = Math.abs(t.off - h.off);
      if (dx < bestDx && Math.abs(t.num - h.num) <= 8) { bestDx = dx; tex = t.name; }
    }
    const { p, tp } = pkgFor(h.name);
    out[id] = { m: h.name, ...(tex ? { t: tex } : {}), ...(p ? { p } : {}), ...(tp ? { tp } : {}), s: h.slot, bp: h.prefix };
    lastItemId = id;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.error(`armorgrp: ${Object.keys(out).length} rows → ${OUT} (last id ${lastItemId})`);
}
main();
