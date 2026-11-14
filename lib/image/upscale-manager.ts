import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  ALL_UPSCALE_MODELS,
  DEFAULT_UPSCALE_SETTINGS,
  getUpscaleModelMeta,
  type UpscaleContentProfile,
  type UpscaleEngineModel,
  type UpscaleFactor,
  type UpscaleFormat,
  type UpscaleJobSnapshot,
  type UpscaleJobStatus,
  type UpscaleTargetPreset,
  type UpscaleTier,
} from "@/components/tool/upscaler/model";
import { resolveFfmpegPath } from "@/lib/audio/wav-utils";
import {
  buildGpuStudioAuthHeaders,
  ensureGpuStudioReady,
  getGpuStudioBaseUrl,
  getGpuStudioStatus,
  type GpuStudioStatusSnapshot,
} from "@/lib/gpu/upscaler-vocal-studio";
import {
  getGenerationStore,
  type GenerationStorageStats,
  type StorageProviderKind,
} from "@/lib/storage/generation-store";
import { DEFAULT_GENERATION_TTL_MS } from "@/lib/storage/retention";

const execFileAsync = promisify(execFile);

export const UPSCALE_TOOL_SLUG = "image/upscaler";
export const UPSCALE_SOURCE_TOOL_SLUG = "image/upscaler-source";
const UPSCALE_MANAGER_REVISION = 1;

export type CreateUpscaleJobInput = {
  ownerId: string;
  sourceFileName: string;
  sourceMimeType: string;
  imageBuffer: Buffer;
  originalWidth?: number;
  originalHeight?: number;
  tier?: UpscaleTier;
  engineModel?: UpscaleEngineModel;
  profile?: UpscaleContentProfile;
  factor?: UpscaleFactor;
  targetPreset?: UpscaleTargetPreset;
  face?: boolean;
  denoise?: number;
  sharpen?: number;
  colorFix?: boolean;
  format?: UpscaleFormat;
  quality?: number;
  transparency?: boolean;
  backgroundColor?: string;
  metadata?: boolean;
};

type NormalizedUpscaleInput = {
  ownerId: string;
  sourceFileName: string;
  sourceMimeType: string;
  originalWidth: number;
  originalHeight: number;
  tier: UpscaleTier;
  engineModel: UpscaleEngineModel;
  profile: UpscaleContentProfile;
  factor: UpscaleFactor;
  targetPreset: UpscaleTargetPreset;
  face: boolean;
  denoise: number;
  sharpen: number;
  colorFix: boolean;
  format: UpscaleFormat;
  quality: number;
  transparency: boolean;
  backgroundColor: string;
  metadata: boolean;
};

type InternalUpscaleJob = {
  id: string;
  ownerId: string;
  input: NormalizedUpscaleInput;
  tempSourceImagePath: string | null;
  status: UpscaleJobStatus;
  progress: number;
  stageLabel: string;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  sourceGenId: string | null;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  precision: string;
  timeTakenMs: number | null;
  byteLength: number | null;
  fileName: string;
  error: string | null;
};

type UpscaleStoredMeta = {
  sourceGenId?: string | null;
  sourceFileName?: string;
  originalWidth?: number;
  originalHeight?: number;
  width?: number;
  height?: number;
  factor?: UpscaleFactor;
  targetPreset?: UpscaleTargetPreset;
  tier?: UpscaleTier;
  engineModel?: UpscaleEngineModel;
  modelLabel?: string;
  precision?: string;
  profile?: UpscaleContentProfile;
  format?: UpscaleFormat;
  quality?: number;
  denoise?: number;
  sharpen?: number;
  face?: boolean;
  colorFix?: boolean;
  timeTakenMs?: number | null;
  stageLabel?: string;
};

function sanitizeHexColor(raw: unknown): string {
  if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return "#ffffff";
}

function buildOutputFileName(sourceFileName: string, factor: UpscaleFactor, format: UpscaleFormat): string {
  const stem =
    sourceFileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "image";
  return `${stem}-${factor}x.${format}`;
}

