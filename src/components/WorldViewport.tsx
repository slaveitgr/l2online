import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { listFiles, getManifest, getCacheStats, getFile, formatBytes, type CachedFileMeta } from "@/lib/l2-assets";
import { listMountFiles, readFromMount } from "@/lib/local-mount";
import { loadMap } from "@/lib/map-loader";
import { getGameConnection, type GameEvent, type WorldEntity } from "@/lib/l2-protocol/game-client";
import {
  setSelectedTarget,
  setHoveredTarget,
  getSelectedTarget,
  setDialogTarget,
  getDialogTarget,
} from "@/lib/game-state";
import { loadCharacterModel, type CharacterModelHandle } from "@/lib/character-mesh";
import { loadNpcMesh, npcMeshInfo, npcMeshInfoSync, isNpcPkgLoaded, prettyNpcName } from "@/lib/npc-mesh";

/**
 * Phase 1.5 viewport.
 *
 * Placeholder terrain + LIVE world entities driven by the game connection:
 * the player sits at the scene origin, NPCs/monsters are rendered as markers at
 * their real L2 coordinates (relative to the player, scaled down). Spawns,
 * moves and despawns stream in from NpcInfo(0x0C)/MoveToLocation(0x2F)/
 * DeleteObject(0x08). Authentic UE2 asset rendering is the next milestone.
 */

// L2 units → scene units. Lower = more zoomed in. ~3000 units → 100 scene units.
const SCALE = 30;

export interface WorldViewportProps {
  onTargetTap?: (objectId: number) => void;
  onGroundTap?: (x: number, y: number, z: number) => void;
}

