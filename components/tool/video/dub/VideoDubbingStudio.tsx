"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Captions,
  Clock,
  Cloud,
  Download,
  FileText,
  Film,
  Languages,
  Loader2,
  Lock,
  Mic2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  Volume2,
  Wand2,
} from "lucide-react";
import { Progress } from "@/components/arc/progress/progress";
import { useAuthSession } from "@/components/auth/AuthContext";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import type { SavedCustomVoice } from "@/components/tool/audio/tts/model";
import { loadSavedClonedVoices } from "@/components/tool/audio/tts/voice-clone-utils";
import {
  GenerationExpiryBadge,
  GenerationStorageNotice,
} from "@/components/tool/GenerationRetentionBadge";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import type { PoolStatusSnapshot } from "@/lib/audio/tts-manager";
import type { GenerationStorageStats } from "@/lib/storage/generation-store";
import {
  DEFAULT_DUB_SETTINGS,
  buildSrtFromSegments,
  dubCredits,
  getDubLanguageLabel,
  parseSubtitleText,
  type DubJobSnapshot,
  type DubSegment,
  type DubSettings,
} from "@/lib/video/dub-types";
import { DubControls } from "./DubControls";
import {
  buildSpeakerCloneReference,
  extractVideoAudio,
  probeVideoFile,
  remuxDubbedVideoInBrowser,
  type ExtractedSpeakerRef,
} from "./video-audio-utils";
import { transcribeAudioInBrowser, type AsrProgress } from "./whisper-asr";

const ACTIVE_DUB_STATUSES = new Set([
  "queued",
  "waiting_for_server",
  "translating",
  "synthesizing",
  "mixing",
]);

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;

type LoadedVideo = {
  file: File;
  url: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
};

type RemuxedVideoResult = {
  jobId: string;
  url: string;
  blob: Blob;
  fileName: string;
  savedToVault?: boolean;
};

