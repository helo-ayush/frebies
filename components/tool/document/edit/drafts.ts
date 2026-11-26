import type { Asset, DocState } from "./model";
import type { EditorStore } from "./store";

/**
 * Work in progress, kept in this browser only, so that a closed tab or a crash
 * loses nothing. One document at a time.
 */

const NAME = "frebies-pdf-editor";
const KEY = "draft";
/** Larger than this is not kept. */
const LIMIT = 160 * 1024 * 1024;

type Kept = {
  version: 1;
  name: string;
  time: number;
  pages: number;
  primary: string | null;
  doc: DocState;
  sources: { id: string; name: string }[];
  assets: Omit<Asset, "url" | "bytes">[];
};

export type Draft = Pick<Kept, "name" | "time" | "pages">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("state");
      // The files themselves, written once each.
      db.createObjectStore("bytes");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No storage"));
  });
}

const asked = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No storage"));
  });

const finished = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("No storage"));
    transaction.onabort = () => reject(transaction.error ?? new Error("No storage"));
  });

/** Keeps what is open now. */
export async function keepDraft(store: EditorStore): Promise<boolean> {
  const { doc } = store;
  if (doc.pages.length === 0) return false;
  const usedSources = new Set(doc.pages.map((page) => page.source));
  const usedAssets = new Set<string>();
  for (const object of Object.values(doc.objects)) if (object.type === "image") usedAssets.add(object.asset);
  if (doc.decor?.watermark?.asset) usedAssets.add(doc.decor.watermark.asset);
  const sources = [...store.sources.values()].filter((source) => usedSources.has(source.id));
  const assets = [...store.assets.values()].filter((asset) => usedAssets.has(asset.id));
  // Pictures taken out of the file stay tied to it.
  for (const asset of assets) {
    const own = asset.origin ? store.sources.get(asset.origin.source) : null;
    if (own && !sources.includes(own)) sources.push(own);
  }
  const weight = [...sources, ...assets].reduce((sum, item) => sum + item.bytes.byteLength, 0);
  if (weight > LIMIT) return false;
  const kept: Kept = {
    version: 1,
    name: store.name,
    time: Date.now(),
    pages: doc.pages.length,
    primary: store.primary,
    doc,
    sources: sources.map(({ id, name }) => ({ id, name })),
    assets: assets.map(({ id, w, h, mime, origin }) => ({ id, w, h, mime, origin })),
  };
  const db = await openDb();
  try {
    const reading = db.transaction("bytes", "readonly");
    const there = new Set((await asked(reading.objectStore("bytes").getAllKeys())).map(String));
    const wanted = new Map<string, Uint8Array>();
    for (const item of [...sources, ...assets]) wanted.set(item.id, item.bytes);
    const writing = db.transaction(["state", "bytes"], "readwrite");
    const bytes = writing.objectStore("bytes");
    for (const key of there) if (!wanted.has(key)) bytes.delete(key);
    for (const [key, value] of wanted) if (!there.has(key)) bytes.put(value, key);
    writing.objectStore("state").put(kept, KEY);
    await finished(writing);
    return true;
  } finally {
    db.close();
  }
}

/** What was left from last time, if anything. */
export async function findDraft(): Promise<Draft | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const kept = (await asked(db.transaction("state", "readonly").objectStore("state").get(KEY))) as Kept | undefined;
    return kept?.version === 1 ? { name: kept.name, time: kept.time, pages: kept.pages } : null;
  } finally {
    db.close();
  }
}

export async function openDraft(store: EditorStore): Promise<void> {
  const db = await openDb();
  try {
    const reading = db.transaction(["state", "bytes"], "readonly");
    const kept = (await asked(reading.objectStore("state").get(KEY))) as Kept | undefined;
    if (!kept) throw new Error("That draft is gone.");
    const bytesOf = async (id: string) => {
      const bytes = (await asked(reading.objectStore("bytes").get(id))) as Uint8Array | undefined;
      if (!bytes) throw new Error("A part of that draft is missing.");
      return bytes;
    };
    const sources = [];
    for (const source of kept.sources) sources.push({ ...source, bytes: await bytesOf(source.id) });
    const assets = [];
    for (const asset of kept.assets) assets.push({ ...asset, bytes: await bytesOf(asset.id) });
    await store.restore({ name: kept.name, primary: kept.primary, doc: kept.doc, sources, assets });
  } finally {
    db.close();
  }
}

export async function forgetDraft(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const writing = db.transaction(["state", "bytes"], "readwrite");
    writing.objectStore("state").clear();
    writing.objectStore("bytes").clear();
    await finished(writing);
  } finally {
    db.close();
  }
}
