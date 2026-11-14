import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_VOCAL_SETTINGS,
  getVocalEngineMeta,
  VOCAL_ENGINE_MODELS,
  type VocalBitrate,
  type VocalChannelMode,
  type VocalEngineModel,
  type VocalJobSnapshot,
  type VocalJobStatus,
  type VocalOutputFormat,
  type VocalSampleRate,
  type VocalStemOutputMode,
} from "@/components/tool/audio/vocal/model";
import { buildWav, computeWavPeaks, parseWav, resolveFfmpegPath } from "@/lib/audio/wav-utils";
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

export const VOCAL_TOOL_SLUG = "audio/vocal-remover";
export const VOCAL_INST_TOOL_SLUG = "audio/vocal-inst";
export const VOCAL_SOURCE_TOOL_SLUG = "audio/vocal-source";
const VOCAL_MANAGER_REVISION = 1;
const CHUNK_SECONDS = 240; // 4-minute slices for reliable GPU separation

export type CreateVocalJobInput = {
  ownerId: string;
  sourceFileName: string;
  sourceMimeType: string;
  audioBuffer: Buffer;
  engineModel?: VocalEngineModel;
  stems?: VocalStemOutputMode;
  sampleRate?: VocalSampleRate;
  channelMode?: VocalChannelMode;
  debleed?: boolean;
  normalize?: boolean;
  keepBacking?: boolean;
  format?: VocalOutputFormat;
  bitrate?: VocalBitrate;
  metadata?: boolean;
};

type NormalizedVocalInput = {
  ownerId: string;
  sourceFileName: string;
  sourceMimeType: string;
  engineModel: VocalEngineModel;
  stems: VocalStemOutputMode;
  sampleRate: VocalSampleRate;
  channelMode: VocalChannelMode;
  debleed: boolean;
  normalize: boolean;
  keepBacking: boolean;
  format: VocalOutputFormat;
  bitrate: VocalBitrate;
  metadata: boolean;
};

type InternalVocalJob = {
  id: string;
  ownerId: string;
  input: NormalizedVocalInput;
  tempSourceAudioPath: string | null;
  status: VocalJobStatus;
  progress: number;
  stageLabel: string;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  sourceGenId: string | null;
  vocalsGenId: string | null;
  instrumentalGenId: string | null;
  durationSec: number;
  chunkCount: number;
  vocalsFileName: string | null;
  vocalsByteLength: number | null;
  vocalsPeaks: number[];
  instrumentalFileName: string | null;
  instrumentalByteLength: number | null;
  instrumentalPeaks: number[];
  error: string | null;
};

type VocalStoredMeta = {
  sourceGenId?: string | null;
  vocalsGenId?: string | null;
  instrumentalGenId?: string | null;
  sourceFileName?: string;
  durationSec?: number;
  chunkCount?: number;
  engineModel?: VocalEngineModel;
  modelLabel?: string;
  stems?: VocalStemOutputMode;
  sampleRate?: VocalSampleRate;
  channelMode?: VocalChannelMode;
  debleed?: boolean;
  normalize?: boolean;
  keepBacking?: boolean;
  format?: VocalOutputFormat;
  bitrate?: VocalBitrate;
  vocalsFileName?: string | null;
  vocalsByteLength?: number | null;
  vocalsPeaks?: number[];
  instrumentalFileName?: string | null;
  instrumentalByteLength?: number | null;
  instrumentalPeaks?: number[];
  stageLabel?: string;
};

function sanitizeStemBase(fileName: string): string {
  return (
    fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 44) || "track"
  );
}

function buildStemFileName(
  sourceFileName: string,
  suffix: "vocals" | "instrumental",
  format: VocalOutputFormat,
): string {
  return `${sanitizeStemBase(sourceFileName)}_${suffix}.${format}`;
}

