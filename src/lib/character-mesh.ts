/**
 * character-mesh.ts — load an extracted L2 character body (public/models/<Race>_<Gender>.json,
 * produced by tools/l2-extract-character-meshes.mjs + l2-extract-character-textures.mjs)
 * into a ready-to-place THREE.Group.
 *
 * The mesh is stored in L2 mesh-local space (z-up). This remaps it to three's y-up,
 * normalises it to `targetHeight` scene units and seats its feet at y = 0.
 *
 * Optional `equip` dresses the character: for each paperdoll slot the resolver
 * (armorgrp/weapongrp) yields a mesh name; the mesh is fetched from
 * /models/armor/<name>.json (same schema as the body) and attached as an
 * overlay on the inner z-up group, so it shares scale + orientation with the
 * body. Naked body parts in covered slots are hidden, then re-asserted every
 * REASSERT_INTERVAL_MS because some async paths re-enable them.
 *
 * Skinning note: extracted body parts have no skeleton today, so the dresser
 * uses overlay-attach (armor & body share canonical pose). The full 576-
 * candidate calibrator in armor-calibration.ts is wired up for the moment
 * bone data lands in the extracted JSON.
 */
import * as THREE from "three";
import { getArmorAssetRefs, warmArmorgrp, type ArmorSlotCode } from "./l2-protocol/armorgrp-resolver";
import { getWeaponAssetRefs, warmWeapongrp } from "./l2-protocol/weapongrp-resolver";
import { NAKED_SLOT_BY_ARMOR, REASSERT_INTERVAL_MS } from "./l2-protocol/armor-calibration";

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

// Warm the grp manifests on first import (idle).
if (typeof window !== "undefined") {
  setTimeout(() => { warmArmorgrp(); warmWeapongrp(); }, 0);
}

export type PaperdollSlot =
  | "rhand" | "lhand" | "gloves" | "chest" | "legs" | "feet" | "head" | "cloak";

export interface CharacterModelHandle {
  group: THREE.Group;
  /** Inner (mesh-local, z-up) group — animators rotate child parts here. */
  inner?: THREE.Group;
  /** Body parts keyed by their original mesh-local name, in attach order. */
  bodyParts?: Array<{ name: string; mesh: THREE.Mesh }>;
  dispose: () => void;
}

export interface LoadCharacterOptions {
  targetHeight?: number;
  basePath?: string;
  equip?: Partial<Record<PaperdollSlot, number>>;
}

const ARMOR_PAPERDOLL_TO_CODE: Partial<Record<PaperdollSlot, ArmorSlotCode>> = {
  chest: "u", legs: "l", gloves: "g", feet: "b", head: "h", cloak: "c",
};

function makeStandardMaterial(texUrl?: string, loader?: THREE.TextureLoader, disposables?: Array<{ dispose: () => void }>) {
  if (!texUrl || !loader) {
    return new THREE.MeshStandardMaterial({ color: 0xcdb49a, roughness: 0.8, metalness: 0.02 });
  }
  const tex = loader.load(texUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 });
  disposables?.push(mat, tex);
  return mat;
}

function partToMesh(part: ModelPart, mat: THREE.Material): { mesh: THREE.Mesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(part.positions), 3));
  if (part.uvs?.length) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(part.uvs), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return { mesh, geo };
}

const NAKED_SUFFIX_BY_CODE: Record<ArmorSlotCode, RegExp> = {
  u: /_u(?:_|$)|_bh(?:_|$)|chest|upper|body/i,
  l: /_l(?:_|$)|legs?|lower|pelvis/i,
  g: /_g(?:_|$)|gloves?|hand/i,
  b: /_b(?:_|$)|feet|foot|boot/i,
  h: /_h(?:_|$)|head|helmet/i,
  c: /_c(?:_|$)|cloak/i,
};

/**
 * Build a character THREE.Group. Returns null if the model JSON is missing.
 * `targetHeight` is the desired height in scene units (default 3.4).
 * `equip` is the paperdoll: each non-zero itemId is dressed onto the body.
 */
