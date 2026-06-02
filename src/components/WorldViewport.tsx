import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { listFiles, getManifest, getCacheStats, formatBytes, type CachedFileMeta } from "@/lib/l2-assets";

/**
 * Phase 1 viewport.
 *
 * Renders a placeholder Lineage 2 scene with three.js: a heightmapped terrain,
 * atmospheric fog, dynamic lighting, and orbit camera controls.
 *
 * The asset loader hooks below read cached client files from IndexedDB and
 * report what was found. Actual parsing of Unreal .unr / .utx packages is the
 * Phase 2 deliverable — see realratchet/Lineage2JS for the loader port.
 */
export function WorldViewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });
  const [loadStatus, setLoadStatus] = useState("Initializing…");
  const [assetSummary, setAssetSummary] = useState<{
    rootName: string;
    maps: CachedFileMeta[];
    textures: number;
    meshes: number;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene ────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0f0a);
    scene.fog = new THREE.FogExp2(0x2a1a14, 0.008);

    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000,
    );
    camera.position.set(60, 45, 60);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Lighting ─────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x442a1c, 0.6);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd28a, 1.2);
    sun.position.set(80, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x6080ff, 0.3);
    rim.position.set(-50, 30, -50);
    scene.add(rim);

    // ── Terrain (placeholder heightmap) ──────────────────────────────────
    const terrainGeom = new THREE.PlaneGeometry(200, 200, 80, 80);
    terrainGeom.rotateX(-Math.PI / 2);
    const pos2 = terrainGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos2.count; i++) {
      const x = pos2.getX(i);
      const z = pos2.getZ(i);
      const h =
        Math.sin(x * 0.05) * 3 +
        Math.cos(z * 0.07) * 2.5 +
        Math.sin((x + z) * 0.03) * 4 +
        (Math.random() - 0.5) * 0.4;
      pos2.setY(i, h);
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x4a3522,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: false,
    });
    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Stone monolith ring (placeholder for a "spawn" landmark)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 12;
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(2, 6 + Math.random() * 2, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x6a6055, roughness: 0.85 }),
      );
      stone.position.set(Math.cos(angle) * r, 3, Math.sin(angle) * r);
      stone.rotation.y = angle + (Math.random() - 0.5) * 0.3;
      stone.castShadow = true;
      stone.receiveShadow = true;
      scene.add(stone);
    }

    // Glowing brazier in center
    const brazier = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.8, 1, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.7 }),
    );
    brazier.position.y = 0.5;
    brazier.castShadow = true;
    scene.add(brazier);

    const flame = new THREE.PointLight(0xff9040, 8, 25, 2);
    flame.position.set(0, 2, 0);
    flame.castShadow = true;
    scene.add(flame);

    const flameSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffaa55 }),
    );
    flameSphere.position.y = 2;
    scene.add(flameSphere);

    // ── Orbit camera (minimal custom controls — no OrbitControls dep) ────
    let theta = Math.PI / 4;
    let phi = Math.PI / 3.5;
    let radius = 90;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const updateCamera = () => {
      camera.position.x = Math.sin(phi) * Math.cos(theta) * radius;
      camera.position.z = Math.sin(phi) * Math.sin(theta) * radius;
      camera.position.y = Math.cos(phi) * radius;
      camera.lookAt(0, 0, 0);
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
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      theta -= dx * 0.005;
      phi = Math.max(0.15, Math.min(Math.PI / 2.1, phi - dy * 0.005));
      updateCamera();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(20, Math.min(250, radius + e.deltaY * 0.08));
      updateCamera();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // ── Resize ───────────────────────────────────────────────────────────
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
      flame.intensity = 7 + Math.sin(t * 6) * 1.5 + Math.sin(t * 13) * 0.8;
      flameSphere.scale.setScalar(1 + Math.sin(t * 8) * 0.08);

      renderer.render(scene, camera);

      frameCount++;
      if (performance.now() - lastFpsTime > 500) {
        setFps(Math.round((frameCount * 1000) / (performance.now() - lastFpsTime)));
        setPos({
          x: Math.round(camera.position.x),
          y: Math.round(camera.position.y),
          z: Math.round(camera.position.z),
        });
        frameCount = 0;
        lastFpsTime = performance.now();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    // ── Asset loader hook (reads cached client) ──────────────────────────
    (async () => {
      setLoadStatus("Reading cached client…");
      const manifest = await getManifest();
      if (!manifest) {
        setLoadStatus("No cached client. Showing placeholder scene.");
        return;
      }
      setLoadStatus("Indexing maps…");
      const maps = await listFiles("maps");
      const textures = (await listFiles("textures")).length;
      const meshes = (await listFiles("staticmeshes")).length;
      setAssetSummary({ rootName: manifest.rootName, maps, textures, meshes });
      setLoadStatus(
        maps.length > 0
          ? `Found ${maps.length} maps · Lineage2JS loader integration pending (Phase 2)`
          : "No .unr maps found in cache.",
      );
      // TODO Phase 2: instantiate Lineage2JS package reader here, decode
      // the chosen .unr (e.g. 17_25.unr — Talking Island village), translate
      // its actors into three.js meshes, and replace the placeholder terrain.
    })();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      terrainGeom.dispose();
      terrainMat.dispose();
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
            {pos.x.toString().padStart(4)} {pos.y.toString().padStart(4)} {pos.z.toString().padStart(4)}
          </span>
        </div>
      </div>

      {/* Bottom-left asset status */}
      <div className="absolute bottom-4 left-4 panel rounded px-4 py-3 font-mono text-xs max-w-md pointer-events-none">
        <div className="text-gold tracking-widest mb-1 uppercase">Asset Loader</div>
        <div className="text-muted-foreground">{loadStatus}</div>
        {assetSummary && (
          <div className="mt-2 pt-2 border-t border-border/40 text-foreground/80 grid grid-cols-3 gap-x-3">
            <div><span className="text-gold-muted">maps</span> {assetSummary.maps.length}</div>
            <div><span className="text-gold-muted">tex</span> {assetSummary.textures}</div>
            <div><span className="text-gold-muted">mesh</span> {assetSummary.meshes}</div>
          </div>
        )}
      </div>

      {/* Bottom-right controls hint */}
      <div className="absolute bottom-4 right-4 panel rounded px-4 py-3 font-mono text-[10px] text-muted-foreground pointer-events-none">
        <div><span className="text-gold-muted">DRAG</span> orbit</div>
        <div><span className="text-gold-muted">WHEEL</span> zoom</div>
      </div>
    </div>
  );
}
