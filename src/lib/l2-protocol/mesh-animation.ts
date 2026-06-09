/**
 * S16 — MeshAnimation decoder (typed skeleton).
 *
 * UE2 MeshAnimation export (ver133 / lic40, confirmed against FMagic_anim,
 * 90 bones / 365 sequences):
 *
 *   stack frame + property list
 *   u32 version
 *   FArray<FNamedBone> refBones                     // {name(ci), u32, u32}
 *   u32 endPos
 *   compat32 motionCount
 *   per motion:
 *     u32 chunkEnd                                  // jump-target for safety
 *     FMotionChunk {
 *       FVector rootSpeed3d
 *       float trackTime
 *       u32 startBone
 *       u32 flags
 *       FPrimArray<u32> boneIndices
 *       FArray<FAnalogTrack> tracks
 *       FAnalogTrack rootTrack
 *     }
 *     FAnalogTrack {
 *       u32 flags
 *       FArray<FQuaternion> keyQuat                 // 16B each (length 1 = const)
 *       FArray<FVector>     keyPos                  // 12B each
 *       FPrimArray<float>   keyTime
 *     }
 *
 *   at endPos:
 *     FArray<FAnimSequence>                         // per seq:
 *       name + frameStart + frameCount + framerate
 *     // tail (license) is VARIABLE — read the stable head:
 *     //   float, name(ci), groupNames, frameStart u32, frameCount u32,
 *     //   notifications, framerate float
 *     // then resync to next record by scanning for float ∈ (0, 1e6) + a name
 *     // index containing '_'.
 *
 * Pairing: motion[i] ↔ sequence[i].
 * Naming: Wait_<weapon>, Run_<weapon>, Atk01_<weapon>, …
 *
 * Anim packages per category:
 *   Magic.ukx           → MMagic_anim, FMagic_anim
 *   Fighter.ukx         → MFighter_anim, FFighter_anim
 *   LineageMonsters.ukx → per monster
 *   LineageNPCs.ukx     → per NPC
 *
 * Runtime: build skeleton from refBones, bind skinned mesh, per frame slerp
 * each bone's localRotation from the current sequence's track. Watch out for
 * the same coord conversion gotcha as armor (S7).
 */

export interface AnalogTrack {
  flags: number;
  keyQuat: Float32Array; // length = 4 * N
  keyPos: Float32Array;  // length = 3 * N
  keyTime: Float32Array; // length = N
}

export interface MotionChunk {
  rootSpeed: [number, number, number];
  trackTime: number;
  startBone: number;
  flags: number;
  boneIndices: Uint32Array;
  tracks: AnalogTrack[];
  rootTrack: AnalogTrack;
}

export interface AnimSequence {
  name: string;
  groupNames: string[];
  frameStart: number;
  frameCount: number;
  framerate: number;
}

export interface MeshAnimation {
  version: number;
  refBones: Array<{ name: string; a: number; b: number }>;
  motions: MotionChunk[];
  sequences: AnimSequence[];
}

