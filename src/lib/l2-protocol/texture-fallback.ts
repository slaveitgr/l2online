/**
 * S11 — Texture fallback resolver.
 *
 * Many modern L2 textures are renamed with an "_ori" suffix or live in a
 * different package than the one referenced by the mesh. This helper walks
 * the canonical fallback chain so meshes never render as untextured/white:
 *
 *   1. exact match
 *   2. <name>_ori
 *   3. any entry that startsWith(name) (case-insensitive)
 *   4. follow Shader.Diffuse / Material ref (cross-package indirection)
 */

export interface TextureRefRequest {
  /** Object name referenced by the mesh (e.g. "FMagic_t000"). */
  name: string;
  /** Optional package hint from the original ref. */
  pkg?: string;
}

export interface TextureCandidate {
  pkg: string;
  name: string;
  /** Higher = better match (4 = exact, 1 = follow-shader). */
  score: number;
}

export interface TextureIndex {
  /** All texture object names known per package, lowercased. */
  byPackage: Map<string, Set<string>>;
  /** Optional: shader → diffuse ref index, lowercased keys. */
  shaderDiffuse?: Map<string, { pkg: string; name: string }>;
}

/** Returns candidates ordered by score, best first. Empty if nothing matched. */
export function resolveTextureRef(
  req: TextureRefRequest,
  idx: TextureIndex,
): TextureCandidate[] {
  const want = req.name.toLowerCase();
  const out: TextureCandidate[] = [];
  const pkgsToScan = req.pkg
    ? [req.pkg.toLowerCase(), ...[...idx.byPackage.keys()].filter((p) => p !== req.pkg?.toLowerCase())]
    : [...idx.byPackage.keys()];

  for (const pkg of pkgsToScan) {
    const set = idx.byPackage.get(pkg);
    if (!set) continue;
    if (set.has(want)) out.push({ pkg, name: req.name, score: 4 });
    if (set.has(`${want}_ori`)) out.push({ pkg, name: `${req.name}_ori`, score: 3 });
  }
  if (out.length === 0) {
    for (const [pkg, set] of idx.byPackage) {
      for (const cand of set) if (cand.startsWith(want)) out.push({ pkg, name: cand, score: 2 });
    }
  }
  if (out.length === 0 && idx.shaderDiffuse) {
    const shaderHit = idx.shaderDiffuse.get(want);
    if (shaderHit) out.push({ ...shaderHit, score: 1 });
  }
  return out.sort((a, b) => b.score - a.score);
}
