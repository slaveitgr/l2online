#!/usr/bin/env node
/**
 * l2-bake-terrain.mjs — bake each map tile's terrain SPLATMAP into one ground texture.
 *
 * L2 terrain blends many tiling ground textures (grass, dirt, cobble, sand) through
 * per-tile alpha masks (TerrainInfo.Layers[].Texture + .AlphaMap). Doing that blend at
 * runtime via three.js alphaMap is fiddly; baking it offline to a single PNG per tile is
 * reliable and fast. The browser then renders the terrain heightmap with this one texture.
 *
 * Output: public/terrain/<tileX>_<tileY>.png   (the composed ground, UV 0..1 = whole tile)
 *
 * Usage:
 *   node tools/l2-bake-terrain.mjs               # every Maps/*.unr
 *   node tools/l2-bake-terrain.mjs 22_22 21_22   # specific tiles
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MAPS = join(ROOT, "Maps");
const TEX = join(ROOT, "Textures");
const OUT = join(ROOT, "public", "terrain");
const TAG = [0xc1, 0x83, 0x2a, 0x9e], RF = 0x02000000, SS = { 0x00: 1, 0x10: 2, 0x20: 4, 0x30: 12, 0x40: 16 };
const SIZE = 1024;   // baked resolution per tile
const TILE = 12;     // how many times each ground texture repeats across the tile

function dec(raw) { const hs = 28, key = raw[hs] ^ TAG[0]; const ok = [0, 1, 2, 3].every((i) => (raw[hs + i] ^ key) === TAG[i]); const b = ok ? new Uint8Array(raw.length - hs) : raw; if (ok) for (let i = 0; i < b.length; i++) b[i] = raw[hs + i] ^ key; return b; }
function parse(b) {
  const dv = new DataView(b.buffer); const c32 = (p) => { let b0 = b[p], s = b0 & 0x80, v = b0 & 0x3f, sz = 1; if (b0 & 0x40) { let sh = 6; for (;;) { const x = b[p + sz]; sz++; v |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; if (sz >= 5) break; } } return [s ? -v : v, sz]; };
  const nameC = dv.getUint32(12, true), nameO = dv.getUint32(16, true), expC = dv.getUint32(20, true), expO = dv.getUint32(24, true), impC = dv.getUint32(28, true), impO = dv.getUint32(32, true);
  let o = nameO; const names = []; for (let i = 0; i < nameC; i++) { const [L, s] = c32(o); o += s; let nm = ""; for (let c = 0; c < L - 1; c++) nm += String.fromCharCode(b[o + c]); o += L + 4; names.push(nm); }
  o = impO; const imps = []; for (let i = 0; i < impC; i++) { o += c32(o)[1]; const [cn, s2] = c32(o); o += s2; o += 4; const [on, s3] = c32(o); o += s3; imps.push(names[on]); }
  o = expO; const exps = []; for (let i = 0; i < expC; i++) { const [cls, s1] = c32(o); o += s1; o += c32(o)[1]; o += 4; const [on, s4] = c32(o); o += s4; const flags = dv.getUint32(o, true); o += 4; const [sz, s5] = c32(o); o += s5; let off = 0; if (sz > 0) { const [o2, s6] = c32(o); o += s6; off = o2; } exps.push({ idClass: cls, className: cls < 0 ? imps[-cls - 1] : cls > 0 ? names[on] : "Class", n: names[on], flags, sz, off }); }
  return { b, dv, names, exps, c32 };
}
function dxt(src, w, h, fmt) { const out = new Uint8Array(w * h * 4); const bw = (w + 3) >> 2, bh = (h + 3) >> 2; let sp = 0; for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let al = null, ai = null; if (fmt === "DXT3") { al = new Uint8Array(16); for (let i = 0; i < 8; i++) { const v = src[sp + i]; al[i * 2] = (v & 15) * 17; al[i * 2 + 1] = (v >> 4) * 17; } sp += 8; } else if (fmt === "DXT5") { const a0 = src[sp], a1 = src[sp + 1]; const at = [a0, a1, 0, 0, 0, 0, 0, 0]; if (a0 > a1) for (let i = 1; i < 7; i++) at[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7); else { for (let i = 1; i < 5; i++) at[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); at[6] = 0; at[7] = 255; } let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(src[sp + 2 + i]) << BigInt(8 * i); ai = new Uint8Array(16); for (let i = 0; i < 16; i++) ai[i] = at[Number((bits >> BigInt(3 * i)) & 7n)]; sp += 8; } const c0 = src[sp] | (src[sp + 1] << 8), c1 = src[sp + 2] | (src[sp + 3] << 8), lut = (src[sp + 4] | (src[sp + 5] << 8) | (src[sp + 6] << 16) | (src[sp + 7] << 24)) >>> 0; sp += 8; const r0 = ((c0 >> 11) & 31) * 255 / 31, g0 = ((c0 >> 5) & 63) * 255 / 63, b0 = (c0 & 31) * 255 / 31, r1 = ((c1 >> 11) & 31) * 255 / 31, g1 = ((c1 >> 5) & 63) * 255 / 63, b1 = (c1 & 31) * 255 / 31; const pr = [r0, r1, 0, 0], pg = [g0, g1, 0, 0], pb = [b0, b1, 0, 0]; if (fmt === "DXT1" && c0 <= c1) { pr[2] = (r0 + r1) / 2; pg[2] = (g0 + g1) / 2; pb[2] = (b0 + b1) / 2; } else { pr[2] = (2 * r0 + r1) / 3; pg[2] = (2 * g0 + g1) / 3; pb[2] = (2 * b0 + b1) / 3; pr[3] = (r0 + 2 * r1) / 3; pg[3] = (g0 + 2 * g1) / 3; pb[3] = (b0 + 2 * b1) / 3; } for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = bx * 4 + px, y = by * 4 + py; if (x >= w || y >= h) continue; const ci = (lut >> (2 * (py * 4 + px))) & 3, di = (y * w + x) * 4; out[di] = pr[ci] | 0; out[di + 1] = pg[ci] | 0; out[di + 2] = pb[ci] | 0; out[di + 3] = 255; } } return out; }
function readTex(pk, name) {
  const e = pk.exps.find((x) => x.n === name && /texture/i.test(x.className)) || pk.exps.find((x) => x.n === name);
  if (!e || e.sz <= 0) return null;
  const { b, dv, names, c32 } = pk; let o = e.off; const ci = () => { const [v, s] = c32(o); o += s; return v; };
  if (e.flags & RF) { const n = ci(); ci(); o += 12; if (n !== 0) ci(); }
  let fmt = -1, U = 0, V = 0, g = 0; for (;;) { if (g++ > 400) break; const nm = names[ci()]; if (nm === "None") break; const info = b[o++]; const pt = info & 15, szc = info & 0x70, arr = info & 0x80; if (pt === 10) ci(); let d; if (szc in SS) d = SS[szc]; else if (szc === 0x50) d = b[o++]; else if (szc === 0x60) { d = dv.getUint16(o, true); o += 2; } else if (szc === 0x70) { d = dv.getUint32(o, true); o += 4; } else d = 0; if (arr && pt !== 3) o++; if (pt === 3) continue; if (nm === "Format") fmt = b[o]; else if (nm === "USize") U = dv.getInt32(o, true); else if (nm === "VSize") V = dv.getInt32(o, true); o += d; }
  const F = { 3: "DXT1", 5: "RGBA8", 7: "DXT3", 8: "DXT5" }[fmt]; if (!U || !V || !F) return null;
  const bpp = F === "DXT1" ? 0.5 : F === "RGBA8" ? 4 : 1; const topLen = (U * V * bpp) | 0;
  const end = e.off + e.sz; let doff = -1; for (let p = o; p < Math.min(end - 8, o + 16384); p++) { const [v, s] = c32(p); if (v === topLen && p + s + topLen <= end) { doff = p + s; break; } }
  if (doff < 0) return null; const data = b.subarray(doff, doff + topLen); let rgba;
  if (F === "RGBA8") { rgba = new Uint8Array(U * V * 4); for (let i = 0; i < rgba.length; i += 4) { rgba[i] = data[i + 2]; rgba[i + 1] = data[i + 1]; rgba[i + 2] = data[i]; rgba[i + 3] = data[i + 3]; } }
  else rgba = dxt(data, U, V, F);
  return { U, V, rgba };
}

// ── extract TerrainInfo layers (Texture + AlphaMap names) with nested struct parse ──
function resolveRef(pk, idx) { if (idx < 0) { const imp = pk.imps?.[-idx - 1]; return imp || null; } if (idx > 0) return { pkg: "(this)", name: pk.exps[idx - 1]?.n }; return null; }
function readTerrainLayers(pk) {
  // re-parse imports w/ outer for pkg names
  const { b, dv, names, c32 } = pk;
  const layers = [];
  const ti = pk.exps.find((e) => e.className === "TerrainInfo" && e.sz > 0);
  if (!ti) return { layers, ti: null };
  // build import name map: idx<0 → "pkg.name"
  const impC = dv.getUint32(28, true), impO = dv.getUint32(32, true);
  let o = impO; const imports = [];
  for (let i = 0; i < impC; i++) { o += c32(o)[1]; const [cn, s2] = c32(o); o += s2; const outer = dv.getInt32(o, true); o += 4; const [on, s3] = c32(o); o += s3; imports.push({ name: names[on], outer, className: names[cn] }); }
  const refName = (idx) => { if (idx < 0) { const imp = imports[-idx - 1]; if (!imp) return null; let pkg = "?"; let ot = imp.outer; for (let k = 0; k < 8 && ot < 0; k++) { const p = imports[-ot - 1]; if (!p) break; pkg = p.name; ot = p.outer; } return { pkg, name: imp.name }; } if (idx > 0) return { pkg: "(this)", name: pk.exps[idx - 1]?.n }; return null; };
  // walk TerrainInfo tagged properties, capturing Layers structs
  o = ti.off; const ci = () => { const [v, s] = c32(o); o += s; return v; };
  if (ti.flags & RF) { const n = ci(); ci(); o += 12; if (n !== 0) ci(); }
  let guard = 0;
  for (;;) {
    if (guard++ > 4000) break;
    const ni = ci(); const nm = names[ni]; if (nm === "None") break;
    const info = b[o++]; const pt = info & 0x0f, szc = info & 0x70, arr = info & 0x80;
    let structName = null; if (pt === 0x0a) structName = names[ci()];
    let dsz; if (szc in SS) dsz = SS[szc]; else if (szc === 0x50) dsz = b[o++]; else if (szc === 0x60) { dsz = dv.getUint16(o, true); o += 2; } else if (szc === 0x70) { dsz = dv.getUint32(o, true); o += 4; } else dsz = 0;
    if (arr && pt !== 0x03) o++;
    if (pt === 0x03) continue;
    if (nm === "Layers" && structName === "TerrainLayer") {
      // nested property list within [o, o+dsz)
      const endN = o + dsz; let no = o, tex = null, alpha = null, ng = 0;
      while (no < endN && ng++ < 200) {
        const [nni, s1] = c32(no); no += s1; const nnm = names[nni]; if (nnm === "None") break;
        const ninfo = b[no++]; const npt = ninfo & 0x0f, nszc = ninfo & 0x70, narr = ninfo & 0x80;
        if (npt === 0x0a) { no += c32(no)[1]; }
        let nd; if (nszc in SS) nd = SS[nszc]; else if (nszc === 0x50) nd = b[no++]; else if (nszc === 0x60) { nd = dv.getUint16(no, true); no += 2; } else if (nszc === 0x70) { nd = dv.getUint32(no, true); no += 4; } else nd = 0;
        if (narr && npt !== 0x03) no++;
        if (npt === 0x03) continue;
        if (nnm === "Texture" && npt === 0x05) tex = refName(c32(no)[0]);
        else if (nnm === "AlphaMap" && npt === 0x05) alpha = refName(c32(no)[0]);
        no += nd;
      }
      layers.push({ tex, alpha });
    }
    o += dsz;
  }
  return { layers, ti };
}

function crc(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; }
function chunk(t, d) { const tt = Buffer.from(t); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const bd = Buffer.concat([tt, d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(bd)); return Buffer.concat([l, bd, cr]); }
function png(rgb, w, h) { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const st = w * 3; const raw = Buffer.alloc((st + 1) * h); for (let y = 0; y < h; y++) { raw[y * (st + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * st, st).copy(raw, y * (st + 1) + 1); } return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]); }

const texCache = new Map();
async function loadTex(pkgName, name) {
  const key = `${pkgName}.${name}`; if (texCache.has(key)) return texCache.get(key);
  let r = null;
  if (pkgName && pkgName !== "(this)" && existsSync(join(TEX, `${pkgName}.utx`))) {
    try { r = readTex(parse(dec(new Uint8Array((await readFile(join(TEX, `${pkgName}.utx`))).buffer))), name); } catch { r = null; }
  }
  texCache.set(key, r); return r;
}

async function bakeTile(tileKey) {
  const file = join(MAPS, `${tileKey}.unr`);
  if (!existsSync(file)) { console.log(`  ${tileKey}: no .unr`); return; }
  const pk = parse(dec(new Uint8Array((await readFile(file)).buffer)));
  pk.imps = []; // unused
  const { layers } = readTerrainLayers(pk);
  if (!layers.length) { console.log(`  ${tileKey}: no terrain layers`); return; }
  const out = new Float32Array(SIZE * SIZE * 3);
  const samp = (t, u, v) => { const x = (((u % 1) + 1) % 1 * (t.U - 1)) | 0, y = (((v % 1) + 1) % 1 * (t.V - 1)) | 0; const i = (y * t.U + x) * 4; return [t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]]; };
  let baked = 0, baseDone = false;
  for (const layer of layers) {
    if (!layer.tex) continue;
    const ground = await loadTex(layer.tex.pkg, layer.tex.name); if (!ground) continue;
    const mask = layer.alpha ? await loadTex(layer.alpha.pkg, layer.alpha.name) : null;
    if (baseDone && !mask) continue; // overlay needs a mask
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE, v = y / SIZE;
      const [r, g, b] = samp(ground, u * TILE, v * TILE);
      const a = !baseDone ? 1 : samp(mask, u, v)[1] / 255; // mask is guaranteed for overlays
      if (a <= 0) continue;
      const di = (y * SIZE + x) * 3;
      out[di] = out[di] * (1 - a) + r * a; out[di + 1] = out[di + 1] * (1 - a) + g * a; out[di + 2] = out[di + 2] * (1 - a) + b * a;
    }
    baseDone = true; baked++;
  }
  if (!baked) { console.log(`  ${tileKey}: no usable layer textures`); return; }
  const rgb = new Uint8Array(SIZE * SIZE * 3); for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, out[i])) | 0;
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, `${tileKey}.png`), png(rgb, SIZE, SIZE));
  console.log(`  ${tileKey}: ${baked} layers → ${tileKey}.png (${SIZE}px)`);
}

async function main() {
  const args = process.argv.slice(2);
  let tiles = args;
  if (!tiles.length) tiles = (await readdir(MAPS).catch(() => [])).filter((f) => /^\d+_\d+\.unr$/i.test(f)).map((f) => basename(f, ".unr"));
  for (const t of tiles) await bakeTile(t).catch((e) => console.log(`  ${t}: ${e.message}`));
}
main();
