/**
 * Holds the file a guest was about to run while they go and sign in. It stays
 * in this browser's own storage, never leaves the device, and is thrown away
 * once it is picked up or after an hour.
 */

const DB_NAME = "frebies";
const STORE = "held-files";
/** Set while something may be waiting, so nobody else's visit opens the database. */
const FLAG = "frebies:held";
const TTL_MS = 60 * 60 * 1000;
/** Past this, copying the file takes longer than choosing it again. */
const MAX_BYTES = 512 * 1024 * 1024;

export type HeldFile = { path: string; file: File; settings?: unknown; at: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "path" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function flagged(): boolean {
  try {
    return window.localStorage.getItem(FLAG) !== null;
  } catch {
    return false;
  }
}

export const canHoldFile = (file: File) => file.size <= MAX_BYTES;

/** Keep `file` for `path`. Private windows and full disks simply do not keep it. */
export async function holdFile(path: string, file: File, settings?: unknown): Promise<void> {
  if (!canHoldFile(file)) return;
  try {
    window.localStorage.setItem(FLAG, "1");
    await run("readwrite", (store) => store.put({ path, file, settings, at: Date.now() } satisfies HeldFile));
  } catch {
    // Nothing to undo: the tool still works, the file just has to be chosen again.
  }
}

export async function readHeldFile(path: string): Promise<HeldFile | null> {
  if (!flagged()) return null;
  try {
    const held = await run<HeldFile | undefined>("readonly", (store) => store.get(path));
    if (!held || Date.now() - held.at > TTL_MS) return null;
    return held;
  } catch {
    return null;
  }
}

export async function dropHeldFile(path: string): Promise<void> {
  if (!flagged()) return;
  try {
    await run("readwrite", (store) => store.delete(path));
  } catch {
    // It expires on its own.
  }
}

/** Delete everything past its hour. */
export async function sweepHeldFiles(): Promise<void> {
  if (!flagged()) return;
  try {
    const all = await run<HeldFile[]>("readonly", (store) => store.getAll());
    const stale = all.filter((held) => Date.now() - held.at > TTL_MS);
    for (const held of stale) await dropHeldFile(held.path);
    if (stale.length === all.length) window.localStorage.removeItem(FLAG);
  } catch {
    // Tried again on the next visit.
  }
}

export function asFileList(file: File): FileList {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  return transfer.files;
}
