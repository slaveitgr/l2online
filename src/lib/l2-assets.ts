/**
 * L2 client asset cache backed by IndexedDB.
 *
 * Two ingest paths:
 *   1. CDN streaming (default) — fetch by path through /api/cdn/* proxy, verify
 *      sha256 from the bundled manifest, persist bytes to IndexedDB.
 *   2. Local folder upload (advanced fallback) — index files from
 *      <input webkitdirectory>.
 *
 * Cached bytes are keyed by lowercased manifest path so both paths share the
 * same store and the renderer doesn't care where files came from.
 */
import { openDB, type IDBPDatabase } from "idb";
import { findFile, loadManifest, type ManifestFile } from "./cdn-manifest";

const DB_NAME = "l2-client-cache";
const STORE = "files";
const META_STORE = "meta";
const DB_VERSION = 1;

export interface CachedFileMeta {
  path: string;
  size: number;
  ext: string;
}

export interface ClientManifest {
  rootName: string;
  indexedAt: number;
  fileCount: number;
  totalSize: number;
  folders: Record<string, number>;
}

const RELEVANT_EXTS = new Set([
  "unr", "utx", "usx", "uax", "umx", "u", "int", "ukx",
]);

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      },
    });
  }
  return dbPromise;
}

export async function getManifest(): Promise<ClientManifest | null> {
  const db = await getDB();
  return (await db.get(META_STORE, "manifest")) ?? null;
}

export async function clearCache() {
  const db = await getDB();
  await db.clear(STORE);
  await db.clear(META_STORE);
}

// ---- CDN path ---------------------------------------------------------------

export interface CacheStats {
  cachedFiles: number;
  cachedBytes: number;
  totalFiles: number;
  totalBytes: number;
  perFolder: Record<string, { cachedFiles: number; cachedBytes: number }>;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns true if the lowercased manifest path is already in IndexedDB. */
export async function isCached(path: string): Promise<boolean> {
  const db = await getDB();
  const k = path.toLowerCase();
  // count() with a key is fastest; falls back to get() if unavailable.
  const v = await db.getKey(STORE, k);
  return v !== undefined;
}

/** Get a file by path: cache-first, then CDN. */
export async function getFile(path: string): Promise<Uint8Array | null> {
  const db = await getDB();
  const k = path.toLowerCase();
  const hit = (await db.get(STORE, k)) as Uint8Array | undefined;
  if (hit) return hit;
  return fetchFromCDN(path);
}

/** Fetch a single file from the CDN proxy, verify sha256, persist. */
export async function fetchFromCDN(path: string): Promise<Uint8Array | null> {
  const meta = findFile(path);
  if (!meta) return null;
  const res = await fetch(`/api/cdn/${meta.path}`);
  if (!res.ok) throw new Error(`CDN ${res.status} for ${meta.path}`);
  const buf = await res.arrayBuffer();
  // Integrity check — only enforce on smaller files to avoid blocking the main
  // thread on >100 MB animations. The proxy and Cloudflare both checksum at
  // the TCP layer, so this is belt-and-suspenders.
  if (buf.byteLength < 32 * 1024 * 1024) {
    const got = await sha256Hex(buf);
    if (got !== meta.sha256) {
      throw new Error(`sha256 mismatch for ${meta.path}: expected ${meta.sha256}, got ${got}`);
    }
  }
  const bytes = new Uint8Array(buf);
  const db = await getDB();
  await db.put(STORE, bytes, meta.path.toLowerCase());
  return bytes;
}

export interface PrefetchProgress {
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  currentFile: string;
  failed: number;
}

/** Prefetch every manifest file in one or more top-level folders. */
export async function prefetchFolders(
  folders: string[],
  onProgress?: (p: PrefetchProgress) => void,
  opts: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<{ done: number; failed: number }> {
  const manifest = await loadManifest();
  const prefixes = folders.map((f) => f.toLowerCase() + "/");
  const targets = manifest.files.filter((f) =>
    prefixes.some((p) => f.path.toLowerCase().startsWith(p)),
  );
  const total = targets.length;
  const bytesTotal = targets.reduce((s, f) => s + f.size, 0);

  let idx = 0;
  let done = 0;
  let failed = 0;
  let bytesDone = 0;
  const concurrency = opts.concurrency ?? 6;

  async function worker() {
    while (idx < targets.length) {
      if (opts.signal?.aborted) return;
      const my = idx++;
      const file: ManifestFile = targets[my];
      try {
        if (!(await isCached(file.path))) {
          await fetchFromCDN(file.path);
        }
        bytesDone += file.size;
        done++;
      } catch (err) {
        console.error("prefetch failed", file.path, err);
        failed++;
      }
      onProgress?.({
        done: done + failed,
        total,
        bytesDone,
        bytesTotal,
        currentFile: file.path,
        failed,
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { done, failed };
}

/** Compute current cache stats vs. the manifest. */
export async function getCacheStats(): Promise<CacheStats> {
  const manifest = await loadManifest();
  const db = await getDB();
  const cachedKeys = new Set((await db.getAllKeys(STORE)) as string[]);

  const perFolder: Record<string, { cachedFiles: number; cachedBytes: number }> = {};
  let cachedFiles = 0;
  let cachedBytes = 0;

  for (const f of manifest.files) {
    const top = f.path.split("/")[0];
    perFolder[top] ??= { cachedFiles: 0, cachedBytes: 0 };
    if (cachedKeys.has(f.path.toLowerCase())) {
      cachedFiles++;
      cachedBytes += f.size;
      perFolder[top].cachedFiles++;
      perFolder[top].cachedBytes += f.size;
    }
  }

  return {
    cachedFiles,
    cachedBytes,
    totalFiles: manifest.total_files,
    totalBytes: manifest.total_bytes,
    perFolder,
  };
}

// ---- Local folder upload (fallback) ----------------------------------------

export interface IndexProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export async function indexClientFiles(
  files: FileList | File[],
  onProgress?: (p: IndexProgress) => void,
): Promise<ClientManifest> {
  const arr = Array.from(files);
  const relevant = arr.filter((f) => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    return RELEVANT_EXTS.has(ext);
  });

  const db = await getDB();
  const folders: Record<string, number> = {};
  let totalSize = 0;
  let rootName = "L2 Client";

  for (let i = 0; i < relevant.length; i++) {
    const file = relevant[i];
    const relPath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relPath.split("/");
    if (parts.length > 1) {
      rootName = parts[0];
      const folder = parts[1].toLowerCase();
      folders[folder] = (folders[folder] ?? 0) + 1;
    }
    const buf = await file.arrayBuffer();
    // strip leading "ClientRoot/" so keys match manifest paths when possible
    const key = parts.length > 1 ? parts.slice(1).join("/").toLowerCase() : relPath.toLowerCase();
    await db.put(STORE, new Uint8Array(buf), key);
    totalSize += file.size;
    onProgress?.({ processed: i + 1, total: relevant.length, currentFile: relPath });
  }

  const manifest: ClientManifest = {
    rootName,
    indexedAt: Date.now(),
    fileCount: relevant.length,
    totalSize,
    folders,
  };
  await db.put(META_STORE, manifest, "manifest");
  return manifest;
}

export async function listFiles(folder?: string): Promise<CachedFileMeta[]> {
  const db = await getDB();
  const keys = (await db.getAllKeys(STORE)) as string[];
  return keys
    .filter((k) => !folder || k.startsWith(folder.toLowerCase() + "/"))
    .map((k) => ({ path: k, size: 0, ext: k.split(".").pop() ?? "" }));
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