function mimeForFormat(format: UpscaleFormat): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "image/jpeg";
}

async function postProcessUpscaledImage(
  rawBuffer: Buffer,
  options: {
    format: UpscaleFormat;
    quality: number;
    denoise: number;
    sharpen: number;
    transparency: boolean;
    backgroundColor: string;
    metadata: boolean;
  },
): Promise<{ buffer: Buffer; mimeType: string }> {
  const ffmpeg = resolveFfmpegPath();
  const isDefaultJpg =
    options.format === "jpg" &&
    options.denoise <= 0 &&
    options.sharpen <= 0 &&
    options.quality >= 94 &&
    options.quality <= 96 &&
    options.metadata;

  if (!ffmpeg || isDefaultJpg) {
    // Fallback gracefully without re-encoding if ffmpeg binary isn't present or JPEG already matches
    return {
      buffer: rawBuffer,
      mimeType: "image/jpeg",
    };
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-upscale-pp-"));
  const inPath = path.join(workDir, "raw.jpg");
  const outPath = path.join(workDir, `out.${options.format}`);

  try {
    await fsp.writeFile(inPath, rawBuffer);
    const vf: string[] = [];

    if (options.denoise > 0) {
      const luma = Math.max(0.5, (options.denoise / 100) * 3.5);
      const chroma = Math.max(0.5, luma * 0.85);
      vf.push(`hqdn3d=${luma.toFixed(2)}:${chroma.toFixed(2)}:0:0`);
    }

    if (options.sharpen > 0) {
      const amount = Math.min(1.6, Math.max(0.15, (options.sharpen / 100) * 1.4));
      vf.push(`unsharp=5:5:${amount.toFixed(2)}:3:3:0.0`);
    }

    if (options.format === "png" || options.format === "webp") {
      vf.push(options.transparency ? "format=rgba" : "format=rgb24");
    } else {
      vf.push("format=rgb24");
    }

    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", inPath];
    if (vf.length > 0) {
      args.push("-vf", vf.join(","));
    }

    if (!options.metadata) {
      args.push("-map_metadata", "-1");
    }

    if (options.format === "png") {
      args.push("-compression_level", "6", outPath);
    } else if (options.format === "webp") {
      args.push("-quality", String(Math.round(options.quality)), outPath);
    } else {
      // Map quality 60-100 to ffmpeg MJPEG q:v 8..1
      const qv = Math.max(1, Math.min(12, Math.round(((100 - options.quality) / 40) * 9) + 1));
      args.push("-q:v", String(qv), outPath);
    }

    await execFileAsync(ffmpeg, args, { timeout: 90_000 });
    const outBuf = await fsp.readFile(outPath);
    if (outBuf.length > 128) {
      return {
        buffer: outBuf,
        mimeType: mimeForFormat(options.format),
      };
    }
  } catch {
    // Fall back to raw Studio JPEG bytes if post-processing fails
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    buffer: rawBuffer,
    mimeType: "image/jpeg",
  };
}

class UpscaleManagerCore {
  public readonly revision = UPSCALE_MANAGER_REVISION;
  private readonly store = getGenerationStore();
  private readonly cacheRoot = path.join(os.tmpdir(), "frebies-upscale-cache");
  private readonly jobs = new Map<string, InternalUpscaleJob>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await fsp.mkdir(path.join(this.cacheRoot, "jobs"), { recursive: true });
      await this.restoreRecentJobs();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  private async restoreRecentJobs(): Promise<void> {
    const now = Date.now();
    try {
      const files = await fsp.readdir(path.join(this.cacheRoot, "jobs"));
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const full = path.join(this.cacheRoot, "jobs", file);
        try {
          const parsed = JSON.parse(await fsp.readFile(full, "utf8")) as InternalUpscaleJob;
          if (!parsed?.id || parsed.expiresAt <= now) {
            await fsp.unlink(full).catch(() => {});
            continue;
          }
          if (parsed.status !== "completed" && parsed.status !== "failed") {
            parsed.status = "failed";
            parsed.error = "Interrupted by worker restart. Click Retry to upscale again.";
            parsed.stageLabel = "Interrupted";
          }
          this.jobs.set(parsed.id, parsed);
        } catch {
          await fsp.unlink(full).catch(() => {});
        }
      }
    } catch {
      // Ignore missing temp cache
    }

    const stored = await this.store.listGenerations<UpscaleStoredMeta>({
      toolSlug: UPSCALE_TOOL_SLUG,
      limit: 80,
    });

    for (const rec of stored) {
      if (this.jobs.has(rec.id)) continue;
      const meta = (rec.meta ?? {}) as UpscaleStoredMeta;
      const engineModel: UpscaleEngineModel =
        ALL_UPSCALE_MODELS.some((m) => m.id === meta.engineModel)
          ? (meta.engineModel as UpscaleEngineModel)
          : "ultrasharp_v2_lite";
      const tier: UpscaleTier = meta.tier === "pro" || engineModel === "seedvr2_3b" ? "pro" : "free";
      const factor: UpscaleFactor = meta.factor === 2 ? 2 : 4;
      const format: UpscaleFormat =
        meta.format === "jpg" || meta.format === "webp" || meta.format === "png"
          ? meta.format
          : "png";

      this.jobs.set(rec.id, {
        id: rec.id,
        ownerId: rec.ownerId,
        input: {
          ownerId: rec.ownerId,
          sourceFileName: meta.sourceFileName || rec.fileName,
          sourceMimeType: "image/jpeg",
          originalWidth: meta.originalWidth || 0,
          originalHeight: meta.originalHeight || 0,
          tier,
          engineModel,
          profile: meta.profile || "natural",
          factor,
          targetPreset: meta.targetPreset || "exact",
          face: meta.face ?? true,
          denoise: typeof meta.denoise === "number" ? meta.denoise : 20,
          sharpen: typeof meta.sharpen === "number" ? meta.sharpen : 25,
          colorFix: meta.colorFix ?? true,
          format,
          quality: typeof meta.quality === "number" ? meta.quality : 95,
          transparency: true,
          backgroundColor: "#ffffff",
          metadata: true,
        },
        tempSourceImagePath: null,
        status: "completed",
        progress: 100,
        stageLabel: meta.stageLabel || "Completed",
        createdAt: rec.createdAt,
        completedAt: rec.completedAt,
        expiresAt: rec.expiresAt,
        ttlMs: rec.ttlMs,
        storageProvider: rec.storageProvider,
        sourceGenId: meta.sourceGenId ?? `${rec.id}_src`,
        originalWidth: meta.originalWidth || 0,
        originalHeight: meta.originalHeight || 0,
        width: meta.width || 0,
        height: meta.height || 0,
        precision: meta.precision || getUpscaleModelMeta(engineModel).precision,
        timeTakenMs: meta.timeTakenMs ?? null,
        byteLength: rec.byteLength,
        fileName: rec.fileName,
        error: null,
      });
    }
  }

  private async persistJobState(job: InternalUpscaleJob): Promise<void> {
    try {
      await fsp.mkdir(path.join(this.cacheRoot, "jobs"), { recursive: true });
      const target = path.join(this.cacheRoot, "jobs", `${job.id}.json`);
      if (job.status === "completed") {
        await fsp.unlink(target).catch(() => {});
        return;
      }
      const serializable: InternalUpscaleJob = {
        ...job,
        tempSourceImagePath: null,
      };
      await fsp.writeFile(target, JSON.stringify(serializable), "utf8");
    } catch {
      // Non-fatal
    }
  }

  public async enqueueJob(rawInput: CreateUpscaleJobInput): Promise<UpscaleJobSnapshot> {
    await this.ensureInitialized();
    const id = `ups_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = Date.now();
    const ttlMs = DEFAULT_GENERATION_TTL_MS;

    const tier: UpscaleTier = rawInput.tier === "pro" ? "pro" : "free";
    const engineModel: UpscaleEngineModel =
      tier === "pro"
        ? "seedvr2_3b"
        : ALL_UPSCALE_MODELS.some((m) => m.id === rawInput.engineModel && m.id !== "seedvr2_3b")
          ? (rawInput.engineModel as UpscaleEngineModel)
          : DEFAULT_UPSCALE_SETTINGS.engineModel;

    const factor: UpscaleFactor = rawInput.factor === 2 ? 2 : 4;
    const format: UpscaleFormat =
      rawInput.format === "jpg" || rawInput.format === "webp" || rawInput.format === "png"
        ? rawInput.format
        : DEFAULT_UPSCALE_SETTINGS.format;

    const normalized: NormalizedUpscaleInput = {
      ownerId: rawInput.ownerId,
      sourceFileName: rawInput.sourceFileName.trim().slice(0, 140) || "image.png",
      sourceMimeType: rawInput.sourceMimeType || "image/png",
      originalWidth: Math.max(0, Math.round(rawInput.originalWidth || 0)),
      originalHeight: Math.max(0, Math.round(rawInput.originalHeight || 0)),
      tier,
      engineModel,
      profile: rawInput.profile || DEFAULT_UPSCALE_SETTINGS.profile,
      factor,
      targetPreset: rawInput.targetPreset || "exact",
      face: rawInput.face ?? DEFAULT_UPSCALE_SETTINGS.face,
      denoise:
        typeof rawInput.denoise === "number" && Number.isFinite(rawInput.denoise)
          ? Math.max(0, Math.min(100, Math.round(rawInput.denoise)))
          : DEFAULT_UPSCALE_SETTINGS.denoise,
      sharpen:
        typeof rawInput.sharpen === "number" && Number.isFinite(rawInput.sharpen)
          ? Math.max(0, Math.min(100, Math.round(rawInput.sharpen)))
          : DEFAULT_UPSCALE_SETTINGS.sharpen,
      colorFix: rawInput.colorFix ?? DEFAULT_UPSCALE_SETTINGS.colorFix,
      format,
      quality:
        typeof rawInput.quality === "number" && Number.isFinite(rawInput.quality)
          ? Math.max(60, Math.min(100, Math.round(rawInput.quality)))
          : DEFAULT_UPSCALE_SETTINGS.quality,
      transparency: rawInput.transparency ?? DEFAULT_UPSCALE_SETTINGS.transparency,
      backgroundColor: sanitizeHexColor(rawInput.backgroundColor),
      metadata: rawInput.metadata ?? DEFAULT_UPSCALE_SETTINGS.metadata,
    };

    // Persist original source image to GenerationStore so Before/After Compare and Retry survive 24h & server restarts
    const sourceGenId = `${id}_src`;
    await this.store.saveArtifact({
      id: sourceGenId,
      toolSlug: UPSCALE_SOURCE_TOOL_SLUG,
      ownerId: normalized.ownerId,
      fileName: normalized.sourceFileName,
      mimeType: normalized.sourceMimeType,
      buffer: rawInput.imageBuffer,
      createdAt: now,
      completedAt: now,
      ttlMs,
      meta: { parentUpscaleJobId: id },
    });

    await fsp.mkdir(path.join(this.cacheRoot, "tmp"), { recursive: true });
    const tempSourceImagePath = path.join(this.cacheRoot, "tmp", `${id}.bin`);
    await fsp.writeFile(tempSourceImagePath, rawInput.imageBuffer);

    const job: InternalUpscaleJob = {
      id,
      ownerId: normalized.ownerId,
      input: normalized,
      tempSourceImagePath,
      status: "queued",
      progress: 6,
      stageLabel: "Queued for GPU upscaling...",
      createdAt: now,
      completedAt: null,
      expiresAt: now + ttlMs,
      ttlMs,
      storageProvider: null,
      sourceGenId,
      originalWidth: normalized.originalWidth,
      originalHeight: normalized.originalHeight,
      width: normalized.originalWidth ? normalized.originalWidth * normalized.factor : 0,
      height: normalized.originalHeight ? normalized.originalHeight * normalized.factor : 0,
      precision: getUpscaleModelMeta(engineModel).precision,
      timeTakenMs: null,
      byteLength: null,
      fileName: buildOutputFileName(normalized.sourceFileName, factor, format),
      error: null,
    };

    this.jobs.set(id, job);
    await this.persistJobState(job);
    void this.executeJob(job);
    return this.toSnapshot(job);
  }

  private async executeJob(job: InternalUpscaleJob): Promise<void> {
    try {
      let sourceBuffer: Buffer | null = null;
      if (job.tempSourceImagePath) {
        sourceBuffer = await fsp.readFile(job.tempSourceImagePath).catch(() => null);
      }
      if (!sourceBuffer && job.sourceGenId) {
        const asset = await this.store.readArtifact(job.sourceGenId, job.ownerId);
        sourceBuffer = asset?.buffer ?? null;
      }
      if (!sourceBuffer) {
        throw new Error("Original image payload could not be loaded.");
      }

      const isPro = job.input.tier === "pro" || job.input.engineModel === "seedvr2_3b";
      const modelMeta = getUpscaleModelMeta(job.input.engineModel);

      job.status = "waiting_for_server";
      job.progress = 14;
      job.stageLabel = isPro
        ? "Checking NVIDIA L20 SeedVR2-3B FP8 engine..."
        : `Preparing ${modelMeta.shortLabel} FP16 on NVIDIA L20...`;

      const gpuSnap = await ensureGpuStudioReady(240_000, { requireProUpscaler: isPro });
      if (gpuSnap.state !== "ready") {
        throw new Error(gpuSnap.lastError || "GPU Upscaler Studio did not become ready in time.");
      }
      if (isPro && !gpuSnap.proUpscalerReady) {
        throw new Error("Pro SeedVR2-3B FP8 engine is still initializing on L20 GPU. Please retry shortly.");
      }

      job.status = "upscaling";
      job.progress = 45;
      job.stageLabel = `Upscaling ${job.input.factor}× with ${modelMeta.shortLabel}...`;

      const baseUrl = getGpuStudioBaseUrl();
      const headers = {
        "Content-Type": "application/json",
        ...buildGpuStudioAuthHeaders(),
      };

      const targetResolution =
        job.input.targetPreset !== "exact" ? job.input.targetPreset : null;

      const payload = JSON.stringify({
        image_base64: sourceBuffer.toString("base64"),
        model: job.input.engineModel,
        scale: job.input.factor,
        target_resolution: targetResolution,
        response_format: "b64_json",
      });

      type GpuUpscaleApiResponse = {
        status?: string;
        model?: string;
        precision?: string;
        width?: number;
        height?: number;
        original_resolution?: string;
        time_taken_ms?: number;
        image_base64?: string;
        detail?: string;
      };
      let rawResText = "";
      let parsed: GpuUpscaleApiResponse | null = null;
      let ok = false;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180_000);
        try {
          const res = await fetch(`${baseUrl}/upscale`, {
            method: "POST",
            headers,
            body: payload,
            cache: "no-store",
            signal: controller.signal,
          });
          rawResText = await res.text().catch(() => "");
          try {
            parsed = rawResText ? (JSON.parse(rawResText) as GpuUpscaleApiResponse) : null;
          } catch {
            parsed = null;
          }
          if (res.ok && parsed?.status === "success" && parsed.image_base64) {
            ok = true;
            break;
          }
          if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt === 1) {
            await ensureGpuStudioReady(120_000, { requireProUpscaler: isPro });
            continue;
          }
          throw new Error(parsed?.detail || `GPU Upscaler error (HTTP ${res.status})`);
        } finally {
          clearTimeout(timer);
        }
      }

      if (!ok || !parsed?.image_base64) {
        throw new Error(parsed?.detail || "Upscaler returned no output image.");
      }

      const rawOutputBuffer = Buffer.from(parsed.image_base64, "base64");
      if (parsed.original_resolution && parsed.original_resolution.includes("x")) {
        const [ow, oh] = parsed.original_resolution.split("x").map((n) => Number.parseInt(n, 10));
        if (Number.isFinite(ow) && ow > 0) job.originalWidth = ow;
        if (Number.isFinite(oh) && oh > 0) job.originalHeight = oh;
      }
      if (parsed.width) job.width = parsed.width;
      if (parsed.height) job.height = parsed.height;
      if (parsed.precision) job.precision = parsed.precision;
      if (typeof parsed.time_taken_ms === "number") job.timeTakenMs = parsed.time_taken_ms;

      job.status = "post_processing";
      job.progress = 82;
      job.stageLabel = `Encoding ${job.input.format.toUpperCase()} & saving to 24h cloud vault...`;

      const processed = await postProcessUpscaledImage(rawOutputBuffer, {
        format: job.input.format,
        quality: job.input.quality,
        denoise: job.input.denoise,
        sharpen: job.input.sharpen,
        transparency: job.input.transparency,
        backgroundColor: job.input.backgroundColor,
        metadata: job.input.metadata,
      });

      const finalExt = processed.mimeType === "image/png"
        ? "png"
        : processed.mimeType === "image/webp"
          ? "webp"
          : "jpg";
      job.fileName = buildOutputFileName(job.input.sourceFileName, job.input.factor, finalExt);

      const completedAt = Date.now();
      const stageLabel = `Ready (${job.width || "?"}×${job.height || "?"} · ${modelMeta.shortLabel})`;

      const stored = await this.store.saveArtifact<UpscaleStoredMeta>({
        id: job.id,
        toolSlug: UPSCALE_TOOL_SLUG,
        ownerId: job.ownerId,
        fileName: job.fileName,
        mimeType: processed.mimeType,
        buffer: processed.buffer,
        createdAt: job.createdAt,
        completedAt,
        meta: {
          sourceGenId: job.sourceGenId,
          sourceFileName: job.input.sourceFileName,
          originalWidth: job.originalWidth,
          originalHeight: job.originalHeight,
          width: job.width,
          height: job.height,
          factor: job.input.factor,
          targetPreset: job.input.targetPreset,
          tier: job.input.tier,
          engineModel: job.input.engineModel,
          modelLabel: modelMeta.shortLabel,
          precision: job.precision,
          profile: job.input.profile,
          format: finalExt,
          quality: job.input.quality,
          denoise: job.input.denoise,
          sharpen: job.input.sharpen,
          face: job.input.face,
          colorFix: job.input.colorFix,
          timeTakenMs: job.timeTakenMs,
          stageLabel,
        },
      });

      job.storageProvider = stored.record.storageProvider;
      job.expiresAt = stored.record.expiresAt;
      job.ttlMs = stored.record.ttlMs;
      job.byteLength = stored.record.byteLength;
      job.status = "completed";
      job.progress = 100;
      job.completedAt = completedAt;
      job.stageLabel = stageLabel;
      await this.persistJobState(job);
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Image upscaling failed.";
      job.stageLabel = "Failed";
      job.completedAt = Date.now();
      await this.persistJobState(job);
    } finally {
      if (job.tempSourceImagePath) {
        await fsp.unlink(job.tempSourceImagePath).catch(() => {});
        job.tempSourceImagePath = null;
      }
    }
  }

  public async retryJob(id: string, ownerId: string): Promise<UpscaleJobSnapshot | null> {
    await this.ensureInitialized();
    const existing = this.jobs.get(id);
    if (!existing || existing.ownerId !== ownerId) return null;
    if (!existing.sourceGenId) return null;
    const asset = await this.store.readArtifact(existing.sourceGenId, ownerId);
    if (!asset) return null;

    return this.enqueueJob({
      ownerId,
      sourceFileName: existing.input.sourceFileName,
      sourceMimeType: existing.input.sourceMimeType,
      imageBuffer: asset.buffer,
      originalWidth: existing.originalWidth,
      originalHeight: existing.originalHeight,
      tier: existing.input.tier,
      engineModel: existing.input.engineModel,
      profile: existing.input.profile,
      factor: existing.input.factor,
      targetPreset: existing.input.targetPreset,
      face: existing.input.face,
      denoise: existing.input.denoise,
      sharpen: existing.input.sharpen,
      colorFix: existing.input.colorFix,
      format: existing.input.format,
      quality: existing.input.quality,
      transparency: existing.input.transparency,
      backgroundColor: existing.input.backgroundColor,
      metadata: existing.input.metadata,
    });
  }

  public async listJobsAsync(ownerId: string): Promise<UpscaleJobSnapshot[]> {
    await this.ensureInitialized();
    const now = Date.now();
    return Array.from(this.jobs.values())
      .filter((j) => j.ownerId === ownerId && j.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map((j) => this.toSnapshot(j));
  }

  public async getJobAsync(id: string, ownerId: string): Promise<UpscaleJobSnapshot | null> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId || job.expiresAt <= Date.now()) return null;
    return this.toSnapshot(job);
  }

  public async deleteJob(id: string, ownerId: string): Promise<boolean> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId) return false;
    if (job.status === "upscaling" || job.status === "post_processing") return false;
    this.jobs.delete(id);
    await fsp.unlink(path.join(this.cacheRoot, "jobs", `${id}.json`)).catch(() => {});
    if (job.tempSourceImagePath) {
      await fsp.unlink(job.tempSourceImagePath).catch(() => {});
    }
    if (job.sourceGenId) {
      await this.store.deleteGeneration(job.sourceGenId, ownerId).catch(() => {});
    }
    await this.store.deleteGeneration(id, ownerId).catch(() => {});
    return true;
  }

  public async getStatusSnapshot(opts?: {
    wakeIfDown?: boolean;
    force?: boolean;
  }): Promise<GpuStudioStatusSnapshot> {
    return getGpuStudioStatus(opts);
  }

  public async getStorageStats(ownerId: string): Promise<GenerationStorageStats> {
    return this.store.getStorageStats(ownerId);
  }

  public getCachedStorageStats(ownerId: string): GenerationStorageStats {
    return this.store.getCachedStats(ownerId);
  }

  private toSnapshot(job: InternalUpscaleJob): UpscaleJobSnapshot {
    const now = Date.now();
    const elapsedMs = Math.max(0, (job.completedAt ?? now) - job.createdAt);
    const meta = getUpscaleModelMeta(job.input.engineModel);
    return {
      id: job.id,
      ownerId: job.ownerId,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      elapsedMs,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      ttlMs: job.ttlMs,
      storageProvider: job.storageProvider,
      sourceFileName: job.input.sourceFileName,
      originalWidth: job.originalWidth,
      originalHeight: job.originalHeight,
      width: job.width,
      height: job.height,
      factor: job.input.factor,
      targetPreset: job.input.targetPreset,
      tier: job.input.tier,
      engineModel: job.input.engineModel,
      modelLabel: meta.shortLabel,
      precision: job.precision,
      profile: job.input.profile,
      format: job.input.format,
      quality: job.input.quality,
      denoise: job.input.denoise,
      sharpen: job.input.sharpen,
      face: job.input.face,
      colorFix: job.input.colorFix,
      timeTakenMs: job.timeTakenMs,
      byteLength: job.byteLength,
      fileName: job.fileName,
      outputUrl: job.status === "completed" ? `/api/generations/${encodeURIComponent(job.id)}/file` : null,
      downloadUrl:
        job.status === "completed" ? `/api/generations/${encodeURIComponent(job.id)}/file?download=1` : null,
      sourceUrl: job.sourceGenId ? `/api/generations/${encodeURIComponent(job.sourceGenId)}/file` : null,
      error: job.error,
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __frebiesUpscaleManager: UpscaleManagerCore | undefined;
}

export function getUpscaleManager(): UpscaleManagerCore {
  const cur = globalThis.__frebiesUpscaleManager as (UpscaleManagerCore & { revision?: number }) | undefined;
  if (!cur || cur.revision !== UPSCALE_MANAGER_REVISION) {
    const fresh = new UpscaleManagerCore();
    globalThis.__frebiesUpscaleManager = fresh;
    return fresh;
  }
  return cur;
}