export function VideoDubbingStudio({ maxSizeMB = 150 }: { maxSizeMB?: number }) {
  const { isLoaded, isSignedIn, user } = useAuthSession();
  const ownerUserId = isSignedIn ? (user?.id ?? null) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const syncedAudioRef = useRef<HTMLAudioElement>(null);
  const asrAbortRef = useRef<AbortController | null>(null);
  const extractedBufferRef = useRef<AudioBuffer | null>(null);
  const extractedPcm16kRef = useRef<Float32Array | null>(null);
  const prevOwnerRef = useRef<string | null>(null);

  const [dragging, setDragging] = useState(false);
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DubSettings>(DEFAULT_DUB_SETTINGS);

  const [segments, setSegments] = useState<DubSegment[]>([]);
  const [speakerRef, setSpeakerRef] = useState<ExtractedSpeakerRef | null>(null);
  const [savedClones, setSavedClones] = useState<SavedCustomVoice[]>([]);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);

  const [extractingAudio, setExtractingAudio] = useState(false);
  const [asrProgress, setAsrProgress] = useState<AsrProgress | null>(null);
  const [translating, setTranslating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [pool, setPool] = useState<PoolStatusSnapshot | null>(null);
  const [jobs, setJobs] = useState<DubJobSnapshot[]>([]);
  const [storage, setStorage] = useState<GenerationStorageStats | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Playback A/B + MP4 remux cache per job
  const [previewTrack, setPreviewTrack] = useState<"original" | "dubbed">("dubbed");
  const [activeDubJobId, setActiveDubJobId] = useState<string | null>(null);
  const [videoCurrentSec, setVideoCurrentSec] = useState(0);
  const [remuxingJobId, setRemuxingJobId] = useState<string | null>(null);
  const [remuxStage, setRemuxStage] = useState<string | null>(null);
  const [remuxedByJob, setRemuxedByJob] = useState<Record<string, RemuxedVideoResult>>({});
  const [savingVaultId, setSavingVaultId] = useState<string | null>(null);

  const fetchStatus = useCallback(async (opts?: { wake?: boolean }) => {
    const qs = opts?.wake ? "?wake=1" : "";
    const res = await fetch(`/api/video/dub/status${qs}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      pool: PoolStatusSnapshot;
      jobs: DubJobSnapshot[];
      storage: GenerationStorageStats | null;
    };
    setPool(data.pool);
    setJobs(data.jobs);
    setStorage(data.storage);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (prevOwnerRef.current !== ownerUserId) {
      prevOwnerRef.current = ownerUserId;
      setJobs([]);
      setStorage(null);
      setActiveDubJobId(null);
      setActiveCloneId(null);
      setRemuxedByJob({});
      setSavedClones(loadSavedClonedVoices(ownerUserId));
    }
    void fetchStatus({ wake: Boolean(isSignedIn) });
  }, [isLoaded, isSignedIn, ownerUserId, fetchStatus]);

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => ACTIVE_DUB_STATUSES.has(j.status)),
    [jobs],
  );

  useEffect(() => {
    if (!isSignedIn || !hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void fetchStatus();
    }, 2400);
    return () => window.clearInterval(timer);
  }, [isSignedIn, hasActiveJobs, fetchStatus]);

  // Select latest completed job matching this video automatically when ready
  const latestCompletedForVideo = useMemo(() => {
    const match = jobs.find(
      (j) =>
        j.status === "completed" &&
        (activeDubJobId ? j.id === activeDubJobId : !video || j.sourceVideoName === video.name),
    );
    return match ?? jobs.find((j) => j.status === "completed") ?? null;
  }, [jobs, activeDubJobId, video]);

  const activeDubAudioUrl = latestCompletedForVideo?.audioUrl ?? null;
  const activeRemuxed = latestCompletedForVideo ? remuxedByJob[latestCompletedForVideo.id] ?? null : null;

  // Keep synced external dubbed <audio> locked tightly to <video> when user previews A/B before MP4 remux
  useEffect(() => {
    const vEl = videoElRef.current;
    const aEl = syncedAudioRef.current;
    if (!vEl) return;

    const usingSeparateAudioSync =
      previewTrack === "dubbed" && Boolean(activeDubAudioUrl) && !activeRemuxed;

    vEl.muted = usingSeparateAudioSync;
    if (!aEl || !usingSeparateAudioSync) {
      aEl?.pause();
      return;
    }

    const onPlay = () => {
      aEl.currentTime = vEl.currentTime;
      void aEl.play().catch(() => {});
    };
    const onPause = () => aEl.pause();
    const onSeeked = () => {
      aEl.currentTime = vEl.currentTime;
    };
    const onRateChange = () => {
      aEl.playbackRate = vEl.playbackRate;
    };

    vEl.addEventListener("play", onPlay);
    vEl.addEventListener("pause", onPause);
    vEl.addEventListener("seeked", onSeeked);
    vEl.addEventListener("ratechange", onRateChange);

    if (!vEl.paused) onPlay();

    return () => {
      vEl.removeEventListener("play", onPlay);
      vEl.removeEventListener("pause", onPause);
      vEl.removeEventListener("seeked", onSeeked);
      vEl.removeEventListener("ratechange", onRateChange);
    };
  }, [previewTrack, activeDubAudioUrl, activeRemuxed]);

  // Cleanup URLs cleanly
  useEffect(() => {
    return () => {
      if (video?.url) URL.revokeObjectURL(video.url);
    };
  }, [video?.url]);

  function patchSettings(next: Partial<DubSettings>) {
    setSettings((cur) => ({ ...cur, ...next }));
  }

  async function ingestVideoFile(file: File) {
    setLoadError(null);
    setStatusError(null);

    if (!file.type.startsWith("video/") && !VIDEO_EXT.test(file.name)) {
      setLoadError("Unsupported file type. Choose an MP4, MOV, WebM, or MKV video.");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setLoadError(`Video is ${formatBytes(file.size)} — maximum is ${maxSizeMB} MB.`);
      return;
    }

    try {
      const meta = await probeVideoFile(file);
      if (meta.duration > 10 * 60) {
        setLoadError("Video exceeds 10 minutes at launch. Trim it shorter and try again.");
        return;
      }

      if (video?.url) URL.revokeObjectURL(video.url);
      extractedBufferRef.current = null;
      extractedPcm16kRef.current = null;
      setSpeakerRef(null);
      setSegments([]);
      setActiveDubJobId(null);
      setPreviewTrack("original");

      const nextVideo: LoadedVideo = {
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
      };
      setVideo(nextVideo);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this video file.");
    }
  }

  async function ensureExtractedAudio(targetVideo: LoadedVideo): Promise<{
    audioBuffer: AudioBuffer;
    pcm16k: Float32Array;
  }> {
    if (extractedBufferRef.current && extractedPcm16kRef.current) {
      return {
        audioBuffer: extractedBufferRef.current,
        pcm16k: extractedPcm16kRef.current,
      };
    }

    setExtractingAudio(true);
    try {
      const decoded = await extractVideoAudio(targetVideo.file, (label) => {
        setAsrProgress({ phase: "loading_model", percent: 5, label });
      });
      extractedBufferRef.current = decoded.audioBuffer;
      extractedPcm16kRef.current = decoded.pcm16k;
      return { audioBuffer: decoded.audioBuffer, pcm16k: decoded.pcm16k };
    } finally {
      setExtractingAudio(false);
    }
  }

  async function runLocalTranscription(targetVideo = video): Promise<DubSegment[] | null> {
    if (!targetVideo) return null;
    setStatusError(null);
    asrAbortRef.current?.abort();
    const controller = new AbortController();
    asrAbortRef.current = controller;

    try {
      const { audioBuffer, pcm16k } = await ensureExtractedAudio(targetVideo);
      const res = await transcribeAudioInBrowser({
        pcm16k,
        durationSec: targetVideo.duration,
        languageHint: settings.sourceLanguage,
        signal: controller.signal,
        onProgress: setAsrProgress,
      });

      setSegments(res.segments);
      if (res.segments.length === 0) {
        setStatusError(
          "No clear speech was detected in this video. Add lines manually or import an SRT/VTT caption file.",
        );
      } else {
        const refClip = buildSpeakerCloneReference(audioBuffer, res.segments);
        setSpeakerRef((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return refClip;
        });
      }
      setAsrProgress(null);
      return res.segments;
    } catch (err) {
      setAsrProgress(null);
      setStatusError(err instanceof Error ? err.message : "Speech recognition failed.");
      return null;
    }
  }

  async function handleTranslateOnly(segsInput?: DubSegment[]): Promise<DubSegment[] | null> {
    if (!isSignedIn) {
      setGateOpen(true);
      return null;
    }
    const list = segsInput ?? segments;
    if (list.length === 0) {
      setStatusError("Transcribe your video or import SRT captions before translating.");
      return null;
    }

    setStatusError(null);
    setTranslating(true);
    try {
      const res = await fetch("/api/video/dub/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: list,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
          tone: settings.tone,
        }),
      });
      const data = (await res.json()) as {
        segments?: DubSegment[];
        detectedLanguage?: string;
        error?: string;
      };
      if (!res.ok || !data.segments) {
        throw new Error(data.error || "Translation failed.");
      }
      setSegments(data.segments);
      return data.segments;
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not translate segments.");
      return null;
    } finally {
      setTranslating(false);
    }
  }

  async function handleStartDubbing() {
    if (!video) return;
    setStatusError(null);

    let workingSegments = segments;
    if (workingSegments.length === 0) {
      const transcribed = await runLocalTranscription(video);
      if (!transcribed || transcribed.length === 0) return;
      workingSegments = transcribed;
    }

    if (!isSignedIn) {
      setGateOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      // Ensure speaker clone audio reference is ready if cloning mode is selected
      let refToSend: { name: string; audioBase64: string; text: string } | null = null;
      if (activeCloneId) {
        const saved = savedClones.find((c) => c.id === activeCloneId);
        if (saved) {
          refToSend = { name: saved.name, audioBase64: saved.audioBase64, text: saved.text };
        }
      } else if (settings.voiceMode === "clone") {
        let localRef = speakerRef;
        if (!localRef) {
          const { audioBuffer } = await ensureExtractedAudio(video);
          localRef = buildSpeakerCloneReference(audioBuffer, workingSegments);
          if (localRef) setSpeakerRef(localRef);
        }
        if (localRef) {
          refToSend = {
            name: `${video.name.replace(/\.[^/.]+$/, "").slice(0, 22)} speaker`,
            audioBase64: localRef.audioBase64,
            text: localRef.text,
          };
        }
      }

      const res = await fetch("/api/video/dub/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceVideoName: video.name,
          durationSeconds: video.duration,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
          voiceMode: refToSend ? "clone" : "preset",
          voiceId: settings.voiceId,
          customVoice: refToSend,
          tone: settings.tone,
          keepBackground: settings.keepBackground,
          backgroundLevel: settings.backgroundLevel,
          syncToTimeline: settings.syncToTimeline,
          preferredStudio: settings.preferredStudio,
          segments: workingSegments,
        }),
      });

      const data = (await res.json()) as { job?: DubJobSnapshot; error?: string };
      if (!res.ok || !data.job) {
        throw new Error(data.error || "Could not queue dubbing job.");
      }

      setJobs((cur) => [data.job!, ...cur.filter((x) => x.id !== data.job!.id)]);
      setActiveDubJobId(data.job.id);
      setPreviewTrack("dubbed");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to start video dubbing.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImportCaptions(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSubtitleText(text);
      if (parsed.length === 0) {
        setStatusError("Could not find timed subtitle blocks inside that file.");
        return;
      }
      setSegments(parsed);
      setStatusError(null);
      if (video) {
        const { audioBuffer } = await ensureExtractedAudio(video);
        const refClip = buildSpeakerCloneReference(audioBuffer, parsed);
        if (refClip) setSpeakerRef(refClip);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to read caption file.");
    }
  }

  async function handleRemuxJob(job: DubJobSnapshot) {
    if (!video || !job.audioUrl) return;
    setRemuxingJobId(job.id);
    setRemuxStage("Starting video mux...");
    setStatusError(null);
    try {
      const result = await remuxDubbedVideoInBrowser({
        sourceVideo: video.file,
        dubbedAudioUrl: job.audioUrl,
        segments: job.segments,
        keepBackground: job.keepBackground,
        backgroundLevel: job.backgroundLevel,
        onProgress: setRemuxStage,
      });

      setRemuxedByJob((cur) => ({
        ...cur,
        [job.id]: {
          jobId: job.id,
          url: result.url,
          blob: result.blob,
          fileName: result.fileName,
        },
      }));
      setActiveDubJobId(job.id);
      setPreviewTrack("dubbed");
      setRemuxStage(null);
    } catch (err) {
      setRemuxStage(null);
      setStatusError(err instanceof Error ? err.message : "MP4 muxing failed in browser.");
    } finally {
      setRemuxingJobId(null);
    }
  }

  async function handleSaveRemuxToVault(job: DubJobSnapshot) {
    const mux = remuxedByJob[job.id];
    if (!mux || !isSignedIn) return;
    setSavingVaultId(job.id);
    try {
      const form = new FormData();
      form.append("file", mux.blob, mux.fileName);
      form.append("fileName", mux.fileName);
      const res = await fetch(`/api/video/dub/jobs/${job.id}`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { job?: DubJobSnapshot; error?: string };
      if (!res.ok || !data.job) {
        throw new Error(data.error || "Could not upload MP4 to 24h vault.");
      }
      setJobs((cur) => cur.map((j) => (j.id === job.id ? data.job! : j)));
      setRemuxedByJob((cur) => ({
        ...cur,
        [job.id]: { ...cur[job.id], savedToVault: true },
      }));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSavingVaultId(null);
    }
  }

  function downloadTextBlob(content: string, filename: string, mime = "text/plain;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleDeleteJob(jobId: string) {
    const res = await fetch(`/api/video/dub/jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      setJobs((cur) => cur.filter((j) => j.id !== jobId));
      if (activeDubJobId === jobId) setActiveDubJobId(null);
    }
  }

  const activeCaptionSegment = useMemo(() => {
    const list: DubSegment[] =
      latestCompletedForVideo && previewTrack === "dubbed"
        ? latestCompletedForVideo.segments
        : segments;
    return list.find((s) => {
      const aligned = s as DubSegment & { alignedStartSec?: number; alignedEndSec?: number };
      const start = aligned.alignedStartSec ?? s.startSec;
      const end = aligned.alignedEndSec ?? s.endSec;
      return videoCurrentSec >= start - 0.05 && videoCurrentSec <= end + 0.15;
    });
  }, [latestCompletedForVideo, previewTrack, segments, videoCurrentSec]);

  const translatedCount = useMemo(
    () => segments.filter((s) => s.translatedText.trim().length > 0).length,
    [segments],
  );
  const estimatedCredits = video ? dubCredits(video.duration) : 5;

  const videoSrcToPlay =
    previewTrack === "dubbed" && activeRemuxed ? activeRemuxed.url : video?.url ?? undefined;

  return (
    <section
      id="video-dubbing"
      aria-label="Video dubbing studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      {/* Studio header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/video/dubbing" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Dubbing studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Video in, localized speech &amp; synced MP4 out.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            5 credits / min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-muted">
            <Cloud size={10} aria-hidden />
            Whisper + Qwen + Drama 3
          </span>
          {!isSignedIn && (
            <button
              type="button"
              onClick={() => setGateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
            >
              <Lock size={10} className="text-accent" aria-hidden />
              Sign in to generate
            </button>
          )}
        </div>
      </div>

      {/* Main 2-column studio grid */}
      <div className="grid lg:h-[820px] lg:grid-cols-[minmax(0,1fr)_396px]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-4 sm:p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void ingestVideoFile(file);
            }}
            className="hidden"
          />
          <input
            ref={captionInputRef}
            type="file"
            accept=".srt,.vtt,text/vtt"
            onChange={(e) => void handleImportCaptions(e)}
            className="hidden"
          />

          {loadError && (
            <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-[#f2c6c2] bg-[#fdf4f3] px-3.5 py-2.5 text-[12px] text-[#9b3127]">
              <AlertCircle size={15} className="shrink-0" aria-hidden />
              <span>{loadError}</span>
            </div>
          )}

          {statusError && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-[12px] border border-[#f2c6c2] bg-[#fdf4f3] px-3.5 py-2.5 text-[12px] text-[#9b3127]">
              <span className="flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" aria-hidden />
                {statusError}
              </span>
              <button
                type="button"
                onClick={() => setStatusError(null)}
                className="text-[11px] font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!video ? (
            <div
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void ingestVideoFile(file);
              }}
              className={`flex min-h-[340px] flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition-colors ${
                dragging
                  ? "border-accent bg-accent/[0.04]"
                  : "border-[#d7d7d3] bg-[#fafaf9]"
              }`}
            >
              <span className="grid h-13 w-13 place-items-center rounded-[14px] border border-line bg-white p-3 text-ink shadow-[0_2px_10px_rgba(15,15,16,0.05)]">
                <UploadCloud size={24} strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.025em] text-ink">
                Drop your video to translate &amp; dub
              </h3>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
                Clips, tutorials, reels, lectures or interviews. Transcription runs privately on your device; translation and voice dubbing run on cloud GPUs.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#272729]"
              >
                <Film size={14} aria-hidden />
                Choose video file
              </button>
              <p className="mt-3 text-[11px] text-faint">
                MP4, MOV, WebM, MKV · up to {maxSizeMB} MB · up to 10 minutes
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {[
                  [Mic2, "Auto speaker voice clone"],
                  [Captions, "On-device Whisper ASR"],
                  [Volume2, "Smart background ducking"],
                  [FileText, "Synced SRT subtitles"],
                ].map(([Icon, label]) => {
                  const ChipIcon = Icon as typeof Mic2;
                  return (
                    <span
                      key={label as string}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] text-muted"
                    >
                      <ChipIcon size={11} className="text-accent" aria-hidden />
                      {label as string}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Video preview player */}
              <div className="relative overflow-hidden rounded-[18px] border border-line bg-[#111113]">
                <div className="relative aspect-video w-full max-h-[340px] bg-black">
                  <video
                    ref={videoElRef}
                    key={videoSrcToPlay}
                    src={videoSrcToPlay}
                    controls
                    playsInline
                    onTimeUpdate={(e) => setVideoCurrentSec(e.currentTarget.currentTime)}
                    className="h-full w-full object-contain"
                  />
                  {activeDubAudioUrl && !activeRemuxed && (
                    <audio ref={syncedAudioRef} src={activeDubAudioUrl} preload="auto" />
                  )}

                  {activeCaptionSegment && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-12 flex justify-center">
                      <span className="max-w-[92%] rounded-lg bg-black/75 px-3 py-1.5 text-center text-[12.5px] font-medium leading-snug text-white backdrop-blur-sm">
                        {previewTrack === "dubbed"
                          ? activeCaptionSegment.translatedText || activeCaptionSegment.sourceText
                          : activeCaptionSegment.sourceText}
                      </span>
                    </div>
                  )}
                </div>

                {/* Video toolbar & A/B switcher */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#18181b] px-4 py-2.5 text-white">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-white">{video.name}</p>
                    <p className="text-[10.5px] text-white/60">
                      {video.width}×{video.height} · {formatTime(video.duration, false)} · {formatBytes(video.size)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeDubAudioUrl && (
                      <div className="inline-flex rounded-full bg-white/10 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPreviewTrack("original")}
                          className={`rounded-full px-3 py-1 font-medium transition-colors ${
                            previewTrack === "original" ? "bg-white text-ink" : "text-white/75 hover:text-white"
                          }`}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewTrack("dubbed")}
                          className={`rounded-full px-3 py-1 font-medium transition-colors ${
                            previewTrack === "dubbed" ? "bg-accent text-white" : "text-white/75 hover:text-white"
                          }`}
                        >
                          Dubbed ({getDubLanguageLabel(latestCompletedForVideo?.targetLanguage || settings.targetLanguage)})
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-white/85 hover:bg-white/10"
                    >
                      Replace video
                    </button>
                  </div>
                </div>
              </div>

              {/* Pipeline quick actions bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-[#fafaf9] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runLocalTranscription(video)}
                    disabled={extractingAudio || Boolean(asrProgress)}
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[#272729] disabled:opacity-50"
                  >
                    {extractingAudio || asrProgress ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Wand2 size={12} aria-hidden />
                    )}
                    {segments.length > 0 ? "Re-transcribe video" : "1. Auto-transcribe audio"}
                  </button>

                  <button
                    type="button"
                    onClick={() => captionInputRef.current?.click()}
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-rail"
                  >
                    <Captions size={12} aria-hidden />
                    Import .SRT/.VTT
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleTranslateOnly()}
                    disabled={segments.length === 0 || translating}
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-rail disabled:opacity-45"
                  >
                    {translating ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Languages size={12} className="text-accent" aria-hidden />
                    )}
                    2. Preview translations
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const lastEnd = segments[segments.length - 1]?.endSec ?? 0;
                    const startSec = Number(Math.min(Math.max(0, video.duration - 2), lastEnd + 0.2).toFixed(2));
                    const endSec = Number(Math.min(video.duration, startSec + 3).toFixed(2));
                    setSegments((cur) => [
                      ...cur,
                      {
                        id: `seg_${Date.now().toString(36)}`,
                        startSec,
                        endSec,
                        sourceText: "",
                        translatedText: "",
                      },
                    ]);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink"
                >
                  <Plus size={11} aria-hidden />
                  Add line
                </button>
              </div>

              {asrProgress && (
                <div className="rounded-[12px] border border-line bg-white p-3">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
                      {asrProgress.label}
                    </span>
                    <span className="font-mono text-[11px] text-faint">{asrProgress.percent}%</span>
                  </div>
                  <Progress value={asrProgress.percent} className="mt-2 h-1.5" />
                </div>
              )}

              {/* Segment timeline & dual-language editor */}
              {segments.length > 0 && (
                <div className="rounded-[16px] border border-line bg-white">
                  <div className="flex items-center justify-between border-b border-line-soft px-3.5 py-2.5">
                    <p className="text-[12px] font-semibold text-ink">
                      Dialogue script &amp; scene timing ({segments.length} segments)
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        downloadTextBlob(
                          buildSrtFromSegments(segments, translatedCount > 0),
                          `${video.name.replace(/\.[^/.]+$/, "")}-${settings.targetLanguage}.srt`,
                        )
                      }
                      className="text-[11px] font-medium text-muted hover:text-ink"
                    >
                      Download SRT
                    </button>
                  </div>

                  <div className="max-h-[260px] divide-y divide-line-soft overflow-y-auto">
                    {segments.map((seg, idx) => {
                      const isRefSource =
                        speakerRef &&
                        Math.abs(speakerRef.startSec - seg.startSec) < 0.2;
                      return (
                        <div key={seg.id} className="grid gap-2 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <div className="flex flex-col justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (videoElRef.current) {
                                  videoElRef.current.currentTime = seg.startSec;
                                  void videoElRef.current.play().catch(() => {});
                                }
                              }}
                              title="Jump video to this scene"
                              className="inline-flex w-fit items-center gap-1 rounded-md border border-line bg-rail px-2 py-1 font-mono text-[10.5px] font-medium text-ink hover:border-ink"
                            >
                              {formatTime(seg.startSec, true)}–{formatTime(seg.endSec, true)}
                            </button>

                            <div className="flex items-center gap-1.5">
                              {settings.voiceMode === "clone" && seg.endSec - seg.startSec >= 2 && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const { audioBuffer } = await ensureExtractedAudio(video);
                                    const refClip = buildSpeakerCloneReference(audioBuffer, segments, seg.id);
                                    if (refClip) setSpeakerRef(refClip);
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium ${
                                    isRefSource
                                      ? "bg-accent/15 text-[#a8432c]"
                                      : "border border-line text-faint hover:text-ink"
                                  }`}
                                >
                                  {isRefSource ? "Voice sample ✓" : "Use voice"}
                                </button>
                              )}

                              <button
                                type="button"
                                aria-label={`Remove segment ${idx + 1}`}
                                onClick={() => setSegments((cur) => cur.filter((x) => x.id !== seg.id))}
                                className="text-faint hover:text-[#b43b30]"
                              >
                                <Trash2 size={11} aria-hidden />
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <textarea
                              rows={2}
                              value={seg.sourceText}
                              placeholder="Original spoken dialogue..."
                              onChange={(e) => {
                                const val = e.target.value;
                                setSegments((cur) =>
                                  cur.map((x) => (x.id === seg.id ? { ...x, sourceText: val } : x)),
                                );
                              }}
                              className="w-full resize-none rounded-[9px] border border-line bg-[#fafaf9] px-2.5 py-1.5 text-[11.5px] leading-snug text-ink outline-none focus:border-ink focus:bg-white"
                            />
                            <textarea
                              rows={2}
                              value={seg.translatedText}
                              placeholder={`Translated (${getDubLanguageLabel(settings.targetLanguage)}) — auto-generated on run`}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSegments((cur) =>
                                  cur.map((x) => (x.id === seg.id ? { ...x, translatedText: val } : x)),
                                );
                              }}
                              className="w-full resize-none rounded-[9px] border border-line bg-white px-2.5 py-1.5 text-[11.5px] leading-snug text-ink outline-none focus:border-ink"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Jobs & 24h Dub Vault */}
          {jobs.length > 0 && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Dubbing queue &amp; 24h outputs ({jobs.length})
                </p>
                {storage && <GenerationStorageNotice />}
              </div>

              {jobs.map((job) => {
                const isRunning = ACTIVE_DUB_STATUSES.has(job.status);
                const isRemuxing = remuxingJobId === job.id;
                const mux = remuxedByJob[job.id];
                const matchesLoadedVideo = Boolean(video && job.sourceVideoName === video.name);

                return (
                  <div
                    key={job.id}
                    className="rounded-[16px] border border-line bg-[#fcfcfb] p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {job.status === "completed" ? (
                            <CheckCircle2 size={14} className="text-[#2f8048]" aria-hidden />
                          ) : job.status === "failed" ? (
                            <AlertCircle size={14} className="text-[#b83d32]" aria-hidden />
                          ) : (
                            <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                          )}
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {job.sourceVideoName} → {getDubLanguageLabel(job.targetLanguage)}
                          </p>
                          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-muted">
                            {job.voiceLabel}
                          </span>
                          {job.status === "completed" && (
                            <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted">{job.stageLabel}</p>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-faint">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock size={10} aria-hidden />
                          {formatTime(job.elapsedMs / 1000, false)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteJob(job.id)}
                          aria-label="Delete dubbing job"
                          className="rounded p-1 text-faint hover:bg-white hover:text-[#b43b30]"
                        >
                          <Trash2 size={12} aria-hidden />
                        </button>
                      </div>
                    </div>

                    {isRunning && (
                      <div className="mt-3">
                        <Progress value={job.progress} className="h-1.5" />
                      </div>
                    )}

                    {job.status === "failed" && job.error && (
                      <p className="mt-2 rounded-[9px] border border-[#f2c6c2] bg-[#fdf4f3] px-3 py-2 text-[11px] text-[#9b3127]">
                        {job.error}
                      </p>
                    )}

                    {job.status === "completed" && job.audioUrl && (
                      <div className="mt-3 space-y-2.5">
                        <AudioPlayer
                          src={job.audioUrl}
                          duration={job.durationSeconds}
                          peaks={job.peaks}
                          fileName={job.fileName}
                          formatLabel={`MP3 · ${job.byteLength ? formatBytes(job.byteLength) : "Dub"}`}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {video && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDubJobId(job.id);
                                  setPreviewTrack("dubbed");
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                              >
                                <RefreshCw size={10} aria-hidden />
                                {matchesLoadedVideo ? "Preview synced with video" : "Sync with loaded video"}
                              </button>
                            )}

                            {job.srtText && (
                              <button
                                type="button"
                                onClick={() =>
                                  downloadTextBlob(
                                    job.srtText,
                                    `${job.sourceVideoName.replace(/\.[^/.]+$/, "")}-${job.targetLanguage}.srt`,
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                              >
                                <Captions size={10} aria-hidden />
                                Download .SRT
                              </button>
                            )}

                            {job.downloadUrl && (
                              <a
                                href={job.downloadUrl}
                                download={job.fileName}
                                className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                              >
                                <Download size={10} aria-hidden />
                                Dubbed Audio (.mp3)
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {mux ? (
                              <>
                                <a
                                  href={mux.url}
                                  download={mux.fileName}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#272729]"
                                >
                                  <Download size={11} aria-hidden />
                                  Download Dubbed MP4
                                </a>
                                {!job.videoUrl && mux.blob.size <= 45 * 1024 * 1024 && (
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveRemuxToVault(job)}
                                    disabled={savingVaultId === job.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                                  >
                                    {savingVaultId === job.id ? (
                                      <Loader2 size={10} className="animate-spin" aria-hidden />
                                    ) : (
                                      <Cloud size={10} aria-hidden />
                                    )}
                                    Save MP4 to vault
                                  </button>
                                )}
                              </>
                            ) : job.videoDownloadUrl ? (
                              <a
                                href={job.videoDownloadUrl}
                                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#272729]"
                              >
                                <Download size={11} aria-hidden />
                                Download Saved MP4
                              </a>
                            ) : video ? (
                              <button
                                type="button"
                                onClick={() => void handleRemuxJob(job)}
                                disabled={isRemuxing}
                                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#272729] disabled:opacity-50"
                              >
                                {isRemuxing ? (
                                  <Loader2 size={11} className="animate-spin" aria-hidden />
                                ) : (
                                  <Sparkles size={11} aria-hidden />
                                )}
                                {isRemuxing ? remuxStage || "Muxing MP4..." : "Export Dubbed MP4"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DubControls
          settings={settings}
          onChange={patchSettings}
          hasVideo={Boolean(video)}
          durationSec={video?.duration ?? 0}
          segmentCount={segments.length}
          translatedCount={translatedCount}
          estimatedCredits={estimatedCredits}
          speakerRef={speakerRef}
          savedCustomVoices={savedClones}
          activeCustomVoiceId={activeCloneId}
          onSelectCustomVoice={setActiveCloneId}
          onStartDub={() => void handleStartDubbing()}
          submitting={submitting}
          transcribing={extractingAudio || Boolean(asrProgress)}
          translating={translating}
          isSignedIn={isSignedIn}
          pool={pool}
        />
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="run AI video translation and dubbing"
        cost={estimatedCredits}
      />
    </section>
  );
}
