#!/usr/bin/env node
/**
 * l2-extract-npc-textures.mjs — decode the diffuse textures referenced by the
 * exact npcgrp map into PNGs the browser applies to the NPC meshes.
 *
 * Each npc's primary texture (t[0]) is "<Package>.[group.]<export>"; we open
 * SysTextures/<Package>.utx, find the Texture export by its final name, decode
 * (P8/DXT1/3/5/RGBA8) → public/models/npc/tex/<sanitised>.png.
 *
 * Usage: node tools/l2-extract-npc-textures.mjs [meshPkg1 meshPkg2 …]  (default: town NPC packages)
 *        node tools/l2-extract-npc-textures.mjs --all
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const L2 = "/sessions/optimistic-focused-wozniak/mnt/L2Slave";
const SYSTEX = join(L2, "SysTextures");
const OUTDIR = join(ROOT, "public", "models", "npc", "tex");
const TAG = [0xc1, 0x83, 0x2a, 0x9e], RF_HAS_STACK = 0x02000000;
const SS = { 0x00: 1, 0x10: 2, 0x20: 4, 0x30: 12, 0x40: 16 };
const TOWN = ["LineageNPCs", "LineageNPCs2", "LineageNPCs3", "LineageNPCs4", "LineageNPCs5", "LineageNpcsEV", "LineageNPCsEV", "LineageNpcs"];

function decode(raw) { const hs = 28, key = raw[hs] ^ TAG[0]; const ok = [0, 1, 2, 3].every((i) => (raw[hs + i] ^ key) === TAG[i]); const b = ok ? new Uint8Array(raw.length - hs) : raw; if (ok) for (let i = 0; i < b.length; i++) b[i] = raw[hs + i] ^ key; return b; }
function parsePkg(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const c32 = (p) => { let b0 = b[p], s = b0 & 0x80, v = b0 & 0x3f, sz = 1; if (b0 & 0x40) { let sh = 6; for (;;) { const x = b[p + sz]; sz++; v |= (x & 0x7f) << sh; sh += 7; if (!(x & 0x80)) break; if (sz >= 5) break; } } return [s ? -v : v, sz]; };
  const nameC = dv.getUint32(12, true), nameO = dv.getUint32(16, true), expC = dv.getUint32(20, true), expO = dv.getUint32(24, true), impC = dv.getUint32(28, true), impO = dv.getUint32(32, true);
  let o = nameO; const names = []; for (let i = 0; i < nameC; i++) { const [L, s] = c32(o); o += s; if (L < 0 || L > 1024) throw new Error("bad name"); let nm = ""; for (let c = 0; c < L - 1; c++) nm += String.fromCharCode(b[o + c]); o += L + 4; names.push(nm); }
  o = impO; const imps = []; for (let i = 0; i < impC; i++) { const [pkgClass, sp1] = c32(o); o += sp1; const [cn, s2] = c32(o); o += s2; const pkgRef = dv.getInt32(o, true); o += 4; const [on, s3] = c32(o); o += s3; imps.push({ className: names[cn] ?? "", objectName: names[on] ?? "", packageName: pkgRef < 0 && imps[-pkgRef - 1] ? imps[-pkgRef - 1].objectName : "", _pkgClass: pkgClass }); }
  o = expO; const exps = []; for (let i = 0; i < expC; i++) { const [cls, s1] = c32(o); o += s1; o += c32(o)[1]; o += 4; const [on, s4] = c32(o); o += s4; const flags = dv.getUint32(o, true); o += 4; const [sz, s5] = c32(o); o += s5; let off = 0; if (sz > 0) { const [o2, s6] = c32(o); o += s6; off = o2; } exps.push({ objectName: names[on], className: cls < 0 ? (imps[-cls - 1]?.className ?? "") : cls > 0 ? names[on] : "Class", flags, size: sz, offset: off }); }
  return { b, dv, c32, names, exps };
}
function readPalette(pkg, e) {
  const { b, dv, c32 } = pkg; let o = e.offset; const ci = () => { const [v, s] = c32(o); o += s; return v; };
  if (e.flags & RF_HAS_STACK) { const n = ci(); ci(); o += 12; if (n !== 0) ci(); }
  let g = 0; for (;;) { if (g++ > 400) break; const nm = pkg.names[ci()]; if (nm === "None") break; const info = b[o++]; const pt = info & 0x0f, szc = info & 0x70, arr = info & 0x80; if (pt === 0x0a) ci(); let d; if (szc in SS) d = SS[szc]; else if (szc === 0x50) d = b[o++]; else if (szc === 0x60) { d = dv.getUint16(o, true); o += 2; } else if (szc === 0x70) { d = dv.getUint32(o, true); o += 4; } else d = 0; if (arr && pt !== 0x03) o++; if (pt === 0x03) continue; o += d; }
  const count = ci(); if (count < 1 || count > 4096) return null; const pal = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) { const bch = b[o++], gg = b[o++], r = b[o++], a = b[o++]; pal[i * 4] = r; pal[i * 4 + 1] = gg; pal[i * 4 + 2] = bch; pal[i * 4 + 3] = a; }
  return pal;
}
function readTexture(pkg, e) {
  const { b, dv, c32 } = pkg; let o = e.offset; const ci = () => { const [v, s] = c32(o); o += s; return v; };
  if (e.flags & RF_HAS_STACK) { const n = ci(); ci(); o += 12; if (n !== 0) ci(); }
  let fmtId = -1, U = 0, V = 0, palRef = 0, g = 0;
  for (;;) { if (g++ > 400) break; const nm = pkg.names[ci()]; if (nm === "None") break; const info = b[o++]; const pt = info & 0x0f, szc = info & 0x70, arr = info & 0x80; if (pt === 0x0a) ci(); let d; if (szc in SS) d = SS[szc]; else if (szc === 0x50) d = b[o++]; else if (szc === 0x60) { d = dv.getUint16(o, true); o += 2; } else if (szc === 0x70) { d = dv.getUint32(o, true); o += 4; } else d = 0; if (arr && pt !== 0x03) o++; if (pt === 0x03) continue; if (nm === "Format") fmtId = b[o]; else if (nm === "USize") U = dv.getInt32(o, true); else if (nm === "VSize") V = dv.getInt32(o, true); else if (nm === "Palette" && pt === 0x05) palRef = c32(o)[0]; o += d; }
  const fmt = { 0: "P8", 3: "DXT1", 5: "RGBA8", 7: "DXT3", 8: "DXT5", 10: "G16" }[fmtId];
  if (!U || !V || !fmt) return null;
  const bpp = fmt === "DXT1" ? 0.5 : fmt === "RGBA8" ? 4 : fmt === "G16" ? 2 : 1; const topLen = Math.floor(U * V * bpp);
  const end = e.offset + e.size; let dataOff = -1; const scanEnd = Math.min(end - 8, o + 16384);
  for (let p = o; p < scanEnd; p++) { const [v, s] = c32(p); if (v === topLen && p + s + topLen <= end) { dataOff = p + s; break; } }
  if (dataOff < 0) return null; const raw = b.subarray(dataOff, dataOff + topLen); let rgba;
  if (fmt === "RGBA8") { rgba = new Uint8Array(U * V * 4); for (let i = 0; i < rgba.length; i += 4) { rgba[i] = raw[i + 2]; rgba[i + 1] = raw[i + 1]; rgba[i + 2] = raw[i]; rgba[i + 3] = raw[i + 3]; } }
  else if (fmt === "P8") { let pal = null; if (palRef > 0) { const pe = pkg.exps[palRef - 1]; if (pe) pal = readPalette(pkg, pe); } if (!pal) return null; rgba = new Uint8Array(U * V * 4); for (let i = 0; i < U * V; i++) { const idx = raw[i] * 4; rgba[i * 4] = pal[idx]; rgba[i * 4 + 1] = pal[idx + 1]; rgba[i * 4 + 2] = pal[idx + 2]; rgba[i * 4 + 3] = pal[idx + 3]; } }
  else if (fmt === "G16") { rgba = new Uint8Array(U * V * 4); for (let i = 0; i < U * V; i++) { const gg = raw[i * 2 + 1]; rgba[i * 4] = gg; rgba[i * 4 + 1] = gg; rgba[i * 4 + 2] = gg; rgba[i * 4 + 3] = 255; } }
  else rgba = decodeDXT(raw, U, V, fmt);
  return { width: U, height: V, rgba };
}
function decodeDXT(src, w, h, fmt) {
  const out = new Uint8Array(w * h * 4); const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2); let sp = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let alpha = null, aIdx = null;
    if (fmt === "DXT3") { alpha = new Uint8Array(16); for (let i = 0; i < 8; i++) { const v = src[sp + i]; alpha[i * 2] = (v & 0x0f) * 17; alpha[i * 2 + 1] = (v >> 4) * 17; } sp += 8; }
    else if (fmt === "DXT5") { const a0 = src[sp], a1 = src[sp + 1]; const at = [a0, a1, 0, 0, 0, 0, 0, 0]; if (a0 > a1) for (let i = 1; i < 7; i++) at[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7); else { for (let i = 1; i < 5; i++) at[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); at[6] = 0; at[7] = 255; } let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(src[sp + 2 + i]) << BigInt(8 * i); aIdx = new Uint8Array(16); for (let i = 0; i < 16; i++) aIdx[i] = at[Number((bits >> BigInt(3 * i)) & 7n)]; sp += 8; }
    const c0 = src[sp] | (src[sp + 1] << 8), c1 = src[sp + 2] | (src[sp + 3] << 8), lut = (src[sp + 4] | (src[sp + 5] << 8) | (src[sp + 6] << 16) | (src[sp + 7] << 24)) >>> 0; sp += 8;
    const r0 = ((c0 >> 11) & 31) * 255 / 31, g0 = ((c0 >> 5) & 63) * 255 / 63, b0 = (c0 & 31) * 255 / 31, r1 = ((c1 >> 11) & 31) * 255 / 31, g1 = ((c1 >> 5) & 63) * 255 / 63, b1 = (c1 & 31) * 255 / 31;
    const pr = [r0, r1, 0, 0], pg = [g0, g1, 0, 0], pb = [b0, b1, 0, 0], pa = [255, 255, 255, 255];
    if (fmt === "DXT1" && c0 <= c1) { pr[2] = (r0 + r1) / 2; pg[2] = (g0 + g1) / 2; pb[2] = (b0 + b1) / 2; pa[3] = 0; } else { pr[2] = (2 * r0 + r1) / 3; pg[2] = (2 * g0 + g1) / 3; pb[2] = (2 * b0 + b1) / 3; pr[3] = (r0 + 2 * r1) / 3; pg[3] = (g0 + 2 * g1) / 3; pb[3] = (b0 + 2 * b1) / 3; }
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = bx * 4 + px, y = by * 4 + py; if (x >= w || y >= h) continue; const ci = (lut >> (2 * (py * 4 + px))) & 3, di = (y * w + x) * 4, li = py * 4 + px; out[di] = pr[ci] | 0; out[di + 1] = pg[ci] | 0; out[di + 2] = pb[ci] | 0; out[di + 3] = fmt === "DXT3" ? alpha[li] : fmt === "DXT5" ? aIdx[li] : pa[ci]; }
  }
  return out;
}
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; }
function pchunk(t, d) { const tt = Buffer.from(t, "latin1"); const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const body = Buffer.concat([tt, d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(body), 0); return Buffer.concat([l, body, cr]); }
function png(rgba, w, h) { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; const st = w * 4; const r = Buffer.alloc((st + 1) * h); for (let y = 0; y < h; y++) { r[y * (st + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * st, st).copy(r, y * (st + 1) + 1); } return Buffer.concat([sig, pchunk("IHDR", ih), pchunk("IDAT", deflateSync(r, { level: 6 })), pchunk("IEND", Buffer.alloc(0))]); }

export function texFileName(full) { return full.replace(/[^A-Za-z0-9]+/g, "_") + ".png"; }

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const meshPkgs = args.filter((a) => !a.startsWith("--"));
  const filter = all ? null : new Set(meshPkgs.length ? meshPkgs : TOWN);
  const map = JSON.parse(await readFile(join(ROOT, "public/models/npc-mesh-map.json"), "utf8"));
  // distinct primary textures whose MESH package is in scope
  const tex = new Set();
  for (const v of Object.values(map)) {
    if (!v.t?.length) continue;
    const meshPkg = v.m.split(".")[0];
    if (filter && !filter.has(meshPkg)) continue;
    tex.add(v.t[0]);
  }
  console.error(`distinct primary textures to decode: ${tex.size}`);
  await mkdir(OUTDIR, { recursive: true });
  const sysFiles = await readdir(SYSTEX);
  const cache = new Map();
  const loadUtx = (pk) => { const k = pk.toLowerCase(); if (cache.has(k)) return cache.get(k); const f = sysFiles.find((x) => x.toLowerCase() === `${k}.utx`); let pkg = null; if (f) { try { pkg = parsePkg(decode(new Uint8Array(readFileSync(join(SYSTEX, f)).buffer))); } catch { pkg = null; } } cache.set(k, pkg); return pkg; };
  let ok = 0, miss = 0, skip = 0;
  const { existsSync } = await import("node:fs");

  // Levenshtein for nearest-name diagnostics (small, inline).
  const lev = (a, b) => { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; const dp = new Array(n + 1); for (let j = 0; j <= n; j++) dp[j] = j; for (let i = 1; i <= m; i++) { let prev = dp[0]; dp[0] = i; for (let j = 1; j <= n; j++) { const tmp = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]); prev = tmp; } } return dp[n]; };
  const isTex = (x) => /texture/i.test(x.className);
  const isShader = (x) => /shader|finalblend|modifier|texenvmap|texpanner|texoscillator|texrotator|texscaler|combiner/i.test(x.className);
  const notMap = (n) => !/_sp\d?$|_sh$|_n$|_normal$/i.test(n);

  // Walk an export's properties and collect Diffuse / Material / Texture refs.
  function readShaderRefs(pkg, e) {
    const { b, dv, c32 } = pkg; let o = e.offset; const ci = () => { const [v, s] = c32(o); o += s; return v; };
    if (e.flags & RF_HAS_STACK) { const n = ci(); ci(); o += 12; if (n !== 0) ci(); }
    const refs = []; let g = 0;
    for (;;) {
      if (g++ > 400) break;
      const nm = pkg.names[ci()]; if (nm === "None") break;
      const info = b[o++]; const pt = info & 0x0f, szc = info & 0x70, arr = info & 0x80;
      if (pt === 0x0a) ci();
      let d; if (szc in SS) d = SS[szc]; else if (szc === 0x50) d = b[o++]; else if (szc === 0x60) { d = dv.getUint16(o, true); o += 2; } else if (szc === 0x70) { d = dv.getUint32(o, true); o += 4; } else d = 0;
      if (arr && pt !== 0x03) o++;
      if (pt === 0x03) continue;
      // pt === 0x05 → ObjectProperty (compact int signed: >0 export, <0 import).
      if (pt === 0x05 && /^(Diffuse|Material|Texture|FallbackMaterial|DiffuseTexture)$/i.test(nm)) {
        const ref = c32(o)[0];
        refs.push({ propName: nm, ref });
      }
      o += d;
    }
    return refs;
  }

  // Resolve an export to a Texture export, following Shader/FinalBlend chains
  // across packages. Returns { pkg, exp } or null. depth-limited to 3.
  function resolveTexture(pkg, e, depth, seen) {
    if (depth > 3 || !e) return null;
    const key = `${pkg.__name || ""}#${e.offset}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (isTex(e)) return { pkg, exp: e };
    if (!isShader(e)) return null;
    const refs = readShaderRefs(pkg, e);
    for (const { ref } of refs) {
      if (ref > 0) {
        const next = pkg.exps[ref - 1];
        const hit = resolveTexture(pkg, next, depth + 1, seen);
        if (hit) return hit;
      } else if (ref < 0) {
        const imp = pkg.imps[-ref - 1]; if (!imp) continue;
        const otherPkg = imp.packageName && loadUtx(imp.packageName);
        if (!otherPkg) continue;
        const nextExp = otherPkg.exps.find((x) => x.objectName === imp.objectName);
        if (!nextExp) continue;
        const hit = resolveTexture(otherPkg, nextExp, depth + 1, seen);
        if (hit) return hit;
      }
    }
    return null;
  }

  for (const full of tex) {
    if (existsSync(join(OUTDIR, texFileName(full)))) { skip++; ok++; continue; }
    const parts = full.split("."); const pk = parts[0]; const exportName = parts[parts.length - 1];
    const pkg = loadUtx(pk); if (!pkg) { miss++; console.warn(`[tex-miss] ${full} — package not found`); continue; }
    pkg.__name = pk;

    // Search order: (1) exact Texture, (2) <name>_ori, (3) prefix Texture, (4) Shader-chain follow.
    let candidate = null;
    candidate = pkg.exps.find((x) => x.objectName === exportName && isTex(x) && notMap(x.objectName));
    if (!candidate) candidate = pkg.exps.find((x) => x.objectName === exportName + "_ori" && isTex(x) && notMap(x.objectName));
    if (!candidate) candidate = pkg.exps.find((x) => x.objectName.startsWith(exportName) && isTex(x) && notMap(x.objectName));

    // If still no Texture, look for a Shader/FinalBlend with that name and follow its refs.
    let resolved = candidate ? { pkg, exp: candidate } : null;
    if (!resolved) {
      const shader = pkg.exps.find((x) => (x.objectName === exportName || x.objectName === exportName + "_ori" || x.objectName.startsWith(exportName)) && isShader(x));
      if (shader) resolved = resolveTexture(pkg, shader, 0, new Set());
    }

    if (!resolved) {
      const nearest = pkg.exps
        .filter((x) => isTex(x) || isShader(x))
        .map((x) => ({ name: x.objectName, cls: x.className, d: lev(x.objectName.toLowerCase(), exportName.toLowerCase()) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
        .map((x) => `${x.name}(${x.cls})`);
      console.warn(`[tex-miss] ${full} — nearest: ${nearest.join(", ") || "<none>"}`);
      miss++;
      continue;
    }

    let dec; try { dec = readTexture(resolved.pkg, resolved.exp); } catch { dec = null; }
    if (!dec) { console.warn(`[tex-miss] ${full} — decode failed for ${resolved.exp.objectName}`); miss++; continue; }
    await writeFile(join(OUTDIR, texFileName(full)), png(dec.rgba, dec.width, dec.height));
    ok++;
  }
  console.error(`decoded ${ok} textures, ${miss} missing → ${OUTDIR}`);
}
main();
