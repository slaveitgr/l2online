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
