/**
 * S3 — SkeletalMesh decoder orchestrator.
 *
 * Inputs: a decrypted .ukx package buffer + the exported object name.
 * Output: GPU-ready geometry buffers (positions/uvs/indices in three.js
 * space), bone bind-pose (if found), and material slot refs by name.
 *
 * The decoder is intentionally tolerant — L2 packages drop properties
 * and pad inconsistently. We rely on:
 *   1. The name table (ver133/lic40 sign-bit width).
 *   2. The export table (name index → file offset + size).
 *   3. Lazy-array chain scan for geometry.
 *
 * The full export-table walk needs the import/export tables; for the
 * first cut we accept an explicit (offset, size) pair (the worker can
 * locate exports separately, or callers can pre-extract the blob).
 */

import { BinaryReader, readNameTable, readSizedString } from "./name-table";
import type { NameEntry } from "./name-table";
import { scanGeometryChain } from "./lazy-array-scan";
import { flipWindingInPlace, ue2ToThreePosition } from "./coord";

export interface DecodedMeshBuffers {
  positions: Float32Array;   // (x, y, z) in three.js space, scaled.
  uvs:       Float32Array;   // per vertex (== per wedge).
  indices:   Uint32Array;    // winding-flipped.
  materials: Array<{ slot: number; textureRef: string | null }>;
  // Bind pose & skin omitted in the first cut — added once bone scan lands.
}

export interface DecodedMesh extends DecodedMeshBuffers {
  ok: true;
}

export interface DecodeFailure { ok: false; reason: string; }

/** Read the package header far enough to grab the name table. */
export function readPackageNames(buf: ArrayBuffer): NameEntry[] | null {
  if (buf.byteLength < 64) return null;
  const r = new BinaryReader(buf, 0);
  const sig = r.u32();
  if (sig !== 0x9e2a83c1) return null;
  /* u16 ver */ r.u16();
  /* u16 lic */ r.u16();
  /* u32 flags */ r.u32();
  const nameCount = r.u32();
  const nameOffset = r.u32();
  // exportCount / exportOffset / importCount / importOffset follow; we
  // skip them here — readers extract the geometry blob separately.
  if (nameOffset <= 0 || nameOffset >= buf.byteLength) return null;
  try {
    return readNameTable(buf, nameOffset, nameCount);
  } catch {
    return null;
  }
}

/**
 * Decode geometry from a pre-isolated export blob.
 * `blob` is the bytes between exportOffset and exportOffset+exportSize.
 */
export function decodeGeometryBlob(
  pkg: ArrayBuffer,
  blobStart: number,
  blobEnd: number,
): DecodedMesh | DecodeFailure {
  const chain = scanGeometryChain(pkg, blobStart, blobEnd);
  if (!chain) return { ok: false, reason: "no geometry chain" };

  const { points, wedges, faces } = chain;

  // Points (UE2 x,y,z).
  const pointsRaw = new Float32Array(points.count * 3);
  const pdv = new DataView(pkg, points.dataOffset, points.count * 12);
  for (let i = 0; i < points.count * 3; i++) {
    pointsRaw[i] = pdv.getFloat32(i * 4, true);
  }

  // Wedges: u16 pointIdx, f32 u, f32 v, u8 mat, u8 _pad (stride 10).
  const wedgeBytes = new Uint8Array(pkg, wedges.dataOffset, wedges.count * 10);
  const wdv = new DataView(wedgeBytes.buffer, wedgeBytes.byteOffset, wedgeBytes.byteLength);
  const wedgePointIdx = new Uint16Array(wedges.count);
  const wedgeUVs = new Float32Array(wedges.count * 2);
  for (let i = 0; i < wedges.count; i++) {
    const o = i * 10;
    wedgePointIdx[i] = wdv.getUint16(o, true);
    wedgeUVs[i * 2]     = wdv.getFloat32(o + 2, true);
    wedgeUVs[i * 2 + 1] = wdv.getFloat32(o + 6, true);
  }

  // Faces: 3 × u16 wedgeIdx, u8 mat, u8 auxMat, u16 smoothing, u16 pad (stride 12).
  const faceBytes = new Uint8Array(pkg, faces.dataOffset, faces.count * 12);
  const fdv = new DataView(faceBytes.buffer, faceBytes.byteOffset, faceBytes.byteLength);
  const indices = new Uint32Array(faces.count * 3);
  const materialSet = new Set<number>();
  for (let i = 0; i < faces.count; i++) {
    const o = i * 12;
    indices[i * 3]     = wedgePointIdx[fdv.getUint16(o, true)];
    indices[i * 3 + 1] = wedgePointIdx[fdv.getUint16(o + 2, true)];
    indices[i * 3 + 2] = wedgePointIdx[fdv.getUint16(o + 4, true)];
    materialSet.add(fdv.getUint8(o + 6));
  }

  flipWindingInPlace(indices);

  // Positions are per-point; we keep wedge UVs paired by point index.
  // For three.js BufferGeometry we expand to per-vertex via the indexed
  // wedge list — but consumers can do that step. Here we return per-point
  // positions + an indices array that already references points.
  const positions = new Float32Array(points.count * 3);
  ue2ToThreePosition(positions, pointsRaw, points.count);

  // Per-point UVs: average wedge UVs that share a point. (Cheap; consumers
  // who need per-wedge UVs can re-expand from the wedge buffer.)
  const uvs = new Float32Array(points.count * 2);
  const uvCounts = new Uint16Array(points.count);
  for (let i = 0; i < wedges.count; i++) {
    const p = wedgePointIdx[i];
    if (p >= points.count) continue;
    uvs[p * 2]     += wedgeUVs[i * 2];
    uvs[p * 2 + 1] += wedgeUVs[i * 2 + 1];
    uvCounts[p]    += 1;
  }
  for (let p = 0; p < points.count; p++) {
    const c = uvCounts[p];
    if (c > 1) { uvs[p * 2] /= c; uvs[p * 2 + 1] /= c; }
  }

  const materials = Array.from(materialSet)
    .sort((a, b) => a - b)
    .map(slot => ({ slot, textureRef: null as string | null }));

  return { ok: true, positions, uvs, indices, materials };
}

// Re-export for worker plumbing.
export { readSizedString };