export function WorldViewport({ onTargetTap, onGroundTap }: WorldViewportProps = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState(0);
  const [worldPos, setWorldPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [entityCount, setEntityCount] = useState(0);
  const [loadStatus, setLoadStatus] = useState("Initializing…");
  const [assetSummary, setAssetSummary] = useState<{
    rootName: string;
    maps: CachedFileMeta[];
    textures: number;
    meshes: number;
  } | null>(null);
  const [mapInfo, setMapInfo] = useState<{ path: string; actors: number; spawns: number } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene ────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    // Daylight town atmosphere (was a dark red cast that tinted everything blue/black).
    scene.background = new THREE.Color(0x9fb6d4);
    scene.fog = new THREE.FogExp2(0xa8bcd6, 0.0016);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 3000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    // ── Lighting (neutral daylight) ──────────────────────────────────────
    // Sky/ground hemisphere lifts untextured surfaces without the old red/blue cast.
    scene.add(new THREE.HemisphereLight(0xdce8f7, 0x6f6048, 0.95));
    const sun = new THREE.DirectionalLight(0xfff3da, 1.3);
    sun.position.set(120, 200, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160 });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd2f0, 0.32);
    fill.position.set(-90, 70, -60);
    scene.add(fill);

    // ── Ground ───────────────────────────────────────────────────────────
    // A large FLAT neutral stone plane at foot level — believable town ground and
    // the click-to-move raycast target. It is hidden once the real map's own
    // terrain/floors assemble (so it never double-covers the real geometry), but
    // stays in the scene graph (invisible objects still raycast) for click-to-move.
    const terrainGeom = new THREE.PlaneGeometry(2000, 2000, 1, 1);
    terrainGeom.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0x6f675b, roughness: 0.96, metalness: 0 });
    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.position.y = -0.6; // sits below the real terrain mesh to avoid z-fighting
    terrain.receiveShadow = true;
    scene.add(terrain);

    // ── Live entity layer ────────────────────────────────────────────────
    const conn = getGameConnection();
    const player = conn?.getPlayer();
    // Scene origin = the player's world position (everything is relative to it).
    const origin = player ? { x: player.x, y: player.y, z: player.z } : { x: 0, y: 0, z: 0 };
    setWorldPos(origin);

    // L2 (x east, y north, z up) → three (x right, y up, z forward).
    // Matches the map-loader convention (l2Group.rotation.x = -PI/2 → three.z = -L2.y)
    // so entities, the player and the static map share ONE coordinate frame.
    const toScene = (wx: number, wy: number, wz: number) =>
      new THREE.Vector3((wx - origin.x) / SCALE, (wz - origin.z) / SCALE, -(wy - origin.y) / SCALE);

    // Player scene position (smoothly chased toward the server-reported target).
    const playerScenePos = new THREE.Vector3(0, 0, 0);
    const playerTargetPos = new THREE.Vector3(0, 0, 0);
    let playerYaw = 0;
    let playerYawTarget = 0;
    const FACE_OFFSET = Math.PI; // tune if the model faces away from travel direction

    // Player marker — a teal cone shown immediately, then replaced by the real
    // 3D character model once it loads (Phase: player avatar in-world).
    const playerMesh = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 3.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3fb6a8, emissive: 0x16403a, roughness: 0.4 }),
    );
    playerMesh.position.set(0, 1.7, 0);
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    // Swap the cone for the player's real character model.
    let playerModel: CharacterModelHandle | null = null;
    let playerModelDisposed = false;
    (() => {
      let race = "Human";
      let gender: "F" | "M" = "F";
      try {
        const raw = sessionStorage.getItem("l2.activeChar");
        if (raw) {
          const c = JSON.parse(raw);
          if (c.race) race = c.race;
          if (c.gender === "M" || c.sex === 0 || c.sex === "0") gender = "M";
        }
      } catch { /* ignore */ }
      loadCharacterModel(race, gender, { targetHeight: 3.4 })
        .then((handle) => {
          if (!handle || playerModelDisposed) { handle?.dispose(); return; }
          playerModel = handle;
          handle.group.position.set(0, 0, 0);
          scene.add(handle.group);
          scene.remove(playerMesh); // hide the placeholder cone
        })
        .catch(() => {/* keep cone */});
    })();

    const playerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x3fb6a8, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
    );
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.position.y = 0.1;
    scene.add(playerRing);

    // L2 Race enum ordinal → extracted-model race name (Mobius Race order).
    const RACE_BY_ORDINAL = ["Human", "Elf", "Dark Elf", "Orc", "Dwarf", "Kamael", "Ertheia", "Sylph"];

    // NPC markers — a humanoid capsule (NPCs, until real .ukx NPC meshes ship).
    // OTHER PLAYERS get their real race/gender body model (clothed Fighter body).
    const npcGeom = new THREE.CapsuleGeometry(0.7, 2.0, 6, 12);
    const npcMat = new THREE.MeshStandardMaterial({ color: 0xb5483a, roughness: 0.7 });
    const entityMeshes = new Map<number, THREE.Mesh>(); // capsules (NPCs)

    interface ModelHandle { group: THREE.Object3D; dispose: () => void; }
    interface EntityModel {
      handle: ModelHandle | null;
      scenePos: THREE.Vector3;
      target: THREE.Vector3;
      yaw: number;
      yawTarget: number;
    }
    const entityModels = new Map<number, EntityModel>(); // real meshes (players + NPCs)

    // npc-id → [raceName, "M"|"F"] fallback for humanoid NPCs without an exact mesh.
    let npcAppearance: Record<string, [string, "M" | "F"]> = {};

    // Create/refresh the smooth-chase record for an entity and load its model via `loader`.
    const placeModel = (objectId: number, x: number, y: number, z: number,
                        loader: () => Promise<ModelHandle | null>, onAttached?: () => void) => {
      const p = toScene(x, y, z); // feet at ground (models seat feet at y=0)
      let em = entityModels.get(objectId);
      if (!em) {
        em = { handle: null, scenePos: p.clone(), target: p.clone(), yaw: 0, yawTarget: 0 };
        entityModels.set(objectId, em);
        loader()
          .then((handle) => {
            const still = entityModels.get(objectId);
            if (!handle || !still) { handle?.dispose(); return; }
            still.handle = handle;
            handle.group.position.copy(still.scenePos);
            handle.group.userData.objectId = objectId; // selectable
            scene.add(handle.group);
            onAttached?.();
          })
          .catch(() => {/* ignore */});
      } else {
        const dx = p.x - em.target.x, dz = p.z - em.target.z;
        if (Math.hypot(dx, dz) > 0.05) em.yawTarget = Math.atan2(dx, dz) + Math.PI;
        em.target.copy(p);
      }
    };

    const ensureCapsule = (e: WorldEntity) => {
      let m = entityMeshes.get(e.objectId);
      if (!m) {
        m = new THREE.Mesh(npcGeom, npcMat);
        m.castShadow = true;
        m.userData.objectId = e.objectId;
        scene.add(m);
        entityMeshes.set(e.objectId, m);
      }
      const p = toScene(e.x, e.y, e.z); p.y += 1.7; m.position.copy(p);
    };
    const dropCapsule = (objectId: number) => {
      const m = entityMeshes.get(objectId);
      if (m) { scene.remove(m); entityMeshes.delete(objectId); }
    };

    // Async: pick the best model for an NPC — exact npcgrp mesh first, then a
    // race/sex body, else leave the capsule. Called only for nearby NPCs by the
    // streaming gate below (see `pumpUpgrades`).
    const inflightUpgrades = new Set<number>();
    const upgradedOrSkipped = new Set<number>(); // already loaded OR no model available
    const upgradeNpc = async (e: WorldEntity) => {
      if (inflightUpgrades.has(e.objectId) || upgradedOrSkipped.has(e.objectId)) return;
      inflightUpgrades.add(e.objectId);
      try {
        const info = await npcMeshInfo(e.displayId);
        if (info?.m) {
          placeModel(e.objectId, e.x, e.y, e.z, () => loadNpcMesh(info.m, { targetHeight: 3.4, texName: info.t?.[0] }), () => dropCapsule(e.objectId));
          upgradedOrSkipped.add(e.objectId);
          return;
        }
        const a = npcAppearance[String(e.displayId)];
        if (a) {
          placeModel(e.objectId, e.x, e.y, e.z, () => loadCharacterModel(a[0], a[1] as "F" | "M", { targetHeight: 3.4 }), () => dropCapsule(e.objectId));
        }
        upgradedOrSkipped.add(e.objectId);
      } finally {
        inflightUpgrades.delete(e.objectId);
      }
    };

    const upsert = (e: WorldEntity) => {
      if (e.isPlayer) {
        const race = RACE_BY_ORDINAL[e.race ?? 0] ?? "Human";
        const gender: "F" | "M" = e.female ? "F" : "M";
        placeModel(e.objectId, e.x, e.y, e.z, () => loadCharacterModel(race, gender, { targetHeight: 3.4 }));
        return;
      }
      ensureCapsule(e);   // always show a marker immediately
      // mesh upgrade is deferred — `pumpUpgrades` decides when it's worth fetching
      // the multi-MB package for this NPC's distance from the player.
    };
    const moveEntity = (objectId: number, x: number, y: number, z: number) => {
      const em = entityModels.get(objectId);
      if (em) {
        const p = toScene(x, y, z);
        const dx = p.x - em.target.x, dz = p.z - em.target.z;
        if (Math.hypot(dx, dz) > 0.05) em.yawTarget = Math.atan2(dx, dz) + Math.PI;
        em.target.copy(p);
        return;
      }
      const m = entityMeshes.get(objectId);
      if (m) { const p = toScene(x, y, z); p.y += 1.7; m.position.copy(p); }
    };
    const remove = (objectId: number) => {
      const m = entityMeshes.get(objectId);
      if (m) { scene.remove(m); entityMeshes.delete(objectId); }
      const em = entityModels.get(objectId);
      if (em) {
        if (em.handle) { scene.remove(em.handle.group); em.handle.dispose(); }
        entityModels.delete(objectId);
      }
    };
    const entityCount = () => entityMeshes.size + entityModels.size;

    // Render whatever already spawned during the enter-world burst.
    conn?.getEntities().forEach(upsert);
    setEntityCount(entityCount());

    // Load the humanoid-NPC race/sex fallback table. The streaming pump (below)
    // will pick up any NPC eligible for upgrade once this table is available.
    fetch("/models/npc-appearance.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((table: Record<string, [string, "M" | "F"]>) => { npcAppearance = table || {}; })
      .catch(() => {/* keep capsules */});

    // ── Selection / hover highlight rings ────────────────────────────────
    const makeRing = (color: number, inner: number, outer: number, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 48),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.12;
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      return m;
    };
    const hoverRing = makeRing(0xf6e7a6, 1.4, 1.9, 0.55);
    const selectRing = makeRing(0xe24a3a, 1.7, 2.2, 0.85);
    // Track hover id in a local mirror so we can clear it cheaply.
    let lastHoverId: number | null = null;

    // ── NPC mesh streaming pump ──────────────────────────────────────────
    // Only upgrade NPCs near the player. Re-evaluated every ~600ms. This caps the
    // worst case (hundreds of spawns) at a handful of package fetches and lets the
    // network/CPU stay responsive while the map tiles stream in.
    const UPGRADE_RADIUS_SCENE = 90; // ~2700 L2 units around the player
    const pumpUpgrades = () => {
      if (!conn) return;
      // 1) NPCs already in a loaded package upgrade for free → always allowed.
      // 2) Others must be within radius AND we cap "new package" work per tick.
      let newPkgBudget = 1;
      const ents = conn.getEntities();
      // Pre-sort by distance so the closest NPCs get prioritised.
      const candidates: Array<{ e: WorldEntity; d2: number }> = [];
      for (const e of ents) {
        if (e.isPlayer) continue;
        if (entityModels.has(e.objectId) || inflightUpgrades.has(e.objectId) || upgradedOrSkipped.has(e.objectId)) continue;
        const p = toScene(e.x, e.y, e.z);
        const dx = p.x - playerScenePos.x, dz = p.z - playerScenePos.z;
        candidates.push({ e, d2: dx * dx + dz * dz });
      }
      candidates.sort((a, b) => a.d2 - b.d2);
      const radius2 = UPGRADE_RADIUS_SCENE * UPGRADE_RADIUS_SCENE;
      for (const { e, d2 } of candidates) {
        const info = npcMeshInfoSync(e.displayId);
        const meshName = info?.m;
        const cached = meshName ? isNpcPkgLoaded(meshName) : false;
        if (cached) { void upgradeNpc(e); continue; }
        if (d2 > radius2) continue;
        if (newPkgBudget <= 0) continue;
        newPkgBudget--;
        void upgradeNpc(e);
      }
    };
    const pumpTimer = window.setInterval(pumpUpgrades, 600);
    // run once after a tiny delay so the first burst of spawns is handled
    window.setTimeout(pumpUpgrades, 250);

    const setPlayerTarget = (wx: number, wy: number, wz: number) => {
      const p = toScene(wx, wy, wz);
      const dx = p.x - playerTargetPos.x;
      const dz = p.z - playerTargetPos.z;
      if (Math.hypot(dx, dz) > 0.05) playerYawTarget = Math.atan2(dx, dz) + FACE_OFFSET;
      playerTargetPos.copy(p);
    };

    const unsub = conn?.addListener((ev: GameEvent) => {
      if (ev.type === "player") {
        const pl = ev.player as { x?: number; y?: number; z?: number };
        if (typeof pl.x === "number") setPlayerTarget(pl.x, pl.y ?? 0, pl.z ?? 0);
      } else if (ev.type === "npc-spawn") {
        upsert(ev.entity);
        setEntityCount(entityCount());
      } else if (ev.type === "npc-move") {
        moveEntity(ev.objectId, ev.x, ev.y, ev.z);
      } else if (ev.type === "npc-remove") {
        remove(ev.objectId);
        setEntityCount(entityCount());
      }
    });

    // ── Orbit camera (around the player at origin) ───────────────────────
    let theta = Math.PI / 4;
    let phi = Math.PI / 3.2;
    let radius = 70;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const updateCamera = () => {
      // third-person orbit centred on the player (who can now move)
      camera.position.x = playerScenePos.x + Math.sin(phi) * Math.cos(theta) * radius;
      camera.position.z = playerScenePos.z + Math.sin(phi) * Math.sin(theta) * radius;
      camera.position.y = playerScenePos.y + Math.cos(phi) * radius + 4;
      camera.lookAt(playerScenePos.x, playerScenePos.y + 2, playerScenePos.z);
    };
    updateCamera();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downT = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    // Collect all selectable NPC objects (capsule + upgraded model groups).
    const npcSelectables = (): THREE.Object3D[] => {
      const a: THREE.Object3D[] = Array.from(entityMeshes.values());
      for (const em of entityModels.values()) if (em.handle) a.push(em.handle.group);
      return a;
    };
    const pickNpcAt = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(npcSelectables(), true);
      if (!hits.length) return null;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && o.userData?.objectId === undefined) o = o.parent;
      const id = o?.userData?.objectId;
      return typeof id === "number" ? id : null;
    };

    const onMove = (e: PointerEvent) => {
      if (dragging) {
        theta -= (e.clientX - lastX) * 0.005;
        phi = Math.max(0.15, Math.min(Math.PI / 2.1, phi - (e.clientY - lastY) * 0.005));
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
        return;
      }
      // Cheap-ish hover raycast (rate-limited via rAF flag).
      if (hoverPending) return;
      hoverPending = true;
      pendingHoverX = e.clientX; pendingHoverY = e.clientY;
    };
    let hoverPending = false;
    let pendingHoverX = 0, pendingHoverY = 0;
    const onPointerLeave = () => {
      if (lastHoverId !== null) { lastHoverId = null; setHoveredTarget(null); }
    };
    renderer.domElement.style.cursor = "default";
    const onUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      const moved = Math.hypot(dx, dy);
      const dt = performance.now() - downT;
      if (moved < 6 && dt < 350) {
        const id = pickNpcAt(e.clientX, e.clientY);
        if (id !== null) {
          setSelectedTarget(id);
          onTargetTap?.(id);
          return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const groundHits = raycaster.intersectObject(terrain, false);
        if (groundHits.length > 0) {
          const p = groundHits[0].point;
          // optimistic local move so the character starts walking immediately
          const dx = p.x - playerTargetPos.x;
          const dz = p.z - playerTargetPos.z;
          if (Math.hypot(dx, dz) > 0.05) playerYawTarget = Math.atan2(dx, dz) + FACE_OFFSET;
          playerTargetPos.set(p.x, p.y, p.z);
          if (onGroundTap) {
            // scene → L2 world (inverse of toScene)
            const wx = Math.round(p.x * SCALE + origin.x);
            const wy = Math.round(-p.z * SCALE + origin.y);
            const wz = Math.round(p.y * SCALE + origin.z);
            onGroundTap(wx, wy, wz);
          }
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(15, Math.min(400, radius + e.deltaY * 0.08));
      updateCamera();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Keyboard: T (or Enter) opens the talk dialog for the selected NPC.
    // Esc closes it (or clears the selection if no dialog is open).
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in chat / inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "t" || e.key === "T" || e.key === "Enter") {
        const sel = getSelectedTarget();
        if (sel !== null) {
          setDialogTarget(sel);
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        if (getDialogTarget() !== null) setDialogTarget(null);
        else setSelectedTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Render loop ──────────────────────────────────────────────────────
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() * 0.001;

      // chase the player toward the server/click target + face travel direction
      playerScenePos.lerp(playerTargetPos, 0.12);
      let dy = playerYawTarget - playerYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      playerYaw += dy * 0.18;

      playerMesh.position.set(playerScenePos.x, playerScenePos.y + 1.7, playerScenePos.z);
      playerRing.position.set(playerScenePos.x, playerScenePos.y + 0.1, playerScenePos.z);
      if (playerModel) {
        playerModel.group.position.copy(playerScenePos);
        playerModel.group.rotation.y = playerYaw;
      }

      // chase every other-player model toward its server target + face travel
      for (const em of entityModels.values()) {
        em.scenePos.lerp(em.target, 0.12);
        let edy = em.yawTarget - em.yaw;
        while (edy > Math.PI) edy -= Math.PI * 2;
        while (edy < -Math.PI) edy += Math.PI * 2;
        em.yaw += edy * 0.18;
        if (em.handle) {
          em.handle.group.position.copy(em.scenePos);
          em.handle.group.rotation.y = em.yaw;
        }
      }
      updateCamera();

      // Hover raycast (deferred from pointermove for cheap throttling).
      if (hoverPending) {
        hoverPending = false;
        const id = pickNpcAt(pendingHoverX, pendingHoverY);
        if (id !== lastHoverId) {
          lastHoverId = id;
          setHoveredTarget(id);
          renderer.domElement.style.cursor = id !== null ? "pointer" : "default";
        }
      }

      // Position highlight rings under hovered + selected NPCs.
      const positionRing = (ring: THREE.Mesh, id: number | null) => {
        if (id === null) { ring.visible = false; return; }
        const em = entityModels.get(id);
        if (em) { ring.position.set(em.scenePos.x, em.scenePos.y + 0.12, em.scenePos.z); ring.visible = true; return; }
        const cap = entityMeshes.get(id);
        if (cap) { ring.position.set(cap.position.x, 0.12, cap.position.z); ring.visible = true; return; }
        ring.visible = false;
      };
      positionRing(hoverRing, lastHoverId);
      positionRing(selectRing, getSelectedTarget());
      hoverRing.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
      selectRing.scale.setScalar(1 + Math.sin(t * 4) * 0.03);

      playerRing.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      renderer.render(scene, camera);
      frameCount++;
      if (performance.now() - lastFpsTime > 500) {
        setFps(Math.round((frameCount * 1000) / (performance.now() - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = performance.now();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    // ── Map layer (real L2 .unr) ─────────────────────────────────────────
    const mapDisposables: Array<{ dispose: () => void }> = [];
    let mapGroup: THREE.Group | null = null;
    let tileTimer = 0;

    // ── Asset loader hook (reads cached client) ──────────────────────────
    (async () => {
      setLoadStatus("Reading mounted/cached client…");
      const [manifest, stats] = await Promise.all([getManifest().catch(() => null), getCacheStats().catch(() => null)]);
      const rootName = manifest?.rootName ?? "CDN cache";
      const [cachedMaps, mountedMaps, cachedTextures, mountedTextures, cachedMeshes, mountedMeshes] = await Promise.all([
        listFiles("maps").catch(() => []),
        listMountFiles("Maps").catch(() => []),
        listFiles("textures").catch(() => []),
        listMountFiles("Textures").catch(() => []),
        listFiles("staticmeshes").catch(() => []),
        listMountFiles("StaticMeshes").catch(() => []),
      ]);
      const mapPaths = new Set<string>();
      const maps = [...mountedMaps, ...cachedMaps].filter((m) => {
        const key = m.path.toLowerCase();
        if (mapPaths.has(key)) return false;
        mapPaths.add(key);
        return true;
      });
      const textures = Math.max(cachedTextures.length, mountedTextures.length);
      const meshes = Math.max(cachedMeshes.length, mountedMeshes.length);
      setAssetSummary({ rootName: mountedMaps.length ? "Mounted client" : rootName, maps, textures, meshes });
      if (stats && stats.cachedFiles > 0)
        setLoadStatus(`${stats.cachedFiles}/${stats.totalFiles} files cached · ${formatBytes(stats.cachedBytes)}`);
      else if (maps.length > 0) setLoadStatus(`Found ${maps.length} maps · loading sector…`);
      else setLoadStatus("No cache found · checking mounted client folder…");

      // ── Shared package source (mount → cache) used by every tile ─────────
      const bytesForPath = async (path: string): Promise<ArrayBuffer | null> => {
        try {
          const b = (await readFromMount(path)) ?? (await getFile(path));
          return b ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : null;
        } catch {
          return null;
        }
      };
      const meshFolder = [...mountedMeshes, ...cachedMeshes] as CachedFileMeta[];
      const meshIndex = new Map<string, string>(); // lower(basename) → path
      for (const f of meshFolder) {
        const base = f.path.split("/").pop()!.replace(/\.usx$/i, "").toLowerCase();
        meshIndex.set(base, f.path);
      }
      const getPackage = async (pkgName: string): Promise<ArrayBuffer | null> => {
        for (const p of [
          `StaticMeshes/${pkgName}.usx`, `staticmeshes/${pkgName}.usx`,
          `Textures/${pkgName}.utx`, `textures/${pkgName}.utx`,
          `SysTextures/${pkgName}.utx`, `systextures/${pkgName}.utx`,
        ]) {
          const buf = await bytesForPath(p);
          if (buf) return buf;
        }
        const indexed = meshIndex.get(pkgName.toLowerCase());
        return indexed ? await bytesForPath(indexed) : null;
      };

      // pre-baked terrain splatmaps (public/terrain/<tile>.png) — one texture per tile
      const texLoader = new THREE.TextureLoader();
      const bakedCache = new Map<string, Promise<THREE.Texture | null>>();
      const loadBakedTerrain = (mx: number, my: number): Promise<THREE.Texture | null> => {
        const key = `${mx}_${my}`;
        if (!bakedCache.has(key)) {
          bakedCache.set(
            key,
            new Promise<THREE.Texture | null>((resolve) => {
              texLoader.load(`/terrain/${key}.png`, (t) => resolve(t), undefined, () => resolve(null));
            }),
          );
        }
        return bakedCache.get(key)!;
      };

      // ── Tile streaming: load the .unr under the player + its neighbours ──
      // L2 world → map tile: tileX = floor(x/32768)+20, tileY = floor(y/32768)+18.
      const TILE_UNITS = 32768;
      const RADIUS = 1; // 3×3 ring around the player
      const mapsRoot = new THREE.Group();
      mapsRoot.name = "L2Tiles";
      scene.add(mapsRoot);
      mapGroup = mapsRoot; // tracked for cleanup
      const loadedTiles = new Map<string, THREE.Group>();
      const loadingTiles = new Set<string>();
      let currentTileKey = "";
      let firstTileLoaded = false;

      const playerWorld = () => ({
        x: playerScenePos.x * SCALE + origin.x,
        y: -playerScenePos.z * SCALE + origin.y,
      });
      const tileOf = (wx: number, wy: number) => ({
        tx: Math.floor(wx / TILE_UNITS) + 20,
        ty: Math.floor(wy / TILE_UNITS) + 18,
      });

      const loadTile = async (tx: number, ty: number) => {
        const key = `${tx}_${ty}`;
        if (loadedTiles.has(key) || loadingTiles.has(key)) return;
        loadingTiles.add(key);
        let bytes: Uint8Array | null = null;
        for (const p of [`Maps/${tx}_${ty}.unr`, `maps/${tx}_${ty}.unr`]) {
          bytes = (await readFromMount(p)) ?? (await getFile(p));
          if (bytes) break;
        }
        if (!bytes) { loadingTiles.delete(key); return; }
        try {
          const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          const g = await loadMap(ab, getPackage, {
            scale: SCALE,
            origin: { x: origin.x, y: origin.y, z: origin.z },
            skipTerrain: true, // we draw a flat baked floor (reliable height) below
            onProgress: (msg) => { if (!firstTileLoaded) setLoadStatus(msg); },
          });
          // Flat textured ground for this tile from the pre-baked splatmap. A flat plane
          // at foot level is reliable (the heightmap geometry mis-positions/floats), and
          // L2 town plazas are near-flat anyway.
          const baked = await loadBakedTerrain(tx, ty);
          if (baked) {
            baked.colorSpace = THREE.SRGBColorSpace;
            baked.anisotropy = 8;
            baked.needsUpdate = true;
            const TILE_SCENE = TILE_UNITS / SCALE; // one tile in scene units
            const floorGeo = new THREE.PlaneGeometry(TILE_SCENE, TILE_SCENE);
            floorGeo.rotateX(-Math.PI / 2);
            const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: baked, roughness: 1, metalness: 0 }));
            // tile centre in world → scene (matches toScene: x→x, y→-z)
            const cwx = (tx - 20) * TILE_UNITS + TILE_UNITS / 2;
            const cwy = (ty - 18) * TILE_UNITS + TILE_UNITS / 2;
            floor.position.set((cwx - origin.x) / SCALE, -0.15, -(cwy - origin.y) / SCALE);
            floor.receiveShadow = true;
            floor.renderOrder = -1;
            g.add(floor);
          }
          if (!loadingTiles.has(key)) { /* unloaded mid-flight */ } else {
            mapsRoot.add(g);
            loadedTiles.set(key, g);
            firstTileLoaded = true;
            setMapInfo({ path: `Maps/${key}.unr`, actors: g.userData.meshCount ?? 0, spawns: loadedTiles.size });
            setLoadStatus(`tiles: ${[...loadedTiles.keys()].join(", ")}`);
          }
        } catch (err) {
          console.warn("[tile] failed", key, err);
        }
        loadingTiles.delete(key);
      };

      const updateTiles = () => {
        const { x, y } = playerWorld();
        const { tx, ty } = tileOf(x, y);
        const ck = `${tx}_${ty}`;
        if (ck === currentTileKey) return;
        currentTileKey = ck;
        // load current first, then the ring
        loadTile(tx, ty);
        for (let dx = -RADIUS; dx <= RADIUS; dx++)
          for (let dy = -RADIUS; dy <= RADIUS; dy++)
            if (dx || dy) loadTile(tx + dx, ty + dy);
        // unload tiles outside the window
        for (const [key, g] of loadedTiles) {
          const [kx, ky] = key.split("_").map(Number);
          if (Math.abs(kx - tx) > RADIUS || Math.abs(ky - ty) > RADIUS) {
            mapsRoot.remove(g);
            loadedTiles.delete(key);
            g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
          }
        }
      };

      updateTiles(); // initial (player enter tile)
      tileTimer = window.setInterval(updateTiles, 1200); // re-check as the player moves
    })().catch((err) => {
      console.error("[map] loader failed", err);
      setLoadStatus(`Map load failed: ${(err as Error).message}`);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (tileTimer) clearInterval(tileTimer);
      clearInterval(pumpTimer);
      unsub?.();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      setHoveredTarget(null);
      setDialogTarget(null);
      hoverRing.geometry.dispose(); (hoverRing.material as THREE.Material).dispose();
      selectRing.geometry.dispose(); (selectRing.material as THREE.Material).dispose();
      entityMeshes.forEach((m) => scene.remove(m));
      entityMeshes.clear();
      entityModels.forEach((em) => { if (em.handle) { scene.remove(em.handle.group); em.handle.dispose(); } });
      entityModels.clear();
      playerModelDisposed = true;
      if (playerModel) { scene.remove(playerModel.group); playerModel.dispose(); }
      if (mapGroup) scene.remove(mapGroup);
      mapDisposables.forEach((d) => d.dispose());
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      terrainGeom.dispose();
      terrainMat.dispose();
      npcGeom.dispose();
      npcMat.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Top-left HUD */}
      <div className="absolute top-4 left-4 panel rounded px-4 py-3 font-mono text-xs space-y-1 pointer-events-none">
        <div className="flex gap-4">
          <span className="text-gold">FPS</span>
          <span className="text-foreground tabular-nums">{fps}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-gold">POS</span>
          <span className="text-foreground tabular-nums">
            {worldPos ? `${worldPos.x} ${worldPos.y} ${worldPos.z}` : "—"}
          </span>
        </div>
        <div className="flex gap-4">
          <span className="text-gold">NPCS</span>
          <span className="text-foreground tabular-nums">{entityCount}</span>
        </div>
      </div>

      {/* Bottom-left asset status */}
      <div className="absolute bottom-4 left-4 panel rounded px-4 py-3 font-mono text-xs max-w-md pointer-events-none">
        <div className="text-gold tracking-widest mb-1 uppercase">Asset Loader</div>
        <div className="text-muted-foreground">{loadStatus}</div>
        {assetSummary && (
          <div className="mt-2 pt-2 border-t border-border/40 text-foreground/80 grid grid-cols-3 gap-x-3">
            <div>
              <span className="text-gold-muted">maps</span> {assetSummary.maps.length}
            </div>
            <div>
              <span className="text-gold-muted">tex</span> {assetSummary.textures}
            </div>
            <div>
              <span className="text-gold-muted">mesh</span> {assetSummary.meshes}
            </div>
          </div>
        )}
        {mapInfo && (
          <div className="mt-2 pt-2 border-t border-border/40 text-foreground/80">
            <span className="text-gold-muted">map</span> {mapInfo.path} ·{" "}
            <span className="text-gold-muted">actors</span> {mapInfo.actors} ·{" "}
            <span className="text-gold-muted">spawns</span> {mapInfo.spawns}
          </div>
        )}
      </div>

      {/* Bottom-right controls hint */}
      <div className="absolute bottom-4 right-4 panel rounded px-4 py-3 font-mono text-[10px] text-muted-foreground pointer-events-none">
        <div>
          <span className="text-gold-muted">DRAG</span> orbit
        </div>
        <div>
          <span className="text-gold-muted">WHEEL</span> zoom
        </div>
      </div>
    </div>
  );
}
