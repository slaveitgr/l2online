/**
 * npc-mesh.ts — lazy loader for exact NPC skeletal meshes.
 *
 * npc-mesh-map.json (built from the real npcgrp) maps npc-id → { m: "<Pkg>.<export>", t: [...] }.
 * Geometry lives in per-package bundles public/models/npc/pkg/<Pkg>.json, fetched on demand
 * and cached. Returns a THREE.Group (feet at y=0, normalised to targetHeight) like the player model.
 */
import * as THREE from "three";

export interface NpcMeshHandle { group: THREE.Group; dispose: () => void; }
interface Geom { positions: number[]; uvs: number[]; indices: number[] }
interface MeshEntry { parts: Geom[]; bbox?: { min: number[]; max: number[] } }
type Pkg = Record<string, MeshEntry>;

let _map: Record<string, { m: string; t?: string[] }> | null = null;
const _mapPromise = (async () => {
  try { const r = await fetch("/models/npc-mesh-map.json"); _map = r.ok ? await r.json() : {}; } catch { _map = {}; }
  return _map!;
})();

const _pkgCache = new Map<string, Promise<Pkg | null>>();
function loadPkg(pkg: string): Promise<Pkg | null> {
  let p = _pkgCache.get(pkg);
  if (!p) {
    p = fetch(`/models/npc/pkg/${pkg}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    _pkgCache.set(pkg, p);
  }
  return p;
}

/** Returns { m, t } for an npc display id, or null if it isn't in the map. */
export async function npcMeshInfo(displayId: number): Promise<{ m: string; t?: string[] } | null> {
  const map = _map ?? (await _mapPromise);
  return map[String(displayId)] ?? null;
}

/** Build a renderable group for a "Pkg.export" mesh name, or null if unavailable. */
export async function loadNpcMesh(meshFullName: string, opts: { targetHeight?: number } = {}): Promise<NpcMeshHandle | null> {
  const dot = meshFullName.indexOf(".");
  if (dot < 0) return null;
  const pkgName = meshFullName.slice(0, dot);
  const exportName = meshFullName.slice(dot + 1);
  const pkg = await loadPkg(pkgName);
  const entry = pkg?.[exportName];
  if (!entry) return null;

  const group = new THREE.Group();
  group.name = `Npc:${meshFullName}`;
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8ad97, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  disposables.push(mat);

  for (const part of entry.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(part.positions, 3));
    if (part.uvs?.length) geo.setAttribute("uv", new THREE.Float32BufferAttribute(part.uvs, 2));
    geo.setIndex(part.indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    group.add(mesh);
    disposables.push(geo);
  }

  // normalise: L2 meshes are z-up; rotate to y-up, scale to targetHeight, seat feet at y=0.
  group.rotation.x = -Math.PI / 2;
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const h = size.y || 1;
  const target = opts.targetHeight ?? 3.4;
  const s = target / h;
  group.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(group);
  group.position.y -= box2.min.y;
  const c = new THREE.Vector3(); box2.getCenter(c);
  group.position.x -= c.x; group.position.z -= c.z;

  // wrap so the caller can position the whole thing freely
  const wrap = new THREE.Group();
  wrap.add(group);
  return { group: wrap, dispose: () => disposables.forEach((d) => d.dispose()) };
}
