/**
 * S3 — Main-thread client for the SkeletalMesh decoding worker.
 *
 * Lazy worker singleton, Promise API, transferable ArrayBuffer handoff
 * (zero copies). Consumers (S15 char-select preview, S7 armor pipeline,
 * S6 NPC loader) call decodeMeshBlob() and receive geometry buffers ready
 * for THREE.BufferGeometry.
 */

let workerInstance: Worker | null = null;
let seq = 0;

interface DecodeOk {
  ok: true;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  materials: Array<{ slot: number; textureRef: string | null }>;
}
interface DecodeErr { ok: false; reason: string; }
type DecodeResult = DecodeOk | DecodeErr;

const pending = new Map<string, (r: DecodeResult) => void>();

function getWorker(): Worker {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker(
    new URL("./workers/mesh-worker.ts", import.meta.url),
    { type: "module" },
  );
  workerInstance.onmessage = (ev: MessageEvent<{ id: string } & DecodeResult>) => {
    const { id, ...rest } = ev.data;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(rest as DecodeResult);
  };
  return workerInstance;
}

/**
 * Decode geometry from a pre-isolated export blob (bytes
 * [blobStart, blobEnd) of `pkg`). The `pkg` ArrayBuffer is transferred;
 * the caller MUST NOT touch it after this call.
 */
export function decodeMeshBlob(
  pkg: ArrayBuffer,
  blobStart: number,
  blobEnd: number,
): Promise<DecodeResult> {
  const id = `m${++seq}`;
  const w = getWorker();
  return new Promise<DecodeResult>(resolve => {
    pending.set(id, resolve);
    w.postMessage(
      { kind: "decode-blob", id, pkg, blobStart, blobEnd },
      [pkg],
    );
  });
}

export function disposeMeshWorker(): void {
  workerInstance?.terminate();
  workerInstance = null;
  pending.clear();
}
