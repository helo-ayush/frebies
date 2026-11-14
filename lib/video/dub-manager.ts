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
import {
  prepareAudioForDeepgramAndVad,
  transcribeAudioWithDeepgram,
} from "./dub-deepgram";
import {
  chunkAndTranslateWordsWithOpenRouter,
  translateDubSegments,
} from "./dub-translate";
import { extractVad20sCloneReference } from "./dub-vad";
import {
  DUB_TONES,
  MAX_DUB_DURATION_SEC,
  buildDualSrtFromSegments,
  buildSrtFromSegments,
  buildVttFromSegments,
  getDubLanguageLabel,
  type DubAlignedSegment,
  type DubCloneSource,
  type DubJobSnapshot,
  type DubJobStatus,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
  type DubVoiceMode,
  type VadReferenceInfo,
} from "./dub-types";

export const DUB_TOOL_SLUG = "video/dubbing";
const DUB_MANAGER_REVISION = 2;

export type CreateDubJobInput = {
  ownerId: string;
  sourceVideoName: string;
  mediaKind?: "video" | "audio";
  durationSeconds: number;
  sourceLanguage: DubLanguageCode;
  targetLanguage: DubTargetLanguageCode;
  voiceMode: DubVoiceMode;
  cloneSource?: DubCloneSource;
  voiceId: VoiceId;
  customVoice?: CustomVoiceInput | null;
  tone: DubTone;
  keepBackground: boolean;
  backgroundLevel: number;
  syncToTimeline: boolean;
  preferredStudio: string;
  segments: DubSegment[];
  skipTranslation?: boolean;
  vadReferenceInfo?: VadReferenceInfo | null;
  modelUsed?: string | null;
  /** Optional raw audio bytes uploaded from browser (for full Deepgram+OpenRouter pipeline and/or background ducking). */
  sourceAudioBuffer?: Buffer | null;
  sourceAudioMimeType?: string;
  sourceAudioExt?: string;
};

type InternalDubJob = {
  id: string;
  ownerId: string;
  input: Omit<CreateDubJobInput, "sourceAudioBuffer">;
  tempSourceAudioPath: string | null;
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
  detectedLanguage: string | null;
  srtText: string;
  vttText: string;
  sourceSrtText: string;
  sourceVttText: string;
  dualSrtText: string;
  vadReferenceInfo: VadReferenceInfo | null;
  modelUsed: string | null;
  alignedSegments: DubAlignedSegment[];
  error: string | null;
};

