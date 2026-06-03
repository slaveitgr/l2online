import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { listFiles, getManifest, getCacheStats, getFile, formatBytes, type CachedFileMeta } from "@/lib/l2-assets";
import { readFromMount } from "@/lib/local-mount";
import { L2Package } from "@/lib/l2-package";
import { loadMap } from "@/lib/map-loader";
import { getGameConnection, type GameEvent, type WorldEntity } from "@/lib/l2-protocol/game-client";

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

export function WorldViewport() {
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
    scene.background = new THREE.Color(0x1a0f0a);
    scene.fog = new THREE.FogExp2(0x2a1a14, 0.006);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 3000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Lighting ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x442a1c, 0.7));
    const sun = new THREE.DirectionalLight(0xffd28a, 1.2);
    sun.position.set(80, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150 });
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6080ff, 0.3);
    rim.position.set(-50, 30, -50);
    scene.add(rim);

    // ── Ground (placeholder heightmap) ───────────────────────────────────
    const terrainGeom = new THREE.PlaneGeometry(400, 400, 80, 80);
    terrainGeom.rotateX(-Math.PI / 2);
    const tp = terrainGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const z = tp.getZ(i);
      const h = Math.sin(x * 0.04) * 3 + Math.cos(z * 0.05) * 2.5 + Math.sin((x + z) * 0.02) * 4;
      tp.setY(i, h);
    }
    terrainGeom.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 0.95 });
    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // ── Live entity layer ────────────────────────────────────────────────
    const conn = getGameConnection();
    const player = conn?.getPlayer();
    // Scene origin = the player's world position (everything is relative to it).
    const origin = player ? { x: player.x, y: player.y, z: player.z } : { x: 0, y: 0, z: 0 };
    setWorldPos(origin);

    // L2 (x east, y north, z up) → three (x right, y up, z south).
    const toScene = (wx: number, wy: number, wz: number) =>
      new THREE.Vector3((wx - origin.x) / SCALE, (wz - origin.z) / SCALE, (wy - origin.y) / SCALE);

    // Player marker
    const playerMesh = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 3.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3fb6a8, emissive: 0x16403a, roughness: 0.4 }),
    );
    playerMesh.position.set(0, 1.7, 0);
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    const playerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x3fb6a8, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
    );
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.position.y = 0.1;
    scene.add(playerRing);

    // NPC markers (shared geometry/material)
    const npcGeom = new THREE.ConeGeometry(0.8, 2.4, 6);
    const npcMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const entityMeshes = new Map<number, THREE.Mesh>();

    const upsert = (e: WorldEntity) => {
      let m = entityMeshes.get(e.objectId);
      if (!m) {
        m = new THREE.Mesh(npcGeom, npcMat);
        m.castShadow = true;
        scene.add(m);
        entityMeshes.set(e.objectId, m);
      }
      const p = toScene(e.x, e.y, e.z);
      p.y += 1.2;
      m.position.copy(p);
    };
    const remove = (objectId: number) => {
      const m = entityMeshes.get(objectId);
      if (m) {
        scene.remove(m);
        entityMeshes.delete(objectId);
      }
    };

    // Render whatever already spawned during the enter-world burst.
    conn?.getEntities().forEach(upsert);
    setEntityCount(entityMeshes.size);

    const unsub = conn?.addListener((ev: GameEvent) => {
      if (ev.type === "npc-spawn") {
        upsert(ev.entity);
        setEntityCount(entityMeshes.size);
      } else if (ev.type === "npc-move") {
        const m = entityMeshes.get(ev.objectId);
        if (m) {
          const p = toScene(ev.x, ev.y, ev.z);
          p.y += 1.2;
          m.position.copy(p);
        }
      } else if (ev.type === "npc-remove") {
        remove(ev.objectId);
        setEntityCount(entityMeshes.size);
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
      camera.position.x = Math.sin(phi) * Math.cos(theta) * radius;
      camera.position.z = Math.sin(phi) * Math.sin(theta) * radius;
      camera.position.y = Math.cos(phi) * radius + 4;
      camera.lookAt(0, 2, 0);
    };
    updateCamera();

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi = Math.max(0.15, Math.min(Math.PI / 2.1, phi - (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(15, Math.min(400, radius + e.deltaY * 0.08));
      updateCamera();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

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

    // ── Asset loader hook (reads cached client) ──────────────────────────
    (async () => {
      setLoadStatus("Reading cached client…");
      const [manifest, stats] = await Promise.all([getManifest().catch(() => null), getCacheStats().catch(() => null)]);
      const rootName = manifest?.rootName ?? "CDN cache";
      const maps = await listFiles("maps").catch(() => []);
      const textures = (await listFiles("textures").catch(() => [])).length;
      const meshes = (await listFiles("staticmeshes").catch(() => [])).length;
      setAssetSummary({ rootName, maps, textures, meshes });
      if (stats && stats.cachedFiles > 0)
        setLoadStatus(`${stats.cachedFiles}/${stats.totalFiles} files cached · ${formatBytes(stats.cachedBytes)}`);
      else if (maps.length > 0) setLoadStatus(`Found ${maps.length} maps · loading sector…`);
      else { setLoadStatus("No cached assets. Visit /cdn-cache to stream from CDN."); return; }

      // Try preferred sectors first, then any cached map. Mount → cache fallback.
      const candidates = ["Maps/22_22.unr", "maps/22_22.unr", "Maps/17_25.unr", "maps/17_25.unr", ...maps.map((m) => m.path)];
      let pkg: L2Package | null = null;
      let pickedPath = "";
      let unrBytes: Uint8Array | null = null;
      for (const path of candidates) {
        try {
          const bytes = (await readFromMount(path)) ?? (await getFile(path));
          if (!bytes) continue;
          pkg = L2Package.from(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
          pickedPath = path;
          unrBytes = bytes;
          break;
        } catch (err) {
          console.warn("[map] failed to parse", path, err);
        }
      }
      if (!pkg || !unrBytes) { setLoadStatus("No parsable .unr available (mount or cache)."); return; }

      const actors = pkg.readActorPlacements();
      const spawns = pkg.readActorPlacements(["PlayerStart"]);
      console.log("[map]", pickedPath, "classes:", pkg.classHistogram());
      setMapInfo({ path: pickedPath, actors: actors.length, spawns: spawns.length });
      setLoadStatus(`${pickedPath} · ${actors.length} actors · ${spawns.length} spawns`);

      if (actors.length === 0) return;

      // Phase 3: assemble REAL meshes from .usx packages — read live from mount first.
      const bytesForPath = async (path: string): Promise<ArrayBuffer | null> => {
        try {
          const b = (await readFromMount(path)) ?? (await getFile(path));
          return b ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : null;
        } catch {
          return null;
        }
      };
      const meshFolder = (await listFiles("staticmeshes").catch(() => [])) as CachedFileMeta[];
      const meshIndex = new Map<string, string>(); // lower(basename) → path
      for (const f of meshFolder) {
        const base = f.path.split("/").pop()!.replace(/\.usx$/i, "").toLowerCase();
        meshIndex.set(base, f.path);
      }

      try {
        mapGroup = await loadMap(
          unrBytes.buffer.slice(unrBytes.byteOffset, unrBytes.byteOffset + unrBytes.byteLength) as ArrayBuffer,
          async (pkgName) => {
            // Try mount → cache, across StaticMeshes/.usx, Textures/.utx, SysTextures/.utx.
            for (const p of [
              `StaticMeshes/${pkgName}.usx`,
              `staticmeshes/${pkgName}.usx`,
              `Textures/${pkgName}.utx`,
              `textures/${pkgName}.utx`,
              `SysTextures/${pkgName}.utx`,
              `systextures/${pkgName}.utx`,
            ]) {
              const buf = await bytesForPath(p);
              if (buf) return buf;
            }
            const indexed = meshIndex.get(pkgName.toLowerCase());
            return indexed ? await bytesForPath(indexed) : null;
          },
          {
            scale: SCALE,
            onProgress: (msg) => {
              console.log(msg);
              setLoadStatus(msg);
            },
          },
        );
        scene.add(mapGroup);
        setLoadStatus(`${pickedPath} · meshes assembled`);
      } catch (err) {
        console.error("[map] assemble failed, falling back to markers", err);
        // Fallback: spawn markers only so the player still sees something.
        const cx = actors.reduce((s, a) => s + a.x, 0) / actors.length;
        const cy = actors.reduce((s, a) => s + a.y, 0) / actors.length;
        const cz = actors.reduce((s, a) => s + a.z, 0) / actors.length;
        mapGroup = new THREE.Group();
        if (spawns.length) {
          const sg = new THREE.ConeGeometry(1.2, 3, 6);
          const sm = new THREE.MeshStandardMaterial({ color: 0x3fdc6a, emissive: 0x114420 });
          const sInst = new THREE.InstancedMesh(sg, sm, spawns.length);
          const m = new THREE.Matrix4();
          spawns.forEach((a, i) => {
            m.makeTranslation((a.x - cx) / SCALE, (a.z - cz) / SCALE + 1.5, (a.y - cy) / SCALE);
            sInst.setMatrixAt(i, m);
          });
          sInst.instanceMatrix.needsUpdate = true;
          mapGroup.add(sInst);
          mapDisposables.push(sg, sm);
        }
        scene.add(mapGroup);
      }
    })().catch((err) => {
      console.error("[map] loader failed", err);
      setLoadStatus(`Map load failed: ${(err as Error).message}`);
    });

    return () => {
      cancelAnimationFrame(raf);
      unsub?.();
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      entityMeshes.forEach((m) => scene.remove(m));
      entityMeshes.clear();
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
