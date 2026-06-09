#!/usr/bin/env node
/**
 * tools/l2-extract-animations.mjs
 *
 * Walks the anim ukx packages and emits per-package JSON files with the
 * MeshAnimation contents (refBones + motion tracks + sequence names).
 *
 *   node tools/l2-extract-animations.mjs \
 *       --client /path/to/L2/systextures/animations \
 *       --out public/anim
 *
 * Anim packages discovered (per FIX 7 spec):
 *   Magic.ukx, Fighter.ukx, LineageMonsters[1-16].ukx, LineageNPCs[1-?].ukx
 *
 * Output schema (per .ukx → one .json file):
 *   { pkg, refBones: [{name,a,b}], anims: [
 *       { name, frameStart, frameCount, framerate,
 *         tracks: [{ flags, keyQuat[4*N], keyPos[3*N], keyTime[N] }],
 *         rootTrack: { ... }
 *       } ]
 *   }
 *
 * Only Wait_* and Run_* sequences are emitted by default (the runtime cares
 * about locomotion first); pass --all to dump every sequence.
 *
 * NOTE: this is the harness — the real decoder lives in
 * src/lib/l2-protocol/mesh-animation.ts (decodeMeshAnimation). We dynamically
 * import the TS module via tsx if available, else use a CommonJS bridge.
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) =>
    a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"] : []
  ).filter(Boolean)
);

const CLIENT = args.client;
const OUT = args.out ?? "public/anim";
const KEEP_ALL = args.all === "true";

if (!CLIENT) {
  console.error("usage: l2-extract-animations.mjs --client <dir> [--out public/anim] [--all]");
  process.exit(2);
}

const ANIM_PKGS = [
  "Magic.ukx", "Fighter.ukx",
  ...Array.from({ length: 16 }, (_, i) => `LineageMonsters${i + 1}.ukx`),
  ...Array.from({ length: 8 }, (_, i) => `LineageNPCs${i + 1}.ukx`),
  "LineageNPCs.ukx",
];

await fs.mkdir(OUT, { recursive: true });

let { decodeMeshAnimation } = { decodeMeshAnimation: null };
try {
  const mod = await import("../src/lib/l2-protocol/mesh-animation.ts");
  decodeMeshAnimation = mod.decodeMeshAnimation;
} catch (e) {
  console.error("[anim-tool] could not import decoder — run with `npx tsx` or `bun`. Error:", e.message);
  process.exit(3);
}

// Minimal UE2 package walker — relies on existing ukx infra in this repo.
const { readPackageNames } = await import("../src/lib/l2-protocol/ukx/skeletal-mesh.ts");

function readExportTable(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x9e2a83c1) return null;
  /* ver/lic */ dv.getUint16(4, true); dv.getUint16(6, true);
  /* flags */ dv.getUint32(8, true);
  const nameCount = dv.getUint32(12, true);
  const nameOff = dv.getUint32(16, true);
  const exportCount = dv.getUint32(20, true);
  const exportOff = dv.getUint32(24, true);
  void nameCount; void nameOff;
  // Export table entries in ver133/lic40: variable-length (compact ints).
  // We do a tolerant pass: walk and skip — return raw offsets/sizes only.
  return { exportCount, exportOff };
}

async function extractPackage(file) {
  const buf = (await fs.readFile(file)).buffer;
  const names = readPackageNames(buf);
  if (!names) return { ok: false, reason: "bad header" };
  const ext = readExportTable(buf);
  if (!ext) return { ok: false, reason: "no export table" };
  // For each plausible MeshAnimation export, try decode. Without full export
  // table parsing we scan for property terminator "None" followed by the
  // version dword characteristic of MeshAnimation (≥ 1, ≤ 1000).
  const noneIdx = names.findIndex((n) => n.name === "None");
  if (noneIdx < 0) return { ok: false, reason: "no None name" };
  // The package-wide MeshAnimation export typically appears near the end.
  // We brute-force: try decode starting after each property-terminator marker
  // pattern and keep the largest successful decode.
  let best = null;
  const dv = new DataView(buf);
  for (let p = 0x100; p < buf.byteLength - 32; p += 1) {
    // crude resync — version is small, refBone count plausible
    const v = dv.getUint32(p, true);
    if (v < 1 || v > 1000) continue;
    const anim = decodeMeshAnimation(buf, p, buf.byteLength, names);
    if (anim && anim.refBones.length >= 8 && anim.sequences.length >= 1) {
      if (!best || anim.sequences.length > best.sequences.length) best = anim;
    }
  }
  if (!best) return { ok: false, reason: "no mesh-animation export decoded" };
  // Filter sequences to Wait_/Run_ unless --all.
  const filter = KEEP_ALL ? () => true : (s) => /^(Wait|Run)_/i.test(s.name);
  const indices = best.sequences.map((s, i) => [s, i]).filter(([s]) => filter(s));
  return {
    ok: true,
    pkg: path.basename(file),
    refBones: best.refBones,
    anims: indices.map(([s, i]) => {
      const m = best.motions[i];
      return {
        name: s.name,
        frameStart: s.frameStart, frameCount: s.frameCount, framerate: s.framerate,
        tracks: m ? m.tracks.map((t) => ({
          flags: t.flags,
          keyQuat: Array.from(t.keyQuat),
          keyPos:  Array.from(t.keyPos),
          keyTime: Array.from(t.keyTime),
        })) : [],
        rootTrack: m?.rootTrack ? {
          flags: m.rootTrack.flags,
          keyQuat: Array.from(m.rootTrack.keyQuat),
          keyPos:  Array.from(m.rootTrack.keyPos),
          keyTime: Array.from(m.rootTrack.keyTime),
        } : null,
      };
    }),
  };
}

const entries = await fs.readdir(CLIENT).catch(() => []);
const want = new Set(ANIM_PKGS.map((s) => s.toLowerCase()));
let okCount = 0, failCount = 0;
for (const e of entries) {
  if (!want.has(e.toLowerCase())) continue;
  const full = path.join(CLIENT, e);
  try {
    const res = await extractPackage(full);
    if (!res.ok) { console.warn(`[anim] skip ${e}: ${res.reason}`); failCount++; continue; }
    const outFile = path.join(OUT, e.replace(/\.ukx$/i, ".json"));
    await fs.writeFile(outFile, JSON.stringify(res));
    console.log(`[anim] ${e}  → ${res.anims.length} sequences, ${res.refBones.length} bones`);
    okCount++;
  } catch (err) {
    console.warn(`[anim] error on ${e}:`, err.message);
    failCount++;
  }
}
console.log(`[anim] done. ok=${okCount}  fail=${failCount}`);