function peakNormalizePcm16(pcmBuffer: Buffer, targetDbfs = -1.0): Buffer {
  if (pcmBuffer.length < 2) return pcmBuffer;
  const totalSamples = Math.floor(pcmBuffer.length / 2);
  let maxAbs = 0;
  for (let i = 0; i < totalSamples; i++) {
    const val = Math.abs(pcmBuffer.readInt16LE(i * 2));
    if (val > maxAbs) maxAbs = val;
  }
  if (maxAbs < 64) return pcmBuffer;

  const targetAmplitude = Math.pow(10, targetDbfs / 20) * 32767;
  const gain = targetAmplitude / maxAbs;
  if (Math.abs(gain - 1) < 0.03) return pcmBuffer;

  const out = Buffer.allocUnsafe(pcmBuffer.length);
  for (let i = 0; i < totalSamples; i++) {
    const scaled = Math.round(pcmBuffer.readInt16LE(i * 2) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), i * 2);
  }
  return out;
}

async function decodeToWorkingWav(
  sourceBuffer: Buffer,
  sampleRate: VocalSampleRate,
  channelMode: VocalChannelMode,
): Promise<Buffer> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error("ffmpeg binary not available to decode audio.");
  }
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-vocal-dec-"));
  const inPath = path.join(workDir, "input.bin");
  const outPath = path.join(workDir, "decoded.wav");
  try {
    await fsp.writeFile(inPath, sourceBuffer);
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        String(sampleRate),
        "-ac",
        channelMode === "mono" ? "1" : "2",
        outPath,
      ],
      { timeout: 120_000 },
    );
    return await fsp.readFile(outPath);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function applyHighpassAndEncode(
  pcmData: Buffer,
  sampleRate: number,
  numChannels: number,
  options: {
    applyDebleedHighpass: boolean;
    highpassHz: number;
    normalize: boolean;
    format: VocalOutputFormat;
    bitrate: VocalBitrate;
    metadata: boolean;
    title: string;
  },
): Promise<{ buffer: Buffer; mimeType: string; peaks: number[] }> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error("ffmpeg binary not available for audio encoding.");
  }

  let processedPcm = pcmData;
  if (options.applyDebleedHighpass) {
    const hpWorkDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-vocal-hp-"));
    const hpIn = path.join(hpWorkDir, "in.wav");
    const hpOut = path.join(hpWorkDir, "hp.wav");
    try {
      await fsp.writeFile(hpIn, buildWav(processedPcm, sampleRate, numChannels, 16, 1));
      await execFileAsync(
        ffmpeg,
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          hpIn,
          "-af",
          `highpass=f=${options.highpassHz}`,
          "-acodec",
          "pcm_s16le",
          "-ar",
          String(sampleRate),
          "-ac",
          String(numChannels),
          hpOut,
        ],
        { timeout: 90_000 },
      );
      const hpWav = await fsp.readFile(hpOut);
      processedPcm = parseWav(hpWav).pcmData;
    } finally {
      await fsp.rm(hpWorkDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (options.normalize) {
    processedPcm = peakNormalizePcm16(processedPcm, -1.0);
  }

  const peaks = computeWavPeaks(processedPcm, 16, numChannels, 80);
  const wavBuffer = buildWav(processedPcm, sampleRate, numChannels, 16, 1);

  if (options.format === "wav" && !options.metadata) {
    return {
      buffer: wavBuffer,
      mimeType: "audio/wav",
      peaks,
    };
  }

  const encWorkDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-vocal-enc-"));
  const encIn = path.join(encWorkDir, "master.wav");
  const encOut = path.join(encWorkDir, `out.${options.format}`);
  try {
    await fsp.writeFile(encIn, wavBuffer);
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", encIn];
    if (options.metadata) {
      args.push("-metadata", `title=${options.title}`, "-metadata", "artist=frebies Vocal Studio");
    } else {
      args.push("-map_metadata", "-1");
    }
    if (options.format === "mp3") {
      args.push("-c:a", "libmp3lame", "-b:a", `${options.bitrate}k`, encOut);
    } else {
      args.push("-c:a", "pcm_s16le", encOut);
    }
    await execFileAsync(ffmpeg, args, { timeout: 120_000 });
    const outBuf = await fsp.readFile(encOut);
    return {
      buffer: outBuf,
      mimeType: options.format === "mp3" ? "audio/mpeg" : "audio/wav",
      peaks,
    };
  } finally {
    await fsp.rm(encWorkDir, { recursive: true, force: true }).catch(() => {});
  }
}

class VocalManagerCore {
  public readonly revision = VOCAL_MANAGER_REVISION;
  private readonly store = getGenerationStore();
  private readonly cacheRoot = path.join(os.tmpdir(), "frebies-vocal-cache");
  private readonly jobs = new Map<string, InternalVocalJob>();
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
          const parsed = JSON.parse(await fsp.readFile(full, "utf8")) as InternalVocalJob;
          if (!parsed?.id || parsed.expiresAt <= now) {
            await fsp.unlink(full).catch(() => {});
            continue;
          }
          if (parsed.status !== "completed" && parsed.status !== "failed") {
            parsed.status = "failed";
            parsed.error = "Interrupted by worker restart. Click Retry to separate again.";
            parsed.stageLabel = "Interrupted";
          }
          this.jobs.set(parsed.id, parsed);
        } catch {
          await fsp.unlink(full).catch(() => {});
        }
      }
    } catch {
      // Ignore missing temp directory
    }

    const stored = await this.store.listGenerations<VocalStoredMeta>({
      toolSlug: VOCAL_TOOL_SLUG,
      limit: 80,
    });

    for (const rec of stored) {
      if (this.jobs.has(rec.id)) continue;
      const meta = (rec.meta ?? {}) as VocalStoredMeta;
      const engineModel: VocalEngineModel = VOCAL_ENGINE_MODELS.some((m) => m.id === meta.engineModel)
        ? (meta.engineModel as VocalEngineModel)
        : "bs_roformer";
      const stems: VocalStemOutputMode =
        meta.stems === "vocals" || meta.stems === "instrumental" || meta.stems === "both"
          ? meta.stems
          : "both";
      const sampleRate: VocalSampleRate =
        meta.sampleRate === 24000 || meta.sampleRate === 48000 || meta.sampleRate === 44100
          ? meta.sampleRate
          : 44100;
      const channelMode: VocalChannelMode = meta.channelMode === "mono" ? "mono" : "stereo";
      const format: VocalOutputFormat = meta.format === "wav" ? "wav" : "mp3";
      const bitrate: VocalBitrate =
        meta.bitrate === 192 || meta.bitrate === 256 || meta.bitrate === 320 ? meta.bitrate : 320;

      this.jobs.set(rec.id, {
        id: rec.id,
        ownerId: rec.ownerId,
        input: {
          ownerId: rec.ownerId,
          sourceFileName: meta.sourceFileName || rec.fileName,
          sourceMimeType: rec.mimeType,
          engineModel,
          stems,
          sampleRate,
          channelMode,
          debleed: meta.debleed ?? DEFAULT_VOCAL_SETTINGS.debleed,
          normalize: meta.normalize ?? DEFAULT_VOCAL_SETTINGS.normalize,
          keepBacking: meta.keepBacking ?? DEFAULT_VOCAL_SETTINGS.keepBacking,
          format,
          bitrate,
          metadata: DEFAULT_VOCAL_SETTINGS.metadata,
        },
        tempSourceAudioPath: null,
        status: "completed",
        progress: 100,
        stageLabel: meta.stageLabel || "Completed",
        createdAt: rec.createdAt,
        completedAt: rec.completedAt,
        expiresAt: rec.expiresAt,
        ttlMs: rec.ttlMs,
        storageProvider: rec.storageProvider,
        sourceGenId: meta.sourceGenId ?? `${rec.id}_src`,
        vocalsGenId: meta.vocalsGenId ?? (stems === "instrumental" ? null : rec.id),
        instrumentalGenId:
          meta.instrumentalGenId ??
          (stems === "both" ? `${rec.id}_inst` : stems === "instrumental" ? rec.id : null),
        durationSec: meta.durationSec ?? 0,
        chunkCount: meta.chunkCount ?? 1,
        vocalsFileName: meta.vocalsFileName ?? null,
        vocalsByteLength: meta.vocalsByteLength ?? null,
        vocalsPeaks: Array.isArray(meta.vocalsPeaks) ? meta.vocalsPeaks : [],
        instrumentalFileName: meta.instrumentalFileName ?? null,
        instrumentalByteLength: meta.instrumentalByteLength ?? null,
        instrumentalPeaks: Array.isArray(meta.instrumentalPeaks) ? meta.instrumentalPeaks : [],
        error: null,
      });
    }
  }

  private async persistJobState(job: InternalVocalJob): Promise<void> {
    await fsp.mkdir(path.join(this.cacheRoot, "jobs"), { recursive: true });
    const serializable: InternalVocalJob = {
      ...job,
      tempSourceAudioPath: null,
    };
    await fsp
      .writeFile(path.join(this.cacheRoot, "jobs", `${job.id}.json`), JSON.stringify(serializable))
      .catch(() => {});
  }

  public async enqueueJob(rawInput: CreateVocalJobInput): Promise<VocalJobSnapshot> {
    await this.ensureInitialized();
    const id = `voc_${crypto.randomBytes(6).toString("hex")}`;
    const now = Date.now();
    const ttlMs = DEFAULT_GENERATION_TTL_MS;

    const engineModel: VocalEngineModel = VOCAL_ENGINE_MODELS.some((m) => m.id === rawInput.engineModel)
      ? (rawInput.engineModel as VocalEngineModel)
      : DEFAULT_VOCAL_SETTINGS.engineModel;
    const stems: VocalStemOutputMode =
      rawInput.stems === "vocals" || rawInput.stems === "instrumental" || rawInput.stems === "both"
        ? rawInput.stems
        : DEFAULT_VOCAL_SETTINGS.stems;
    const sampleRate: VocalSampleRate =
      rawInput.sampleRate === 24000 || rawInput.sampleRate === 48000 || rawInput.sampleRate === 44100
        ? rawInput.sampleRate
        : DEFAULT_VOCAL_SETTINGS.sampleRate;
    const channelMode: VocalChannelMode =
      rawInput.channelMode === "mono" || rawInput.channelMode === "stereo"
        ? rawInput.channelMode
        : DEFAULT_VOCAL_SETTINGS.channelMode;
    const format: VocalOutputFormat = rawInput.format === "wav" ? "wav" : DEFAULT_VOCAL_SETTINGS.format;
    const bitrate: VocalBitrate =
      rawInput.bitrate === 192 || rawInput.bitrate === 256 || rawInput.bitrate === 320
        ? rawInput.bitrate
        : DEFAULT_VOCAL_SETTINGS.bitrate;

    const normalized: NormalizedVocalInput = {
      ownerId: rawInput.ownerId,
      sourceFileName: rawInput.sourceFileName || "audio-track.mp3",
      sourceMimeType: rawInput.sourceMimeType || "audio/mpeg",
      engineModel,
      stems,
      sampleRate,
      channelMode,
      debleed: rawInput.debleed ?? DEFAULT_VOCAL_SETTINGS.debleed,
      normalize: rawInput.normalize ?? DEFAULT_VOCAL_SETTINGS.normalize,
      keepBacking: rawInput.keepBacking ?? DEFAULT_VOCAL_SETTINGS.keepBacking,
      format,
      bitrate,
      metadata: rawInput.metadata ?? DEFAULT_VOCAL_SETTINGS.metadata,
    };

    const sourceGenId = `${id}_src`;
    await this.store.saveArtifact({
      id: sourceGenId,
      toolSlug: VOCAL_SOURCE_TOOL_SLUG,
      ownerId: normalized.ownerId,
      fileName: normalized.sourceFileName,
      mimeType: normalized.sourceMimeType,
      buffer: rawInput.audioBuffer,
      createdAt: now,
      completedAt: now,
      ttlMs,
      meta: { parentVocalJobId: id },
    });

    await fsp.mkdir(path.join(this.cacheRoot, "tmp"), { recursive: true });
    const tempSourceAudioPath = path.join(this.cacheRoot, "tmp", `${id}.bin`);
    await fsp.writeFile(tempSourceAudioPath, rawInput.audioBuffer);

    const job: InternalVocalJob = {
      id,
      ownerId: normalized.ownerId,
      input: normalized,
      tempSourceAudioPath,
      status: "queued",
      progress: 5,
      stageLabel: "Queued for GPU stem separation...",
      createdAt: now,
      completedAt: null,
      expiresAt: now + ttlMs,
      ttlMs,
      storageProvider: null,
      sourceGenId,
      vocalsGenId: stems === "instrumental" ? null : id,
      instrumentalGenId: stems === "both" ? `${id}_inst` : stems === "instrumental" ? id : null,
      durationSec: 0,
      chunkCount: 1,
      vocalsFileName:
        stems === "instrumental" ? null : buildStemFileName(normalized.sourceFileName, "vocals", format),
      vocalsByteLength: null,
      vocalsPeaks: [],
      instrumentalFileName:
        stems === "vocals" ? null : buildStemFileName(normalized.sourceFileName, "instrumental", format),
      instrumentalByteLength: null,
      instrumentalPeaks: [],
      error: null,
    };

    this.jobs.set(id, job);
    await this.persistJobState(job);
    void this.executeJob(job);
    return this.toSnapshot(job);
  }

  private async executeJob(job: InternalVocalJob): Promise<void> {
    try {
      let sourceBuffer: Buffer | null = null;
      if (job.tempSourceAudioPath) {
        sourceBuffer = await fsp.readFile(job.tempSourceAudioPath).catch(() => null);
      }
      if (!sourceBuffer && job.sourceGenId) {
        const asset = await this.store.readArtifact(job.sourceGenId, job.ownerId);
        sourceBuffer = asset?.buffer ?? null;
      }
      if (!sourceBuffer) {
        throw new Error("Original audio file could not be loaded.");
      }

      const modelMeta = getVocalEngineMeta(job.input.engineModel);

      job.status = "extracting";
      job.progress = 12;
      job.stageLabel = `Decoding ${job.input.sampleRate / 1000} kHz ${job.input.channelMode} audio...`;

      const workingWav = await decodeToWorkingWav(
        sourceBuffer,
        job.input.sampleRate,
        job.input.channelMode,
      );
      const parsed = parseWav(workingWav);
      const bytesPerSec = parsed.sampleRate * parsed.numChannels * 2;
      const durationSec = bytesPerSec > 0 ? parsed.pcmData.length / bytesPerSec : 0;
      job.durationSec = Math.round(durationSec * 10) / 10;

      job.status = "waiting_for_server";
      job.progress = 20;
      job.stageLabel = `Preparing ${modelMeta.shortLabel} on NVIDIA L20...`;

      const gpuSnap = await ensureGpuStudioReady(240_000, { requireProUpscaler: false });
      if (gpuSnap.state !== "ready") {
        throw new Error(gpuSnap.lastError || "GPU Vocal Separation Studio did not become ready in time.");
      }

      const chunkBytes = Math.max(bytesPerSec, CHUNK_SECONDS * bytesPerSec);
      const totalChunks = Math.max(1, Math.ceil(parsed.pcmData.length / chunkBytes));
      job.chunkCount = totalChunks;

      const returnVocals = job.input.stems !== "instrumental";
      const returnInstrumental = job.input.stems !== "vocals";
      const baseUrl = getGpuStudioBaseUrl();
      const headers = {
        "Content-Type": "application/json",
        ...buildGpuStudioAuthHeaders(),
      };

      const vocalPcmParts: Buffer[] = [];
      const instPcmParts: Buffer[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const startByte = i * chunkBytes;
        const endByte = Math.min(parsed.pcmData.length, (i + 1) * chunkBytes);
        const frameAlign = parsed.numChannels * 2;
        const alignedEnd = Math.floor(endByte / frameAlign) * frameAlign;
        if (alignedEnd <= startByte) continue;

        job.status = "separating";
        const pctBase = 26 + Math.round((i / totalChunks) * 54);
        job.progress = pctBase;
        job.stageLabel =
          totalChunks > 1
            ? `Separating stems (${modelMeta.shortLabel}) · chunk ${i + 1}/${totalChunks}...`
            : `Separating stems with ${modelMeta.shortLabel}...`;

        const chunkWav = buildWav(
          parsed.pcmData.subarray(startByte, alignedEnd),
          parsed.sampleRate,
          parsed.numChannels,
          16,
          1,
        );

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300_000);
        let rawText = "";
        let httpStatus = 0;
        try {
          const res = await fetch(`${baseUrl}/separate`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              audio_base64: chunkWav.toString("base64"),
              model: job.input.engineModel,
              sample_rate: parsed.sampleRate,
              mono: job.input.channelMode === "mono",
              return_vocals: returnVocals,
              return_instrumental: returnInstrumental,
            }),
            signal: controller.signal,
            cache: "no-store",
          });
          httpStatus = res.status;
          rawText = await res.text();
        } finally {
          clearTimeout(timer);
        }

        if (httpStatus < 200 || httpStatus >= 300) {
          throw new Error(`GPU Studio /separate HTTP ${httpStatus}: ${rawText.slice(0, 220)}`);
        }

        const payload = JSON.parse(rawText) as {
          vocals_base64?: string;
          instrumental_base64?: string;
          detail?: string;
          error?: string;
        };

        if (returnVocals) {
          if (!payload.vocals_base64) {
            throw new Error(payload.detail || payload.error || "GPU Studio returned empty vocals stem.");
          }
          vocalPcmParts.push(parseWav(Buffer.from(payload.vocals_base64, "base64")).pcmData);
        }

        if (returnInstrumental) {
          if (!payload.instrumental_base64) {
            throw new Error(
              payload.detail || payload.error || "GPU Studio returned empty instrumental stem.",
            );
          }
          instPcmParts.push(parseWav(Buffer.from(payload.instrumental_base64, "base64")).pcmData);
        }
      }

      job.status = "post_processing";
      job.progress = 85;
      job.stageLabel = `Applying DSP & encoding ${job.input.format.toUpperCase()} stems...`;

      const highpassHz = job.input.keepBacking ? 70 : 95;
      const vocalsOut = returnVocals
        ? await applyHighpassAndEncode(Buffer.concat(vocalPcmParts), parsed.sampleRate, parsed.numChannels, {
            applyDebleedHighpass: job.input.debleed,
            highpassHz,
            normalize: job.input.normalize,
            format: job.input.format,
            bitrate: job.input.bitrate,
            metadata: job.input.metadata,
            title: `${sanitizeStemBase(job.input.sourceFileName)} (Vocals)`,
          })
        : null;

      const instOut = returnInstrumental
        ? await applyHighpassAndEncode(Buffer.concat(instPcmParts), parsed.sampleRate, parsed.numChannels, {
            applyDebleedHighpass: false,
            highpassHz,
            normalize: job.input.normalize,
            format: job.input.format,
            bitrate: job.input.bitrate,
            metadata: job.input.metadata,
            title: `${sanitizeStemBase(job.input.sourceFileName)} (Instrumental)`,
          })
        : null;

      const completedAt = Date.now();
      const stageLabel = `Ready (${modelMeta.shortLabel} · ${job.input.sampleRate / 1000} kHz ${job.input.format.toUpperCase()})`;

      job.vocalsByteLength = vocalsOut?.buffer.length ?? null;
      job.vocalsPeaks = vocalsOut?.peaks ?? [];
      job.instrumentalByteLength = instOut?.buffer.length ?? null;
      job.instrumentalPeaks = instOut?.peaks ?? [];

      const commonMeta: VocalStoredMeta = {
        sourceGenId: job.sourceGenId,
        vocalsGenId: job.vocalsGenId,
        instrumentalGenId: job.instrumentalGenId,
        sourceFileName: job.input.sourceFileName,
        durationSec: job.durationSec,
        chunkCount: job.chunkCount,
        engineModel: job.input.engineModel,
        modelLabel: modelMeta.shortLabel,
        stems: job.input.stems,
        sampleRate: job.input.sampleRate,
        channelMode: job.input.channelMode,
        debleed: job.input.debleed,
        normalize: job.input.normalize,
        keepBacking: job.input.keepBacking,
        format: job.input.format,
        bitrate: job.input.bitrate,
        vocalsFileName: job.vocalsFileName,
        vocalsByteLength: job.vocalsByteLength,
        vocalsPeaks: job.vocalsPeaks,
        instrumentalFileName: job.instrumentalFileName,
        instrumentalByteLength: job.instrumentalByteLength,
        instrumentalPeaks: job.instrumentalPeaks,
        stageLabel,
      };

      const primaryIsInstrumentalOnly = job.input.stems === "instrumental";
      const primaryBuffer = primaryIsInstrumentalOnly ? instOut!.buffer : vocalsOut!.buffer;
      const primaryMime = primaryIsInstrumentalOnly ? instOut!.mimeType : vocalsOut!.mimeType;
      const primaryFileName = primaryIsInstrumentalOnly
        ? job.instrumentalFileName!
        : job.vocalsFileName!;

      const storedPrimary = await this.store.saveArtifact<VocalStoredMeta>({
        id: job.id,
        toolSlug: VOCAL_TOOL_SLUG,
        ownerId: job.ownerId,
        fileName: primaryFileName,
        mimeType: primaryMime,
        buffer: primaryBuffer,
        createdAt: job.createdAt,
        completedAt,
        ttlMs: job.ttlMs,
        meta: commonMeta,
      });

      if (job.input.stems === "both" && instOut && job.instrumentalGenId && job.instrumentalFileName) {
        await this.store.saveArtifact({
          id: job.instrumentalGenId,
          toolSlug: VOCAL_INST_TOOL_SLUG,
          ownerId: job.ownerId,
          fileName: job.instrumentalFileName,
          mimeType: instOut.mimeType,
          buffer: instOut.buffer,
          createdAt: job.createdAt,
          completedAt,
          ttlMs: job.ttlMs,
          meta: { parentVocalJobId: job.id },
        });
      }

      job.storageProvider = storedPrimary.record.storageProvider;
      job.expiresAt = storedPrimary.record.expiresAt;
      job.ttlMs = storedPrimary.record.ttlMs;
      job.status = "completed";
      job.progress = 100;
      job.completedAt = completedAt;
      job.stageLabel = stageLabel;
      await this.persistJobState(job);
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Vocal separation failed.";
      job.stageLabel = "Failed";
      job.completedAt = Date.now();
      await this.persistJobState(job);
    } finally {
      if (job.tempSourceAudioPath) {
        await fsp.unlink(job.tempSourceAudioPath).catch(() => {});
        job.tempSourceAudioPath = null;
      }
    }
  }

  public async retryJob(id: string, ownerId: string): Promise<VocalJobSnapshot | null> {
    await this.ensureInitialized();
    const existing = this.jobs.get(id);
    if (!existing || existing.ownerId !== ownerId || !existing.sourceGenId) return null;
    const asset = await this.store.readArtifact(existing.sourceGenId, ownerId);
    if (!asset) return null;

    return this.enqueueJob({
      ownerId,
      sourceFileName: existing.input.sourceFileName,
      sourceMimeType: existing.input.sourceMimeType,
      audioBuffer: asset.buffer,
      engineModel: existing.input.engineModel,
      stems: existing.input.stems,
      sampleRate: existing.input.sampleRate,
      channelMode: existing.input.channelMode,
      debleed: existing.input.debleed,
      normalize: existing.input.normalize,
      keepBacking: existing.input.keepBacking,
      format: existing.input.format,
      bitrate: existing.input.bitrate,
      metadata: existing.input.metadata,
    });
  }

  public async listJobsAsync(ownerId: string): Promise<VocalJobSnapshot[]> {
    await this.ensureInitialized();
    const now = Date.now();
    return Array.from(this.jobs.values())
      .filter((j) => j.ownerId === ownerId && j.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map((j) => this.toSnapshot(j));
  }

  public async getJobAsync(id: string, ownerId: string): Promise<VocalJobSnapshot | null> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId || job.expiresAt <= Date.now()) return null;
    return this.toSnapshot(job);
  }

  public async deleteJob(id: string, ownerId: string): Promise<boolean> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId) return false;
    if (
      job.status === "extracting" ||
      job.status === "separating" ||
      job.status === "post_processing"
    ) {
      return false;
    }

    this.jobs.delete(id);
    await fsp.unlink(path.join(this.cacheRoot, "jobs", `${id}.json`)).catch(() => {});
    if (job.tempSourceAudioPath) {
      await fsp.unlink(job.tempSourceAudioPath).catch(() => {});
    }
    if (job.sourceGenId) {
      await this.store.deleteGeneration(job.sourceGenId, ownerId).catch(() => {});
    }
    if (job.instrumentalGenId && job.instrumentalGenId !== id) {
      await this.store.deleteGeneration(job.instrumentalGenId, ownerId).catch(() => {});
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

  private toSnapshot(job: InternalVocalJob): VocalJobSnapshot {
    const now = Date.now();
    const elapsedMs = Math.max(0, (job.completedAt ?? now) - job.createdAt);
    const meta = getVocalEngineMeta(job.input.engineModel);
    const completed = job.status === "completed";

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
      durationSec: job.durationSec,
      chunkCount: job.chunkCount,
      engineModel: job.input.engineModel,
      modelLabel: meta.shortLabel,
      stems: job.input.stems,
      sampleRate: job.input.sampleRate,
      channelMode: job.input.channelMode,
      debleed: job.input.debleed,
      normalize: job.input.normalize,
      format: job.input.format,
      bitrate: job.input.bitrate,
      vocalsUrl:
        completed && job.vocalsGenId
          ? `/api/generations/${encodeURIComponent(job.vocalsGenId)}/file`
          : null,
      vocalsDownloadUrl:
        completed && job.vocalsGenId
          ? `/api/generations/${encodeURIComponent(job.vocalsGenId)}/file?download=1`
          : null,
      vocalsFileName: job.vocalsFileName,
      vocalsByteLength: job.vocalsByteLength,
      vocalsPeaks: job.vocalsPeaks,
      instrumentalUrl:
        completed && job.instrumentalGenId
          ? `/api/generations/${encodeURIComponent(job.instrumentalGenId)}/file`
          : null,
      instrumentalDownloadUrl:
        completed && job.instrumentalGenId
          ? `/api/generations/${encodeURIComponent(job.instrumentalGenId)}/file?download=1`
          : null,
      instrumentalFileName: job.instrumentalFileName,
      instrumentalByteLength: job.instrumentalByteLength,
      instrumentalPeaks: job.instrumentalPeaks,
      error: job.error,
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __frebiesVocalManager: VocalManagerCore | undefined;
}

export function getVocalManager(): VocalManagerCore {
  const cur = globalThis.__frebiesVocalManager as (VocalManagerCore & { revision?: number }) | undefined;
  if (!cur || cur.revision !== VOCAL_MANAGER_REVISION) {
    const fresh = new VocalManagerCore();
    globalThis.__frebiesVocalManager = fresh;
    return fresh;
  }
  return cur;
}
