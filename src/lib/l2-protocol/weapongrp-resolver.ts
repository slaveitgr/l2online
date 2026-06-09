/**
 * Weapongrp.dat resolver — itemId → mesh/texture refs for the weapon
 * that will be attached to Weapon_R_Bone.
 *
 * Reads /models/weapongrp.json produced by tools/l2-parse-weapongrp.mjs.
 * Validation row: item 81166 (R97_ReitermirrorCane) →
 * LineageWeapons2.ukx, 299 verts / 438 tris.
 */
export interface WeaponAssetRefs {
  mesh: string | null;
  texture: string | null;
  meshPackage: string | null;
  texPackage: string | null;
  /** target world length in metres (≈ 1.05 m for melee, 1.6 m for bows). */
  worldLengthM: number;
}

interface WeapongrpRow {
  m: string;
  t?: string;
  p?: string;
  tp?: string;
  /** weapon type (sword / bow / dagger …) → optional length hint. */
  k?: string;
}

type Manifest = Record<string, WeapongrpRow>;

let _manifest: Manifest | null = null;
let _loading: Promise<Manifest | null> | null = null;

async function loadManifest(): Promise<Manifest | null> {
  if (_manifest) return _manifest;
  if (_loading) return _loading;
  _loading = fetch("/models/weapongrp.json")
    .then((r) => (r.ok ? r.json() as Promise<Manifest> : null))
    .then((m) => { _manifest = m ?? {}; return _manifest; })
    .catch(() => { _manifest = {}; return _manifest; });
  return _loading;
}

const LEN_BY_KIND: Record<string, number> = {
  bow: 1.6, crossbow: 1.4, pole: 2.0, polearm: 2.0,
  sword: 1.05, dagger: 0.55, blunt: 1.05, fist: 0.3,
  rod: 1.4, dualsword: 1.05, dualdagger: 0.6,
};

export async function getWeaponAssetRefs(itemId: number): Promise<WeaponAssetRefs> {
  const mf = await loadManifest();
  const row = mf?.[String(itemId)];
  if (!row) return empty();
  return {
    mesh: row.m ?? null,
    texture: row.t ?? null,
    meshPackage: row.p ?? null,
    texPackage: row.tp ?? null,
    worldLengthM: (row.k && LEN_BY_KIND[row.k]) || 1.05,
  };
}

function empty(): WeaponAssetRefs {
  return { mesh: null, texture: null, meshPackage: null, texPackage: null, worldLengthM: 1.05 };
}

export const warmWeapongrp = loadManifest;
