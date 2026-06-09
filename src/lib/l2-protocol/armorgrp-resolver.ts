/**
 * Armorgrp.dat resolver (S7) — itemId+slot → mesh/texture/package refs.
 *
 * Reads a pre-built manifest at /models/armorgrp.json produced by
 * tools/l2-parse-armorgrp.mjs. The manifest is keyed by itemId; each row
 * carries the mesh name, texture name, owning .ukx / .utx packages, the
 * slot letter (u=chest, l=legs, g=gloves, b=feet) and the bodyPrefix
 * (e.g. "FMagic"). Missing manifest = graceful nulls (no dressing).
 *
 * Chain: paperdoll itemId → getArmorAssetRefs(itemId)
 *      → asset-index / mesh worker → BufferGeometry on the body.
 */

export type ArmorSlot =
  | "helmet" | "chest" | "legs" | "gloves" | "boots"
  | "underwear" | "cloak" | "shield";

export type ArmorSlotCode = "u" | "l" | "g" | "b" | "h" | "c";

export interface ArmorAssetRefs {
  mesh: string | null;
  texture: string | null;
  meshPackage: string | null;
  texPackage: string | null;
  slot: ArmorSlotCode | null;
  bodyPrefix: string | null;
}

interface ArmorgrpRow {
  m: string;    // mesh object name
  t?: string;   // texture object name
  p?: string;   // mesh package (e.g. LineageUnique3.ukx)
  tp?: string;  // tex package (e.g. LineageUniqueTex3.utx)
  s?: ArmorSlotCode;
  bp?: string;  // body prefix
}

type Manifest = Record<string, ArmorgrpRow>;

let _manifest: Manifest | null = null;
let _loading: Promise<Manifest | null> | null = null;

async function loadManifest(): Promise<Manifest | null> {
  if (_manifest) return _manifest;
  if (_loading) return _loading;
  _loading = fetch("/models/armorgrp.json")
    .then((r) => (r.ok ? r.json() as Promise<Manifest> : null))
    .then((m) => { _manifest = m ?? {}; return _manifest; })
    .catch(() => { _manifest = {}; return _manifest; });
  return _loading;
}

/** SLOT_TO_CODE — maps semantic slot to the Armorgrp letter convention. */
const SLOT_TO_CODE: Partial<Record<ArmorSlot, ArmorSlotCode>> = {
  chest: "u", legs: "l", gloves: "g", boots: "b",
  helmet: "h", cloak: "c",
};

/** Public — resolve mesh/texture refs for an equipped armor item. */
export async function getArmorAssetRefs(
  itemId: number,
  slot?: ArmorSlot,
): Promise<ArmorAssetRefs> {
  if (!itemId || itemId <= 0) return empty();
  const mf = await loadManifest();
  const row = mf?.[String(itemId)];
  if (!row) return empty();
  const code = row.s ?? (slot ? SLOT_TO_CODE[slot] ?? null : null);
  return {
    mesh: row.m ?? null,
    texture: row.t ?? null,
    meshPackage: row.p ?? null,
    texPackage: row.tp ?? null,
    slot: code ?? null,
    bodyPrefix: row.bp ?? null,
  };
}

/** Synchronous after first call has resolved; falls back to nulls. */
export function getArmorAssetRefsSync(itemId: number): ArmorAssetRefs {
  const row = _manifest?.[String(itemId)];
  if (!row) return empty();
  return {
    mesh: row.m ?? null,
    texture: row.t ?? null,
    meshPackage: row.p ?? null,
    texPackage: row.tp ?? null,
    slot: row.s ?? null,
    bodyPrefix: row.bp ?? null,
  };
}

function empty(): ArmorAssetRefs {
  return { mesh: null, texture: null, meshPackage: null, texPackage: null, slot: null, bodyPrefix: null };
}

/** Eagerly warm the manifest (call at app boot). */
export const warmArmorgrp = loadManifest;
