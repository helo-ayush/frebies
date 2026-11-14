import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TtsFormat, TtsLanguage, TtsStyle, VoiceId } from "@/components/tool/audio/tts/model";
import {
  getGenerationStore,
  type GenerationStorageStats,
  type StorageProviderKind,
} from "@/lib/storage/generation-store";
import { DEFAULT_GENERATION_TTL_MS } from "@/lib/storage/retention";
import { loadPoolSettings, type PoolSettings, type StudioConfig } from "./modelscope-config";
import { prepareSpeechChunks } from "./tts-text";
import { getPresetVoiceReference, getPresetVoiceReferenceAsync } from "./voice-presets";
import { concatWavSegments, buildWav, postProcessWav } from "./wav-utils";

export type StudioState = "unknown" | "sleeping" | "waking" | "booting" | "ready" | "error";

export type StudioSnapshot = {
  id: string;
  label: string;
  owner: string;
  repo: string;
  apiUrl: string;
  visibility: string;
  state: StudioState;
  platformStatus: string;
  phase: string;
  activeJobs: number;
  maxConcurrent: number;
  avgLatencyMs: number;
  bootStartedAt: number | null;
  bootElapsedMs: number;
  lastCheckedAt: number | null;
  lastError: string | null;
  totalServed: number;
  totalFailures: number;
  cooldownUntil: number;
};

export type TtsJobStatus =
  | "queued"
  | "waiting_for_server"
  | "synthesizing"
  | "processing_audio"
  | "completed"
  | "failed";

export type TtsJobInput = {
  text: string;
  voice: VoiceId;
  language: TtsLanguage;
  style: TtsStyle;
  speed: number;
  pitch: number;
  format: TtsFormat;
  bitrate: number;
  metadata: boolean;
  paragraphPauses: boolean;
  emphasizeNumbers: boolean;
  temperature?: number;
  topP?: number;
  preferredStudio?: string;
  ownerId?: string;
  customVoice?: {
    name: string;
    audioBase64: string;
    text?: string;
  } | null;
};

export type TtsJobSnapshot = {
  id: string;
  ownerId: string;
  status: TtsJobStatus;
  progress: number;
  stageLabel: string;
  assignedStudio: string | null;
  assignedStudioLabel: string | null;
  queuePosition: number | null;
  bootElapsedMs: number;
  elapsedMs: number;
  chunksDone: number;
  chunksTotal: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  expiresAt: number | null;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  storageKey: string | null;
  audioUrl: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  byteLength: number | null;
  durationSeconds: number | null;
  peaks: number[];
  format: TtsFormat;
  bitrate: number;
  voiceName: string;
  fileName: string;
  textPreview: string;
  charCount: number;
  error: string | null;
};

export type PoolStatusSnapshot = {
  poolState: "ready" | "booting" | "sleeping" | "degraded" | "unconfigured";
  configured: boolean;
  readyCount: number;
  bootingCount: number;
  sleepingCount: number;
  totalActiveJobs: number;
  queuedJobsCount: number;
  bootElapsedMs: number;
  bootPhase: string | null;
  bootingStudioLabel: string | null;
  wakeTriggered: boolean;
  studios: StudioSnapshot[];
  checkedAt: number;
};

type InternalStudio = StudioSnapshot & {
  config: StudioConfig;
  lastWakeAt: number;
  wakeInFlight: Promise<void> | null;
  consecutiveFailures: number;
};

type InternalJob = {
  id: string;
  ownerId: string;
  input: TtsJobInput;
  status: TtsJobStatus;
  progress: number;
  stageLabel: string;
  assignedStudio: string | null;
  assignedStudioLabel: string | null;
  bootStartedAt: number | null;
  chunksDone: number;
  chunksTotal: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  expiresAt: number | null;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  storageKey: string | null;
  audioFilePath: string | null;
  mimeType: string | null;
  byteLength: number | null;
  durationSeconds: number | null;
  peaks: number[];
  outputFormat: TtsFormat;
  voiceName: string;
  fileName: string;
  textPreviewOverride?: string;
  charCountOverride?: number;
  error: string | null;
  attempts: number;
};

type TtsStoredMeta = {
  voice?: VoiceId;
  voiceName?: string;
  language?: TtsLanguage;
  style?: TtsStyle;
  speed?: number;
  pitch?: number;
  format?: TtsFormat;
  bitrate?: number;
  peaks?: number[];
  textPreview?: string;
  charCount?: number;
  chunksTotal?: number;
  chunksDone?: number;
  assignedStudio?: string | null;
  assignedStudioLabel?: string | null;
  startedAt?: number | null;
  stageLabel?: string;
};

const JOB_TTL_MS = DEFAULT_GENERATION_TTL_MS;
const HEALTH_CACHE_MS = 6_000;
const BOOT_POLL_INTERVAL_MS = 5_000;
const WAKE_DEBOUNCE_MS = 180_000;
const FAILOVER_REQUEST_TIMEOUT_MS = 75_000;
const STUDIO_REQUEST_TIMEOUT_MS = 120_000;
const STREAM_HEADERS_TIMEOUT_MS = 90_000;
const STREAM_IDLE_TIMEOUT_MS = 45_000;
const STREAM_TOTAL_TIMEOUT_MS = 150_000;
const DRAMA3_PCM_SAMPLE_RATE = 44100;
const MANAGER_REVISION = 8;

type ReferencePayload = {
  voiceTag: string;
  audioBuffer: Buffer;
  audioBase64: string;
  text?: string;
};

type SynthesisSampling = {
  temperature?: number;
  topP?: number;
  maxNewTokens?: number;
};

function formatStudioHttpError(studioLabel: string, status: number, rawDetail: string): string {
  const trimmed = rawDetail.trim();
  const looksLikeHtml = trimmed.startsWith("<") || /<html/i.test(trimmed);
  if (status === 504 || /504 Gateway Time-out/i.test(trimmed)) {
    return `Voice server ${studioLabel} timed out behind gateway (HTTP 504).`;
  }
  if (status === 502 || status === 503) {
    return `Voice server ${studioLabel} was temporarily unavailable (HTTP ${status}).`;
  }
  if (looksLikeHtml) {
    return `Voice server ${studioLabel} returned an unexpected gateway error (HTTP ${status}).`;
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { detail?: unknown; error?: unknown };
      const msg =
        typeof parsed.detail === "string"
          ? parsed.detail
          : typeof parsed.error === "string"
            ? parsed.error
            : "";
      if (msg) return `${studioLabel}: ${msg.slice(0, 220)}`;
    } catch {
      // Fall through to plain excerpt
    }
  }
  return `${studioLabel} returned HTTP ${status}${trimmed ? `: ${trimmed.slice(0, 200)}` : ""}`;
}

function detectAudioFileInfo(buf: Buffer): { ext: string; mime: string } {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    return { ext: "wav", mime: "audio/wav" };
  }
  if (
    (buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3") ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS") {
    return { ext: "ogg", mime: "audio/ogg" };
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "fLaC") {
    return { ext: "flac", mime: "audio/flac" };
  }
  if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") {
    return { ext: "m4a", mime: "audio/mp4" };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: "webm", mime: "audio/webm" };
  }
  return { ext: "wav", mime: "audio/wav" };
}

class TtsManagementCore {
  public readonly revision = MANAGER_REVISION;
  private settings: PoolSettings;
  private studios: InternalStudio[];
  private jobs = new Map<string, InternalJob>();
  private studioVoiceIds = new Map<string, string>();
  private voiceRegisterInFlight = new Map<string, Promise<string | null>>();
  private readonly store = getGenerationStore();
  private cacheRoot: string;
  private refreshPromise: Promise<PoolStatusSnapshot> | null = null;
  private lastRefreshAt = 0;
  private bootTimer: ReturnType<typeof setInterval> | null = null;
  private pumpScheduled = false;
  private initPromise: Promise<void> | null = null;
  private lastStoreSyncByOwner = new Map<string, number>();

  constructor() {
    this.settings = loadPoolSettings();
    this.cacheRoot = path.join(os.tmpdir(), "frebies-tts-cache");
    this.store.onRemoved((removedIds) => {
      for (const id of removedIds) {
        this.jobs.delete(id);
        void fsp.unlink(path.join(this.cacheRoot, "jobs", `${id}.json`)).catch(() => {});
      }
    });
    this.studios = this.settings.studios.map((config) => ({
      config,
      id: config.id,
      label: config.label,
      owner: config.owner,
      repo: config.repo,
      apiUrl: config.apiUrl,
      visibility: "unknown",
      state: "unknown",
      platformStatus: "Unknown",
      phase: "Checking server status...",
      activeJobs: 0,
      maxConcurrent: this.settings.maxConcurrentPerStudio,
      avgLatencyMs: 6500,
      bootStartedAt: null,
      bootElapsedMs: 0,
      lastCheckedAt: null,
      lastError: null,
      totalServed: 0,
      totalFailures: 0,
      cooldownUntil: 0,
      lastWakeAt: 0,
      wakeInFlight: null,
      consecutiveFailures: 0,
    }));
  }

