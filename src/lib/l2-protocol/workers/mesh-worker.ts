/**
 * S3 — SkeletalMesh decoding Web Worker.
 *
 * Request shape:
 *   { kind: 'decode-blob', pkg: ArrayBuffer, blobStart: number, blobEnd: number,
 *     id: string, opts?: { } }
 *
 * Response shape:
 *   { id, ok: true,  positions, uvs, indices, materials }
 *   { id, ok: false, reason }
 *
 * The decoded typed arrays are transferred back to the main thread.
 */

import { decodeGeometryBlob } from "../ukx/skeletal-mesh";

export interface DecodeBlobRequest {
  kind: "decode-blob";
  id: string;
  pkg: ArrayBuffer;
  blobStart: number;
  blobEnd: number;
}

export type MeshWorkerRequest = DecodeBlobRequest;

self.onmessage = (ev: MessageEvent<MeshWorkerRequest>) => {
  const req = ev.data;
  if (!req || req.kind !== "decode-blob") return;
  const result = decodeGeometryBlob(req.pkg, req.blobStart, req.blobEnd);
  if (!result.ok) {
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, reason: result.reason });
    return;
  }
  const transfer: Transferable[] = [
    result.positions.buffer,
    result.uvs.buffer,
    result.indices.buffer,
  ];
  (self as unknown as Worker).postMessage(
    {
      id: req.id,
      ok: true,
      positions: result.positions,
      uvs: result.uvs,
      indices: result.indices,
      materials: result.materials,
    },
    transfer,
  );
};

export {};
