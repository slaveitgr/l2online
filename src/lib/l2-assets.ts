/**
 * L2 client asset cache backed by IndexedDB.
 * Stores raw bytes of Unreal package files (.utx/.unr/.usx/.uax) keyed by
 * their relative path inside the client folder.
 *
 * For Phase 1 we just index + cache. Actual parsing of Unreal packages
 * will plug in here in Phase 2 (port loaders from realratchet/Lineage2JS).
 */
import { openDB, type IDBPDatabase } from "idb";

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
  folders: Record<string, number>; // folder name -> file count
}

const RELEVANT_EXTS = new Set([
  "unr", "utx", "usx", "uax", "umx", "u", "int", "ukx",
]);

const KEY_FOLDERS = ["system", "maps", "textures", "staticmeshes", "animations", "sounds"];

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
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

export interface IndexProgress {
  processed: number;
  total: number;
  currentFile: string;
}

/**
 * Index a folder of files (from <input type="file" webkitdirectory>).
 * Stores each relevant file as a Uint8Array under its relative path.
 */
export async function indexClientFiles(
  files: FileList | File[],
  onProgress?: (p: IndexProgress) => void,
): Promise<ClientManifest> {
  const arr = Array.from(files);
  const relevant = arr.filter((f) => {
    const name = f.name.toLowerCase();
    const ext = name.split(".").pop() ?? "";
    return RELEVANT_EXTS.has(ext);
  });

  const db = await getDB();
  await db.clear(STORE);

  const folders: Record<string, number> = {};
  let totalSize = 0;
  let rootName = "L2 Client";

  for (let i = 0; i < relevant.length; i++) {
    const file = relevant[i];
    // webkitRelativePath: "L2/system/Engine.u"
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relPath.split("/");
    if (parts.length > 1) {
      rootName = parts[0];
      const folder = parts[1].toLowerCase();
      folders[folder] = (folders[folder] ?? 0) + 1;
    }

    const buf = await file.arrayBuffer();
    await db.put(STORE, new Uint8Array(buf), relPath.toLowerCase());
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

export async function getFile(relPath: string): Promise<Uint8Array | null> {
  const db = await getDB();
  return (await db.get(STORE, relPath.toLowerCase())) ?? null;
}

export async function listFiles(folder?: string): Promise<CachedFileMeta[]> {
  const db = await getDB();
  const keys = (await db.getAllKeys(STORE)) as string[];
  const out: CachedFileMeta[] = [];
  for (const k of keys) {
    if (folder && !k.includes(`/${folder.toLowerCase()}/`)) continue;
    const v = (await db.get(STORE, k)) as Uint8Array | undefined;
    if (!v) continue;
    out.push({ path: k, size: v.byteLength, ext: k.split(".").pop() ?? "" });
  }
  return out;
}

export function validateManifest(m: ClientManifest): { ok: boolean; missing: string[] } {
  const present = new Set(Object.keys(m.folders));
  const missing = KEY_FOLDERS.filter((f) => !present.has(f));
  return { ok: missing.length === 0, missing };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
