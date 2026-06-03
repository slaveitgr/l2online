/**
 * CharacterModel — renders a real L2 character mesh (extracted from <Race>.ukx by
 * tools/l2-extract-character-meshes.mjs into /public/models/<Race>_<Gender>.json)
 * in a small three.js canvas. Drop into the char-select / char-create renderModel slot:
 *
 *   <L2CharSelectScreen renderModel={(c)=> <CharacterModel race={c?.race} gender="F"/>} />
 *   <L2CharCreateScreen renderModel={(o)=> <CharacterModel race={o.race} gender={o.sex? "F":"M"}/>} />
 *
 * Loads the compact JSON (positions/uvs/indices per body part), assembles a merged
 * mesh, remaps L2 z-up → three y-up, frames it and slowly turntable-rotates.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ModelPart { name: string; positions: number[]; uvs: number[]; indices: number[] }
interface ModelFile { race: string; gender: string; parts: ModelPart[]; bbox: { min: number[]; max: number[] } }

const RACE_FILE: Record<string, string> = {
  Human: "Human", Elf: "Elf", "Dark Elf": "DarkElf", DarkElf: "DarkElf",
  Orc: "Orc", Dwarf: "Dwarf", Kamael: "Kamael", Ertheia: "Ertheia",
};

export function CharacterModel({
  race = "Ertheia", gender = "F", autoRotate = true, className,
}: { race?: string; gender?: "F" | "M" | 0 | 1; autoRotate?: boolean; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const g = gender === 1 || gender === "F" ? "F" : gender === 0 || gender === "M" ? "M" : "F";
  const file = `/models/${RACE_FILE[race] ?? "Ertheia"}_${g}.json`;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const w = mount.clientWidth || 320, h = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // lighting — soft key + rim, like the char-select stage
    scene.add(new THREE.HemisphereLight(0xf0e8d0, 0x202028, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.4); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ab0ff, 0.6); rim.position.set(-3, 2, -2); scene.add(rim);

    const root = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(root);
    scene.add(pivot);
    // L2 is z-up; rotate into three's y-up
    root.rotation.x = -Math.PI / 2;

    let raf = 0;
    const skin = new THREE.MeshStandardMaterial({ color: 0xcdb49a, roughness: 0.78, metalness: 0.02 });

    fetch(file)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("model not found"))))
      .then((model: ModelFile) => {
        if (disposed) return;
        for (const part of model.parts) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(part.positions), 3));
          if (part.uvs?.length) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(part.uvs), 2));
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
          geo.computeVertexNormals();
          root.add(new THREE.Mesh(geo, skin));
        }
        // frame the model
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center); // center at pivot origin
        const height = size.y || 30;
        camera.position.set(0, height * 0.08, height * 1.9);
        camera.lookAt(0, 0, 0);
      })
      .catch(() => {/* leave empty stage */});

    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (autoRotate) pivot.rotation.y = Math.sin(clock.getElapsedTime() * 0.25) * 0.5;
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [file, autoRotate]);

  return <div ref={mountRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
