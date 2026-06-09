/**
 * npc-mesh.ts — lazy/streaming loader for exact NPC skeletal meshes.
 *
 * npc-mesh-map.json (built from the real npcgrp) maps npc-id → { m: "<Pkg>.<export>", t: [...] }.
 * Geometry lives in per-package bundles public/models/npc/pkg/<Pkg>.json. Packages are 3–12 MB
 * each so we (a) only fetch a package when an NPC from it is actually requested, (b) cap the
 * number of in-flight fetches to avoid bandwidth/CPU spikes, and (c) ask the browser to fetch
 * with low priority so map tiles and the player avatar win the network race.
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

// ── Concurrency-limited package fetcher ───────────────────────────────────
const MAX_INFLIGHT = 2;
let inflight = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) { inflight++; return Promise.resolve(); }
  return new Promise((res) => queue.push(() => { inflight++; res(); }));
}
function release() {
  inflight = Math.max(0, inflight - 1);
  const next = queue.shift();
  if (next) next();
}

/**
 * Package name aliases. Npcgrp.dat refers to mesh classes in singular form
 * (LineageMonster, LineageNpc) but the actual .ukx/.json bundle is plural
 * (LineageMonsters, LineageNPCs). Also normalises casing variants we see
 * in the wild (LineageNPCsEV vs LineageNpcsEV, LineageNPC vs LineageNpc).
 */
function aliasPkg(pkg: string): string {
  let m = /^LineageMonster(\d*)$/i.exec(pkg); if (m) return `LineageMonsters${m[1]}`;
  m = /^LineageNpc(\d*)$/i.exec(pkg);         if (m) return `LineageNPCs${m[1]}`;
  m = /^LineageNPC(\d*)$/i.exec(pkg);         if (m) return `LineageNPCs${m[1]}`;
  return pkg;
}

/** Known extracted packages — kept here so we can do case-insensitive lookup
 *  without a directory listing API. Append as new packages get extracted. */
const KNOWN_PKGS = [
  "LineageNPCs", "LineageNPCs2", "LineageNPCs3", "LineageNPCs4", "LineageNPCs5",
  "LineageNpcsEV", "LineageNPCsEV",
  "LineageMonsters", "LineageMonsters2", "LineageMonsters3", "LineageMonsters4",
  "LineageMonsters5", "LineageMonsters6", "LineageMonsters7", "LineageMonsters8",
  "LineageMonsters9", "LineageMonsters10", "LineageMonsters11", "LineageMonsters12",
  "LineageMonsters13", "LineageMonsters14", "LineageMonsters15", "LineageMonsters16",
  "Branch", "Branch2", "dropitems",
];
const _knownByLower = new Map(KNOWN_PKGS.map((n) => [n.toLowerCase(), n]));
function resolveActualName(pkg: string): string {
  return _knownByLower.get(pkg.toLowerCase()) ?? _knownByLower.get(aliasPkg(pkg).toLowerCase()) ?? pkg;
}

const _pkgCache = new Map<string, Promise<Pkg | null>>();
const _missingPkgs = new Set<string>(); // log each missing pkg once
function loadPkg(pkg: string): Promise<Pkg | null> {
  const actual = resolveActualName(pkg);
  let p = _pkgCache.get(actual);
  if (!p) {
    p = (async () => {
      await acquire();
      try {
        // `priority: 'low'` keeps tiles/avatar fetches ahead of these multi-MB bundles.
        const init = { priority: "low" } as RequestInit;
        const r = await fetch(`/models/npc/pkg/${actual}.json`, init);
        if (!r.ok) {
          if (!_missingPkgs.has(actual)) {
            _missingPkgs.add(actual);
            // eslint-disable-next-line no-console
            console.warn(`[npc] package bundle missing: ${actual}.json — extract with: node tools/l2-extract-npc-meshes.mjs ${actual}`);
          }
          return null;
        }
        return (await r.json()) as Pkg;
      } catch { return null; } finally { release(); }
    })();
    _pkgCache.set(actual, p);
  }
  return p;
}

/** True when the package bundle is already resident in cache. */
export function isNpcPkgLoaded(meshFullName: string): boolean {
  const dot = meshFullName.indexOf(".");
  if (dot < 0) return false;
  return _pkgCache.has(resolveActualName(meshFullName.slice(0, dot)));
}

/** Returns { m, t } for an npc display id, or null if it isn't in the map. */
export async function npcMeshInfo(displayId: number): Promise<{ m: string; t?: string[] } | null> {
  const map = _map ?? (await _mapPromise);
  return map[String(displayId)] ?? null;
}

/** Synchronous lookup once the map is in memory (returns null until then). */
export function npcMeshInfoSync(displayId: number): { m: string; t?: string[] } | null {
  return _map?.[String(displayId)] ?? null;
}

/** PNG filename for a texture full-name (must match l2-extract-npc-textures.mjs). */
function texFile(full: string): string { return full.replace(/[^A-Za-z0-9]+/g, "_") + ".png"; }

/** Build a renderable group for a "Pkg.export" mesh name, or null if unavailable. */
export async function loadNpcMesh(meshFullName: string, opts: { targetHeight?: number; texName?: string } = {}): Promise<NpcMeshHandle | null> {
  const dot = meshFullName.indexOf(".");
  if (dot < 0) return null;
  const pkgName = meshFullName.slice(0, dot);
  const exportName = meshFullName.slice(dot + 1);
  const pkg = await loadPkg(pkgName);
  const entry = pkg?.[exportName];
  if (!entry) return null;

  const group = new THREE.Group();
  group.name = `Npc:${meshFullName}`;
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  // Neutral gray fallback when no texture loads — guarantees we never render
  // pure white meshes (which made unmappable NPCs look like ghosts).
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  disposables.push(mat);

  if (opts.texName) {
    const url = `/models/npc/tex/${texFile(opts.texName)}`;
    new THREE.TextureLoader().load(
      url,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4; mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; disposables.push(tex); },
      undefined,
      () => {/* keep neutral material if the texture isn't available */},
    );
  }

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

  const wrap = new THREE.Group();
  wrap.add(group);
  return { group: wrap, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** Derive a human-ish display name from a mesh export ("LineageMonsters.gremlin_m00" → "Gremlin"). */
export function prettyNpcName(meshFullName: string | undefined, fallback: string): string {
  if (!meshFullName) return fallback;
  const tail = meshFullName.split(".").pop() ?? meshFullName;
  const stripped = tail.replace(/_[mfn]\d{2,}$/i, "").replace(/_(m|f|n)$/i, "").replace(/_/g, " ").trim();
  if (!stripped) return fallback;
  return stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}
