/**
 * L2 map loader for three.js — geometry + textures.
 *
 * Assembles a real Lineage 2 map sector: reads a `.unr`, resolves every
 * StaticMeshActor to its mesh (`.usx`) AND its diffuse texture (`.utx`, via the
 * Material→Shader/Combiner→Texture graph), and places each instance at its real
 * position/rotation/scale. Returns a THREE.Group ready to add to the scene
 * (already axis-remapped L2→three and scaled down).
 *
 * Validated end-to-end on real client files (17_25.unr Ertheia: 2081 actors;
 * Material chain → "Ertheia_a_ground02" DXT1 512×512 decoded correctly).
 *
 *   const root = await loadMap(unrBytes, getPackage);  // see getPackage note
 *   scene.add(root);
 *
 * getPackage(name) must return the raw bytes of a package by NAME, trying both
 * StaticMeshes/<name>.usx and Textures/<name>.utx (+ SysTextures). Example:
 *   const tryFolders = async (name) => {
 *     for (const p of [`StaticMeshes/${name}.usx`, `Textures/${name}.utx`, `SysTextures/${name}.utx`]) {
 *       const f = (await getFile(p)) ?? (await readFromMount(p));
 *       if (f) return f.buffer;
 *     } return null;
 *   };
 */
import * as THREE from "three";
import { L2Package, type MapPlacement, type L2Texture, type UExport } from "./l2-package";
import { readIndexedMapPlacements, readIndexedTerrainInfos } from "./l2-unreal-object-index";

export type PackageSource = (packageName: string) => Promise<ArrayBuffer | null>;

export interface LoadMapOptions {
  scale?: number; // L2 units per scene unit (default 30)
  origin?: { x: number; y: number; z: number };
  skip?: (meshName: string) => boolean;
  withTextures?: boolean; // default true
  onProgress?: (msg: string) => void;
}

const DEFAULT_SKIP = (n: string) => /sky|cloud|backdrop/i.test(n);

const DXT_FORMAT: Record<string, number> = {
  DXT1: THREE.RGBA_S3TC_DXT1_Format,
  DXT3: THREE.RGBA_S3TC_DXT3_Format,
  DXT5: THREE.RGBA_S3TC_DXT5_Format,
};