  private effectiveTtlMs(): number {
    return this.store.getCachedStats().ttlMs || JOB_TTL_MS;
  }

  private async ensureCacheDirs(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await fsp.mkdir(path.join(this.cacheRoot, "jobs"), { recursive: true });
        await fsp.mkdir(path.join(this.cacheRoot, "audio"), { recursive: true });
        await this.store.ensureInitialized();
        await this.cleanupExpiredJobs();
        await this.hydrateRecentJobs();
      })();
    }
    return this.initPromise;
  }

  private async syncCompletedFromStore(ownerId?: string, force = false): Promise<void> {
    const cacheKey = ownerId ?? "__all__";
    const now = Date.now();
    const lastSync = this.lastStoreSyncByOwner.get(cacheKey) ?? 0;
    if (!force && now - lastSync < 2500) {
      return;
    }
    this.lastStoreSyncByOwner.set(cacheKey, now);

    try {
      const stored = await this.store.listGenerations<TtsStoredMeta>({
        toolSlug: "audio/text-to-speech",
        ownerId,
        limit: ownerId ? 60 : 200,
      });

      for (const rec of stored) {
        if (rec.expiresAt <= now) continue;
        const existing = this.jobs.get(rec.id);
        if (existing && existing.status === "completed") continue;
        const meta = rec.meta ?? {};
        const format: TtsFormat = meta.format === "wav" ? "wav" : "mp3";
        const voiceName = meta.voiceName || "Aria";
        const preview = meta.textPreview || rec.fileName;

        const hydrated: InternalJob = {
          id: rec.id,
          ownerId: rec.ownerId,
          input: {
            text: preview,
            voice: meta.voice ?? "aria",
            language: meta.language ?? "en-US",
            style: meta.style ?? "narration",
            speed: meta.speed ?? 1,
            pitch: meta.pitch ?? 1,
            format,
            bitrate: meta.bitrate ?? 192,
            metadata: true,
            paragraphPauses: true,
            emphasizeNumbers: false,
            ownerId: rec.ownerId,
          },
          status: "completed",
          progress: 100,
          stageLabel: meta.stageLabel || "Stored on Tigris",
          assignedStudio: meta.assignedStudio ?? null,
          assignedStudioLabel: meta.assignedStudioLabel ?? null,
          bootStartedAt: null,
          chunksDone: meta.chunksDone ?? 1,
          chunksTotal: meta.chunksTotal ?? 1,
          createdAt: rec.createdAt,
          startedAt: meta.startedAt ?? rec.createdAt,
          completedAt: rec.completedAt,
          expiresAt: rec.expiresAt,
          ttlMs: rec.ttlMs,
          storageProvider: rec.storageProvider,
          storageKey: rec.storageKey,
          audioFilePath: null,
          mimeType: rec.mimeType,
          byteLength: rec.byteLength,
          durationSeconds: rec.durationSeconds ?? null,
          peaks: Array.isArray(meta.peaks) ? meta.peaks : [],
          outputFormat: format,
          voiceName,
          fileName: rec.fileName,
          textPreviewOverride: preview,
          charCountOverride: meta.charCount ?? preview.length,
          error: null,
          attempts: 1,
        };
        this.jobs.set(rec.id, hydrated);
      }
    } catch {
      // Ignore remote store hydration failure on transient errors
    }
  }

  private async hydrateRecentJobs(): Promise<void> {
    const ttlMs = this.effectiveTtlMs();
    const now = Date.now();
    const cutoff = now - ttlMs;

    // 1) Hydrate completed generations persisted in Tigris / R2 (or local GenerationStore fallback)
    await this.syncCompletedFromStore(undefined, true);

    // 2) Hydrate recent failed jobs from local transient metadata so "Try again" survives restarts
    try {
      const files = await fsp.readdir(path.join(this.cacheRoot, "jobs"));
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const full = path.join(this.cacheRoot, "jobs", file);
        try {
          const raw = await fsp.readFile(full, "utf-8");
          const parsed = JSON.parse(raw) as InternalJob;
          if (!parsed?.id || this.jobs.has(parsed.id) || (parsed.createdAt ?? 0) < cutoff) continue;
          const ownerId = parsed.ownerId || parsed.input?.ownerId || "guest:anonymous";
          if (parsed.status === "failed") {
            this.jobs.set(parsed.id, {
              ...parsed,
              ownerId,
              expiresAt: parsed.expiresAt ?? parsed.createdAt + ttlMs,
              ttlMs: parsed.ttlMs ?? ttlMs,
              storageProvider: parsed.storageProvider ?? null,
              storageKey: parsed.storageKey ?? null,
            });
          }
        } catch {
          // Skip corrupt or stale job entries
        }
      }
    } catch {
      // Ignore cache read error
    }
  }

  private pruneInMemoryExpiredJobs(): void {
    const now = Date.now();
    const defaultTtl = this.effectiveTtlMs();
    for (const [id, job] of this.jobs.entries()) {
      const exp = job.expiresAt ?? job.createdAt + defaultTtl;
      if ((job.status === "completed" || job.status === "failed") && exp <= now) {
        this.jobs.delete(id);
        void fsp.unlink(path.join(this.cacheRoot, "jobs", `${id}.json`)).catch(() => {});
      }
    }
  }

  private async cleanupExpiredJobs(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.effectiveTtlMs();
    this.pruneInMemoryExpiredJobs();

    try {
      const files = await fsp.readdir(path.join(this.cacheRoot, "jobs"));
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const full = path.join(this.cacheRoot, "jobs", file);
        const stat = await fsp.stat(full).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
          await fsp.unlink(full).catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup read errors on fresh dir
    }

    // Legacy local audio files older than TTL
    try {
      const audioFiles = await fsp.readdir(path.join(this.cacheRoot, "audio"));
      for (const file of audioFiles) {
        const full = path.join(this.cacheRoot, "audio", file);
        const stat = await fsp.stat(full).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
          await fsp.unlink(full).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  }

  private async persistJobMetadata(job: InternalJob): Promise<void> {
    try {
      await this.ensureCacheDirs();
      const target = path.join(this.cacheRoot, "jobs", `${job.id}.json`);
      if (job.status === "completed" && job.storageKey) {
        await fsp.unlink(target).catch(() => {});
        return;
      }
      const { audioBase64: _drop, ...safeCustom } = job.input.customVoice || { name: "", audioBase64: "" };
      const record = {
        ...job,
        input: {
          ...job.input,
          customVoice: job.input.customVoice ? safeCustom : null,
        },
      };
      await fsp.writeFile(target, JSON.stringify(record), "utf-8");
    } catch {
      // Non-fatal metadata persistence failure
    }
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (this.settings.token) {
      headers.Authorization = `Bearer ${this.settings.token}`;
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
  }

  private async probeSingleStudio(studio: InternalStudio, wakeIfDown: boolean): Promise<boolean> {
    const now = Date.now();
    let wakeTriggered = false;
    let healthHandled = false;

    // 1. Direct container /health probe first
    try {
      const res = await this.fetchWithTimeout(
        `${studio.apiUrl}/health`,
        { method: "GET", headers: this.authHeaders() },
        12_000,
      );

      if (res.ok) {
        const data = (await res.json()) as { status?: string; phase?: string; error?: string | null };
        const st = (data.status || "").toLowerCase();
        studio.lastCheckedAt = now;
        studio.lastError = null;

        if (st === "ready") {
          studio.state = "ready";
          studio.platformStatus = "Running";
          studio.phase =
            studio.cooldownUntil > now
              ? "Cooling down after timeout — routing traffic to healthy backup"
              : "Ready";
          studio.bootStartedAt = null;
          studio.bootElapsedMs = 0;
          healthHandled = true;
        } else if (st === "booting") {
          studio.state = "booting";
          studio.platformStatus = studio.platformStatus === "Unknown" ? "Deploying" : studio.platformStatus;
          studio.phase = data.phase || "Loading model into VRAM";
          if (!studio.bootStartedAt) studio.bootStartedAt = now;
          studio.bootElapsedMs = now - studio.bootStartedAt;
          healthHandled = true;
        } else if (st === "failed") {
          studio.state = "error";
          studio.platformStatus = "Failed";
          studio.phase = data.phase || "Startup failed";
          studio.lastError = data.error || data.phase || "Studio reported failed health";
          studio.bootStartedAt = null;
          healthHandled = false; // Check OpenAPI & consider recovery wake if requested
        }
      }
    } catch {
      // Container might be sleeping, starting up, or unreachable — inspect OpenAPI below
    }

    if (healthHandled) {
      return false;
    }

    // 2. ModelScope OpenAPI lifecycle check (when /health didn't report ready/booting)
    if (!this.settings.token) {
      studio.lastCheckedAt = now;
      studio.state = "error";
      studio.phase = "MODELSCOPE_API_TOKEN missing in environment";
      studio.lastError = "Set MODELSCOPE_API_TOKEN in .env.local";
      return false;
    }

    try {
      const metaRes = await this.fetchWithTimeout(
        `${this.settings.openApiEndpoint}/openapi/v1/studios/${studio.owner}/${studio.repo}`,
        { method: "GET", headers: this.authHeaders() },
        10_000,
      );

      if (metaRes.ok) {
        const json = (await metaRes.json()) as {
          data?: { status?: string; visibility?: string; runtime?: { status?: string } };
        };
        const data = json.data;
        const pStatus = data?.runtime?.status || data?.status || "Unknown";
        studio.visibility = data?.visibility || studio.visibility;
        studio.platformStatus = pStatus;
        studio.lastCheckedAt = now;

        const norm = pStatus.toLowerCase();
        if (norm === "building" || norm === "deploying" || norm === "starting" || norm === "initializing") {
          studio.state = "booting";
          if (!studio.bootStartedAt) studio.bootStartedAt = now;
          studio.bootElapsedMs = now - studio.bootStartedAt;
          studio.phase =
            norm === "building"
              ? "Preparing studio image..."
              : "Deploying container & loading model into VRAM...";
          return false;
        }

        if (norm === "running") {
          // Running in platform control plane, wait for port 7860 /health
          if (!studio.bootStartedAt) studio.bootStartedAt = now;
          studio.state = "booting";
          studio.bootElapsedMs = now - studio.bootStartedAt;
          studio.phase = "Starting speech runtime on GPU...";
          return false;
        }

        if (norm === "sleeping" || norm === "stopped" || norm === "offline" || norm.includes("fail")) {
          const canTriggerWake = wakeIfDown && now - studio.lastWakeAt > WAKE_DEBOUNCE_MS;
          if (canTriggerWake) {
            wakeTriggered = await this.triggerWakeStudio(studio);
          } else if (now - studio.lastWakeAt <= WAKE_DEBOUNCE_MS && studio.state === "booting") {
            studio.bootElapsedMs = studio.bootStartedAt ? now - studio.bootStartedAt : 0;
          } else {
            studio.state = norm.includes("fail") ? "error" : "sleeping";
            studio.bootStartedAt = null;
            studio.bootElapsedMs = 0;
            studio.phase = norm.includes("fail") ? `Studio ${pStatus}` : "Sleeping (auto-wakes on visit or request)";
          }
          return wakeTriggered;
        }
      }
    } catch (err) {
      studio.lastCheckedAt = now;
      studio.lastError = err instanceof Error ? err.message : "Failed to query ModelScope status";
    }

    return wakeTriggered;
  }

  public async restartStudio(studioId: string): Promise<PoolStatusSnapshot> {
    await this.ensureCacheDirs();
    const target = this.studios.find((s) => s.id === studioId);
    if (target) {
      await this.triggerWakeStudio(target, true);
      this.ensureBootMonitor();
    }
    return this.buildPoolSnapshot(Boolean(target));
  }

  private async triggerWakeStudio(studio: InternalStudio, forceDeploy = false): Promise<boolean> {
    if (studio.wakeInFlight) {
      await studio.wakeInFlight;
      return true;
    }

    const run = async () => {
      const now = Date.now();

      // Safety guard 1: Never call /deploy if the container's /health endpoint is already responding
      // (unless forceDeploy was explicitly requested via manual restart).
      if (!forceDeploy) {
        try {
          const healthRes = await this.fetchWithTimeout(
            `${studio.apiUrl}/health`,
            { method: "GET", headers: this.authHeaders() },
            5_000,
          );
          if (healthRes.ok) {
            const payload = (await healthRes.json()) as { status?: string; phase?: string };
            const st = (payload.status || "").toLowerCase();
            if (st === "ready") {
              studio.state = "ready";
              studio.platformStatus = "Running";
              studio.phase = "Ready";
              studio.bootStartedAt = null;
              studio.bootElapsedMs = 0;
              return;
            }
            if (st === "booting") {
              studio.state = "booting";
              studio.platformStatus = "Running";
              studio.phase = payload.phase || "Loading model into VRAM";
              if (!studio.bootStartedAt) studio.bootStartedAt = now;
              studio.bootElapsedMs = now - studio.bootStartedAt;
              return;
            }
          }
        } catch {
          // Container not reachable directly; inspect OpenAPI status next
        }
      }

      // Safety guard 2: Check ModelScope OpenAPI status before firing /deploy.
      // Calling POST /deploy on a studio that is already Running, Building, or Deploying
      // destroys the live container and forces a full rebuild/redeploy loop.
      if (this.settings.token) {
        try {
          const metaRes = await this.fetchWithTimeout(
            `${this.settings.openApiEndpoint}/openapi/v1/studios/${studio.owner}/${studio.repo}`,
            { method: "GET", headers: this.authHeaders() },
            8_000,
          );
          if (metaRes.ok) {
            const json = (await metaRes.json()) as {
              data?: { status?: string; runtime?: { status?: string } };
            };
            const pStatus = json.data?.runtime?.status || json.data?.status || "";
            const norm = pStatus.toLowerCase();
            if (
              norm === "building" ||
              norm === "deploying" ||
              norm === "starting" ||
              norm === "initializing" ||
              (!forceDeploy && norm === "running")
            ) {
              studio.platformStatus = pStatus || "Running";
              studio.state = "booting";
              if (!studio.bootStartedAt) studio.bootStartedAt = now;
              studio.bootElapsedMs = now - studio.bootStartedAt;
              studio.phase =
                norm === "building"
                  ? "Preparing studio image..."
                  : "Starting speech runtime on GPU...";
              return;
            }
          }
        } catch {
          // Proceed if metadata check fails
        }
      }

      studio.lastWakeAt = now;
      studio.state = "waking";
      studio.bootStartedAt = forceDeploy ? now : studio.bootStartedAt || now;
      studio.bootElapsedMs = now - studio.bootStartedAt;
      studio.phase = forceDeploy
        ? "Restarting ModelScope runtime via /deploy..."
        : "Waking ModelScope server from sleep...";
      studio.lastError = null;
      if (forceDeploy) {
        studio.cooldownUntil = now + 90_000;
        studio.consecutiveFailures = 0;
      }

      // Step 2: ModelScope OpenAPI deploy/restart trigger (only when truly sleeping/stopped/failed)
      if (!this.settings.token) return;
      try {
        const res = await this.fetchWithTimeout(
          `${this.settings.openApiEndpoint}/openapi/v1/studios/${studio.owner}/${studio.repo}/deploy`,
          { method: "POST", headers: this.authHeaders() },
          15_000,
        );
        if (res.ok) {
          const data = (await res.json()) as { data?: { status?: string } };
          studio.state = "booting";
          studio.platformStatus = data.data?.status || "Deploying";
          studio.phase = "Server wake triggered — starting ModelScope runtime...";
          studio.bootElapsedMs = Date.now() - (studio.bootStartedAt || now);
        } else {
          const text = await res.text().catch(() => "");
          studio.state = "error";
          studio.lastError = `Wake trigger failed (HTTP ${res.status}): ${text.slice(0, 160)}`;
          studio.phase = studio.lastError;
        }
      } catch (err) {
        studio.state = "error";
        studio.lastError = err instanceof Error ? err.message : "Failed to trigger ModelScope wake";
        studio.phase = studio.lastError;
      }
    };

    studio.wakeInFlight = run().finally(() => {
      studio.wakeInFlight = null;
      this.ensureBootMonitor();
    });

    await studio.wakeInFlight;
    return true;
  }

  public getCachedPoolSnapshot(): PoolStatusSnapshot {
    return this.buildPoolSnapshot(false);
  }

  public async getPoolStatus(options?: { wakeIfDown?: boolean; force?: boolean }): Promise<PoolStatusSnapshot> {
    await this.ensureCacheDirs();
    const wakeIfDown = Boolean(options?.wakeIfDown);
    const force = Boolean(options?.force);
    const now = Date.now();

    const needsWakeScan =
      wakeIfDown &&
      this.studios.some(
        (s) => (s.state === "sleeping" || s.state === "unknown") && now - s.lastWakeAt > WAKE_DEBOUNCE_MS,
      );

    if (!force && !needsWakeScan && now - this.lastRefreshAt < HEALTH_CACHE_MS && this.studios.some((s) => s.lastCheckedAt)) {
      return this.buildPoolSnapshot(false);
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      let anyWakeTriggered = false;
      const shouldWakeAll = wakeIfDown && this.settings.wakeAllOnVisit;

      if (shouldWakeAll) {
        const results = await Promise.all(
          this.studios.map((s) => this.probeSingleStudio(s, true)),
        );
        anyWakeTriggered = results.some(Boolean);
      } else {
        // Probe all first without waking; if none ready/booting and wakeIfDown, wake first sleeping studio
        await Promise.all(this.studios.map((s) => this.probeSingleStudio(s, false)));
        const hasReadyOrBooting = this.studios.some((s) => s.state === "ready" || s.state === "booting" || s.state === "waking");
        if (wakeIfDown && !hasReadyOrBooting) {
          const target = this.studios.find((s) => s.state === "sleeping" || s.state === "unknown");
          if (target) {
            anyWakeTriggered = await this.probeSingleStudio(target, true);
          }
        }
      }

      this.lastRefreshAt = Date.now();
      this.ensureBootMonitor();
      this.schedulePump();
      return this.buildPoolSnapshot(anyWakeTriggered);
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private buildPoolSnapshot(wakeTriggered: boolean): PoolStatusSnapshot {
    const now = Date.now();
    const snapshots: StudioSnapshot[] = this.studios.map((s) => {
      const bootElapsedMs =
        (s.state === "booting" || s.state === "waking") && s.bootStartedAt
          ? Math.max(0, now - s.bootStartedAt)
          : 0;
      const {
        config: _c,
        lastWakeAt: _lw,
        wakeInFlight: _wif,
        consecutiveFailures: _cf,
        ...rest
      } = s;
      return {
        ...rest,
        bootElapsedMs,
      };
    });

    const readyCount = snapshots.filter((s) => s.state === "ready").length;
    const bootingStudios = snapshots.filter((s) => s.state === "booting" || s.state === "waking");
    const bootingCount = bootingStudios.length;
    const sleepingCount = snapshots.filter((s) => s.state === "sleeping").length;
    const totalActiveJobs = snapshots.reduce((sum, s) => sum + s.activeJobs, 0);

    let queuedJobsCount = 0;
    for (const j of this.jobs.values()) {
      if (j.status === "queued" || j.status === "waiting_for_server") {
        queuedJobsCount += 1;
      }
    }

    let poolState: PoolStatusSnapshot["poolState"] = "unconfigured";
    if (snapshots.length === 0) {
      poolState = "unconfigured";
    } else if (readyCount > 0) {
      poolState = "ready";
    } else if (bootingCount > 0) {
      poolState = "booting";
    } else if (sleepingCount > 0) {
      poolState = "sleeping";
    } else {
      poolState = "degraded";
    }

    const earliestBoot = bootingStudios
      .filter((s) => s.bootStartedAt !== null)
      .sort((a, b) => (a.bootStartedAt ?? 0) - (b.bootStartedAt ?? 0))[0];

    return {
      poolState,
      configured: snapshots.length > 0 && Boolean(this.settings.token),
      readyCount,
      bootingCount,
      sleepingCount,
      totalActiveJobs,
      queuedJobsCount,
      bootElapsedMs: earliestBoot?.bootElapsedMs ?? 0,
      bootPhase: earliestBoot?.phase ?? null,
      bootingStudioLabel: earliestBoot?.label ?? null,
      wakeTriggered,
      studios: snapshots,
      checkedAt: now,
    };
  }

  private ensureBootMonitor(): void {
    const hasPendingJobs = Array.from(this.jobs.values()).some(
      (j) => j.status === "queued" || j.status === "waiting_for_server",
    );
    const hasBootingStudios = this.studios.some((s) => s.state === "booting" || s.state === "waking");

    if (!hasPendingJobs && !hasBootingStudios) {
      if (this.bootTimer) {
        clearInterval(this.bootTimer);
        this.bootTimer = null;
      }
      return;
    }

    if (!this.bootTimer) {
      this.bootTimer = setInterval(() => {
        const stillNeedsMonitor =
          Array.from(this.jobs.values()).some(
            (j) => j.status === "queued" || j.status === "waiting_for_server",
          ) || this.studios.some((s) => s.state === "booting" || s.state === "waking");

        if (!stillNeedsMonitor) {
          if (this.bootTimer) {
            clearInterval(this.bootTimer);
            this.bootTimer = null;
          }
          return;
        }

        const wakePending = Array.from(this.jobs.values()).some((j) => j.status === "waiting_for_server");
        void this.getPoolStatus({ wakeIfDown: wakePending, force: true }).then(() => {
          this.schedulePump();
        });
      }, BOOT_POLL_INTERVAL_MS);
    }
  }

  /**
   * Thinking Layer: pick the healthy studio with the smallest active queue.
   * Ties break on fewer recent errors, then lower historical latency EMA.
   * Technical callers may optionally pin a specific studio id.
   */
  private pickLeastQueueStudio(preferredStudioId?: string | null): InternalStudio | null {
    const now = Date.now();
    const candidates = this.studios.filter(
      (s) =>
        s.state === "ready" &&
        s.cooldownUntil <= now &&
        s.activeJobs < s.maxConcurrent,
    );

    if (candidates.length === 0) return null;

    if (preferredStudioId && preferredStudioId !== "auto") {
      const pinned = candidates.find((s) => s.id === preferredStudioId);
      return pinned ?? null;
    }

    candidates.sort((a, b) => {
      if (a.activeJobs !== b.activeJobs) return a.activeJobs - b.activeJobs;
      if (a.consecutiveFailures !== b.consecutiveFailures) {
        return a.consecutiveFailures - b.consecutiveFailures;
      }
      return a.avgLatencyMs - b.avgLatencyMs;
    });

    return candidates[0];
  }

  public async enqueueJob(input: TtsJobInput): Promise<TtsJobSnapshot> {
    await this.ensureCacheDirs();

    const chunks = prepareSpeechChunks(input.text, {
      style: input.style,
      paragraphPauses: input.paragraphPauses,
      emphasizeNumbers: input.emphasizeNumbers,
    });

    if (chunks.length === 0) {
      throw new Error("Please provide script text to synthesize.");
    }

    const id = `tts_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = Date.now();
    const voiceRef = input.customVoice ? null : getPresetVoiceReference(input.voice);
    const voiceName = input.customVoice?.name?.trim() || voiceRef?.name || input.voice;
    const ext = input.format === "wav" ? "wav" : "mp3";
    const fileName = `frebies-${voiceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(-6)}.${ext}`;

    // Fast-path: if pool has already been probed, don't block POST on OpenAPI latency
    const hasPriorProbe = this.studios.some((s) => s.lastCheckedAt !== null);
    let pool: PoolStatusSnapshot;
    if (!hasPriorProbe) {
      pool = await this.getPoolStatus({ wakeIfDown: true });
    } else {
      pool = this.buildPoolSnapshot(false);
      if (now - this.lastRefreshAt >= HEALTH_CACHE_MS || pool.readyCount === 0) {
        void this.getPoolStatus({ wakeIfDown: true });
      }
    }

    const preferredId = input.preferredStudio && input.preferredStudio !== "auto" ? input.preferredStudio : null;
    const hasReadySlot = this.pickLeastQueueStudio(preferredId) !== null;
    const isBooting = pool.readyCount === 0;
    const pinnedTarget = preferredId ? this.studios.find((s) => s.id === preferredId) : null;
    const pinnedNotReady = Boolean(pinnedTarget && pinnedTarget.state !== "ready");

    const ttlMs = this.effectiveTtlMs();
    const ownerId = input.ownerId?.trim();
    if (!ownerId) {
      throw new Error("Please sign in to queue voice synthesis.");
    }

    const job: InternalJob = {
      id,
      ownerId,
      input: { ...input, ownerId },
      status: hasReadySlot ? "queued" : isBooting || pinnedNotReady ? "waiting_for_server" : "queued",
      progress: hasReadySlot ? 5 : 2,
      stageLabel: hasReadySlot
        ? pinnedTarget
          ? `Queued for ${pinnedTarget.label}...`
          : "Queued for least-busy GPU studio..."
        : isBooting || pinnedNotReady
          ? `Server is booting (${pinnedTarget?.label || pool.bootingStudioLabel || "ModelScope"}) — task cached & auto-starts when ready`
          : "Queued — waiting for an open GPU slot...",
      assignedStudio: null,
      assignedStudioLabel: null,
      bootStartedAt:
        isBooting || pinnedNotReady
          ? pinnedTarget?.bootStartedAt ?? this.studios.find((s) => s.bootStartedAt !== null)?.bootStartedAt ?? now
          : null,
      chunksDone: 0,
      chunksTotal: chunks.length,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: now + ttlMs,
      ttlMs,
      storageProvider: null,
      storageKey: null,
      audioFilePath: null,
      mimeType: null,
      byteLength: null,
      durationSeconds: null,
      peaks: [],
      outputFormat: input.format,
      voiceName,
      fileName,
      error: null,
      attempts: 0,
    };

    this.jobs.set(id, job);
    await this.persistJobMetadata(job);
    this.ensureBootMonitor();
    this.pumpQueue();

    return this.toJobSnapshot(job);
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    const pendingJobs = Array.from(this.jobs.values())
      .filter((j) => j.status === "queued" || j.status === "waiting_for_server")
      .sort((a, b) => a.createdAt - b.createdAt);

    if (pendingJobs.length === 0) return;

    // Proactively wake sleeping standby studio when multiple jobs arrive
    const activeTotal = this.studios.reduce((sum, s) => sum + s.activeJobs, 0);
    if (pendingJobs.length + activeTotal >= 2) {
      const sleeping = this.studios.find(
        (s) => s.state === "sleeping" && Date.now() - s.lastWakeAt > WAKE_DEBOUNCE_MS,
      );
      if (sleeping) {
        void this.probeSingleStudio(sleeping, true);
      }
    }

    for (const job of pendingJobs) {
      const preferredId =
        job.input.preferredStudio && job.input.preferredStudio !== "auto" ? job.input.preferredStudio : null;
      const studio = this.pickLeastQueueStudio(preferredId);
      if (!studio) {
        // Ensure booting state stays reflected cleanly for queued user tasks
        const target = preferredId ? this.studios.find((s) => s.id === preferredId) : null;
        const anyReady = target ? target.state === "ready" : this.studios.some((s) => s.state === "ready");
        if (!anyReady) {
          job.status = "waiting_for_server";
          const booting = target ?? this.studios.find((s) => s.state === "booting" || s.state === "waking");
          if (booting && (booting.state === "booting" || booting.state === "waking")) {
            if (!job.bootStartedAt && booting.bootStartedAt) {
              job.bootStartedAt = booting.bootStartedAt;
            }
            job.stageLabel = `Server booting (${booting.label}: ${booting.phase}) — queued task cached`;
          } else {
            job.stageLabel = "Waking ModelScope server — cached task will start automatically";
            void this.getPoolStatus({ wakeIfDown: true, force: true });
          }
        } else {
          job.status = "queued";
          job.stageLabel = target
            ? `${target.label} is busy (${target.activeJobs}/${target.maxConcurrent}) — queued...`
            : "All GPU slots busy — queued for next available studio";
        }
        continue;
      }

      // Claim studio slot immediately before dispatching async work
      studio.activeJobs += 1;
      job.assignedStudio = studio.id;
      job.assignedStudioLabel = studio.label;
      job.status = "synthesizing";
      job.startedAt = job.startedAt ?? Date.now();
      job.progress = Math.max(job.progress, 8);
      job.stageLabel = `Synthesizing on ${studio.label}${preferredId ? " (pinned)" : " (least-queue route)"}...`;
      void this.executeJob(job, studio);
    }

    this.ensureBootMonitor();
  }

  private async resolveStudioVoiceId(
    studio: InternalStudio,
    reference: ReferencePayload,
  ): Promise<string | null> {
    const cacheKey = `${studio.id}::${reference.voiceTag}`;
    const cached = this.studioVoiceIds.get(cacheKey);
    if (cached) return cached;

    const pending = this.voiceRegisterInFlight.get(cacheKey);
    if (pending) return pending;

    const task = (async (): Promise<string | null> => {
      try {
        const listRes = await this.fetchWithTimeout(
          `${studio.apiUrl}/v1/voices`,
          { method: "GET", headers: this.authHeaders() },
          10_000,
        );
        if (listRes.status === 404 || listRes.status === 405) {
          return null;
        }
        if (listRes.ok) {
          const listJson = (await listRes.json()) as {
            voices?: Array<{ id?: string; name?: string }>;
          };
          const found = listJson.voices?.find(
            (v) => v.id && v.name === reference.voiceTag,
          );
          if (found?.id) {
            this.studioVoiceIds.set(cacheKey, found.id);
            return found.id;
          }
        }

        const audioInfo = detectAudioFileInfo(reference.audioBuffer);
        const form = new FormData();
        form.append(
          "audio",
          new Blob([new Uint8Array(reference.audioBuffer)], { type: audioInfo.mime }),
          `${reference.voiceTag}.${audioInfo.ext}`,
        );
        form.append("text", reference.text || "");
        form.append("name", reference.voiceTag);

        const uploadRes = await this.fetchWithTimeout(
          `${studio.apiUrl}/v1/voices`,
          { method: "POST", headers: this.authHeaders(), body: form },
          120_000,
        );
        if (!uploadRes.ok) {
          return null;
        }
        const created = (await uploadRes.json()) as { id?: string };
        if (created.id) {
          this.studioVoiceIds.set(cacheKey, created.id);
          return created.id;
        }
        return null;
      } catch {
        return null;
      }
    })().finally(() => {
      this.voiceRegisterInFlight.delete(cacheKey);
    });

    this.voiceRegisterInFlight.set(cacheKey, task);
    return task;
  }

  private hasReadyCandidate(preferredStudioId?: string | null): boolean {
    const now = Date.now();
    return this.studios.some((s) => {
      if (preferredStudioId && preferredStudioId !== "auto" && s.id !== preferredStudioId) {
        return false;
      }
      return s.state === "ready" && s.cooldownUntil <= now;
    });
  }

  private async readTtsAudioResponse(
    res: Response,
    studioLabel: string,
    onActivity: () => void,
  ): Promise<Buffer> {
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("text/event-stream") || !res.body) {
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      if (buf.length < 44) {
        throw new Error(`Studio ${studioLabel} returned empty audio payload`);
      }
      return buf;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const pcmChunks: Buffer[] = [];
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value && value.byteLength > 0) {
          onActivity();
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line.startsWith("data:")) {
              const rawJson = line.slice(5).trim();
              if (rawJson && rawJson !== "[DONE]") {
                let obj: Record<string, unknown> | null = null;
                try {
                  obj = JSON.parse(rawJson) as Record<string, unknown>;
                } catch {
                  obj = null;
                }
                if (obj) {
                  if (obj.error) {
                    throw new Error(`${studioLabel} stream error: ${String(obj.error).slice(0, 200)}`);
                  }
                  if (obj.type === "speech.audio.delta" && typeof obj.audio === "string") {
                    const chunk = Buffer.from(obj.audio, "base64");
                    if (chunk.length > 0) {
                      pcmChunks.push(chunk);
                    }
                  }
                }
              }
            }
            nl = buffer.indexOf("\n");
          }
        }
        if (done) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    if (pcmChunks.length === 0) {
      throw new Error(`Studio ${studioLabel} returned an empty audio stream`);
    }

    const pcmBuf = Buffer.concat(pcmChunks);
    if (pcmBuf.length < 32) {
      throw new Error(`Studio ${studioLabel} returned truncated audio stream`);
    }
    return buildWav(pcmBuf, DRAMA3_PCM_SAMPLE_RATE, 1, 16, 1);
  }

  private async callStudioTts(
    studio: InternalStudio,
    text: string,
    reference: ReferencePayload | null,
    sampling: SynthesisSampling = {},
  ): Promise<Buffer> {
    const started = Date.now();
    const referenceId = reference ? await this.resolveStudioVoiceId(studio, reference) : null;

    const sendAttempt = async (useRefId: string | null, useStream: boolean): Promise<Buffer> => {
      const temperature =
        typeof sampling.temperature === "number"
          ? Math.min(1.2, Math.max(0.2, sampling.temperature))
          : 0.72;
      const topP =
        typeof sampling.topP === "number"
          ? Math.min(1.0, Math.max(0.3, sampling.topP))
          : 0.8;

      const payload: Record<string, unknown> = {
        text,
        format: "wav",
        temperature,
        top_p: topP,
        ...(typeof sampling.maxNewTokens === "number"
          ? { max_new_tokens: Math.min(1024, Math.max(200, Math.round(sampling.maxNewTokens))) }
          : {}),
        ...(useStream ? { stream: true, stream_format: "sse" } : {}),
      };
      if (useRefId) {
        payload.reference_id = useRefId;
      } else if (reference?.audioBase64) {
        payload.references = [
          {
            audio_base64: reference.audioBase64,
            ...(reference.text ? { text: reference.text } : {}),
          },
        ];
      }

      const hasHealthyPeer = this.studios.some(
        (s) => s.id !== studio.id && s.state === "ready" && s.cooldownUntil <= Date.now(),
      );
      const bufferedTimeoutMs = hasHealthyPeer ? FAILOVER_REQUEST_TIMEOUT_MS : STUDIO_REQUEST_TIMEOUT_MS;

      const controller = new AbortController();
      let timeoutReason = "Request timed out";
      let stepTimer: ReturnType<typeof setTimeout> | null = null;
      const resetStepTimer = (ms: number, reason: string) => {
        if (stepTimer) clearTimeout(stepTimer);
        stepTimer = setTimeout(() => {
          timeoutReason = reason;
          controller.abort();
        }, ms);
      };

      const totalTimer = setTimeout(() => {
        timeoutReason = `${studio.label} exceeded ${Math.round(STREAM_TOTAL_TIMEOUT_MS / 1000)}s limit`;
        controller.abort();
      }, useStream ? STREAM_TOTAL_TIMEOUT_MS : bufferedTimeoutMs);

      resetStepTimer(
        useStream ? STREAM_HEADERS_TIMEOUT_MS : bufferedTimeoutMs,
        `${studio.label} timed out waiting for audio response`,
      );

      try {
        const res = await fetch(`${studio.apiUrl}/v1/tts`, {
          method: "POST",
          headers: this.authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          const err = new Error(formatStudioHttpError(studio.label, res.status, detail));
          (err as Error & { statusCode?: number }).statusCode = res.status;
          throw err;
        }

        const ctype = (res.headers.get("content-type") || "").toLowerCase();
        if (ctype.includes("text/event-stream")) {
          resetStepTimer(STREAM_IDLE_TIMEOUT_MS, `${studio.label} audio stream stalled`);
        } else {
          resetStepTimer(bufferedTimeoutMs, `${studio.label} timed out receiving audio`);
        }

        return await this.readTtsAudioResponse(res, studio.label, () => {
          resetStepTimer(STREAM_IDLE_TIMEOUT_MS, `${studio.label} audio stream stalled`);
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          const timedOut = new Error(timeoutReason);
          (timedOut as Error & { statusCode?: number; isTimeout?: boolean }).statusCode = 504;
          (timedOut as Error & { isTimeout?: boolean }).isTimeout = true;
          throw timedOut;
        }
        throw err;
      } finally {
        if (stepTimer) clearTimeout(stepTimer);
        clearTimeout(totalTimer);
      }
    };

    let buf: Buffer;
    let usedRefId = referenceId;
    try {
      buf = await sendAttempt(usedRefId, true);
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404 && reference && usedRefId) {
        this.studioVoiceIds.delete(`${studio.id}::${reference.voiceTag}`);
        usedRefId = null;
        buf = await sendAttempt(null, true);
      } else if (code === 400 || code === 501) {
        // Fallback to buffered WAV if backend rejects SSE stream flag
        buf = await sendAttempt(usedRefId, false);
      } else {
        throw err;
      }
    }

    const latency = Date.now() - started;
    studio.avgLatencyMs = Math.round(studio.avgLatencyMs * 0.7 + latency * 0.3);
    studio.consecutiveFailures = 0;
    studio.totalServed += 1;
    return buf;
  }

  private handleStudioChunkFailure(studio: InternalStudio, err: unknown): {
    code: number;
    msg: string;
    isTimeout: boolean;
    clientRejected: boolean;
  } {
    const code = (err as Error & { statusCode?: number }).statusCode ?? 502;
    const rawMsg = err instanceof Error ? err.message : "";
    const isTimeout =
      Boolean((err as Error & { isTimeout?: boolean }).isTimeout) ||
      code === 504 ||
      code === 408 ||
      (err instanceof Error && err.name === "AbortError") ||
      /aborted|timed out|stalled/i.test(rawMsg);
    const msg = isTimeout ? rawMsg || `Request to ${studio.label} timed out` : rawMsg;
    const isSleepingSubdomain = code === 400 && /InvalidArgument|Subdomain/i.test(rawMsg);
    const clientRejected = code >= 400 && code < 500 && code !== 408 && code !== 429 && !isSleepingSubdomain;

    if (clientRejected) {
      return { code, msg: msg || "Studio rejected request", isTimeout, clientRejected };
    }

    studio.consecutiveFailures += 1;
    studio.totalFailures += 1;
    studio.lastError = msg || "Studio failure";

    if (code === 503 || code === 502 || code === 504 || isTimeout || isSleepingSubdomain) {
      const backoffMs = studio.consecutiveFailures >= 2 ? 60_000 : 25_000;
      studio.cooldownUntil = Date.now() + backoffMs;
      if (isSleepingSubdomain) {
        studio.state = "sleeping";
        studio.bootStartedAt = null;
        if (Date.now() - studio.lastWakeAt > WAKE_DEBOUNCE_MS) {
          void this.triggerWakeStudio(studio, false);
        }
      } else {
        // Do NOT call triggerWakeStudio(..., true) on inference timeouts — firing /deploy
        // on a busy or warming studio kills the live container and causes a redeploy loop.
        // Instead, place the studio on temporary routing cooldown and probe /health.
        studio.phase = "Cooling down after timeout — routing traffic to healthy backup";
        void this.probeSingleStudio(studio, false);
      }
    }

    return { code, msg, isTimeout, clientRejected: false };
  }

  private async resolveReferencePayload(
    voice: VoiceId,
    customVoice?: { name?: string; audioBase64: string; text?: string } | null,
  ): Promise<ReferencePayload | null> {
    const presetRef = customVoice ? null : await getPresetVoiceReferenceAsync(voice);
    if (customVoice?.audioBase64) {
      const cleanB64 = customVoice.audioBase64.replace(/^data:[^,]+,/, "");
      const audioBuffer = Buffer.from(cleanB64, "base64");
      const text = customVoice.text?.trim() || undefined;
      const hash = crypto
        .createHash("sha256")
        .update(audioBuffer)
        .update(text || "")
        .digest("hex")
        .slice(0, 12);
      return {
        voiceTag: `frebies-custom-${hash}`,
        audioBuffer,
        audioBase64: cleanB64,
        text,
      };
    }
    if (presetRef) {
      return {
        voiceTag: `frebies-${presetRef.id}-${presetRef.contentHash}`,
        audioBuffer: presetRef.audioBuffer,
        audioBase64: presetRef.audioBase64,
        text: presetRef.text,
      };
    }
    return null;
  }

  /**
   * Run parallel segment synthesis across healthy ModelScope Drama 3 studios with
   * automatic failover. Caller must pass `initialStudio` with `activeJobs` already claimed.
   */
  private async synthesizeChunksWithPool(options: {
    chunks: { text: string; maxNewTokens?: number }[];
    refPayload: ReferencePayload | null;
    preferredId: string | null;
    initialStudio: InternalStudio;
    style: TtsStyle;
    temperature?: number;
    topP?: number;
    onStageLabel: (label: string) => void;
    onAssignedStudio: (studio: InternalStudio) => void;
    onChunkDone: (done: number, total: number, activeLabels: string[]) => void;
    onAttempt?: () => void;
  }): Promise<{ ok: true; wavs: Buffer[] } | { ok: false; requeueWaiting: true }> {
    const { chunks, refPayload, preferredId, initialStudio, style } = options;
    const maxPoolConcurrency = Math.max(
      1,
      this.studios.reduce((sum, s) => sum + s.maxConcurrent, 0),
    );
    const targetWorkers = Math.min(chunks.length, maxPoolConcurrency);

    const startingStudios: InternalStudio[] = [initialStudio];
    while (startingStudios.length < targetWorkers) {
      const extra = this.pickLeastQueueStudio(preferredId);
      if (!extra) break;
      extra.activeJobs += 1;
      startingStudios.push(extra);
    }

    const segmentWavs: (Buffer | null)[] = new Array(chunks.length).fill(null);
    const workerStudios = new Map<number, string>();
    let nextChunkIdx = 0;
    let completedChunks = 0;
    let fatalError: Error | null = null;
    let shouldRequeueWaiting = false;

    const updateParallelStageLabel = () => {
      const activeLabels = Array.from(new Set(workerStudios.values()));
      options.onChunkDone(completedChunks, chunks.length, activeLabels);
      const hosts = activeLabels.length > 0 ? activeLabels.join(" + ") : initialStudio.label || "GPU";
      if (chunks.length === 1) {
        options.onStageLabel(`Generating speech on ${hosts}...`);
      } else if (activeLabels.length > 1) {
        options.onStageLabel(`Generating in parallel on ${hosts} (${completedChunks}/${chunks.length} ready)...`);
      } else {
        options.onStageLabel(`Generating on ${hosts} (${completedChunks}/${chunks.length} segments)...`);
      }
    };

    const runWorker = async (workerId: number, firstStudio: InternalStudio) => {
      let heldStudio: InternalStudio | null = firstStudio;
      try {
        while (!fatalError && !shouldRequeueWaiting) {
          const myIdx = nextChunkIdx;
          if (myIdx >= chunks.length) break;
          nextChunkIdx += 1;

          const chunk = chunks[myIdx];
          let chunkRetries = 0;
          const maxChunkRetries = Math.max(1, this.studios.length);

          while (!fatalError && !shouldRequeueWaiting) {
            if (!heldStudio) break;
            workerStudios.set(workerId, heldStudio.label);
            updateParallelStageLabel();

            try {
              const baseTemp = options.temperature ?? 0.72;
              const moodTemp =
                style === "cheerful"
                  ? Math.min(1.0, Math.max(baseTemp, 0.84))
                  : style === "narration"
                    ? Math.min(baseTemp, 0.65)
                    : baseTemp;
              const wav = await this.callStudioTts(heldStudio, chunk.text, refPayload, {
                temperature: moodTemp,
                topP: options.topP,
                maxNewTokens: chunk.maxNewTokens,
              });
              segmentWavs[myIdx] = wav;
              completedChunks += 1;
              options.onAssignedStudio(heldStudio);
              updateParallelStageLabel();
              break;
            } catch (err) {
              const failedStudio = heldStudio;
              const info = this.handleStudioChunkFailure(failedStudio, err);
              failedStudio.activeJobs = Math.max(0, failedStudio.activeJobs - 1);
              heldStudio = null;
              workerStudios.delete(workerId);

              if (info.clientRejected) {
                fatalError = new Error(info.msg);
                return;
              }

              options.onAttempt?.();
              chunkRetries += 1;
              if (chunkRetries > maxChunkRetries) {
                fatalError = new Error(info.msg || "Synthesis failed after failover retries");
                return;
              }

              let fallback = this.pickLeastQueueStudio(preferredId);
              if (!fallback && this.hasReadyCandidate(preferredId)) {
                for (let waitStep = 0; waitStep < 24 && !fallback && !fatalError && !shouldRequeueWaiting; waitStep += 1) {
                  if (!this.hasReadyCandidate(preferredId)) break;
                  await new Promise((resolve) => setTimeout(resolve, 1200));
                  fallback = this.pickLeastQueueStudio(preferredId);
                }
              }

              if (fallback) {
                fallback.activeJobs += 1;
                heldStudio = fallback;
                options.onAssignedStudio(fallback);
                options.onStageLabel(`Re-routing segment ${myIdx + 1} to ${fallback.label}...`);
                continue;
              }

              if (completedChunks === 0) {
                shouldRequeueWaiting = true;
                return;
              }

              fatalError = new Error(info.msg || "Voice servers became unavailable mid-generation");
              return;
            }
          }
        }
      } finally {
        workerStudios.delete(workerId);
        if (heldStudio) {
          heldStudio.activeJobs = Math.max(0, heldStudio.activeJobs - 1);
          heldStudio = null;
        }
      }
    };

    await Promise.all(startingStudios.map((studio, i) => runWorker(i, studio)));

    if (shouldRequeueWaiting && !fatalError) {
      return { ok: false, requeueWaiting: true };
    }
    if (fatalError) {
      throw fatalError;
    }

    const wavs = chunks.map((_, idx) => {
      const wav = segmentWavs[idx];
      if (!wav) {
        throw new Error(`Missing synthesized segment ${idx + 1} of ${chunks.length}`);
      }
      return wav;
    });
    return { ok: true, wavs };
  }

  /**
   * Public pooled synthesis helper reused by sibling AI workflows (such as Video Dubbing).
   * Automatically wakes sleeping studios and waits until a slot becomes available.
   */
  public async synthesizeSegmentPool(options: {
    segments: { text: string; maxNewTokens?: number }[];
    voice: VoiceId;
    customVoice?: { name?: string; audioBase64: string; text?: string } | null;
    preferredStudio?: string;
    style?: TtsStyle;
    temperature?: number;
    topP?: number;
    maxWaitMs?: number;
    onWaiting?: (bootingLabel: string | null, phase: string | null) => void;
    onProgress?: (done: number, total: number, studioLabel: string | null) => void;
    onStageLabel?: (label: string) => void;
  }): Promise<{ wavs: Buffer[]; studioLabel: string | null }> {
    await this.ensureCacheDirs();
    const preferredId =
      options.preferredStudio && options.preferredStudio !== "auto" ? options.preferredStudio : null;
    const refPayload = await this.resolveReferencePayload(options.voice, options.customVoice);
    const maxWaitMs = options.maxWaitMs ?? 480_000;
    const deadline = Date.now() + maxWaitMs;
    let lastAssignedLabel: string | null = null;

    while (Date.now() < deadline) {
      await this.getPoolStatus({ wakeIfDown: true, force: true });
      const studio = this.pickLeastQueueStudio(preferredId);

      if (!studio) {
        const booting =
          this.studios.find((s) => s.state === "booting" || s.state === "waking") ??
          this.studios[0] ??
          null;
        options.onWaiting?.(booting?.label ?? null, booting?.phase ?? null);
        await new Promise((resolve) => setTimeout(resolve, 6_000));
        continue;
      }

      studio.activeJobs += 1;
      lastAssignedLabel = studio.label;
      let passedToPool = false;

      try {
        passedToPool = true;
        const result = await this.synthesizeChunksWithPool({
          chunks: options.segments,
          refPayload,
          preferredId,
          initialStudio: studio,
          style: options.style ?? "neutral",
          temperature: options.temperature,
          topP: options.topP,
          onStageLabel: (label) => options.onStageLabel?.(label),
          onAssignedStudio: (s) => {
            lastAssignedLabel = s.label;
          },
          onChunkDone: (done, total, activeLabels) => {
            options.onProgress?.(done, total, activeLabels[0] ?? lastAssignedLabel);
          },
        });

        if (result.ok) {
          return { wavs: result.wavs, studioLabel: lastAssignedLabel };
        }
        options.onWaiting?.(lastAssignedLabel, "Restarting voice server");
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      } finally {
        if (!passedToPool) {
          studio.activeJobs = Math.max(0, studio.activeJobs - 1);
        }
        this.schedulePump();
      }
    }

    throw new Error("Timed out waiting for a healthy ModelScope voice studio.");
  }

  private async executeJob(job: InternalJob, initialStudio: InternalStudio): Promise<void> {
    let initialOwnedByCaller = true;

    try {
      const chunks = prepareSpeechChunks(job.input.text, {
        style: job.input.style,
        paragraphPauses: job.input.paragraphPauses,
        emphasizeNumbers: job.input.emphasizeNumbers,
      });

      const refPayload = await this.resolveReferencePayload(job.input.voice, job.input.customVoice);
      const preferredId =
        job.input.preferredStudio && job.input.preferredStudio !== "auto" ? job.input.preferredStudio : null;

      initialOwnedByCaller = false;
      const poolResult = await this.synthesizeChunksWithPool({
        chunks,
        refPayload,
        preferredId,
        initialStudio,
        style: job.input.style,
        temperature: job.input.temperature,
        topP: job.input.topP,
        onStageLabel: (label) => {
          job.stageLabel = label;
        },
        onAssignedStudio: (studio) => {
          job.assignedStudio = studio.id;
          job.assignedStudioLabel = studio.label;
        },
        onChunkDone: (done, total) => {
          job.chunksDone = done;
          job.progress = 10 + Math.round((done / Math.max(1, total)) * 75);
        },
        onAttempt: () => {
          job.attempts += 1;
        },
      });

      if (!poolResult.ok) {
        job.status = "waiting_for_server";
        job.progress = 5;
        job.chunksDone = 0;
        job.assignedStudio = null;
        job.assignedStudioLabel = null;
        job.stageLabel = "Server restarting/booting — cached task will auto-retry when ready";
        await this.persistJobMetadata(job);
        void this.getPoolStatus({ wakeIfDown: true, force: true });
        return;
      }

      const wavSegments = chunks.map((chunk, idx) => ({
        wav: poolResult.wavs[idx],
        pauseAfterMs: chunk.pauseAfterMs,
      }));

      job.status = "processing_audio";
      job.progress = 88;
      job.stageLabel =
        job.input.format === "mp3"
          ? `Mastering MP3 (${job.input.bitrate} kbps)...`
          : "Finalizing studio WAV output...";

      const stitched = concatWavSegments(wavSegments);
      const finalAudio = await postProcessWav(stitched.wav, stitched.sampleRate, {
        format: job.input.format,
        bitrate: job.input.bitrate,
        speed: job.input.speed,
        pitch: job.input.pitch,
        metadata: job.input.metadata,
        voiceName: job.voiceName,
        title: job.input.text.slice(0, 64).trim() || "frebies voiceover",
      });

      const finalExt = finalAudio.format === "wav" ? "wav" : "mp3";
      job.outputFormat = finalAudio.format;
      job.fileName = job.fileName.replace(/\.(mp3|wav)$/i, `.${finalExt}`);
      const completedAt = Date.now();
      const durationSeconds = Number(finalAudio.durationSeconds.toFixed(2));
      const textPreview = job.input.text.replace(/\s+/g, " ").trim().slice(0, 96);
      const completedStageLabel = `Completed via ${job.assignedStudioLabel || "ModelScope"}`;

      job.stageLabel = "Uploading audio to storage...";
      const stored = await this.store.saveArtifact<TtsStoredMeta>({
        id: job.id,
        toolSlug: "audio/text-to-speech",
        ownerId: job.ownerId,
        fileName: job.fileName,
        mimeType: finalAudio.mimeType,
        buffer: finalAudio.buffer,
        createdAt: job.createdAt,
        completedAt,
        durationSeconds,
        meta: {
          voice: job.input.voice,
          voiceName: job.voiceName,
          language: job.input.language,
          style: job.input.style,
          speed: job.input.speed,
          pitch: job.input.pitch,
          format: finalAudio.format,
          bitrate: job.input.bitrate,
          peaks: finalAudio.peaks,
          textPreview,
          charCount: job.input.text.length,
          chunksTotal: job.chunksTotal,
          chunksDone: job.chunksDone,
          assignedStudio: job.assignedStudio,
          assignedStudioLabel: job.assignedStudioLabel,
          startedAt: job.startedAt,
          stageLabel: completedStageLabel,
        },
      });

      job.storageProvider = stored.record.storageProvider;
      job.storageKey = stored.record.storageKey;
      job.expiresAt = stored.record.expiresAt;
      job.ttlMs = stored.record.ttlMs;
      job.audioFilePath = null;
      job.mimeType = stored.record.mimeType;
      job.byteLength = stored.record.byteLength;
      job.durationSeconds = durationSeconds;
      job.peaks = finalAudio.peaks;
      job.textPreviewOverride = textPreview;
      job.charCountOverride = job.input.text.length;
      job.status = "completed";
      job.progress = 100;
      job.completedAt = completedAt;
      job.stageLabel = completedStageLabel;
      await this.persistJobMetadata(job);
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Voice synthesis failed";
      job.stageLabel = "Failed";
      job.completedAt = Date.now();
      job.expiresAt = job.completedAt + this.effectiveTtlMs();
      await this.persistJobMetadata(job);
    } finally {
      if (initialOwnedByCaller) {
        initialStudio.activeJobs = Math.max(0, initialStudio.activeJobs - 1);
      }
      this.schedulePump();
    }
  }

  public async retryJob(jobId: string, ownerId?: string): Promise<TtsJobSnapshot | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (ownerId !== undefined && job.ownerId !== ownerId) return null;
    if (job.status === "synthesizing" || job.status === "processing_audio") {
      return this.toJobSnapshot(job);
    }
    job.status = "queued";
    job.progress = 4;
    job.error = null;
    job.attempts = 0;
    job.chunksDone = 0;
    job.completedAt = null;
    job.expiresAt = Date.now() + this.effectiveTtlMs();
    job.stageLabel = "Re-queued for generation...";
    await this.persistJobMetadata(job);
    await this.getPoolStatus({ wakeIfDown: true, force: true });
    this.pumpQueue();
    return this.toJobSnapshot(job);
  }

  public async deleteJob(jobId: string, ownerId?: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (job) {
      if (ownerId !== undefined && job.ownerId !== ownerId) return false;
      if (job.status === "synthesizing" || job.status === "processing_audio") {
        return false;
      }
      this.jobs.delete(jobId);
      if (job.audioFilePath) {
        await fsp.unlink(job.audioFilePath).catch(() => {});
      }
      await fsp.unlink(path.join(this.cacheRoot, "jobs", `${jobId}.json`)).catch(() => {});
      await this.store.deleteGeneration(jobId, ownerId).catch(() => false);
      this.schedulePump();
      return true;
    }

    return this.store.deleteGeneration(jobId, ownerId);
  }

  public getJob(jobId: string, ownerId?: string): TtsJobSnapshot | null {
    this.pruneInMemoryExpiredJobs();
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (ownerId !== undefined && job.ownerId !== ownerId) return null;
    return this.toJobSnapshot(job);
  }

  public async getJobAsync(jobId: string, ownerId?: string): Promise<TtsJobSnapshot | null> {
    await this.ensureCacheDirs();
    const local = this.getJob(jobId, ownerId);
    if (local && (local.status === "completed" || local.status === "failed")) {
      return local;
    }
    await this.syncCompletedFromStore(ownerId, true);
    return this.getJob(jobId, ownerId);
  }

  public async waitForJob(jobId: string, timeoutMs = 285_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = this.jobs.get(jobId);
      if (!job || job.status === "completed" || job.status === "failed") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  public async listJobsAsync(ownerId?: string): Promise<TtsJobSnapshot[]> {
    await this.ensureCacheDirs();
    await this.syncCompletedFromStore(ownerId);
    return this.listJobs(ownerId);
  }

  public listJobs(ownerId?: string): TtsJobSnapshot[] {
    this.pruneInMemoryExpiredJobs();
    return Array.from(this.jobs.values())
      .filter((j) => ownerId === undefined || j.ownerId === ownerId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 60)
      .map((j) => this.toJobSnapshot(j));
  }

  public async getStorageStats(ownerId?: string): Promise<GenerationStorageStats> {
    await this.ensureCacheDirs();
    return this.store.getStorageStats(ownerId);
  }

  public getCachedStorageStats(ownerId?: string): GenerationStorageStats {
    return this.store.getCachedStats(ownerId);
  }

  public async readJobAudio(
    jobId: string,
    ownerId?: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    expiresAt: number;
  } | null> {
    await this.ensureCacheDirs();
    const fromStore = await this.store.readArtifact(jobId, ownerId);
    if (fromStore) {
      return {
        buffer: fromStore.buffer,
        mimeType: fromStore.record.mimeType || "audio/mpeg",
        fileName: fromStore.record.fileName,
        expiresAt: fromStore.record.expiresAt,
      };
    }

    // Backwards-compatible legacy local file read if not yet migrated
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "completed" || !job.audioFilePath) return null;
    if (ownerId !== undefined && job.ownerId !== ownerId) return null;
    try {
      const buffer = await fsp.readFile(job.audioFilePath);
      return {
        buffer,
        mimeType: job.mimeType || "audio/mpeg",
        fileName: job.fileName,
        expiresAt: job.expiresAt ?? job.createdAt + this.effectiveTtlMs(),
      };
    } catch {
      return null;
    }
  }

  public async getSignedJobAudioUrl(
    jobId: string,
    opts?: { ownerId?: string; download?: boolean },
  ): Promise<string | null> {
    await this.ensureCacheDirs();
    return this.store.getSignedDownloadUrl(jobId, {
      ownerId: opts?.ownerId,
      download: opts?.download,
      expiresInSeconds: 3600,
    });
  }

  private toJobSnapshot(job: InternalJob): TtsJobSnapshot {
    const now = Date.now();
    const pendingOrder = Array.from(this.jobs.values())
      .filter((j) => j.status === "queued" || j.status === "waiting_for_server")
      .sort((a, b) => a.createdAt - b.createdAt);
    const idx = pendingOrder.findIndex((j) => j.id === job.id);
    const queuePosition = idx >= 0 ? idx + 1 : null;

    let bootElapsedMs = 0;
    if (job.status === "waiting_for_server") {
      const activeBoot = this.studios.find((s) => s.bootStartedAt !== null)?.bootStartedAt ?? job.bootStartedAt;
      if (activeBoot) bootElapsedMs = Math.max(0, now - activeBoot);
    }

    const elapsedMs = (job.completedAt ?? now) - job.createdAt;
    const textPreview = job.textPreviewOverride ?? job.input.text.replace(/\s+/g, " ").trim().slice(0, 96);
    const charCount = job.charCountOverride ?? job.input.text.length;
    const ttlMs = job.ttlMs || this.effectiveTtlMs();
    const expiresAt = job.expiresAt ?? (job.completedAt ?? job.createdAt) + ttlMs;

    return {
      id: job.id,
      ownerId: job.ownerId,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      assignedStudio: job.assignedStudio,
      assignedStudioLabel: job.assignedStudioLabel,
      queuePosition,
      bootElapsedMs,
      elapsedMs: Math.max(0, elapsedMs),
      chunksDone: job.chunksDone,
      chunksTotal: job.chunksTotal,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt,
      ttlMs,
      storageProvider: job.storageProvider,
      storageKey: job.storageKey,
      audioUrl: job.status === "completed" ? `/api/audio/tts/jobs/${job.id}/audio` : null,
      downloadUrl: job.status === "completed" ? `/api/audio/tts/jobs/${job.id}/audio?download=1` : null,
      mimeType: job.mimeType,
      byteLength: job.byteLength,
      durationSeconds: job.durationSeconds,
      peaks: job.peaks,
      format: job.outputFormat,
      bitrate: job.input.bitrate,
      voiceName: job.voiceName,
      fileName: job.fileName,
      textPreview,
      charCount,
      error: job.error,
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __frebiesTtsManager: TtsManagementCore | undefined;
}

export function getTtsManager(): TtsManagementCore {
  const current = globalThis.__frebiesTtsManager as (TtsManagementCore & { revision?: number }) | undefined;
  if (!current || current.revision !== MANAGER_REVISION) {
    const fresh = new TtsManagementCore();
    globalThis.__frebiesTtsManager = fresh;
    return fresh;
  }
  return current;
}
