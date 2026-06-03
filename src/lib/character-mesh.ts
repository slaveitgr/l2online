/**
 * character-mesh.ts — load an extracted L2 character (public/models/<Race>_<Gender>.json,
 * produced by tools/l2-extract-character-meshes.mjs + l2-extract-character-textures.mjs)
 * into a ready-to-place THREE.Group.
 *
 * The mesh is stored in L2 mesh-local space (z-up). This remaps it to three's y-up,
 * normalises it to `targetHeight` scene units and seats its feet at y = 0, so it can be
 * dropped straight into the world at an entity position. Shared by the char-select
 * preview and the in-world renderer.
 */
import * as THREE from "three";

interface ModelPart { name: string; positions: number[]; uvs: number[]; indices: number[]; texture?: string }
interface ModelFile { race: string; gender: string; parts: ModelPart[]; bbox?: { min: number[]; max: number[] } }

const RACE_FILE: Record<string, string> = {
  Human: "Human", Elf: "Elf", "Dark Elf": "DarkElf", DarkElf: "DarkElf",
  Orc: "Orc", Dwarf: "Dwarf", Kamael: "Kamael", Ertheia: "Ertheia",
};

const cache = new Map<string, Promise<ModelFile | null>>();
function fetchModel(file: string): Promise<ModelFile | null> {
  if (!cache.has(file)) {
    cache.set(file, fetch(file).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(file)!;
}

export interface CharacterModelHandle {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Build a character THREE.Group. Returns null if the model JSON is missing.
 * `targetHeight` is the desired height in scene units (default 3.4 — matches the
 * old player marker so camera framing is unchanged).
 */
export async function loadCharacterModel(
  race = "Ertheia",
  gender: "F" | "M" = "F",
  opts: { targetHeight?: number; basePath?: string } = {},
): Promise<CharacterModelHandle | null> {
  const base = opts.basePath ?? "/models/";
  const file = `${base}${RACE_FILE[race] ?? "Human"}_${gender}.json`;
  const model = await fetchModel(file);
  if (!model || !model.parts?.length) return null;

  const loader = new THREE.TextureLoader();
  const disposables: Array<{ dispose: () => void }> = [];
  const skin = new THREE.MeshStandardMaterial({ color: 0xcdb49a, roughness: 0.8, metalness: 0.02 });
  disposables.push(skin);

  // inner group holds the raw (z-up) meshes; rotate it into y-up
  const inner = new THREE.Group();
  inner.rotation.x = -Math.PI / 2;

  for (const part of model.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(part.positions), 3));
    if (part.uvs?.length) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(part.uvs), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
    geo.computeVertexNormals();
    disposables.push(geo);
    let mat: THREE.Material = skin;
    if (part.texture) {
      const tex = loader.load(part.texture);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 });
      disposables.push(mat, tex);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    inner.add(mesh);
  }

  // normalise: scale to targetHeight, seat feet at y=0, centre x/z
  const group = new THREE.Group();
  group.add(inner);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const target = opts.targetHeight ?? 3.4;
  const scale = size.y > 0.0001 ? target / size.y : 1;
  inner.scale.setScalar(scale);
  // recompute after scaling and re-seat
  const box2 = new THREE.Box3().setFromObject(group);
  inner.position.x -= (box2.min.x + box2.max.x) / 2;
  inner.position.z -= (box2.min.z + box2.max.z) / 2;
  inner.position.y -= box2.min.y;
  group.name = `Character:${race}_${gender}`;

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
