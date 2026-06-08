/**
 * UE2 → three.js coordinate conversion (S3).
 *
 * UE2 is left-handed Z-up: (x, y, z).
 * three.js is right-handed Y-up: (x, y, z) with Y up.
 *
 * Mapping used across the L2 client: (ux, uy, uz) → (ux, uz, uy) and
 * scale by UE2_TO_METERS so the world fits the runtime grid.
 *
 * Winding: UE2 face order is opposite of three's default — swap indices
 * 1 and 2 of every triangle.
 */

export const UE2_TO_METERS = 1 / 52.5;

export function ue2ToThreePosition(
  out: Float32Array,
  src: Float32Array,
  count: number,
  scale = UE2_TO_METERS,
): void {
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const x = src[o];
    const y = src[o + 1];
    const z = src[o + 2];
    out[o] = x * scale;
    out[o + 1] = z * scale;
    out[o + 2] = y * scale;
  }
}

/** Flip triangle winding in-place. `indices.length` MUST be a multiple of 3. */
export function flipWindingInPlace(indices: Uint32Array): void {
  for (let i = 0; i < indices.length; i += 3) {
    const tmp = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = tmp;
  }
}
