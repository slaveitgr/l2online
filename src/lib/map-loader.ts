/**
 * L2 map loader for three.js — geometry + textures.
 *
 * Assembles a real Lineage 2 map sector: reads a `.unr`, resolves every
 * StaticMeshActor to its mesh (`.usx`) AND its diffuse texture (`.utx`, via the
 * Material→Shader/Combiner→Texture graph), and places each instance at its real
 * position/rotation/scale. Returns a THREE.Group ready to add to the scene
 * (already axis-remapped L2→three and scaled down).
 */
import * as THREE from "three";
import { L2Package, type MapPlacement, type L2Texture, type UExport } from "./l2-package";
import {
  bitsetHas,
  readIndexedMapPlacements,
  readIndexedTerrainInfos,
  type IndexedTerrainInfo,
} from "./l2-unreal-object-index";

export type PackageSource = (packageName: string) => Promise<ArrayBuffer | null>;

export interface LoadMapOptions {
  scale?: number;
  origin?: { x: number; y: number; z: number };
  skip?: (meshName: string) => boolean;
  withTextures?: boolean;
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
    tex = new THREE.CompressedTexture(
      [{ data: t.data, width: t.width, height: t.height } as unknown as ImageData],
      t.width,
      t.height,
      dxt as THREE.CompressedPixelFormat,
    );
  } else if (t.format === "RGBA8") {
    tex = new THREE.DataTexture(t.data, t.width, t.height, THREE.RGBAFormat);
  } else {
    return null;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // L2 diffuse maps are authored in sRGB — without this they render washed-out/grey.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (!dxt) {
    // uncompressed: trilinear mipmaps kill the distance shimmer
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    // DXT here carries only the top mip → bilinear
    tex.minFilter = THREE.LinearFilter;
  }
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function buildTerrainMesh(terrain: IndexedTerrainInfo, heightmap: L2Texture): THREE.Mesh | null {
  if (heightmap.format !== "G16" || heightmap.width < 2 || heightmap.height < 2) return null;
  if (heightmap.data.byteLength < heightmap.width * heightmap.height * 2) return null;

  const width = heightmap.width;
  const height = heightmap.height;
  const sx = terrain.terrainScale[0] || 128;
  const sy = terrain.terrainScale[1] || 128;
  const sz = (terrain.terrainScale[2] || 76) / 256;
  const brokenScale = terrain.terrainScale[0] === 0 || terrain.terrainScale[1] === 0 || terrain.terrainScale[2] === 0;
  const baseX = brokenScale ? (terrain.mapX - 20) * width * 128 : terrain.location[0] - (width / 2) * sx;
  const baseY = brokenScale ? (terrain.mapY - 18) * height * 128 : terrain.location[1] - (height / 2) * sy;
  const baseZ = brokenScale ? 0 : terrain.location[2] - 32768 * sz;

  const positions = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  const dv = new DataView(heightmap.data.buffer, heightmap.data.byteOffset, heightmap.data.byteLength);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = x + y * width;
      const h = dv.getUint16(i * 2, true);
      positions[i * 3] = baseX + x * sx;
      positions[i * 3 + 1] = baseY + y * sy;
      positions[i * 3 + 2] = baseZ + h * sz;
      uvs[i * 2] = x / Math.max(1, width - 1);
      uvs[i * 2 + 1] = y / Math.max(1, height - 1);
    }
  }

  const indices: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const q = x + y * width;
      if (terrain.quadVisibilityBitmap && !bitsetHas(terrain.quadVisibilityBitmap, q)) continue;
      const a = x + y * width;
      const b = x + 1 + y * width;
      const c = x + 1 + (y + 1) * width;
      const d = x + (y + 1) * width;
      if (terrain.edgeTurnBitmap && bitsetHas(terrain.edgeTurnBitmap, q)) indices.push(d, a, b, d, b, c);
      else indices.push(a, b, c, a, c, d);
    }
  }
  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const indexArray = width * height > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeVertexNormals();
  // neutral earth tone (true ground texturing needs the terrain layer splatmaps — TODO)
  const material = new THREE.MeshStandardMaterial({ color: 0x6f6453, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Terrain:${terrain.mapX}_${terrain.mapY}`;
  mesh.receiveShadow = true;
  return mesh;
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
  // Untextured meshes fall back to a muted stone tone (not bright tan that glares white).
  const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x5d564a, roughness: 0.95 });

  let terrainMeshes = 0;
  for (const terrain of terrains) {
    if (!terrain.terrainMap) continue;
    const target = terrain.terrainMap.target;
    const terrainPkg = await getPkg(target.pkg);
    const terrainTexture = terrainPkg?.readTexture(target.name);
    const terrainMesh = terrainTexture ? buildTerrainMesh(terrain, terrainTexture) : null;
    if (!terrainMesh) continue;
    terrainMeshes++;
    l2Group.add(terrainMesh);
  }
  if (terrains.length) log(`[terrain] ${terrainMeshes}/${terrains.length} heightmaps meshed`);

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

      let material: THREE.Material = fallbackMat;
      if (withTex && g.uvs) {
        const ref = usx.meshMaterialRef(meshName);
        if (ref != null) {
          const tex = await resolveTexture(usx, ref);
          if (tex) {
            // alphaTest cuts out foliage/banner/cloth cards (their texture's transparent
            // areas otherwise render as opaque white "shards"). Opaque walls keep alpha=255
            // so nothing is discarded. side=Double so thin leaf/cloth cards show both faces.
            material = new THREE.MeshStandardMaterial({
              map: tex,
              roughness: 0.95,
              metalness: 0,
              alphaTest: 0.4,
              side: THREE.DoubleSide,
            });
          }
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
  l2Group.rotation.x = -Math.PI / 2;
  root.scale.setScalar(1 / scale);
  root.name = "L2Map";
  // expose how much real ground we produced so the viewport can drop its placeholder
  root.userData.terrainMeshes = terrainMeshes;
  root.userData.meshCount = byPkg.size;
  return root;
}
