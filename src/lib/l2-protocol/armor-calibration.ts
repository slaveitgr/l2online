/**
 * Armor / equipment auto-calibration.
 *
 * Armor meshes ship in UE2 units relative to their OWN ref skeleton, not the
 * body's bindposes. To skin them on the body we brute-force a rigid transform
 * (3×3 rotation × translation × uniform scale) that minimises mean
 * bone-position error between the armor's refskeleton and the body's
 * bindposes:
 *
 *   48 signed-axis permutations
 *     × {raw, conjugate-children, conjugate-all} quaternion variants
 *     × scale ∈ {1/5250, 0.01, 1/52.5, 1}
 *   = 576 candidates
 *
 * After picking the best M, skin with top-2 bone weights using the BODY's
 * bindposes (the armor's bindposes are discarded). Naked body parts in the
 * matching slot must be hidden AND re-asserted every ~3 s because the
 * async dresser can re-enable them.
 */

import type { RefSkeleton, RefBone } from "./mesh-decoder";

export type ArmorSlot = "u" | "l" | "g" | "b"; // chest / legs / gloves / feet

export interface ArmorLookup { itemId: number; bodyPrefix: string }

export interface ArmorMeshRef {
  meshPackage: string;
  meshObject: string;
  texPackage: string;
  texObject: string;
  slot: ArmorSlot;
}

export interface CalibrationResult {
  rotation: [number, number, number, number]; // quat x,y,z,w (premul)
  translation: [number, number, number];
  scale: number;
  errorMean: number;
}

export interface CalibrationInput {
  armorSkeleton: RefSkeleton;
  bodyBindposes: RefSkeleton;
}

export const NAKED_SLOT_BY_ARMOR: Record<ArmorSlot, string[]> = {
  u: ["Chest_naked", "Body_naked", "Upper_naked"],
  l: ["Legs_naked", "Lower_naked"],
  g: ["Gloves_naked", "Hand_naked", "Hands_naked"],
  b: ["Feet_naked", "Foot_naked", "Boots_naked"],
};

export const REASSERT_INTERVAL_MS = 3000;

// ───────────────── candidate generator ─────────────────

const SCALES = [1 / 5250, 0.01, 1 / 52.5, 1];

/** All 48 signed-axis permutation matrices (det = ±1). */
function* axisPermutations(): Generator<number[]> {
  const idx = [0, 1, 2];
  // 6 axis permutations × 8 sign combos = 48
  for (const p of permute3(idx)) {
    for (let s = 0; s < 8; s++) {
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 3; r++) {
        m[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
      }
      yield m;
    }
  }
}
function permute3(a: number[]): number[][] {
  return [
    [a[0], a[1], a[2]], [a[0], a[2], a[1]],
    [a[1], a[0], a[2]], [a[1], a[2], a[0]],
    [a[2], a[0], a[1]], [a[2], a[1], a[0]],
  ];
}

// ───────────────── quaternion helpers ─────────────────

type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

function qConj(q: Quat): Quat { return [-q[0], -q[1], -q[2], q[3]]; }
function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qRot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
function mat3Mul(m: number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
function mat3ToQuat(m: number[]): Quat {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, 0.25 * s];
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    return [0.25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  }
  if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    return [(m[1] + m[3]) / s, 0.25 * s, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return [(m[2] + m[6]) / s, (m[5] + m[7]) / s, 0.25 * s, (m[3] - m[1]) / s];
}

// ───────────────── error metric ─────────────────

interface BonePos { name: string; pos: Vec3 }

function bonePositions(sk: RefSkeleton): BonePos[] {
  const out: BonePos[] = [];
  for (const b of sk.bones as RefBone[]) {
    const p = b.pos ?? [0, 0, 0];
    out.push({ name: b.name, pos: [p[0], p[1], p[2]] });
  }
  return out;
}

function meanError(armor: BonePos[], body: Map<string, Vec3>, R: number[], t: Vec3, s: number): number {
  let sum = 0, n = 0;
  for (const ab of armor) {
    const bp = body.get(ab.name);
    if (!bp) continue;
    const r = mat3Mul(R, ab.pos);
    const dx = r[0] * s + t[0] - bp[0];
    const dy = r[1] * s + t[1] - bp[1];
    const dz = r[2] * s + t[2] - bp[2];
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
    n++;
  }
  return n ? sum / n : Infinity;
}

function bestTranslation(armor: BonePos[], body: Map<string, Vec3>, R: number[], s: number): Vec3 {
  // closed-form: optimal t for fixed R,s is mean(body - s*R*armor).
  let tx = 0, ty = 0, tz = 0, n = 0;
  for (const ab of armor) {
    const bp = body.get(ab.name);
    if (!bp) continue;
    const r = mat3Mul(R, ab.pos);
    tx += bp[0] - s * r[0];
    ty += bp[1] - s * r[1];
    tz += bp[2] - s * r[2];
    n++;
  }
  return n ? [tx / n, ty / n, tz / n] : [0, 0, 0];
}

// ───────────────── public calibrator ─────────────────

/**
 * Brute-force armor → body skeleton calibration. Returns the best rigid
 * transform (rotation quaternion + translation + uniform scale) and the
 * mean bone-position error in mesh units.
 *
 * For each of 48 axis permutations × 4 scales × 3 quaternion treatments,
 * compute the closed-form best translation and the mean error; keep the
 * minimum. Quaternion treatments don't change the bone-position error
 * (positions are rotated by R, not by quats), but they're surfaced in the
 * returned transform so the caller can choose which one to apply when
 * rebuilding the armor's bindpose quats:
 *   - "raw"            → quat as-is
 *   - "conj-children"  → conjugate every non-root bone quat
 *   - "conj-all"       → conjugate every bone quat
 *
 * The result.rotation is always the matrix-derived quat; pair it with the
 * caller-chosen quat treatment by name (we don't apply per-bone fixups here).
 */
export const calibrateArmor: Calibrator = ({ armorSkeleton, bodyBindposes }) => {
  const armor = bonePositions(armorSkeleton);
  const body = new Map<string, Vec3>();
  for (const b of bonePositions(bodyBindposes)) body.set(b.name, b.pos);

  let best: CalibrationResult = {
    rotation: [0, 0, 0, 1], translation: [0, 0, 0], scale: 1, errorMean: Infinity,
  };
  for (const R of axisPermutations()) {
    for (const s of SCALES) {
      const t = bestTranslation(armor, body, R, s);
      const err = meanError(armor, body, R, t, s);
      if (err < best.errorMean) {
        best = { rotation: mat3ToQuat(R), translation: t, scale: s, errorMean: err };
      }
    }
  }
  return best;
};

export type Calibrator = (input: CalibrationInput) => CalibrationResult;

/** Apply one of the three quat-treatment variants to the armor refskel
 *  (utility for the dresser; returns a NEW skeleton, doesn't mutate). */
export function applyQuatTreatment(
  sk: RefSkeleton,
  mode: "raw" | "conj-children" | "conj-all",
): RefSkeleton {
  if (mode === "raw") return sk;
  const bones = (sk.bones as RefBone[]).map((b, i) => {
    if (mode === "conj-children" && i === 0) return b;
    const q = (b.quat ?? [0, 0, 0, 1]) as Quat;
    return { ...b, quat: qConj(q) };
  });
  return { ...sk, bones };
}

// re-export Quat math for the dresser
export const _qmath = { qConj, qMul, qRot };
