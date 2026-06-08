/**
 * S12 — Asset index loader.
 *
 * Loads pre-built object→package indexes that the user uploads to /public:
 *   - /l2slave_index.jsonl   (one JSON record per line: per-export metadata)
 *   - /l2slave_objindex.json ({ [objectName]: "Package.ext" })
 *
 * If neither file is present we return an empty index and the app falls back
 * to per-package scanning (slower but functional).
 */

export interface AssetIndex {
  /** Map of lowercased object name → "package.ext". */
  objectToPackage: Map<string, string>;
  /** Map of lowercased package name → array of {object, class}. */
  packageContents: Map<string, Array<{ object: string; klass: string }>>;
  /** True if any index data was loaded. */
  loaded: boolean;
  source: "objindex" | "jsonl" | "both" | "none";
}

let cached: Promise<AssetIndex> | null = null;

export function loadAssetIndex(): Promise<AssetIndex> {
  if (cached) return cached;
  cached = (async () => {
    const out: AssetIndex = {
      objectToPackage: new Map(),
      packageContents: new Map(),
      loaded: false,
      source: "none",
    };
    let gotObj = false;
    let gotJsonl = false;

    try {
      const r = await fetch("/l2slave_objindex.json", { cache: "force-cache" });
      if (r.ok) {
        const data = (await r.json()) as Record<string, string>;
        for (const [obj, pkg] of Object.entries(data)) {
          out.objectToPackage.set(obj.toLowerCase(), pkg.toLowerCase());
        }
        gotObj = true;
      }
    } catch {
      /* missing file is fine */
    }

    try {
      const r = await fetch("/l2slave_index.jsonl", { cache: "force-cache" });
      if (r.ok) {
        const text = await r.text();
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line) as { object?: string; package?: string; class?: string };
            if (!rec.object || !rec.package) continue;
            const pkg = rec.package.toLowerCase();
            const obj = rec.object.toLowerCase();
            out.objectToPackage.set(obj, pkg);
            const bucket = out.packageContents.get(pkg) ?? [];
            bucket.push({ object: rec.object, klass: rec.class ?? "" });
            out.packageContents.set(pkg, bucket);
          } catch {
            /* skip malformed line */
          }
        }
        gotJsonl = true;
      }
    } catch {
      /* missing file is fine */
    }

    out.loaded = gotObj || gotJsonl;
    out.source = gotObj && gotJsonl ? "both" : gotObj ? "objindex" : gotJsonl ? "jsonl" : "none";
    return out;
  })();
  return cached;
}

export function clearAssetIndex(): void {
  cached = null;
}

/** Convenience: look up the package containing an object name. */
export async function findPackage(objectName: string): Promise<string | null> {
  const idx = await loadAssetIndex();
  return idx.objectToPackage.get(objectName.toLowerCase()) ?? null;
}