export async function loadCharacterModel(
  race = "Ertheia",
  gender: "F" | "M" = "F",
  opts: LoadCharacterOptions = {},
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

  // Track parts by their original name so the dresser can hide nakeds.
  const bodyPartMeshes: Array<{ name: string; mesh: THREE.Mesh }> = [];

  for (const part of model.parts) {
    const mat = part.texture ? makeStandardMaterial(part.texture, loader, disposables) : skin;
    const { mesh, geo } = partToMesh(part, mat);
    disposables.push(geo);
    inner.add(mesh);
    bodyPartMeshes.push({ name: part.name, mesh });
  }

  // ─── DRESSING ─────────────────────────────────────────────────────────────
  const armorOverlays: THREE.Object3D[] = [];
  const hiddenSlotCodes = new Set<ArmorSlotCode>();

  async function dressArmor(itemId: number, paperdollSlot: PaperdollSlot) {
    try {
      const refs = await getArmorAssetRefs(itemId);
      if (!refs.mesh) return;
      const armorUrl = `${base}armor/${refs.mesh}.json`;
      const armorModel = await fetchModel(armorUrl);
      if (!armorModel || !armorModel.parts?.length) return;
      const code = (refs.slot ?? ARMOR_PAPERDOLL_TO_CODE[paperdollSlot] ?? null) as ArmorSlotCode | null;
      const texUrl = refs.texture ? `${base}armor/tex/${refs.texture}.png` : undefined;
      for (const ap of armorModel.parts) {
        const mat = makeStandardMaterial(ap.texture ?? texUrl, loader, disposables);
        const { mesh, geo } = partToMesh(ap, mat);
        disposables.push(geo);
        inner.add(mesh);
        armorOverlays.push(mesh);
      }
      if (code) hiddenSlotCodes.add(code);
    } catch { /* ignore dressing failures — body stays naked */ }
  }

  async function dressWeapon(itemId: number) {
    try {
      const refs = await getWeaponAssetRefs(itemId);
      if (!refs.mesh) return;
      const wUrl = `${base}weapon/${refs.mesh}.json`;
      const wModel = await fetchModel(wUrl);
      if (!wModel || !wModel.parts?.length) return;
      const wGroup = new THREE.Group();
      const texUrl = refs.texture ? `${base}weapon/tex/${refs.texture}.png` : undefined;
      const partDisposables: Array<{ dispose: () => void }> = [];
      for (const wp of wModel.parts) {
        const mat = makeStandardMaterial(wp.texture ?? texUrl, loader, partDisposables);
        const { mesh, geo } = partToMesh(wp, mat);
        partDisposables.push(geo);
        wGroup.add(mesh);
      }
      disposables.push(...partDisposables);
      // Normalise weapon to ~refs.worldLengthM along its longest axis. Computed
      // BEFORE attaching to inner so the bbox is in mesh-local (z-up) space.
      const wbox = new THREE.Box3().setFromObject(wGroup);
      const wsize = wbox.getSize(new THREE.Vector3());
      const longest = Math.max(wsize.x, wsize.y, wsize.z);
      if (longest > 0.0001) {
        // The full character is normalised later to targetHeight units; pre-
        // scale the weapon so AFTER that normalisation its world length is
        // approximately refs.worldLengthM scene units. The body is roughly
        // 180 mesh-units tall; targetHeight maps that to ~3.4 scene units →
        // 1 scene unit ≈ 53 mesh-units. So mesh-scale ≈ worldLengthM*53/longest.
        const meshScale = (refs.worldLengthM * 53) / longest;
        wGroup.scale.setScalar(meshScale);
      }
      // Heuristic right-hand attach in mesh-local (z-up): place the weapon
      // at the body's right side (+x), hip-level (z ≈ body_height/2), slight
      // forward offset (+y).
      const bbox = new THREE.Box3().setFromObject(inner);
      const bsize = bbox.getSize(new THREE.Vector3());
      // bbox here is in WORLD because inner is rotated — recompute in local.
      const localBox = new THREE.Box3();
      bodyPartMeshes.forEach((p) => localBox.expandByObject(p.mesh));
      const lsize = localBox.getSize(new THREE.Vector3());
      const handX = (localBox.max.x) * 0.55;
      const handZ = localBox.min.z + lsize.z * 0.55;
      const handY = localBox.min.y + lsize.y * 0.10;
      wGroup.position.set(handX, handY, handZ);
      inner.add(wGroup);
      armorOverlays.push(wGroup);
      void bsize; // silence
    } catch { /* ignore weapon failures */ }
  }

  const equip = opts.equip ?? {};
  const dressers: Array<Promise<void>> = [];
  for (const slot of ["chest", "legs", "gloves", "feet", "head", "cloak"] as const) {
    const id = equip[slot];
    if (id) dressers.push(dressArmor(id, slot));
  }
  if (equip.rhand) dressers.push(dressWeapon(equip.rhand));
  if (equip.lhand) dressers.push(dressWeapon(equip.lhand)); // shields share weapon ducting

  // Hide naked-body parts for whatever slot codes ended up covered.
  const enforceHidden = () => {
    for (const { name, mesh } of bodyPartMeshes) {
      let cover = false;
      for (const code of hiddenSlotCodes) {
        const list = NAKED_SLOT_BY_ARMOR[code as "u" | "l" | "g" | "b"];
        if (list?.some((n) => name.toLowerCase().includes(n.toLowerCase()))) { cover = true; break; }
        if (NAKED_SUFFIX_BY_CODE[code].test(name)) { cover = true; break; }
      }
      mesh.visible = !cover;
    }
  };

  await Promise.allSettled(dressers);
  enforceHidden();
  const reassert = window.setInterval(enforceHidden, REASSERT_INTERVAL_MS);
  disposables.push({ dispose: () => window.clearInterval(reassert) });

  // normalise: scale to targetHeight, seat feet at y=0, centre x/z
  const group = new THREE.Group();
  group.add(inner);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const target = opts.targetHeight ?? 3.4;
  const scale = size.y > 0.0001 ? target / size.y : 1;
  inner.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(group);
  inner.position.x -= (box2.min.x + box2.max.x) / 2;
  inner.position.z -= (box2.min.z + box2.max.z) / 2;
  inner.position.y -= box2.min.y;
  group.name = `Character:${race}_${gender}`;

  void armorOverlays;

  return {
    group,
    inner,
    bodyParts: bodyPartMeshes,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
