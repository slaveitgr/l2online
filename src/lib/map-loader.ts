/**
 * L2 map loader for three.js.
 *
 * Assembles a real Lineage 2 map sector: reads a `.unr`, resolves every
 * StaticMeshActor to its mesh in a `.usx`, extracts geometry, and places each
 * instance at its real position/rotation/scale. Returns a THREE.Group ready to
 * drop into the scene (already axis-remapped L2→three and scaled down).
 *
 * Validated pipeline (Python proof on 17_25.unr Ertheia: 2081 actors,
 * 7 packages, 112k triangles assembled).
 *
 *   const root = await loadMap(unrBytes, async (pkgName) => {
 *     const f = await getFile(`StaticMeshes/${pkgName}.usx`);
 *     return f ? f.buffer : null;
 *   });
 *   scene.add(root);
 */
import * as THREE from "three";
import { L2Package, type MapPlacement } from "./l2-package";

/** Resolve a package name (e.g. "Ertheia_V_S") → its raw .usx bytes, or null. */
export type PackageSource = (packageName: string) => Promise<ArrayBuffer | null>;

export interface LoadMapOptions {
  /** L2 units per scene unit (default 30 — buildings ~a few scene units). */
  scale?: number;
  /** World-space point that becomes the scene origin (default = map centroid). */
  origin?: { x: number; y: number; z: number };
  /** Skip meshes whose name matches (default: sky/cloud backdrops). */
  skip?: (meshName: string) => boolean;
  /** Material applied to all meshes (default: neutral stone). Textures: a later pass. */
  material?: THREE.Material;
  onProgress?: (msg: string) => void;
}

const DEFAULT_SKIP = (n: string) => /sky|cloud|backdrop/i.test(n);

export async function loadMap(
  unrBytes: ArrayBuffer,
  getPackage: PackageSource,
  opts: LoadMapOptions = {},
): Promise<THREE.Group> {
  const scale = opts.scale ?? 30;
  const skip = opts.skip ?? DEFAULT_SKIP;
  const log = opts.onProgress ?? (() => {});
  const material =
    opts.material ?? new THREE.MeshStandardMaterial({ color: 0x9a8b73, roughness: 0.9, flatShading: false });

  // 1) parse the map → placements
  const map = L2Package.from(unrBytes);
  const placements = map.readMapPlacements().filter((p) => !skip(p.mesh));
  log(`[map] ${placements.length} placements across ${new Set(placements.map((p) => p.pkg)).size} packages`);

  // 2) origin = centroid (unless given)
  const origin =
    opts.origin ??
    (() => {
      const n = placements.length || 1;
      const s = placements.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 });
      return { x: s.x / n, y: s.y / n, z: s.z / n };
    })();

  // 3) group placements by package
  const byPkg = new Map<string, MapPlacement[]>();
  for (const p of placements) {
    if (!byPkg.has(p.pkg)) byPkg.set(p.pkg, []);
    byPkg.get(p.pkg)!.push(p);
  }

  // L2 space group (z-up). The root remaps to three (y-up) + scales down.
  const l2Group = new THREE.Group();

  // 4) per package: load .usx once, build instanced meshes per unique mesh
  for (const [pkgName, list] of byPkg) {
    let usxBytes: ArrayBuffer | null = null;
    try {
      usxBytes = await getPackage(pkgName);
    } catch {
      /* ignore */
    }
    if (!usxBytes) {
      log(`[map] package missing: ${pkgName}.usx (${list.length} actors skipped)`);
      continue;
    }
    const usx = L2Package.from(usxBytes);

    // bucket this package's placements by mesh name
    const byMesh = new Map<string, MapPlacement[]>();
    for (const p of list) {
      if (!byMesh.has(p.mesh)) byMesh.set(p.mesh, []);
      byMesh.get(p.mesh)!.push(p);
    }

    for (const [meshName, instances] of byMesh) {
      const geomData = usx.readStaticMesh(meshName);
      if (!geomData || geomData.indices.length === 0) continue;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(geomData.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(geomData.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(geomData.indices, 1));

      const inst = new THREE.InstancedMesh(geo, material, instances.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      instances.forEach((p, i) => {
        pos.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
        // UE rotator → Euler in L2 space (z-up). Yaw about z dominates.
        e.set(p.roll, p.pitch, p.yaw, "ZYX");
        q.setFromEuler(e);
        const s = p.scale || 1;
        scl.set(s * p.scale3d[0], s * p.scale3d[1], s * p.scale3d[2]);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      l2Group.add(inst);
    }
    log(`[map] ${pkgName}: ${byMesh.size} meshes built`);
  }

  // 5) remap L2 (x,y,z z-up) → three (y-up) and scale down
  const root = new THREE.Group();
  root.add(l2Group);
  l2Group.rotation.x = -Math.PI / 2; // z-up → y-up
  root.scale.setScalar(1 / scale);
  root.name = "L2Map";
  return root;
}
