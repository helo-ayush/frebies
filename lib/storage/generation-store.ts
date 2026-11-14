import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { toSafeOwnerSegment } from "@/lib/auth/owner";
import {
  getR2Config,
  r2CreateSignedDownloadUrl,
  r2DeleteObjects,
  r2GetObjectBuffer,
  r2GetObjectText,
  r2ListObjects,
  r2PutObject,
} from "@/lib/storage/r2-client";
import { DEFAULT_GENERATION_TTL_HOURS, DEFAULT_GENERATION_TTL_MS } from "@/lib/storage/retention";

export type StorageProviderKind = "r2" | "local";

export type StoredGenerationRecord<TMeta = Record<string, unknown>> = {
  id: string;
  toolSlug: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  storageProvider: StorageProviderKind;
  storageKey: string;
  metaKey: string;
  createdAt: number;
  completedAt: number;
  expiresAt: number;
  ttlMs: number;
  durationSeconds?: number | null;
  meta?: TMeta;
};

export type GenerationStorageStats = {
  provider: StorageProviderKind;
  bucketName: string | null;
  ttlHours: number;
  ttlMs: number;
  usedBytes: number;
  maxBytes: number;
  ownerMaxBytes: number | null;
  usedPercent: number;
  totalItems: number;
  ownerUsedBytes: number;
  ownerItems: number;
  evictedCount: number;
  expiredDeletedCount: number;
  lastEvictedAt: number | null;
};

export type SaveGenerationInput<TMeta = Record<string, unknown>> = {
  id: string;
  toolSlug: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  createdAt?: number;
  completedAt?: number;
  ttlMs?: number;
  durationSeconds?: number | null;
  meta?: TMeta;
};

export type SaveGenerationResult<TMeta = Record<string, unknown>> = {
  record: StoredGenerationRecord<TMeta>;
  evictedIds: string[];
  expiredIds: string[];
};

const STORE_REVISION = 1;
const DEFAULT_R2_MAX_BYTES = 9_500_000_000; // 9.5 GB safety headroom under 10 GB R2 tier
const DEFAULT_TIGRIS_MAX_BYTES = 4_700 * 1024 * 1024; // ~4.7 GB safety headroom under 5 GB Tigris free tier
const LAZY_PRUNE_INTERVAL_MS = 30_000;

function sanitizeSegment(raw: string, fallback = "item"): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || fallback;
}