type DubStoredMeta = {
  sourceLanguage?: string;
  detectedLanguage?: string | null;
  targetLanguage?: string;
  voiceLabel?: string;
  sourceVideoName?: string;
  mediaKind?: "video" | "audio";
  keepBackground?: boolean;
  backgroundLevel?: number;
  peaks?: number[];
  srtText?: string;
  vttText?: string;
  sourceSrtText?: string;
  sourceVttText?: string;
  dualSrtText?: string;
  vadReferenceInfo?: VadReferenceInfo | null;
  modelUsed?: string | null;
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
      const aligned = Array.isArray(meta.segments) ? meta.segments : [];
      this.jobs.set(rec.id, {
        id: rec.id,
        ownerId: rec.ownerId,
        input: {
          ownerId: rec.ownerId,
          sourceVideoName: meta.sourceVideoName || rec.fileName,
          mediaKind: meta.mediaKind || "video",
          durationSeconds: rec.durationSeconds ?? 0,
          sourceLanguage: (meta.sourceLanguage as DubLanguageCode) || "auto",
          targetLanguage: (meta.targetLanguage as DubTargetLanguageCode) || "hi",
          voiceMode: "preset",
          cloneSource: "auto_vad",
          voiceId: "aria",
          tone: "natural",
          keepBackground: meta.keepBackground ?? true,
          backgroundLevel: meta.backgroundLevel ?? 0.18,
          syncToTimeline: true,
          preferredStudio: "auto",
          segments: [],
        },
        tempSourceAudioPath: null,
        status: "completed",
        progress: 100,
        stageLabel: meta.stageLabel || "Completed",
        assignedStudioLabel: meta.assignedStudioLabel ?? null,
        bootStartedAt: null,
        segmentsDone: aligned.length,
        segmentsTotal: aligned.length,
        createdAt: rec.createdAt,
        completedAt: rec.completedAt,
        expiresAt: rec.expiresAt,
        ttlMs: rec.ttlMs,
        storageProvider: rec.storageProvider,
        mimeType: rec.mimeType,
        byteLength: rec.byteLength,
        durationSeconds: rec.durationSeconds ?? 0,
        peaks: Array.isArray(meta.peaks) ? meta.peaks : [],
        voiceLabel: meta.voiceLabel || "Cloned speaker",
        fileName: rec.fileName,
        videoGenId: meta.videoGenId ?? videoByParentId.get(rec.id) ?? null,
        detectedLanguage: meta.detectedLanguage ?? null,
        srtText: meta.srtText || "",
        vttText: meta.vttText || "",
        sourceSrtText: meta.sourceSrtText || (aligned.length > 0 ? buildSrtFromSegments(aligned, false) : ""),
        sourceVttText: meta.sourceVttText || (aligned.length > 0 ? buildVttFromSegments(aligned, false) : ""),
        dualSrtText: meta.dualSrtText || (aligned.length > 0 ? buildDualSrtFromSegments(aligned) : ""),
        vadReferenceInfo: meta.vadReferenceInfo ?? null,
        modelUsed: meta.modelUsed ?? null,
        alignedSegments: aligned,
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
        tempSourceAudioPath: null,
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

    const cleanStem =
      input.sourceVideoName
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-z0-9-_]+/gi, "-")
        .slice(0, 42) || "media";
    const fileName = `${cleanStem}-dub-${input.targetLanguage}.mp3`;

    let voiceLabel = "Original speaker (VAD 20s clone)";
    if (input.voiceMode === "preset") {
      voiceLabel = getPresetVoiceReference(input.voiceId)?.name ?? input.voiceId;
    } else if (input.customVoice?.name?.trim()) {
      voiceLabel = input.customVoice.name.trim();
    }

    let tempSourceAudioPath: string | null = null;
    if (input.sourceAudioBuffer && input.sourceAudioBuffer.length > 0) {
      await fsp.mkdir(path.join(this.cacheRoot, "tmp"), { recursive: true });
      const ext = (input.sourceAudioExt || "wav").replace(/[^a-z0-9]/gi, "") || "wav";
      tempSourceAudioPath = path.join(this.cacheRoot, "tmp", `${id}.${ext}`);
      await fsp.writeFile(tempSourceAudioPath, input.sourceAudioBuffer);
    }

    const { sourceAudioBuffer: _discard, ...restInput } = input;
    void _discard;

    const job: InternalDubJob = {
      id,
      ownerId: input.ownerId,
      input: restInput,
      tempSourceAudioPath,
      status: "queued",
      progress: 4,
      stageLabel:
        restInput.segments.length === 0 && tempSourceAudioPath
          ? "Queued for Deepgram ASR & OpenRouter chunking..."
          : "Preparing dubbing timeline...",
      assignedStudioLabel: null,
      bootStartedAt: null,
      segmentsDone: 0,
      segmentsTotal: restInput.segments.length,
      createdAt: now,
      completedAt: null,
      expiresAt: now + ttlMs,
      ttlMs,
      storageProvider: null,
      mimeType: null,
      byteLength: null,
      durationSeconds: Math.min(MAX_DUB_DURATION_SEC, Math.max(1, input.durationSeconds || 5)),
      peaks: [],
      voiceLabel,
      fileName,
      videoGenId: null,
      detectedLanguage: null,
      srtText: "",
      vttText: "",
      sourceSrtText: "",
      sourceVttText: "",
      dualSrtText: "",
      vadReferenceInfo: input.vadReferenceInfo ?? null,
      modelUsed: input.modelUsed ?? null,
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
    let backgroundWavBuffer: Buffer | null = null;

    try {
      let workingSegments = job.input.segments.map((s) => ({ ...s }));
      let customVoiceToUse = job.input.customVoice ? { ...job.input.customVoice } : null;

      // Prepare source audio on disk if provided (used for Deepgram ASR, VAD 20s clone, or background mix)
      let preparedAudio: {
        wav24kBuffer: Buffer;
        deepgramPayload: Buffer;
        deepgramMimeType: string;
        durationSeconds: number;
      } | null = null;

      if (job.tempSourceAudioPath) {
        const rawBuf = await fsp.readFile(job.tempSourceAudioPath);
        preparedAudio = await prepareAudioForDeepgramAndVad(
          rawBuf,
          job.input.sourceAudioMimeType,
          job.input.sourceAudioExt,
        );
        if (preparedAudio.durationSeconds > 1) {
          job.durationSeconds = Math.min(MAX_DUB_DURATION_SEC, preparedAudio.durationSeconds);
          job.input.durationSeconds = job.durationSeconds;
        }
        if (job.input.keepBackground) {
          backgroundWavBuffer = preparedAudio.wav24kBuffer;
        }
      }

      // Step 1: If caller submitted raw extracted audio without pre-chunked segments, run Deepgram + VAD + OpenRouter
      if (workingSegments.length === 0) {
        if (!preparedAudio) {
          throw new Error("No dialogue segments or extracted audio supplied.");
        }

        job.status = "transcribing";
        job.progress = 8;
        job.stageLabel = "Transcribing audio word timestamps via Deepgram...";

        const dg = await transcribeAudioWithDeepgram({
          audioBuffer: preparedAudio.deepgramPayload,
          mimeType: preparedAudio.deepgramMimeType,
          sourceLanguage: job.input.sourceLanguage,
          durationSeconds: preparedAudio.durationSeconds,
          onTripProgress: (idx, total, label) => {
            job.progress = 8 + Math.round(((idx + 0.5) / Math.max(1, total)) * 5);
            job.stageLabel = `Deepgram ASR ${label}...`;
          },
        });

        if (dg.words.length === 0) {
          throw new Error("Deepgram did not detect clear speech in this audio.");
        }

        job.detectedLanguage = dg.detectedLanguage;
        if (dg.durationSeconds > 1) {
          job.durationSeconds = Math.min(MAX_DUB_DURATION_SEC, dg.durationSeconds);
          job.input.durationSeconds = job.durationSeconds;
        }

        // Step 1b: Extract ~20s VAD continuous speech sample if user requested speaker cloning and didn't provide custom file
        if (job.input.voiceMode === "clone" && !customVoiceToUse?.audioBase64) {
          job.progress = 14;
          job.stageLabel = "Finding ~20s clean speech sample via VAD...";
          const vadRef = extractVad20sCloneReference({
            wavBuffer: preparedAudio.wav24kBuffer,
            words: dg.words,
            targetDurationSec: 20,
          });
          if (vadRef) {
            customVoiceToUse = {
              name: `${job.input.sourceVideoName.replace(/\.[^/.]+$/, "").slice(0, 22)} (20s VAD)`,
              audioBase64: vadRef.audioBase64,
              text: vadRef.info.text,
            };
            job.vadReferenceInfo = vadRef.info;
            job.voiceLabel = customVoiceToUse.name;
          }
        }

        job.status = "translating";
        job.progress = 17;
        job.stageLabel = `Semantic chunking & translating into ${getDubLanguageLabel(job.input.targetLanguage)} via Nemotron 3 Ultra...`;

        const chunked = await chunkAndTranslateWordsWithOpenRouter({
          words: dg.words,
          sourceLanguage: dg.detectedLanguage || job.input.sourceLanguage,
          targetLanguage: job.input.targetLanguage,
          tone: job.input.tone,
          autoTranslate: true,
          onTripProgress: (idx, total, label) => {
            job.progress = 17 + Math.round(((idx + 0.5) / Math.max(1, total)) * 4);
            job.stageLabel = `${label}: Semantic chunking & Drama 3 tags via Nemotron 3 Ultra...`;
          },
        });

        workingSegments = chunked.segments;
        job.modelUsed = chunked.modelUsed;
        job.detectedLanguage = chunked.detectedLanguage || dg.detectedLanguage;
      } else {
        // Pre-chunked segments provided: translate any untranslated lines via OpenRouter
        const needsTranslate =
          !job.input.skipTranslation &&
          workingSegments.some((s) => s.sourceText.trim() && !s.translatedText.trim());

        if (needsTranslate) {
          job.status = "translating";
          job.progress = 12;
          job.stageLabel = `Translating ${workingSegments.length} lines with Drama 3 expression tags via Nemotron 3 Ultra...`;
          const translated = await translateDubSegments({
            segments: workingSegments,
            sourceLanguage: job.input.sourceLanguage,
            targetLanguage: job.input.targetLanguage,
            tone: job.input.tone,
            onTripProgress: (idx, total, label) => {
              job.progress = 12 + Math.round(((idx + 0.5) / Math.max(1, total)) * 8);
              job.stageLabel = `${label}: Translating via Nemotron 3 Ultra...`;
            },
          });
          workingSegments = translated.segments;
          job.modelUsed = translated.modelUsed;
          job.detectedLanguage = translated.detectedLanguage;
        }
      }

      const activeSegments = workingSegments.filter((s) => (s.translatedText || s.sourceText).trim().length > 0);
      if (activeSegments.length === 0) {
        throw new Error("No spoken dialogue segments found to synthesize.");
      }
      job.segmentsTotal = activeSegments.length;

      // Step 2: Ensure custom reference voice is available if cloning
      const toneMeta = DUB_TONES.find((t) => t.value === job.input.tone) ?? DUB_TONES[0];
      const useCustom = job.input.voiceMode === "clone" || Boolean(customVoiceToUse?.audioBase64);

      if (useCustom && !customVoiceToUse?.audioBase64 && preparedAudio) {
        const vadFallback = extractVad20sCloneReference({
          wavBuffer: preparedAudio.wav24kBuffer,
          targetDurationSec: 20,
        });
        if (vadFallback) {
          customVoiceToUse = {
            name: `${job.input.sourceVideoName.replace(/\.[^/.]+$/, "").slice(0, 22)} (20s VAD)`,
            audioBase64: vadFallback.audioBase64,
            text: vadFallback.info.text,
          };
          job.vadReferenceInfo = vadFallback.info;
        }
      }

      if (useCustom && !customVoiceToUse?.audioBase64) {
        throw new Error(
          "No clean voice reference could be extracted. Upload a custom voice sample or switch to a Studio preset voice.",
        );
      }

      job.status = "synthesizing";
      job.progress = 22;
      job.stageLabel = `Synthesizing ${activeSegments.length} expressive lines via Drama 3...`;

      const { wavs, studioLabel } = await ttsManager.synthesizeSegmentPool({
        segments: activeSegments.map((seg) => {
          const line = (seg.translatedText || seg.sourceText).trim();
          return {
            text: line,
            maxNewTokens: estimateMaxNewTokens(line),
          };
        }),
        voice: job.input.voiceId,
        customVoice: useCustom ? customVoiceToUse : null,
        preferredStudio: job.input.preferredStudio,
        style: toneMeta.ttsStyle,
        onWaiting: (bootingLabel, phase) => {
          job.status = "waiting_for_server";
          if (!job.bootStartedAt) job.bootStartedAt = Date.now();
          job.stageLabel = `Warming up ${bootingLabel || "voice GPU"} (${phase || "booting"}) — dubbing resumes automatically...`;
        },
        onProgress: (done, total, sLabel) => {
          job.status = "synthesizing";
          job.segmentsDone = done;
          job.segmentsTotal = total;
          if (sLabel) job.assignedStudioLabel = sLabel;
          job.progress = 22 + Math.round((done / Math.max(1, total)) * 60);
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

      // Step 3: Time-align segments cleanly & assemble unified dubbed MP3 (streaming disk writer for up to 2h)
      job.status = "mixing";
      job.progress = 85;
      job.stageLabel = "Time-aligning dialogue cadence & mastering audio...";

      const assembled = await assembleDubbedSpeechTrack({
        segments: activeSegments,
        rawWavs: wavs,
        totalDurationSec: job.durationSeconds,
        syncToTimeline: job.input.syncToTimeline,
        voiceLabel: job.voiceLabel,
        title: `${job.input.sourceVideoName} (${getDubLanguageLabel(job.input.targetLanguage)})`,
        keepBackground: job.input.keepBackground,
        backgroundLevel: job.input.backgroundLevel,
        backgroundWavBuffer,
      });

      const srtText = buildSrtFromSegments(assembled.alignedSegments, true);
      const vttText = buildVttFromSegments(assembled.alignedSegments, true);
      const sourceSrtText = buildSrtFromSegments(assembled.alignedSegments, false);
      const sourceVttText = buildVttFromSegments(assembled.alignedSegments, false);
      const dualSrtText = buildDualSrtFromSegments(assembled.alignedSegments);
      const completedAt = Date.now();
      const stageLabel = `Ready (${getDubLanguageLabel(job.input.targetLanguage)} via ${job.assignedStudioLabel || "Drama 3"})`;

      job.progress = 94;
      job.stageLabel = "Saving dubbed audio & subtitles to Tigris cloud vault...";
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
          detectedLanguage: job.detectedLanguage,
          targetLanguage: job.input.targetLanguage,
          voiceLabel: job.voiceLabel,
          sourceVideoName: job.input.sourceVideoName,
          mediaKind: job.input.mediaKind || "video",
          keepBackground: job.input.keepBackground,
          backgroundLevel: job.input.backgroundLevel,
          peaks: assembled.peaks,
          srtText,
          vttText,
          sourceSrtText,
          sourceVttText,
          dualSrtText,
          vadReferenceInfo: job.vadReferenceInfo,
          modelUsed: job.modelUsed,
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
      job.sourceSrtText = sourceSrtText;
      job.sourceVttText = sourceVttText;
      job.dualSrtText = dualSrtText;
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
    } finally {
      if (job.tempSourceAudioPath) {
        await fsp.unlink(job.tempSourceAudioPath).catch(() => {});
        job.tempSourceAudioPath = null;
      }
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
    if (job.tempSourceAudioPath) {
      await fsp.unlink(job.tempSourceAudioPath).catch(() => {});
    }
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
      detectedLanguage: job.detectedLanguage,
      targetLanguage: job.input.targetLanguage,
      voiceLabel: job.voiceLabel,
      keepBackground: job.input.keepBackground,
      backgroundLevel: job.input.backgroundLevel,
      fileName: job.fileName,
      sourceVideoName: job.input.sourceVideoName,
      mediaKind: job.input.mediaKind || "video",
      srtText: job.srtText,
      vttText: job.vttText,
      sourceSrtText: job.sourceSrtText,
      sourceVttText: job.sourceVttText,
      dualSrtText: job.dualSrtText,
      vadReferenceInfo: job.vadReferenceInfo,
      modelUsed: job.modelUsed,
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
