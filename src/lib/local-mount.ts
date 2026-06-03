/**
 * Hybrid local-folder mount using the File System Access API.
 * Stores the FileSystemDirectoryHandle in IndexedDB so it survives reloads,
 * and reads files on demand without copying bytes into the cache store.
 *
 * Only Chromium-based browsers expose showDirectoryPicker / handle persistence.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "l2-client-mount";
const STORE = "handles";
const KEY = "root";

type DirHandle = FileSystemDirectoryHandle;

let dbPromise: Promise<IDBPDatabase> | null = null;
let cachedHandle: DirHandle | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickFolder(): Promise<DirHandle> {
  if (!isSupported()) throw new Error("File System Access API not supported in this browser (use Chrome/Edge).");
  // @ts-expect-error showDirectoryPicker is non-standard but supported in Chromium
  const handle: DirHandle = await window.showDirectoryPicker({ mode: "read" });
  const db = await getDB();
  await db.put(STORE, handle, KEY);
  cachedHandle = handle;
  return handle;
}

export async function getMountedHandle(): Promise<DirHandle | null> {
  if (cachedHandle) return cachedHandle;
  if (!isSupported()) return null;
  const db = await getDB();
  const handle = (await db.get(STORE, KEY)) as DirHandle | undefined;
  cachedHandle = handle ?? null;
  return cachedHandle;
}

export async function ensurePermission(handle: DirHandle): Promise<boolean> {
  // @ts-expect-error queryPermission/requestPermission are Chromium-only
  const q = await handle.queryPermission({ mode: "read" });
  if (q === "granted") return true;
  // @ts-expect-error
  const r = await handle.requestPermission({ mode: "read" });
  return r === "granted";
}

export async function unmount() {
  cachedHandle = null;
  const db = await getDB();
  await db.delete(STORE, KEY);
}

/**
 * Walk a slash-separated path under the mounted root and return the file bytes.
 * Path is matched case-insensitively per segment, since L2 packages use mixed case.
 */
export async function readFromMount(path: string): Promise<Uint8Array | null> {
  const root = await getMountedHandle();
  if (!root) return null;
  const granted = await ensurePermission(root);
  if (!granted) return null;

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let dir: DirHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i].toLowerCase();
    const next = await findDirChild(dir, seg);
    if (!next) return null;
    dir = next;
  }
  const fileName = parts[parts.length - 1].toLowerCase();
  const fileHandle = await findFileChild(dir, fileName);
  if (!fileHandle) return null;
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function listMountFiles(folder: string): Promise<Array<{ path: string; size: number; ext: string }>> {
  const root = await getMountedHandle();
  if (!root) return [];
  const granted = await ensurePermission(root);
  if (!granted) return [];

  const folderName = folder.toLowerCase();
  const dir = root.name.toLowerCase() === folderName ? root : await findDirChild(root, folderName);
  if (!dir) return [];

  const files: Array<{ path: string; size: number; ext: string }> = [];
  for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (handle.kind !== "file") continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    const ext = name.toLowerCase().split(".").pop() ?? "";
    files.push({ path: `${folder}/${name}`, size: file.size, ext });
  }
  return files;
}

async function findDirChild(dir: DirHandle, nameLower: string): Promise<DirHandle | null> {
  for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (handle.kind === "directory" && name.toLowerCase() === nameLower) return handle as DirHandle;
  }
  return null;
}

async function findFileChild(dir: DirHandle, nameLower: string): Promise<FileSystemFileHandle | null> {
  for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (handle.kind === "file" && name.toLowerCase() === nameLower) return handle as FileSystemFileHandle;
  }
  return null;
}

export interface MountStatus {
  mounted: boolean;
  name: string | null;
  supported: boolean;
}

export async function getMountStatus(): Promise<MountStatus> {
  const supported = isSupported();
  const handle = supported ? await getMountedHandle() : null;
  return { mounted: !!handle, name: handle?.name ?? null, supported };
}