function resolveTtlHours(): number {
  const raw = Number.parseFloat(process.env.GENERATION_TTL_HOURS ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_GENERATION_TTL_HOURS;
}

function resolveTtlMs(): number {
  const hours = resolveTtlHours();
  return Math.max(60_000, Math.round(hours * 60 * 60 * 1000));
}

function resolveMaxStorageBytes(): number {
  const exactBytes = Number.parseInt(process.env.GENERATION_MAX_STORAGE_BYTES ?? "", 10);
  if (Number.isFinite(exactBytes) && exactBytes > 0) {
    return exactBytes;
  }
  const mbRaw =
    Number.parseFloat(process.env.GENERATION_MAX_STORAGE_MB ?? process.env.R2_MAX_STORAGE_MB ?? "");
  if (Number.isFinite(mbRaw) && mbRaw > 0) {
    return Math.round(mbRaw * 1024 * 1024);
  }
  const cfg = getR2Config();
  if (cfg.endpoint.includes("storage.dev") || cfg.endpoint.includes("tigris")) {
    return DEFAULT_TIGRIS_MAX_BYTES;
  }
  return DEFAULT_R2_MAX_BYTES;
}

function resolveOwnerMaxStorageBytes(): number {
  const exactBytes = Number.parseInt(process.env.GENERATION_OWNER_MAX_STORAGE_BYTES ?? "", 10);
  if (Number.isFinite(exactBytes) && exactBytes > 0) {
    return exactBytes;
  }
  const mbRaw = Number.parseFloat(process.env.GENERATION_OWNER_MAX_STORAGE_MB ?? "");
  if (Number.isFinite(mbRaw) && mbRaw > 0) {
    return Math.round(mbRaw * 1024 * 1024);
  }
  return 0;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const count = Math.min(limit, items.length);
  const runners = Array.from({ length: count }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

export class GenerationStore {
  public readonly revision = STORE_REVISION;

  private readonly localRoot: string;
  private activeProvider: StorageProviderKind | null = null;
  private initPromise: Promise<void> | null = null;
  private writeLock: Promise<void> = Promise.resolve();
  private lastLazyPruneAt = 0;

  private records = new Map<string, StoredGenerationRecord>();
  private orphanR2Objects = new Map<string, { key: string; size: number; lastModified: number }>();
  private evictedCount = 0;
  private expiredDeletedCount = 0;
  private lastEvictedAt: number | null = null;
  private evictionListeners = new Set<(removedIds: string[], reason: "expired" | "quota") => void>();

  constructor() {
    this.localRoot = path.join(os.tmpdir(), "frebies-generations");
  }

  public onRemoved(listener: (removedIds: string[], reason: "expired" | "quota") => void): () => void {
    this.evictionListeners.add(listener);
    return () => {
      this.evictionListeners.delete(listener);
    };
  }

  private emitRemoved(ids: string[], reason: "expired" | "quota"): void {
    if (ids.length === 0) return;
    for (const listener of this.evictionListeners) {
      try {
        listener(ids, reason);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private currentProvider(): StorageProviderKind {
    return getR2Config().configured ? "r2" : "local";
  }

  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(fn, fn);
    this.writeLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  public async ensureInitialized(): Promise<void> {
    const desired = this.currentProvider();
    if (this.activeProvider && this.activeProvider !== desired) {
      this.records.clear();
      this.orphanR2Objects.clear();
      this.initPromise = null;
    }
    this.activeProvider = desired;

    if (!this.initPromise) {
      this.initPromise = this.hydrateFromBackend(desired).catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private localMetaDir(): string {
    return path.join(this.localRoot, "meta");
  }

  private localArtifactPath(storageKey: string): string {
    const safeRel = storageKey.replace(/^\/+/, "").split("/").join(path.sep);
    return path.join(this.localRoot, safeRel);
  }

  private localMetaPath(metaKey: string): string {
    const fileName = path.basename(metaKey);
    return path.join(this.localMetaDir(), fileName);
  }

  private async hydrateFromBackend(provider: StorageProviderKind): Promise<void> {
    const now = Date.now();
    const defaultTtlMs = resolveTtlMs();
    this.records.clear();
    this.orphanR2Objects.clear();

    if (provider === "r2") {
      const [metaObjects, artifactObjects] = await Promise.all([
        r2ListObjects("meta/"),
        r2ListObjects("gen/"),
      ]);

      const artifactMap = new Map(artifactObjects.map((o) => [o.key, o]));
      const keysToDelete: string[] = [];
      const referencedArtifactKeys = new Set<string>();

      await runWithConcurrency(metaObjects, 8, async (metaObj) => {
        if (!metaObj.key.endsWith(".json")) return;
        try {
          const text = await r2GetObjectText(metaObj.key);
          if (!text) return;
          const parsed = JSON.parse(text) as StoredGenerationRecord;
          if (!parsed?.id || !parsed.storageKey) {
            keysToDelete.push(metaObj.key);
            return;
          }
          const artifact = artifactMap.get(parsed.storageKey);
          const expired = !parsed.expiresAt || parsed.expiresAt <= now;
          if (expired || !artifact) {
            keysToDelete.push(metaObj.key);
            if (artifact) keysToDelete.push(parsed.storageKey);
            if (expired) this.expiredDeletedCount += 1;
            return;
          }
          referencedArtifactKeys.add(parsed.storageKey);
          this.records.set(parsed.id, {
            ...parsed,
            byteLength: artifact.size || parsed.byteLength,
            storageProvider: "r2",
          });
        } catch {
          // Ignore malformed JSON metadata
        }
      });

      for (const obj of artifactObjects) {
        if (referencedArtifactKeys.has(obj.key) || keysToDelete.includes(obj.key)) continue;
        if (obj.lastModified + defaultTtlMs <= now) {
          keysToDelete.push(obj.key);
          this.expiredDeletedCount += 1;
        } else {
          this.orphanR2Objects.set(obj.key, obj);
        }
      }

      if (keysToDelete.length > 0) {
        await r2DeleteObjects(keysToDelete).catch(() => {});
      }
      return;
    }

    // Local disk fallback mode
    await fsp.mkdir(this.localMetaDir(), { recursive: true });
    await fsp.mkdir(path.join(this.localRoot, "gen"), { recursive: true });
    const metaFiles = await fsp.readdir(this.localMetaDir()).catch(() => []);
    for (const file of metaFiles) {
      if (!file.endsWith(".json")) continue;
      const metaFull = path.join(this.localMetaDir(), file);
      try {
        const raw = await fsp.readFile(metaFull, "utf-8");
        const parsed = JSON.parse(raw) as StoredGenerationRecord;
        if (!parsed?.id || !parsed.storageKey) {
          await fsp.unlink(metaFull).catch(() => {});
          continue;
        }
        const artFull = this.localArtifactPath(parsed.storageKey);
        const expired = !parsed.expiresAt || parsed.expiresAt <= now;
        if (expired) {
          await fsp.unlink(artFull).catch(() => {});
          await fsp.unlink(metaFull).catch(() => {});
          this.expiredDeletedCount += 1;
          continue;
        }
        const stat = await fsp.stat(artFull).catch(() => null);
        if (!stat) {
          await fsp.unlink(metaFull).catch(() => {});
          continue;
        }
        this.records.set(parsed.id, {
          ...parsed,
          byteLength: stat.size,
          storageProvider: "local",
        });
      } catch {
        // Ignore corrupt local file
      }
    }
  }

  private computeTotalUsedBytes(): number {
    let total = 0;
    for (const rec of this.records.values()) {
      total += rec.byteLength;
    }
    for (const orphan of this.orphanR2Objects.values()) {
      total += orphan.size;
    }
    return total;
  }

  private computeOwnerUsedBytes(ownerId: string): { bytes: number; count: number } {
    let bytes = 0;
    let count = 0;
    for (const rec of this.records.values()) {
      if (rec.ownerId === ownerId) {
        bytes += rec.byteLength;
        count += 1;
      }
    }
    return { bytes, count };
  }

  private async deleteBackendRecord(record: StoredGenerationRecord): Promise<void> {
    if (record.storageProvider === "r2") {
      await r2DeleteObjects([record.storageKey, record.metaKey]).catch(() => {});
      return;
    }
    await fsp.unlink(this.localArtifactPath(record.storageKey)).catch(() => {});
    await fsp.unlink(this.localMetaPath(record.metaKey)).catch(() => {});
  }

  private async pruneExpiredLocked(now = Date.now()): Promise<string[]> {
    const expiredRecords: StoredGenerationRecord[] = [];
    for (const rec of this.records.values()) {
      if (rec.expiresAt <= now) {
        expiredRecords.push(rec);
      }
    }

    const r2DeleteBatch: string[] = [];
    const expiredIds: string[] = [];

    for (const rec of expiredRecords) {
      this.records.delete(rec.id);
      expiredIds.push(rec.id);
      this.expiredDeletedCount += 1;
      if (rec.storageProvider === "r2") {
        r2DeleteBatch.push(rec.storageKey, rec.metaKey);
      } else {
        await fsp.unlink(this.localArtifactPath(rec.storageKey)).catch(() => {});
        await fsp.unlink(this.localMetaPath(recordMetaName(rec.metaKey))).catch(() => {});
      }
    }

    const defaultTtlMs = resolveTtlMs();
    for (const [key, orphan] of this.orphanR2Objects.entries()) {
      if (orphan.lastModified + defaultTtlMs <= now) {
        this.orphanR2Objects.delete(key);
        r2DeleteBatch.push(key);
        this.expiredDeletedCount += 1;
      }
    }

    if (r2DeleteBatch.length > 0) {
      await r2DeleteObjects(r2DeleteBatch).catch(() => {});
    }

    this.lastLazyPruneAt = now;
    if (expiredIds.length > 0) {
      this.emitRemoved(expiredIds, "expired");
    }
    return expiredIds;
  }

  private async maybeLazyPrune(): Promise<void> {
    const now = Date.now();
    if (now - this.lastLazyPruneAt < LAZY_PRUNE_INTERVAL_MS) return;
    await this.withWriteLock(async () => {
      if (Date.now() - this.lastLazyPruneAt >= LAZY_PRUNE_INTERVAL_MS) {
        await this.pruneExpiredLocked(Date.now());
      }
    });
  }

  /**
   * Stores a generated artifact on Cloudflare R2 (or local fallback) with a 24h retention window.
   * If storage capacity is full, evicts oldest generations first (FIFO queue) even if their 24h TTL
   * has not completed yet, making room for the newest generation.
   */
  public async saveArtifact<TMeta = Record<string, unknown>>(
    input: SaveGenerationInput<TMeta>,
  ): Promise<SaveGenerationResult<TMeta>> {
    await this.ensureInitialized();

    return this.withWriteLock(async () => {
      const now = Date.now();
      const expiredIds = await this.pruneExpiredLocked(now);
      const evictedIds: string[] = [];

      const provider = this.currentProvider();
      const maxBytes = resolveMaxStorageBytes();
      const ownerMaxBytes = resolveOwnerMaxStorageBytes();
      const incomingBytes = input.buffer.length;

      if (incomingBytes > maxBytes) {
        throw new Error(
          `Generated file (${incomingBytes} bytes) exceeds configured storage cap (${maxBytes} bytes).`,
        );
      }
      if (ownerMaxBytes > 0 && incomingBytes > ownerMaxBytes) {
        throw new Error(
          `Generated file (${incomingBytes} bytes) exceeds per-user storage cap (${ownerMaxBytes} bytes).`,
        );
      }

      // If overwriting an existing ID, release its previous bytes cleanly first
      const existingSameId = this.records.get(input.id);
      if (existingSameId) {
        this.records.delete(input.id);
        await this.deleteBackendRecord(existingSameId);
      }

      // 1) Enforce per-owner FIFO eviction if an owner storage limit is enabled
      if (ownerMaxBytes > 0) {
        const ownerQueue = Array.from(this.records.values())
          .filter((r) => r.ownerId === input.ownerId)
          .sort((a, b) => a.createdAt - b.createdAt || a.completedAt - b.completedAt || a.id.localeCompare(b.id));

        let ownerUsed = ownerQueue.reduce((sum, r) => sum + r.byteLength, 0);
        const r2Batch: string[] = [];

        for (const victim of ownerQueue) {
          if (ownerUsed + incomingBytes <= ownerMaxBytes) break;
          this.records.delete(victim.id);
          ownerUsed -= victim.byteLength;
          this.evictedCount += 1;
          this.lastEvictedAt = now;
          evictedIds.push(victim.id);

          if (victim.storageProvider === "r2") {
            r2Batch.push(victim.storageKey, victim.metaKey);
          } else {
            await fsp.unlink(this.localArtifactPath(victim.storageKey)).catch(() => {});
            await fsp.unlink(this.localMetaPath(victim.metaKey)).catch(() => {});
          }
        }
        if (r2Batch.length > 0) {
          await r2DeleteObjects(r2Batch).catch(() => {});
        }
      }

      // 2) Enforce global bucket FIFO queue eviction ("delete oldest even before 24h completes")
      const globalQueue = Array.from(this.records.values()).sort(
        (a, b) => a.createdAt - b.createdAt || a.completedAt - b.completedAt || a.id.localeCompare(b.id),
      );
      let totalUsed = this.computeTotalUsedBytes();
      const globalR2Batch: string[] = [];

      for (const victim of globalQueue) {
        if (totalUsed + incomingBytes <= maxBytes) break;
        this.records.delete(victim.id);
        totalUsed -= victim.byteLength;
        this.evictedCount += 1;
        this.lastEvictedAt = now;
        evictedIds.push(victim.id);

        if (victim.storageProvider === "r2") {
          globalR2Batch.push(victim.storageKey, victim.metaKey);
        } else {
          await fsp.unlink(this.localArtifactPath(victim.storageKey)).catch(() => {});
          await fsp.unlink(this.localMetaPath(victim.metaKey)).catch(() => {});
        }
      }

      // If untracked orphan gen/ objects in R2 still keep usage above maxBytes, evict oldest orphans too
      if (provider === "r2" && totalUsed + incomingBytes > maxBytes && this.orphanR2Objects.size > 0) {
        const orphans = Array.from(this.orphanR2Objects.values()).sort(
          (a, b) => a.lastModified - b.lastModified || a.key.localeCompare(b.key),
        );
        for (const orphan of orphans) {
          if (totalUsed + incomingBytes <= maxBytes) break;
          this.orphanR2Objects.delete(orphan.key);
          totalUsed -= orphan.size;
          this.evictedCount += 1;
          this.lastEvictedAt = now;
          globalR2Batch.push(orphan.key);
        }
      }

      if (globalR2Batch.length > 0) {
        await r2DeleteObjects(globalR2Batch).catch(() => {});
      }

      const ttlMs = input.ttlMs ?? resolveTtlMs();
      const completedAt = input.completedAt ?? now;
      const createdAt = input.createdAt ?? completedAt;
      const expiresAt = completedAt + ttlMs;

      const ownerSeg = toSafeOwnerSegment(input.ownerId);
      const toolSeg = sanitizeSegment(input.toolSlug.replace(/\//g, "_"), "tool");
      const safeId = sanitizeSegment(input.id, "gen");
      const safeFileName = sanitizeSegment(input.fileName, "output.bin");

      const storageKey = `gen/${ownerSeg}/${toolSeg}/${safeId}/${safeFileName}`;
      const metaKey = `meta/${safeId}.json`;

      const record: StoredGenerationRecord<TMeta> = {
        id: input.id,
        toolSlug: input.toolSlug,
        ownerId: input.ownerId,
        fileName: safeFileName,
        mimeType: input.mimeType,
        byteLength: incomingBytes,
        storageProvider: provider,
        storageKey,
        metaKey,
        createdAt,
        completedAt,
        expiresAt,
        ttlMs,
        durationSeconds: input.durationSeconds ?? null,
        meta: input.meta,
      };

      if (provider === "r2") {
        await r2PutObject({
          key: storageKey,
          body: input.buffer,
          contentType: input.mimeType,
          metadata: {
            "owner-id": ownerSeg,
            "tool-slug": toolSeg,
            "generation-id": safeId,
            "created-at": String(createdAt),
            "expires-at": String(expiresAt),
          },
          cacheControl: `private, max-age=${Math.max(60, Math.round(ttlMs / 1000))}`,
        });
        await r2PutObject({
          key: metaKey,
          body: JSON.stringify(record),
          contentType: "application/json",
          cacheControl: "private, no-store",
        });
      } else {
        const artPath = this.localArtifactPath(storageKey);
        const metaPath = this.localMetaPath(metaKey);
        await fsp.mkdir(path.dirname(artPath), { recursive: true });
        await fsp.mkdir(path.dirname(metaPath), { recursive: true });
        await fsp.writeFile(artPath, input.buffer);
        await fsp.writeFile(metaPath, JSON.stringify(record), "utf-8");
      }

      this.records.set(record.id, record as StoredGenerationRecord);

      if (evictedIds.length > 0) {
        this.emitRemoved(evictedIds, "quota");
      }

      return { record, evictedIds, expiredIds };
    });
  }

  public async getRecord<TMeta = Record<string, unknown>>(
    id: string,
    ownerId?: string,
  ): Promise<StoredGenerationRecord<TMeta> | null> {
    await this.ensureInitialized();
    let rec = this.records.get(id);
    if (!rec && this.currentProvider() === "r2") {
      const metaKey = `meta/${sanitizeSegment(id, "gen")}.json`;
      try {
        const text = await r2GetObjectText(metaKey);
        if (text) {
          const parsed = JSON.parse(text) as StoredGenerationRecord;
          if (parsed?.id && parsed.storageKey && parsed.expiresAt > Date.now()) {
            rec = { ...parsed, storageProvider: "r2" };
            this.records.set(rec.id, rec);
          }
        }
      } catch {
        // Ignore missing/invalid remote meta
      }
    }
    if (!rec) return null;
    if (ownerId !== undefined && rec.ownerId !== ownerId) return null;
    if (rec.expiresAt <= Date.now()) {
      await this.deleteGeneration(id);
      return null;
    }
    return rec as StoredGenerationRecord<TMeta>;
  }

  public async readArtifact(
    id: string,
    ownerId?: string,
  ): Promise<{
    record: StoredGenerationRecord;
    buffer: Buffer;
  } | null> {
    const rec = await this.getRecord(id, ownerId);
    if (!rec) return null;

    if (rec.storageProvider === "r2") {
      const obj = await r2GetObjectBuffer(rec.storageKey);
      if (!obj) {
        // Object disappeared remotely; prune stale record cleanly
        await this.deleteGeneration(id);
        return null;
      }
      return { record: rec, buffer: obj.buffer };
    }

    const artPath = this.localArtifactPath(rec.storageKey);
    if (!fs.existsSync(artPath)) {
      await this.deleteGeneration(id);
      return null;
    }
    const buffer = await fsp.readFile(artPath);
    return { record: rec, buffer };
  }

  public async getSignedDownloadUrl(
    id: string,
    opts?: { ownerId?: string; download?: boolean; expiresInSeconds?: number },
  ): Promise<string | null> {
    const rec = await this.getRecord(id, opts?.ownerId);
    if (!rec || rec.storageProvider !== "r2") return null;
    const remainingSec = Math.max(60, Math.floor((rec.expiresAt - Date.now()) / 1000));
    const expiresInSeconds = Math.min(remainingSec, opts?.expiresInSeconds ?? 3600);
    return r2CreateSignedDownloadUrl(rec.storageKey, {
      expiresInSeconds,
      fileName: rec.fileName,
      download: opts?.download,
    });
  }

  public async deleteGeneration(id: string, ownerId?: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.withWriteLock(async () => {
      const rec = this.records.get(id);
      if (!rec) return false;
      if (ownerId !== undefined && rec.ownerId !== ownerId) return false;
      this.records.delete(id);
      await this.deleteBackendRecord(rec);
      return true;
    });
  }

  public async listGenerations<TMeta = Record<string, unknown>>(opts?: {
    ownerId?: string;
    toolSlug?: string;
    limit?: number;
  }): Promise<StoredGenerationRecord<TMeta>[]> {
    await this.ensureInitialized();
    await this.maybeLazyPrune();

    const now = Date.now();
    const limit = opts?.limit ?? 50;
    const items: StoredGenerationRecord<TMeta>[] = [];

    for (const rec of this.records.values()) {
      if (rec.expiresAt <= now) continue;
      if (opts?.ownerId !== undefined && rec.ownerId !== opts.ownerId) continue;
      if (opts?.toolSlug && rec.toolSlug !== opts.toolSlug) continue;
      items.push(rec as StoredGenerationRecord<TMeta>);
    }

    items.sort((a, b) => b.createdAt - a.createdAt || b.completedAt - a.completedAt);
    return items.slice(0, limit);
  }

  public getCachedStats(ownerId?: string): GenerationStorageStats {
    const now = Date.now();
    const provider = this.currentProvider();
    const cfg = getR2Config();
    const maxBytes = resolveMaxStorageBytes();
    const ownerMaxRaw = resolveOwnerMaxStorageBytes();
    const ttlMs = resolveTtlMs();

    let usedBytes = 0;
    let totalItems = 0;
    let ownerUsedBytes = 0;
    let ownerItems = 0;

    for (const rec of this.records.values()) {
      if (rec.expiresAt <= now) continue;
      usedBytes += rec.byteLength;
      totalItems += 1;
      if (ownerId && rec.ownerId === ownerId) {
        ownerUsedBytes += rec.byteLength;
        ownerItems += 1;
      }
    }

    for (const orphan of this.orphanR2Objects.values()) {
      usedBytes += orphan.size;
    }

    const effectiveCap = ownerId && ownerMaxRaw > 0 ? ownerMaxRaw : maxBytes;
    const denominator = Math.max(1, effectiveCap);
    const numerator = ownerId && ownerMaxRaw > 0 ? ownerUsedBytes : usedBytes;

    return {
      provider,
      bucketName: provider === "r2" ? cfg.bucketName : null,
      ttlHours: resolveTtlHours(),
      ttlMs: ttlMs || DEFAULT_GENERATION_TTL_MS,
      usedBytes,
      maxBytes,
      ownerMaxBytes: ownerMaxRaw > 0 ? ownerMaxRaw : null,
      usedPercent: Math.min(100, Math.round((numerator / denominator) * 1000) / 10),
      totalItems,
      ownerUsedBytes,
      ownerItems,
      evictedCount: this.evictedCount,
      expiredDeletedCount: this.expiredDeletedCount,
      lastEvictedAt: this.lastEvictedAt,
    };
  }

  public async getStorageStats(ownerId?: string): Promise<GenerationStorageStats> {
    await this.ensureInitialized();
    await this.maybeLazyPrune();
    return this.getCachedStats(ownerId);
  }
}

function recordMetaName(metaKey: string): string {
  return path.basename(metaKey);
}

declare global {
  // eslint-disable-next-line no-var
  var __frebiesGenerationStore: GenerationStore | undefined;
}

export function getGenerationStore(): GenerationStore {
  const existing = globalThis.__frebiesGenerationStore as
    | (GenerationStore & { revision?: number })
    | undefined;
  if (!existing || existing.revision !== STORE_REVISION) {
    const fresh = new GenerationStore();
    globalThis.__frebiesGenerationStore = fresh;
    return fresh;
  }
  return existing;
}
