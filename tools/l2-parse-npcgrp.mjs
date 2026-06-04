#!/usr/bin/env node
/**
 * l2-parse-npcgrp.mjs — THE exact npc-id → mesh/texture map.
 *
 * Decrypts system/eu/Npcgrp.dat (Lineage2Ver413 RSA+zlib), resolves the MAP_INT
 * name indices through system/eu/L2GameDataName.dat, and walks the GrandCrusade
 * npcgrp record layout (validated: npc 20001 → LineageMonsters.gremlin_m00).
 *
 * Output: public/models/npc-mesh-map.json  { "<id>": { "m":"<mesh>", "t":["<tex>",…] }, … }
 * (Structure ported from L2ClientDat by Mobius — dist/data/structure/dats/npcgrp.xml)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const L2 = "/sessions/optimistic-focused-wozniak/mnt/L2Slave/system/eu";
const OUT = join(ROOT, "public", "models", "npc-mesh-map.json");

const LJS = Buffer.from("75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039", "hex");
const bI = (b) => BigInt("0x" + b.toString("hex"));
const bB = (x, m = 0) => { let h = x.toString(16); if (h.length % 2) h = "0" + h; let b = Buffer.from(h, "hex"); return b.length >= m ? b : Buffer.concat([Buffer.alloc(m - b.length), b]); };
const mpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; e >>= 1n; b = b * b % m; } return r; };
function decode413(buf) {
  let end = 0; while (end + 1 < 64) { const c = buf.readUInt16LE(end); if (c < 32 || c > 126) break; end += 2; }
  const pay = buf.subarray(end), blocks = Math.floor(pay.length / 128), mod = bI(LJS), ch = [];
  for (let i = 0; i < blocks; i++) { const enc = pay.subarray(i * 128, i * 128 + 128); const dec = bB(mpow(bI(enc), 0x1dn, mod), 128); const sz = dec[3], off = 128 - sz - ((124 - sz) % 4); ch.push(dec.subarray(off, off + sz)); }
  return inflateSync(Buffer.concat(ch).subarray(4));
}

// L2GameDataName.dat → string table (u32 count; per entry u32 byteLen + UTF-16LE)
function loadNames() {
  const d = decode413(readFileSync(join(L2, "L2GameDataName.dat")));
  let o = 0; const count = d.readUInt32LE(o); o += 4; const names = [];
  for (let j = 0; j < count; j++) { const size = d.readUInt32LE(o); o += 4; if (size <= 0) { names.push(""); continue; } names.push(d.subarray(o, o + size).toString("utf16le").replace(/\0+$/, "")); o += size; }
  return names;
}

function main() {
  const names = loadNames();
  const d = decode413(readFileSync(join(L2, "Npcgrp.dat"))); let o = 0; const n = d.length;
  const u8 = () => d[o++];
  const u16 = () => { const v = d.readUInt16LE(o); o += 2; return v; };
  const s16 = () => { const v = d.readInt16LE(o); o += 2; return v; };
  const u32 = () => { const v = d.readUInt32LE(o); o += 4; return v; };
  const f32 = () => { o += 4; };
  const f64 = () => { o += 8; };
  const cntr = () => { let b0 = d[o++], signed = b0 & 0x80, out = b0 & 0x3f; if (b0 & 0x40) { let sh = 6; for (let i = 1; i < 5; i++) { const x = d[o++]; if (i === 4) { out |= (x & 0x1f) << 27; break; } out |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; } } return signed ? -out : out; };
  const mapint = () => { const idx = u32(); return idx >= 0 && idx < names.length ? names[idx] : `<${idx}>`; };

  const count = u32(); const out = {};
  for (let i = 0; i < count && o < n; i++) {
    const npcId = u16();
    const className = mapint();
    const mesh = mapint();
    const tn = cntr(); const tex = []; for (let k = 0; k < tn; k++) tex.push(mapint());
    const tn2 = u32(); for (let k = 0; k < tn2; k++) mapint();
    const pl = cntr(); for (let k = 0; k < pl; k++) u16();
    f32(); // npc_speed
    for (let k = cntr(); k > 0; k--) mapint(); // attack_sound1
    for (let k = cntr(); k > 0; k--) mapint(); // defense_sound1
    for (let k = cntr(); k > 0; k--) mapint(); // damage_sound
    for (let k = cntr(); k > 0; k--) { mapint(); f32(); } // deco_effect
    for (let k = cntr(); k > 0; k--) { u16(); u8(); } // quest
    mapint(); // attack_effect
    u8(); u8(); u8(); // sound_vol/radius/random
    u8(); u8();       // social/hpshowable
    for (let k = u32(); k > 0; k--) mapint(); // dialog_sound (UINT count)
    u8(); u8(); u8(); u8(); // silhouette/summon_sort/max/grade
    f32(); f32();          // drawscale/use_zoomincam
    mapint();             // npc_icon_name
    u8();                 // sound_priority
    u16(); u16();         // ground_high/low
    f32(); f32(); f32(); f32(); // collision
    u32(); u32(); u32();  // slots
    f64(); f64();         // org_hp/org_mp
    s16();                // npc_type
    if (npcId > 0 && (mesh.startsWith("Lineage") || tex.length)) out[npcId] = { m: mesh, t: tex };
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.error(`parsed ${Object.keys(out).length}/${count} npcs → ${OUT} (${(JSON.stringify(out).length / 1024 | 0)}KB)`);
  console.error("check 20001:", JSON.stringify(out[20001]));
}
main();
