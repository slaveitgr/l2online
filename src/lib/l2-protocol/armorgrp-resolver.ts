/**
 * S7 — Armorgrp.dat resolver (STUB).
 *
 * Full implementation lands with S7. Once Armorgrp.dat is loaded, this
 * module returns the mesh/texture asset name for a given itemId & slot.
 * The returned name then feeds resolvePackageForObject() in asset-index.ts
 * to find the owning .ukx / .utx package.
 *
 * Chain reminder:
 *   itemId → getArmorAssetName() → meshName
 *          → resolvePackageForObject(meshName) → .ukx
 *          → decodeMeshBlob() → BufferGeometry.
 */

export type ArmorSlot =
  | "helmet" | "chest" | "legs" | "gloves" | "boots"
  | "underwear" | "cloak" | "shield";

export interface ArmorAssetRefs {
  mesh: string | null;
  texture: string | null;
}

/** Stub — always returns nulls until Armorgrp.dat parser is wired up. */
export function getArmorAssetName(
  _itemId: number,
  _slot: ArmorSlot,
): ArmorAssetRefs {
  return { mesh: null, texture: null };
}
