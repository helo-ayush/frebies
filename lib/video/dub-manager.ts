import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CustomVoiceInput, VoiceId } from "@/components/tool/audio/tts/model";
import { getPresetVoiceReference } from "@/lib/audio/voice-presets";
import { getTtsManager } from "@/lib/audio/tts-manager";
import { estimateMaxNewTokens } from "@/lib/audio/tts-text";
import { getGenerationStore } from "@/lib/storage/generation-store";
import { DEFAULT_GENERATION_TTL_MS } from "@/lib/storage/retention";
import { assembleDubbedSpeechTrack } from "./dub-audio";
import { translateDubSegments } from "./dub-translate";
import {
  DUB_TONES,
  buildSrtFromSegments,
  buildVttFromSegments,
  getDubLanguageLabel,
  type DubAlignedSegment,
  type DubJobSnapshot,
  type DubJobStatus,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
  type DubVoiceMode,
} from "./dub-types";

export const DUB_TOOL_SLUG = "video/dubbing";
const DUB_MANAGER_REVISION = 1;

export type CreateDubJobInput = {
  ownerId: string;
  sourceVideoName: string;
  durationSeconds: number;
  sourceLanguage: DubLanguageCode;
  targetLanguage: DubTargetLanguageCode;
  voiceMode: DubVoiceMode;
  voiceId: VoiceId;
  customVoice?: CustomVoiceInput | null;
  tone: DubTone;
  keepBackground: boolean;
  backgroundLevel: number;
  syncToTimeline: boolean;
  preferredStudio: string;
  segments: DubSegment[];
  skipTranslation?: boolean;
};

type InternalDubJob = {
  id: string;
  ownerId: string;
  input: CreateDubJobInput;
  status: DubJobStatus;
  progress: number;
  stageLabel: string;
  assignedStudioLabel: string | null;
  bootStartedAt: number | null;
  segmentsDone: number;
  segmentsTotal: number;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: "local" | "r2" | null;
  mimeType: string | null;
  byteLength: number | null;
  durationSeconds: number;
  peaks: number[];
  voiceLabel: string;
  fileName: string;
  videoGenId: string | null;
  srtText: string;
  vttText: string;
  alignedSegments: DubAlignedSegment[];
  error: string | null;
};

type DubStoredMeta = {
  sourceLanguage?: string;
  targetLanguage?: string;
  voiceLabel?: string;
  sourceVideoName?: string;
  keepBackground?: boolean;
  backgroundLevel?: number;
  peaks?: number[];
  srtText?: string;
  vttText?: string;
  segments?: DubAlignedSegment[];
  videoGenId?: string | null;
  stageLabel?: string;
  assignedStudioLabel?: string | null;
  startedAt?: number;
};

