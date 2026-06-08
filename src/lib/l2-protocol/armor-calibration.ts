/**
 * S7 — Armor / equipment auto-calibration (typed skeleton).
 *
 * Armor meshes ship in UE2 units relative to their own ref skeleton, not the
 * body's. We brute-force a 3×3 rotation × translation × scale that minimises
 * bone-position error between armor's refskeleton and the body's bindposes.
 *
 *   48 signed-axis permutations
 *   × {raw, conjugate-children, conjugate-all} quaternion variants
 *   × scale ∈ {1/5250, 0.01, 1/52.5, 1}
 *
 *   total candidates: 48 × 3 × 4 = 576
 *
 * Pick the candidate with smallest mean bone-position error. Skin with top-2
 * bone weights using the BODY's bindposes (not the armor's). Hide the naked
 * body parts that the armor covers, and re-assert every ~3 s because the
 * async dresser keeps re-enabling them.
 *
 * Lookup pipeline:
 *   1. Armorgrp.dat → row with u32 == itemId.
 *   2. Inside row, find string-index naming a mesh "<bodyPrefix>_m###_[uglb]".
 *   3. Pair with the matching "_t###" texture in LineageUniqueTex3.utx.
 *   4. Resolve via asset-index (S12).
 */

import type { RefSkeleton } from "./mesh-decoder";

export type ArmorSlot = "u" | "l" | "g" | "b"; // chest / legs / gloves / feet

export interface ArmorLookup {
  itemId: number;
  bodyPrefix: string; // e.g. "FMagic"
}

export interface ArmorMeshRef {
  meshPackage: string; // e.g. "LineageUnique3.ukx"
  meshObject: string;  // e.g. "FMagic_m042_u"
  texPackage: string;  // e.g. "LineageUniqueTex3.utx"
  texObject: string;   // e.g. "FMagic_t042"
  slot: ArmorSlot;
}

export interface CalibrationResult {
  rotation: [number, number, number, number]; // quat x,y,z,w
  translation: [number, number, number];
  scale: number;
  errorMean: number;
}

export interface CalibrationInput {
  armorSkeleton: RefSkeleton;
  bodyBindposes: RefSkeleton;
}

/**
 * Brute-force calibration entry-point. Real worker fills this in; the function
 * signature is what the dressing pipeline imports.
 */
export type Calibrator = (input: CalibrationInput) => CalibrationResult;

export const NAKED_SLOT_BY_ARMOR: Record<ArmorSlot, string[]> = {
  u: ["Chest_naked", "Body_naked"],
  l: ["Legs_naked"],
  g: ["Gloves_naked", "Hand_naked"],
  b: ["Feet_naked", "Foot_naked"],
};

export const REASSERT_INTERVAL_MS = 3000;
