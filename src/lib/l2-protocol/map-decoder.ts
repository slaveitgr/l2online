/**
 * S8 — Map decoder (typed skeleton).
 *
 * Buildings (.unr exports of class StaticMeshActor / L2MovableStaticMeshActor):
 *   props Location(float3), Rotation(rotator units, /65536 * 360),
 *         DrawScale, DrawScale3D, StaticMesh(ref)
 *   The StaticMesh lives in <pkg>.usx, stream layout:
 *     vertexStream  elem=24  (pos3 + normal3, float32)
 *     colorStream
 *     alphaStream
 *     uvStreams
 *     indexStream   u16
 *   Instantiate with collider, scale 1/52.5.
 *
 * Terrain (.unr exports of class TerrainInfo):
 *   props TerrainMap(ref → G16 utx), Layers (first Texture import = ground tex)
 *   Binary tail: sectors[], sectorsX/Y, toWorld (FCoords 4×float3),
 *                toHeightMap, heightmapX/Y
 *   Per vertex: H = (x, y, heightG16) - origin; world = (H·X, H·Y, H·Z)
 *   QuadVisibilityBitmap: bit per (x,y); 0 = hole (cities have paved holes).
 *
 * Streaming: keep player sector + 8 neighbours, drop anything > 1 ring.
 * Sector key: `${20 + Math.floor(l2x/32768)}_${18 + Math.floor(l2y/32768)}`.
 */

export interface StaticMeshActor {
  meshRef: { pkg: string; object: string };
  location: [number, number, number];
  rotation: [number, number, number]; // pitch, yaw, roll in radians
  drawScale: number;
  drawScale3D: [number, number, number];
}

export interface TerrainInfo {
  terrainMapRef: { pkg: string; object: string };
  layerTextureRef?: { pkg: string; object: string };
  sectorsX: number;
  sectorsY: number;
  heightmapX: number;
  heightmapY: number;
  /** Row-major G16 heightmap, length = heightmapX × heightmapY. */
  heights: Uint16Array;
  /** Row-major visibility bitmap, bit per quad (lsb-first). */
  quadVisibility: Uint8Array;
  toWorld: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
}

export function rotatorUnitsToRadians(u: number): number {
  return (u / 65536) * Math.PI * 2;
}

export function sectorKey(l2x: number, l2y: number): string {
  return `${20 + Math.floor(l2x / 32768)}_${18 + Math.floor(l2y / 32768)}`;
}

export function neighbourSectors(centerKey: string): string[] {
  const [sx, sy] = centerKey.split("_").map(Number);
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      out.push(`${sx + dx}_${sy + dy}`);
    }
  }
  return out;
}

export function isQuadVisible(vis: Uint8Array, x: number, y: number, width: number): boolean {
  const bit = y * width + x;
  return (vis[bit >> 3] & (1 << (bit & 7))) !== 0;
}
