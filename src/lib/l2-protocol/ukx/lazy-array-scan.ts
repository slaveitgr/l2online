/**
 * S3 — lazy-array chain scanner for SkeletalMesh geometry.
 *
 * SkeletalMesh exports in L2 ukx packages store geometry as a chain of
 * UE2 "lazy arrays". Each lazy-array has the layout:
 *
 *   u32 skipOffset   // absolute byte offset of the *next* lazy-array
 *   compact32 count
 *   element[count]   // fixed stride
 *
 * Inside the export's serialized blob we look for three back-to-back
 * lazy-arrays whose `skipOffset == nextStart`:
 *
 *   points  : 12 bytes (3 × f32 — UE2 (x,y,z))
 *   wedges  : 10 bytes (u16 pointIdx, 2 × f32 uv,
 *                       u8 matIdx, u8 _reserved/flags)  ← stride observed
 *   faces   : 12 bytes (3 × u16 wedgeIdx, u8 matIdx, u8 auxMat,
 *                       u16 smoothing groups, u32 -> sometimes pad)
 *
 * Strides are the discriminator. We do NOT walk UE2 property reflection —
 * it's lossy in L2's stripped builds and breaks across regions.
 *
 * The chain may not start at the export's first byte; scan from a base
 * offset and accept the first triple of valid (skip == next-start)
 * arrays with matching strides.
 */

import { BinaryReader } from "./name-table";

export interface LazyArrayHeader {
  start: number;       // byte offset where the lazy array begins (skipOffset value)
  skipOffset: number;  // value read at offset `start`
  countOffset: number; // offset of the compact count field
  count: number;
  dataOffset: number;  // first byte of element[0]
  dataEnd: number;     // dataOffset + count * stride
}

export interface GeometryChain {
  points: LazyArrayHeader;
  wedges: LazyArrayHeader;
  faces:  LazyArrayHeader;
}

const POINT_STRIDE = 12;
const WEDGE_STRIDE = 10;
const FACE_STRIDE  = 12;

function tryReadLazyHeader(
  buf: ArrayBuffer,
  blobStart: number,
  blobEnd: number,
  at: number,
  stride: number,
): LazyArrayHeader | null {
  if (at + 5 > blobEnd) return null;
  const r = new BinaryReader(buf, 0);
  r.seek(at);
  const skipOffset = r.u32();
  const countOffset = r.pos;
  let count: number;
  try {
    count = r.compactSigned();
  } catch {
    return null;
  }
  if (count < 0 || count > 5_000_000) return null;
  const dataOffset = r.pos;
  const dataEnd = dataOffset + count * stride;
  if (dataEnd > blobEnd) return null;
  // skipOffset is absolute into the package buffer (UE2 convention).
  // For our purposes we treat it as the absolute next-start; callers verify.
  if (skipOffset !== dataEnd) return null;
  return { start: at, skipOffset, countOffset, count, dataOffset, dataEnd };
}

/**
 * Scan `[blobStart, blobEnd)` for a (points, wedges, faces) chain.
 * Returns the first match, or null.
 */
export function scanGeometryChain(
  buf: ArrayBuffer,
  blobStart: number,
  blobEnd: number,
): GeometryChain | null {
  for (let p = blobStart; p < blobEnd - 32; p++) {
    const pts = tryReadLazyHeader(buf, blobStart, blobEnd, p, POINT_STRIDE);
    if (!pts || pts.count < 3) continue;
    const wedges = tryReadLazyHeader(buf, blobStart, blobEnd, pts.dataEnd, WEDGE_STRIDE);
    if (!wedges || wedges.count < pts.count) continue;
    const faces = tryReadLazyHeader(buf, blobStart, blobEnd, wedges.dataEnd, FACE_STRIDE);
    if (!faces || faces.count < 1) continue;
    return { points: pts, wedges, faces };
  }
  return null;
}