class VideoDubManagerCore {
  public readonly revision = DUB_MANAGER_REVISION;
  private readonly store = getGenerationStore();
  private readonly cacheRoot = path.join(os.tmpdir(), "frebies-dub-cache");
  private readonly jobs = new Map<string, InternalDubJob>();
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
          const parsed = JSON.parse(await fsp.readFile(full, "utf8")) as InternalDubJob;
          if (!parsed?.id || parsed.expiresAt <= now) {
            await fsp.unlink(full).catch(() => {});
            continue;
          }
          if (parsed.status !== "completed" && parsed.status !== "failed") {
            parsed.status = "failed";
            parsed.error = "Interrupted by server restart. Please start again.";
            parsed.stageLabel = "Failed";
          }
          this.jobs.set(parsed.id, parsed);
        } catch {
          await fsp.unlink(full).catch(() => {});
        }
      }
    } catch {
      // ignore missing cache dir
    }

    const [stored, storedVideos] = await Promise.all([
      this.store.listGenerations({ toolSlug: DUB_TOOL_SLUG, limit: 80 }),
      this.store.listGenerations({ toolSlug: `${DUB_TOOL_SLUG}-video`, limit: 80 }),
    ]);
    const videoByParentId = new Map<string, string>();
    for (const vid of storedVideos) {
      const m = vid.meta as { parentDubJobId?: string } | null;
      if (m?.parentDubJobId) {
        videoByParentId.set(m.parentDubJobId, vid.id);
      }
    }

    for (const rec of stored) {
      if (this.jobs.has(rec.id)) continue;
      const meta = (rec.meta ?? {}) as DubStoredMeta;
      this.jobs.set(rec.id, {
        id: rec.id,
        ownerId: rec.ownerId,
        input: {
          ownerId: rec.ownerId,
          sourceVideoName: meta.sourceVideoName || rec.fileName,
          durationSeconds: rec.durationSeconds ?? 0,
          sourceLanguage: (meta.sourceLanguage as DubLanguageCode) || "auto",
          targetLanguage: (meta.targetLanguage as DubTargetLanguageCode) || "hi",
          voiceMode: "preset",
          voiceId: "aria",
          tone: "natural",
          keepBackground: meta.keepBackground ?? true,
          backgroundLevel: meta.backgroundLevel ?? 0.18,
          syncToTimeline: true,
          preferredStudio: "auto",
          segments: [],
        },
        status: "completed",
        progress: 100,
        stageLabel: meta.stageLabel || "Completed",
        assignedStudioLabel: meta.assignedStudioLabel ?? null,
        bootStartedAt: null,
        segmentsDone: meta.segments?.length ?? 0,
        segmentsTotal: meta.segments?.length ?? 0,
        createdAt: rec.createdAt,
        completedAt: rec.completedAt,
        expiresAt: rec.expiresAt,
        ttlMs: rec.ttlMs,
        storageProvider: rec.storageProvider,
        mimeType: rec.mimeType,
        byteLength: rec.byteLength,
        durationSeconds: rec.durationSeconds ?? 0,
        peaks: Array.isArray(meta.peaks) ? meta.peaks : [],
        voiceLabel: meta.voiceLabel || "Cloned voice",
        fileName: rec.fileName,
        videoGenId: meta.videoGenId ?? videoByParentId.get(rec.id) ?? null,
        srtText: meta.srtText || "",
        vttText: meta.vttText || "",
        alignedSegments: Array.isArray(meta.segments) ? meta.segments : [],
        error: null,
      });
    }
  }

  private async persistPendingJob(job: InternalDubJob): Promise<void> {
    try {
      await fsp.mkdir(path.join(this.cacheRoot, "jobs"), { recursive: true });
      const target = path.join(this.cacheRoot, "jobs", `${job.id}.json`);
      if (job.status === "completed") {
        await fsp.unlink(target).catch(() => {});
        return;
      }
      const safeCustom = job.input.customVoice
        ? { ...job.input.customVoice, audioBase64: "" }
        : null;
      const serializable: InternalDubJob = {
        ...job,
        input: {
          ...job.input,
          customVoice: safeCustom,
        },
      };
      await fsp.writeFile(target, JSON.stringify(serializable), "utf8");
    } catch {
      // non-fatal
    }
  }

  public async enqueueJob(input: CreateDubJobInput): Promise<DubJobSnapshot> {
    await this.ensureInitialized();
    const id = `dub_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = Date.now();
    const ttlMs = DEFAULT_GENERATION_TTL_MS;

    const cleanStem = input.sourceVideoName.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 42) || "video";
    const fileName = `${cleanStem}-dub-${input.targetLanguage}.mp3`;

    let voiceLabel = "Original speaker (cloned)";
    if (input.voiceMode === "preset") {
      voiceLabel = getPresetVoiceReference(input.voiceId)?.name ?? input.voiceId;
    } else if (input.customVoice?.name?.trim()) {
      voiceLabel = input.customVoice.name.trim();
    }

    const job: InternalDubJob = {
      id,
      ownerId: input.ownerId,
      input,
      status: "queued",
      progress: 4,
      stageLabel: "Preparing dubbing timeline...",
      assignedStudioLabel: null,
      bootStartedAt: null,
      segmentsDone: 0,
      segmentsTotal: input.segments.length,
      createdAt: now,
      completedAt: null,
      expiresAt: now + ttlMs,
      ttlMs,
      storageProvider: null,
      mimeType: null,
      byteLength: null,
      durationSeconds: input.durationSeconds,
      peaks: [],
      voiceLabel,
      fileName,
      videoGenId: null,
      srtText: "",
      vttText: "",
      alignedSegments: [],
      error: null,
    };

    this.jobs.set(id, job);
    await this.persistPendingJob(job);
    void this.executeJob(job);
    return this.toSnapshot(job);
  }

  private async executeJob(job: InternalDubJob): Promise<void> {
    const ttsManager = getTtsManager();

    try {
      // Step 1: Translate if any segment lacks translatedText
      let workingSegments = job.input.segments.map((s) => ({ ...s }));
      const needsTranslate =
        !job.input.skipTranslation &&
        workingSegments.some((s) => s.sourceText.trim() && !s.translatedText.trim());

      if (needsTranslate) {
        job.status = "translating";
        job.progress = 10;
        job.stageLabel = `Translating ${workingSegments.length} lines to ${getDubLanguageLabel(job.input.targetLanguage)}...`;
        const translated = await translateDubSegments({
          segments: workingSegments,
          sourceLanguage: job.input.sourceLanguage,
          targetLanguage: job.input.targetLanguage,
          tone: job.input.tone,
        });
        workingSegments = translated.segments;
        if (job.input.sourceLanguage === "auto") {
          job.input.sourceLanguage = translated.detectedLanguage as DubLanguageCode;
        }
      }

      const activeSegments = workingSegments.filter((s) => (s.translatedText || s.sourceText).trim().length > 0);
      if (activeSegments.length === 0) {
        throw new Error("No spoken dialogue segments found to synthesize.");
      }
      job.segmentsTotal = activeSegments.length;

      // Step 2: Synthesize every segment via ModelScope Drama 3 GPU pool (voice clone or preset)
      const toneMeta = DUB_TONES.find((t) => t.value === job.input.tone) ?? DUB_TONES[0];
      const useCustom = job.input.voiceMode === "clone" || Boolean(job.input.customVoice?.audioBase64);

      if (useCustom && !job.input.customVoice?.audioBase64) {
        throw new Error("No speaker voice sample could be extracted from this video. Switch to a preset voice or pick another segment.");
      }

      job.status = "synthesizing";
      job.progress = 18;
      job.stageLabel = `Generating ${activeSegments.length} dubbed voice segments...`;

      const { wavs, studioLabel } = await ttsManager.synthesizeSegmentPool({
        segments: activeSegments.map((seg) => {
          const line = (seg.translatedText || seg.sourceText).trim();
          return {
            text: line,
            maxNewTokens: estimateMaxNewTokens(line),
          };
        }),
        voice: job.input.voiceId,
        customVoice: useCustom ? job.input.customVoice : null,
        preferredStudio: job.input.preferredStudio,
        style: toneMeta.ttsStyle,
        onWaiting: (bootingLabel, phase) => {
          job.status = "waiting_for_server";
          if (!job.bootStartedAt) job.bootStartedAt = Date.now();
          job.stageLabel = `Warming up ${bootingLabel || "voice studio"} (${phase || "booting GPU"}) — dubbing starts automatically...`;
        },
        onProgress: (done, total, sLabel) => {
          job.status = "synthesizing";
          job.segmentsDone = done;
          job.segmentsTotal = total;
          if (sLabel) job.assignedStudioLabel = sLabel;
          job.progress = 20 + Math.round((done / Math.max(1, total)) * 60);
        },
        onStageLabel: (label) => {
          if (job.status === "synthesizing") {
            job.stageLabel = label;
          }
        },
      });

      if (studioLabel) {
        job.assignedStudioLabel = studioLabel;
      }

      // Step 3: Time-align segments cleanly & assemble unified dubbed speech mix
      job.status = "mixing";
      job.progress = 85;
      job.stageLabel = "Aligning speech cadence to scene timestamps...";

      const assembled = await assembleDubbedSpeechTrack({
        segments: activeSegments,
        rawWavs: wavs,
        totalDurationSec: job.input.durationSeconds,
        syncToTimeline: job.input.syncToTimeline,
        voiceLabel: job.voiceLabel,
        title: `${job.input.sourceVideoName} (${getDubLanguageLabel(job.input.targetLanguage)})`,
      });

      const srtText = buildSrtFromSegments(assembled.alignedSegments, true);
      const vttText = buildVttFromSegments(assembled.alignedSegments, true);
      const completedAt = Date.now();
      const stageLabel = `Ready (${getDubLanguageLabel(job.input.targetLanguage)} via ${job.assignedStudioLabel || "ModelScope"})`;

      job.stageLabel = "Saving dubbed track to your 24h workspace...";
      const stored = await this.store.saveArtifact<DubStoredMeta>({
        id: job.id,
        toolSlug: DUB_TOOL_SLUG,
        ownerId: job.ownerId,
        fileName: job.fileName,
        mimeType: "audio/mpeg",
        buffer: assembled.mp3Buffer,
        createdAt: job.createdAt,
        completedAt,
        durationSeconds: assembled.durationSeconds,
        meta: {
          sourceLanguage: job.input.sourceLanguage,
          targetLanguage: job.input.targetLanguage,
          voiceLabel: job.voiceLabel,
          sourceVideoName: job.input.sourceVideoName,
          keepBackground: job.input.keepBackground,
          backgroundLevel: job.input.backgroundLevel,
          peaks: assembled.peaks,
          srtText,
          vttText,
          segments: assembled.alignedSegments,
          stageLabel,
          assignedStudioLabel: job.assignedStudioLabel,
          startedAt: job.createdAt,
        },
      });

      job.storageProvider = stored.record.storageProvider;
      job.expiresAt = stored.record.expiresAt;
      job.ttlMs = stored.record.ttlMs;
      job.mimeType = stored.record.mimeType;
      job.byteLength = stored.record.byteLength;
      job.durationSeconds = assembled.durationSeconds;
      job.peaks = assembled.peaks;
      job.srtText = srtText;
      job.vttText = vttText;
      job.alignedSegments = assembled.alignedSegments;
      job.status = "completed";
      job.progress = 100;
      job.completedAt = completedAt;
      job.stageLabel = stageLabel;
      await this.persistPendingJob(job);
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Video dubbing failed";
      job.stageLabel = "Failed";
      job.completedAt = Date.now();
      await this.persistPendingJob(job);
    }
  }

  public async attachMuxedVideo(options: {
    jobId: string;
    ownerId: string;
    videoBuffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<DubJobSnapshot | null> {
    await this.ensureInitialized();
    const job = this.jobs.get(options.jobId);
    if (!job || job.ownerId !== options.ownerId) return null;

    const videoGenId = `${job.id}_mp4`;
    const stored = await this.store.saveArtifact({
      id: videoGenId,
      toolSlug: `${DUB_TOOL_SLUG}-video`,
      ownerId: options.ownerId,
      fileName: options.fileName,
      mimeType: options.mimeType,
      buffer: options.videoBuffer,
      createdAt: job.createdAt,
      completedAt: Date.now(),
      durationSeconds: job.durationSeconds,
      meta: { parentDubJobId: job.id },
    });

    job.videoGenId = stored.record.id;
    return this.toSnapshot(job);
  }

  public async listJobsAsync(ownerId: string): Promise<DubJobSnapshot[]> {
    await this.ensureInitialized();
    const now = Date.now();
    return Array.from(this.jobs.values())
      .filter((j) => j.ownerId === ownerId && j.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((j) => this.toSnapshot(j));
  }

  public async getJobAsync(id: string, ownerId: string): Promise<DubJobSnapshot | null> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId || job.expiresAt <= Date.now()) return null;
    return this.toSnapshot(job);
  }

  public async deleteJob(id: string, ownerId: string): Promise<boolean> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId) return false;
    this.jobs.delete(id);
    await fsp.unlink(path.join(this.cacheRoot, "jobs", `${id}.json`)).catch(() => {});
    if (job.videoGenId) {
      await this.store.deleteGeneration(job.videoGenId, ownerId);
    }
    await this.store.deleteGeneration(id, ownerId);
    return true;
  }

  private toSnapshot(job: InternalDubJob): DubJobSnapshot {
    const now = Date.now();
    const bootElapsedMs =
      job.status === "waiting_for_server" && job.bootStartedAt
        ? Math.max(0, now - job.bootStartedAt)
        : 0;
    const elapsedMs = Math.max(0, (job.completedAt ?? now) - job.createdAt);

    return {
      id: job.id,
      ownerId: job.ownerId,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      assignedStudioLabel: job.assignedStudioLabel,
      bootElapsedMs,
      elapsedMs,
      segmentsDone: job.segmentsDone,
      segmentsTotal: job.segmentsTotal,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      ttlMs: job.ttlMs,
      storageProvider: job.storageProvider,
      audioUrl: job.status === "completed" ? `/api/generations/${job.id}/file` : null,
      downloadUrl: job.status === "completed" ? `/api/generations/${job.id}/file?download=1` : null,
      videoUrl: job.videoGenId ? `/api/generations/${job.videoGenId}/file` : null,
      videoDownloadUrl: job.videoGenId ? `/api/generations/${job.videoGenId}/file?download=1` : null,
      mimeType: job.mimeType,
      byteLength: job.byteLength,
      durationSeconds: job.durationSeconds,
      peaks: job.peaks,
      sourceLanguage: job.input.sourceLanguage,
      targetLanguage: job.input.targetLanguage,
      voiceLabel: job.voiceLabel,
      keepBackground: job.input.keepBackground,
      backgroundLevel: job.input.backgroundLevel,
      fileName: job.fileName,
      sourceVideoName: job.input.sourceVideoName,
      srtText: job.srtText,
      vttText: job.vttText,
      segments: job.alignedSegments,
      error: job.error,
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __frebiesVideoDubManager: VideoDubManagerCore | undefined;
}

export function getVideoDubManager(): VideoDubManagerCore {
  const cur = globalThis.__frebiesVideoDubManager as (VideoDubManagerCore & { revision?: number }) | undefined;
  if (!cur || cur.revision !== DUB_MANAGER_REVISION) {
    const fresh = new VideoDubManagerCore();
    globalThis.__frebiesVideoDubManager = fresh;
    return fresh;
  }
  return cur;
}