function toThreeTexture(t: L2Texture): THREE.Texture | null {
  const dxt = DXT_FORMAT[t.format];
  let tex: THREE.Texture;
  if (dxt) {
    // DXT1/3/5 → upload compressed straight to the GPU
    tex = new THREE.CompressedTexture(
      [{ data: t.data, width: t.width, height: t.height } as unknown as ImageData],
      t.width,
      t.height,
      dxt as THREE.CompressedPixelFormat,
    );
  } else if (t.format === "RGBA8") {
    // readTexture already swizzled BGRA→RGBA → plain DataTexture
    tex = new THREE.DataTexture(t.data, t.width, t.height, THREE.RGBAFormat);
  } else {
    return null; // P8/G16 not yet supported for world textures
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export async function loadMap(
  unrBytes: ArrayBuffer,
  getPackage: PackageSource,
  opts: LoadMapOptions = {},
): Promise<THREE.Group> {
  const scale = opts.scale ?? 30;
  const skip = opts.skip ?? DEFAULT_SKIP;
  const withTex = opts.withTextures ?? true;
  const log = opts.onProgress ?? (() => {});

  const map = L2Package.from(unrBytes);
  const terrains = readIndexedTerrainInfos(map);
  const indexedPlacements = readIndexedMapPlacements(map);
  const hiddenSkipped = indexedPlacements.filter((p) => p.hidden || p.deleteMe).length;
  const placementSource: MapPlacement[] = indexedPlacements.length
    ? indexedPlacements.filter((p) => !p.hidden && !p.deleteMe)
    : map.readMapPlacements();
  const placements = placementSource.filter((p) => !skip(p.mesh));
  log(
    `[map] ${placements.length} placements / ${new Set(placements.map((p) => p.pkg)).size} packages` +
      (indexedPlacements.length ? ` · ${hiddenSkipped} hidden/deleted skipped` : ""),
  );
  if (terrains.length) {
    const ready = terrains.filter((t) => t.terrainMap && t.quadVisibilityBitmap && t.edgeTurnBitmap).length;
    const first = terrains[0];
    log(
      `[terrain] ${ready}/${terrains.length} decoded · map ${first.mapX}_${first.mapY}` +
        (first.terrainMap ? ` · ${first.terrainMap.target.pkg}.${first.terrainMap.target.name}` : ""),
    );
  }

  const origin =
    opts.origin ??
    (() => {
      const n = placements.length || 1;
      const s = placements.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 });
      return { x: s.x / n, y: s.y / n, z: s.z / n };
    })();

  // package cache (parse each .usx/.utx once)
  const pkgCache = new Map<string, L2Package | null>();
  const getPkg = async (name: string): Promise<L2Package | null> => {
    if (pkgCache.has(name)) return pkgCache.get(name)!;
    let pkg: L2Package | null = null;
    try {
      const buf = await getPackage(name);
      if (buf) pkg = L2Package.from(buf);
    } catch {
      /* ignore */
    }
    pkgCache.set(name, pkg);
    return pkg;
  };

  // resolve a material object-ref → a decoded diffuse texture (crosses packages)
  const texCache = new Map<string, THREE.Texture | null>();
  async function resolveTexture(pkg: L2Package, refIdx: number, depth = 0): Promise<THREE.Texture | null> {
    if (depth > 8) return null;
    const r = pkg.resolveRefFull(refIdx);
    if (r.kind === "import") {
      const tp = await getPkg(r.pkg);
      if (!tp) return null;
      const e = tp.findExport(r.name);
      if (!e) return null;
      return resolveInPkg(tp, e, depth + 1);
    }
    if (r.kind === "export") {
      const e = pkg.exports[r.localExportIndex - 1];
      if (!e) return null;
      return resolveInPkg(pkg, e, depth + 1);
    }
    return null;
  }
  async function resolveInPkg(pkg: L2Package, e: UExport, depth: number): Promise<THREE.Texture | null> {
    const cacheKey = `${pkg.signature}:${e.objectName}`;
    if (texCache.has(cacheKey)) return texCache.get(cacheKey)!;
    if (e.className === "Texture") {
      const t = pkg.readTexture(e);
      const tex = t ? toThreeTexture(t) : null;
      texCache.set(cacheKey, tex);
      return tex;
    }
    const refs = pkg.objectRefs(e);
    for (const key of ["Diffuse", "Material", "Material1", "Material2"]) {
      if (key in refs) {
        const tex = await resolveTexture(pkg, refs[key], depth + 1);
        if (tex) {
          texCache.set(cacheKey, tex);
          return tex;
        }
      }
    }
    // fallback: any object ref
    for (const v of Object.values(refs)) {
      const tex = await resolveTexture(pkg, v, depth + 1);
      if (tex) {
        texCache.set(cacheKey, tex);
        return tex;
      }
    }
    texCache.set(cacheKey, null);
    return null;
  }

  const l2Group = new THREE.Group();
  const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x8d8270, roughness: 0.92 });

  // group placements by package, then by mesh
  const byPkg = new Map<string, MapPlacement[]>();
  for (const p of placements) (byPkg.get(p.pkg) ?? byPkg.set(p.pkg, []).get(p.pkg)!).push(p);

  for (const [pkgName, list] of byPkg) {
    const usx = await getPkg(pkgName);
    if (!usx) {
      log(`[map] missing ${pkgName}.usx (${list.length} skipped)`);
      continue;
    }

    const byMesh = new Map<string, MapPlacement[]>();
    for (const p of list) (byMesh.get(p.mesh) ?? byMesh.set(p.mesh, []).get(p.mesh)!).push(p);

    for (const [meshName, instances] of byMesh) {
      const g = usx.readStaticMesh(meshName);
      if (!g || g.indices.length === 0) continue;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
      if (g.uvs) geo.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(g.indices, 1));

      // material: real diffuse texture if available, else neutral
      let material: THREE.Material = fallbackMat;
      if (withTex && g.uvs) {
        const ref = usx.meshMaterialRef(meshName);
        if (ref != null) {
          const tex = await resolveTexture(usx, ref);
          if (tex) material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
        }
      }

      const inst = new THREE.InstancedMesh(geo, material, instances.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      instances.forEach((p, i) => {
        pos.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
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
    log(`[map] ${pkgName}: ${byMesh.size} meshes`);
  }

  const root = new THREE.Group();
  root.add(l2Group);
  l2Group.rotation.x = -Math.PI / 2; // L2 z-up → three y-up
  root.scale.setScalar(1 / scale);
  root.name = "L2Map";
  return root;
}
