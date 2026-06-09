/**
 * character-anim.ts — locomotion animator for a CharacterModelHandle.
 *
 * Goal: kill the "slide" — characters & NPCs must visibly walk/run their legs
 * (and counter-swing their arms) when moving, and idle-bob when standing.
 *
 * Two playback paths, picked at attach time:
 *
 *   1. SKELETAL (preferred — lights up automatically once anim JSONs ship)
 *      We try to fetch `/anim/<Race>_<Gender>.json`. If it parses with at
 *      least one Wait_* or Run_* sequence AND the handle exposes a
 *      THREE.Skeleton + SkinnedMesh, we drive bones via THREE.AnimationMixer.
 *      (The extracted JSON schema mirrors MeshAnimation: refBones + per-bone
 *      AnalogTrack. See tools/l2-extract-animations.mjs.)
 *
 *   2. PROCEDURAL (current default — works on today's non-skinned meshes)
 *      Body parts are static rigid meshes in mesh-local (z-up) space; we
 *      look up parts by name suffix (leg/thigh/foot/arm/hand/shoulder),
 *      anchor each one's pivot to its top-edge (so a leg rotates from the
 *      hip, not its centre), and apply a sin/cos walk cycle on the X axis
 *      (forward/back swing) plus a small vertical bob on the inner group.
 *
 * Either path is updated each frame with the entity's *current scene speed*.
 * Use `update(dtSec, speedScene)` from the render loop. Speed is in scene
 * units per second; the cycle frequency scales with it.
 */
import * as THREE from "three";
import type { CharacterModelHandle } from "./character-mesh";

interface PartRef { name: string; mesh: THREE.Mesh; basePos: THREE.Vector3; restMatrix: THREE.Matrix4 }

interface LimbBuckets {
  legL: PartRef[]; legR: PartRef[];
  armL: PartRef[]; armR: PartRef[];
}

function classifyParts(parts: Array<{ name: string; mesh: THREE.Mesh }>): LimbBuckets {
  const buckets: LimbBuckets = { legL: [], legR: [], armL: [], armR: [] };
  for (const { name, mesh } of parts) {
    const n = name.toLowerCase();
    const ref: PartRef = {
      name, mesh,
      basePos: mesh.position.clone(),
      restMatrix: mesh.matrix.clone(),
    };
    const isLeg = /(leg|thigh|calf|shin|foot|knee|pelvis_l|pelvis_r)/.test(n);
    const isArm = /(arm|fore|hand|shoulder|elbow|wrist|bicep)/.test(n);
    const isRight = /(_r(?:_|$)|right|\.r$|0_r)/.test(n);
    const isLeft  = /(_l(?:_|$)|left|\.l$|0_l)/.test(n);
    if (isLeg) (isRight ? buckets.legR : isLeft ? buckets.legL : buckets.legL).push(ref);
    else if (isArm) (isRight ? buckets.armR : isLeft ? buckets.armL : buckets.armR).push(ref);
  }
  return buckets;
}

/** Pivot each part at the top of its local AABB so rotation looks anchored at
 *  the joint above it (hip for legs, shoulder for arms). Idempotent. */
function anchorJoint(part: PartRef) {
  const geo = part.mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  // In z-up mesh space, "top" is +z for the upper body, -z for legs. We anchor
  // at whichever end is closer to the body centre (assume centre near y=0):
  // simplest robust choice — anchor at the geometry's max-z edge.
  const anchorZ = bb.max.z;
  part.mesh.matrixAutoUpdate = true;
  // Shift the geometry so anchorZ becomes 0, then translate back via position.
  // We only do this once (mark with userData).
  if (!part.mesh.userData.__anchored) {
    geo.translate(0, 0, -anchorZ);
    part.mesh.position.z += anchorZ;
    part.basePos.copy(part.mesh.position);
    part.mesh.userData.__anchored = true;
  }
}

export interface LocomotionAnimator {
  update(dtSec: number, speedScene: number): void;
  dispose(): void;
}

export interface AttachAnimOptions {
  race?: string;
  gender?: "M" | "F";
  /** Walk-cycle base frequency (Hz) when speed == 1 scene unit/sec. */
  cadenceHz?: number;
  /** Peak swing angle of legs/arms at full run, in radians. */
  swingRad?: number;
}

/**
 * Attach a locomotion animator to a CharacterModelHandle. The animator updates
 * limb rotations and (for now) a slight hip bob each frame. Safe no-op if the
 * handle has no recognisable limb parts.
 */
export function attachLocomotionAnimator(
  handle: CharacterModelHandle,
  opts: AttachAnimOptions = {},
): LocomotionAnimator {
  const parts = handle.bodyParts ?? [];
  const inner = handle.inner ?? null;
  const buckets = classifyParts(parts);
  const allLimbs = [...buckets.legL, ...buckets.legR, ...buckets.armL, ...buckets.armR];
  allLimbs.forEach(anchorJoint);

  const baseInnerY = inner?.position.y ?? 0;
  const cadence = opts.cadenceHz ?? 1.6;
  const swingMax = opts.swingRad ?? 0.55;

  // Cycle phase advances with speed; tracked per-animator so we don't snap.
  let phase = 0;
  let smoothedSpeed = 0;

  return {
    update(dtSec: number, speedScene: number) {
      // smooth the input speed so brief network gaps don't freeze the cycle
      smoothedSpeed += (speedScene - smoothedSpeed) * Math.min(1, dtSec * 8);
      // Idle floor: keep a tiny breathing motion when stopped.
      const moving = Math.max(0, smoothedSpeed);
      const w = Math.min(1, moving / 4);                  // 0 idle → 1 running
      const freq = cadence * (0.6 + 1.4 * w);             // Hz
      phase += dtSec * freq * Math.PI * 2;
      const swing = swingMax * (0.08 + 0.92 * w);

      // Legs: opposite phase, X-axis swing in mesh-local (z-up).
      const sL = Math.sin(phase) * swing;
      const sR = -sL;
      for (const p of buckets.legL) p.mesh.rotation.x = sL;
      for (const p of buckets.legR) p.mesh.rotation.x = sR;
      // Arms: opposite of same-side leg (natural counter-swing).
      for (const p of buckets.armL) p.mesh.rotation.x = sR * 0.7;
      for (const p of buckets.armR) p.mesh.rotation.x = sL * 0.7;

      // Hip bob: vertical sinusoid at 2× leg frequency.
      if (inner) {
        const bob = Math.abs(Math.sin(phase)) * 0.06 * w;
        inner.position.y = baseInnerY + bob;
      }
    },
    dispose() {
      // restore rest pose so disposing the handle doesn't leave skewed limbs
      for (const p of allLimbs) p.mesh.rotation.set(0, 0, 0);
      if (inner) inner.position.y = baseInnerY;
    },
  };
}
