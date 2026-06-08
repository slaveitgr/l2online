/**
 * S12 — Asset index loader.
 *
 *   l2slave_index.jsonl  — AUTHORITATIVE objectName → package mapping
 *     (byObject), plus package metadata (byPackage) and class index
 *     (byClass). Use resolvePackageForObject(name) for the canonical
 *     "object name → .ukx/.utx package" lookup (S7 armor chain step 2,
 *     S3 mesh load, S6 NPC mesh load).
 *
 *   l2slave_objindex.json — auxiliary { itemId: ["LineageX.utx", ...] }.
 *     NOT the primary resolver. Correct armor chain is:
 *       itemId → Armorgrp.dat (sect.7) → meshName
 *              → resolvePackageForObject(meshName) → package.
 */

import objindexAsset from "@/assets/l2slave_objindex.json.asset.json";
import jsonlAsset from "@/assets/l2slave_index.jsonl.asset.json";

interface PackageRecord {
  path: string;
  crypto?: string;
  ver?: number;
  lic?: number;
  size?: number;
  names?: number;
  exports?: number;
  classes?: Record<string, number>;
  objs?: Array<[string, string, number]>;
}

export interface PackageMeta {
  path: string;
  ver?: number;
  lic?: number;
  size?: number;
  classes?: Record<string, number>;
}

export interface ObjectEntry {
  name: string;
  klass: string;
  size: number;
  package: string;
}

interface PackageIndex {
  byObject: Map<string, ObjectEntry[]>; // lowercase object name → entries
  byPackage: Map<string, PackageMeta>; // lowercase package path → meta
  byClass: Map<string, ObjectEntry[]>;  // lowercase class name → entries
}

let packageIndexPromise: Promise<PackageIndex> | null = null;
let itemTexturePromise: Promise<Map<number, string[]>> | null = null;

export function loadPackageIndex(): Promise<PackageIndex> {
  if (packageIndexPromise) return packageIndexPromise;
  packageIndexPromise = (async () => {
    const idx: PackageIndex = {
      byObject: new Map(),
      byPackage: new Map(),
      byClass: new Map(),
    };
    try {
      const r = await fetch(jsonlAsset.url, { cache: "force-cache" });
      if (!r.ok) return idx;
      const text = await r.text();
      for (const line of text.split("\n")) {
        if (!line) continue;
        let rec: PackageRecord;
        try {
          rec = JSON.parse(line) as PackageRecord;
        } catch {
          continue;
        }
        if (!rec.path) continue;
        const pkgKey = rec.path.toLowerCase();
        idx.byPackage.set(pkgKey, {
          path: rec.path,
          ver: rec.ver,
          lic: rec.lic,
          size: rec.size,
          classes: rec.classes,
        });
        if (!rec.objs) continue;
        for (const [name, klass, size] of rec.objs) {
          const entry: ObjectEntry = { name, klass, size, package: rec.path };
          const objKey = name.toLowerCase();
          const bucket = idx.byObject.get(objKey);
          if (bucket) bucket.push(entry);
          else idx.byObject.set(objKey, [entry]);
          const classKey = klass.toLowerCase();
          const cbucket = idx.byClass.get(classKey);
          if (cbucket) cbucket.push(entry);
          else idx.byClass.set(classKey, [entry]);
        }
      }
    } catch {
      /* leave index empty; callers fall back to per-package scan */
    }
    return idx;
  })();
  return packageIndexPromise;
}

export function loadItemTextureIndex(): Promise<Map<number, string[]>> {
  if (itemTexturePromise) return itemTexturePromise;
  itemTexturePromise = (async () => {
    const out = new Map<number, string[]>();
    try {
      const r = await fetch(objindexAsset.url, { cache: "force-cache" });
      if (!r.ok) return out;
      const data = (await r.json()) as Record<string, string[]>;
      for (const [key, packages] of Object.entries(data)) {
        const id = Number(key);
        if (!Number.isFinite(id)) continue;
        out.set(id, packages);
      }
    } catch {
      /* leave empty */
    }
    return out;
  })();
  return itemTexturePromise;
}

/** Find every package that exports a given object name (case-insensitive). */
export async function findObjectPackages(objectName: string): Promise<ObjectEntry[]> {
  const idx = await loadPackageIndex();
  return idx.byObject.get(objectName.toLowerCase()) ?? [];
}

/** Convenience: first matching package path (most common case). */
export async function findPackage(objectName: string): Promise<string | null> {
  const hits = await findObjectPackages(objectName);
  return hits[0]?.package ?? null;
}

/** Find all known objects of a given UE2 class (e.g. "SkeletalMesh"). */
export async function findObjectsByClass(klass: string): Promise<ObjectEntry[]> {
  const idx = await loadPackageIndex();
  return idx.byClass.get(klass.toLowerCase()) ?? [];
}

/** Candidate texture packages for an itemId (armor/weapon texture lookup, S7). */
export async function findItemTexturePackages(itemId: number): Promise<string[]> {
  const idx = await loadItemTextureIndex();
  return idx.get(itemId) ?? [];
}

/** Force a fresh fetch (e.g. after a manual cache wipe). */
export function clearAssetIndex(): void {
  packageIndexPromise = null;
  itemTexturePromise = null;
}

/** Optional: prefetch both indexes (call once after entering the world). */
export function prefetchAssetIndexes(): void {
  void loadPackageIndex();
  void loadItemTextureIndex();
}
