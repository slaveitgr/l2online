/**
 * Typed loader and lookup for the CDN manifest bundled at /cdn-manifest.json.
 * The manifest enumerates every Lineage 2 asset hosted on the remote CDN
 * (l2client.slave.gr) with size + sha256, letting us stream files on demand
 * instead of asking the user to upload 35 GB from disk.
 */

export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

export interface CDNManifest {
  version: string;
  generated_at: string;
  base_url: string;
  total_files: number;
  total_bytes: number;
  files: ManifestFile[];
}

export interface FolderSummary {
  name: string;
  fileCount: number;
  totalSize: number;
}

let cached: CDNManifest | null = null;
let lookup: Map<string, ManifestFile> | null = null;
let inflight: Promise<CDNManifest> | null = null;

export async function loadManifest(): Promise<CDNManifest> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/cdn-manifest.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
      return r.json() as Promise<CDNManifest>;
    })
    .then((m) => {
      cached = m;
      lookup = new Map();
      for (const f of m.files) lookup.set(f.path.toLowerCase(), f);
      return m;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function findFile(path: string): ManifestFile | undefined {
  return lookup?.get(path.toLowerCase());
}

export function summarizeFolders(m: CDNManifest): FolderSummary[] {
  const folders = new Map<string, FolderSummary>();
  for (const f of m.files) {
    const top = f.path.split("/")[0];
    const cur = folders.get(top) ?? { name: top, fileCount: 0, totalSize: 0 };
    cur.fileCount += 1;
    cur.totalSize += f.size;
    folders.set(top, cur);
  }
  return Array.from(folders.values()).sort((a, b) => b.totalSize - a.totalSize);
}

export function filesInFolder(m: CDNManifest, folder: string): ManifestFile[] {
  const prefix = folder.toLowerCase() + "/";
  return m.files.filter((f) => f.path.toLowerCase().startsWith(prefix));
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