/** Pair motion[i] ↔ sequence[i] by index, returning a name→motion map. */
export function pairMotionsToSequences(anim: MeshAnimation): Map<string, MotionChunk> {
  const out = new Map<string, MotionChunk>();
  const n = Math.min(anim.motions.length, anim.sequences.length);
  for (let i = 0; i < n; i++) out.set(anim.sequences[i].name, anim.motions[i]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary decoder. Operates on an already-isolated MeshAnimation export blob.
// Tolerant: any sub-record that fails resyncs to the next plausible record by
// scanning for the stable head pattern (float ∈ (0, 1e6) followed by a name
// table index whose resolved name contains '_'). Callers pass the resolved
// name table so we can validate name indices.
// ─────────────────────────────────────────────────────────────────────────────

import { BinaryReader, readSizedString } from "./ukx/name-table";

interface NameLike { name: string }

function readCompact32(r: BinaryReader): number { return r.compactSigned(); }

function readArrayHeader(r: BinaryReader): number {
  const n = readCompact32(r);
  return n < 0 ? 0 : n;
}

function readNamedBones(r: BinaryReader, names: NameLike[]): MeshAnimation["refBones"] {
  const count = readArrayHeader(r);
  const out: MeshAnimation["refBones"] = new Array(count);
  for (let i = 0; i < count; i++) {
    const ni = readCompact32(r);
    const name = names[ni]?.name ?? `bone_${i}`;
    const a = r.u32();
    const b = r.u32();
    out[i] = { name, a, b };
  }
  return out;
}

function readAnalogTrack(r: BinaryReader): AnalogTrack {
  const flags = r.u32();
  const nQ = readArrayHeader(r);
  const keyQuat = new Float32Array(nQ * 4);
  for (let i = 0; i < nQ; i++) {
    keyQuat[i * 4 + 0] = r.f32();
    keyQuat[i * 4 + 1] = r.f32();
    keyQuat[i * 4 + 2] = r.f32();
    keyQuat[i * 4 + 3] = r.f32();
  }
  const nP = readArrayHeader(r);
  const keyPos = new Float32Array(nP * 3);
  for (let i = 0; i < nP; i++) {
    keyPos[i * 3 + 0] = r.f32();
    keyPos[i * 3 + 1] = r.f32();
    keyPos[i * 3 + 2] = r.f32();
  }
  const nT = readArrayHeader(r);
  const keyTime = new Float32Array(nT);
  for (let i = 0; i < nT; i++) keyTime[i] = r.f32();
  return { flags, keyQuat, keyPos, keyTime };
}

function readMotionChunk(r: BinaryReader): MotionChunk {
  const rx = r.f32(), ry = r.f32(), rz = r.f32();
  const trackTime = r.f32();
  const startBone = r.u32();
  const flags = r.u32();
  const nbi = readArrayHeader(r);
  const boneIndices = new Uint32Array(nbi);
  for (let i = 0; i < nbi; i++) boneIndices[i] = r.u32();
  const nTracks = readArrayHeader(r);
  const tracks: AnalogTrack[] = new Array(nTracks);
  for (let i = 0; i < nTracks; i++) tracks[i] = readAnalogTrack(r);
  const rootTrack = readAnalogTrack(r);
  return {
    rootSpeed: [rx, ry, rz],
    trackTime, startBone, flags,
    boneIndices, tracks, rootTrack,
  };
}

/**
 * Read the variable-tail per-sequence record. The stable head is:
 *   float, name(ci), groupNames FArray<name(ci)>, u32 frameStart,
 *   u32 frameCount, notifications FArray<...>, float framerate
 * On any anomaly, resync forward to the next float ∈ (0, 1e6) whose
 * following name index resolves to a string containing '_'.
 */
function readAnimSequence(r: BinaryReader, names: NameLike[]): AnimSequence | null {
  try {
    /* float (anim flags / rate hint, varies) */ r.f32();
    const ni = readCompact32(r);
    const name = names[ni]?.name ?? "";
    const gCount = readArrayHeader(r);
    const groupNames: string[] = [];
    for (let i = 0; i < gCount; i++) {
      const gi = readCompact32(r);
      groupNames.push(names[gi]?.name ?? "");
    }
    const frameStart = r.u32();
    const frameCount = r.u32();
    const notif = readArrayHeader(r);
    for (let i = 0; i < notif; i++) {
      // (float time, name function, name body, u32 flags) — best-effort skip
      r.f32(); readCompact32(r); readCompact32(r); r.u32();
    }
    const framerate = r.f32();
    if (!name || frameCount > 1_000_000 || framerate <= 0 || framerate > 240) {
      return null;
    }
    return { name, groupNames, frameStart, frameCount, framerate };
  } catch {
    return null;
  }
}

/** Scan forward for the next plausible sequence head, then read it. */
function resyncAndReadSequence(r: BinaryReader, names: NameLike[], end: number): AnimSequence | null {
  const limit = Math.min(end, r.view.byteLength) - 16;
  while (r.pos < limit) {
    const start = r.pos;
    const f = r.view.getFloat32(start, true);
    if (Number.isFinite(f) && f > 0 && f < 1e6) {
      const saved = r.pos;
      r.pos = start;
      const seq = readAnimSequence(r, names);
      if (seq && seq.name.includes("_")) return seq;
      r.pos = saved + 1;
    } else {
      r.pos = start + 1;
    }
  }
  return null;
}

/**
 * Decode one MeshAnimation export blob. `start` is the byte offset (in `buf`)
 * of the property-list end (just past "None"). `end` is the export's last byte.
 * Returns null if the blob doesn't pass minimal sanity checks.
 */
export function decodeMeshAnimation(
  buf: ArrayBuffer, start: number, end: number, names: NameLike[],
): MeshAnimation | null {
  try {
    const r = new BinaryReader(buf, 0);
    r.seek(start);
    const version = r.u32();
    const refBones = readNamedBones(r, names);
    if (refBones.length === 0 || refBones.length > 4096) return null;
    const endPos = r.u32();
    const motionCount = readCompact32(r);
    if (motionCount < 0 || motionCount > 100_000) return null;
    const motions: MotionChunk[] = [];
    for (let i = 0; i < motionCount; i++) {
      const chunkEnd = r.u32();
      try {
        motions.push(readMotionChunk(r));
      } catch { /* skip */ }
      // jump to chunkEnd for safety against per-motion drift
      if (chunkEnd > r.pos && chunkEnd <= end) r.seek(chunkEnd);
    }
    if (endPos > 0 && endPos < buf.byteLength) r.seek(endPos);
    const seqCount = readArrayHeader(r);
    const sequences: AnimSequence[] = [];
    for (let i = 0; i < seqCount; i++) {
      const seq = readAnimSequence(r, names);
      if (seq) { sequences.push(seq); continue; }
      const rec = resyncAndReadSequence(r, names, end);
      if (rec) sequences.push(rec); else break;
    }
    return { version, refBones, motions, sequences };
  } catch {
    return null;
  }
}

void readSizedString; // re-exported by skeletal-mesh; pin import here too.
