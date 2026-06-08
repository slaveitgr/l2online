/**
 * S10 — Server-authoritative movement helpers.
 *
 * Symptom of skipping this: "ο παίχτης κολλάει στα κτίρια / σιωπηλά δεν κινείται".
 * Cause: the client sends MoveTo with its OPTICAL position (which has drifted /
 * scrambled onto a roof), and the server rejects the move silently because its
 * own state doesn't match.
 *
 * Rule: always issue MoveTo with the LAST SERVER POSITION as origin
 * (the value the server last sent via MoveToLocation echo for this object) —
 * never the rendered position.
 */

export interface ServerPosition {
  x: number;
  y: number;
  z: number;
  /** epoch ms when last server echo arrived */
  at: number;
}

const lastServerPos = new Map<number, ServerPosition>();

export function recordServerPosition(objectId: number, x: number, y: number, z: number): void {
  lastServerPos.set(objectId, { x, y, z, at: Date.now() });
}

export function getServerPosition(objectId: number): ServerPosition | null {
  return lastServerPos.get(objectId) ?? null;
}

/** Best origin to use for a MoveTo: prefer the server echo if it's fresh. */
export function pickMoveOrigin(
  objectId: number,
  fallback: { x: number; y: number; z: number },
  freshnessMs = 30_000,
): { x: number; y: number; z: number } {
  const s = lastServerPos.get(objectId);
  if (s && Date.now() - s.at < freshnessMs) return { x: s.x, y: s.y, z: s.z };
  return fallback;
}

/**
 * Grounding rule for visual placement: pick the closest local ground height
 * to the server's z (±3 m), never water. Caller passes candidate heights
 * (in L2 units; 1 m ≈ 52.5 units) sampled from terrain + static meshes.
 */
export function pickGroundZ(serverZ: number, candidates: number[], toleranceUnits = 157): number {
  if (candidates.length === 0) return serverZ;
  let best = candidates[0];
  let bestDist = Math.abs(best - serverZ);
  for (const c of candidates) {
    const d = Math.abs(c - serverZ);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  // If best is within tolerance of server z, trust it; otherwise trust server.
  return bestDist <= toleranceUnits ? best : serverZ;
}

export function clearServerCoord(): void {
  lastServerPos.clear();
}
