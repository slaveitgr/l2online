/**
 * S3 — SkeletalMesh / texture / skinned decoder (typed interfaces + algorithm).
 *
 * Full implementation belongs in a Web Worker (src/workers/l2-mesh.worker.ts)
 * to avoid jank. This module holds the data shapes the worker emits and the
 * UE2→three coordinate helper used by every consumer.
 *
 * ALGORITHM (per ukx export):
 *  Scan export range for a chain of lazy-arrays where skipOffset == next section start:
 *    pts      elem=12  → Float3 positions
 *    wedges   elem=10  → u16 vertIdx + 2 float UV
 *    faces    elem=12  → 3 × u16 wedge idx
 *    influences elem=8 → float weight, u16 point, u16 bone   (skinned only)
 *  RefSkeleton: scan for run of ≥10 bones with
 *    name(ci) flags(u32) quat(16) pos(12) length(4) size(12) numChildren(u32) parent(u32)
 *  Sanity: |quat| ≈ 1, |pos| reasonable.
 *
 * UE2→three: position (x,y,z) → (x,z,y), flip face winding, scale 1/52.5.
 * UV: for CPU-decoded textures use v→1−v; for compressed (DXT) keep raw v.
 *
 * TEXTURE (utx): walk properties for Format/USize/VSize/Palette.
 *   Format ids: 0=P8 3=DXT1 5=RGBA8 7=DXT3 8=DXT5 10=G16.
 *   Top mip = first compact32 == USize*VSize*bpp inside the export's serial range.
 *   DXT → THREE.CompressedTexture (10× faster, 8× less memory). P8 → CPU palette decode.
 */

export type UVConvention = "cpu-flipped" | "compressed-raw";

export interface SkeletalMeshGeometry {
  positions: Float32Array; // length = pts*3 (UE2 units, pre-convert)
  uvs: Float32Array;       // length = wedges*2
  vertexIndex: Uint16Array; // length = wedges, points into positions
  faces: Uint16Array;      // length = triangles*3, points into wedges
  influences?: Float32Array; // per-wedge top-N {weight, bone}, packed
}

export interface RefBone {
  name: string;
  flags: number;
  quat: [number, number, number, number]; // x,y,z,w
  pos: [number, number, number];
  length: number;
  size: [number, number, number];
  numChildren: number;
  parent: number; // index into refBones; root has parent === self or 0
}

export interface RefSkeleton {
  bones: RefBone[];
}

export type TextureFormat = "P8" | "DXT1" | "DXT3" | "DXT5" | "RGBA8" | "G16";

export interface TextureData {
  format: TextureFormat;
  width: number;
  height: number;
  /** Raw top-mip bytes (DXT block stream, RGBA8 buffer, or P8 indices). */
  pixels: Uint8Array;
  /** 256×4 RGBA palette for P8 (undefined otherwise). */
  palette?: Uint8Array;
}

/** UE2 position (x,y,z) → three position (x,z,y) at L2-unit scale. */
export function ue2ToThreePosition(x: number, y: number, z: number, scale = 1 / 52.5): [number, number, number] {
  return [x * scale, z * scale, y * scale];
}

/** Flip face winding in-place for an index buffer of triangles. */
export function flipWinding(faces: Uint16Array | Uint32Array): void {
  for (let i = 0; i < faces.length; i += 3) {
    const t = faces[i + 1];
    faces[i + 1] = faces[i + 2];
    faces[i + 2] = t;
  }
}

export type MeshFormat = 0 | 3 | 5 | 7 | 8 | 10;
export function textureFormatFromId(id: MeshFormat): TextureFormat {
  switch (id) {
    case 0: return "P8";
    case 3: return "DXT1";
    case 5: return "RGBA8";
    case 7: return "DXT3";
    case 8: return "DXT5";
    case 10: return "G16";
  }
}

export function bytesPerPixel(format: TextureFormat): number {
  switch (format) {
    case "P8": return 1;
    case "G16": return 2;
    case "RGBA8": return 4;
    case "DXT1": return 0.5;
    case "DXT3":
    case "DXT5": return 1;
  }
}
