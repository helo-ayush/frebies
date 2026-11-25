"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Captions,
  Check,
  Download,
  FileAudio,
  Film,
  Languages,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import { computePeaks } from "@/components/tool/audio/useAudioFile";
import type { SavedCustomVoice } from "@/components/tool/audio/tts/model";
import { loadSavedClonedVoices } from "@/components/tool/audio/tts/voice-clone-utils";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  ActionRow,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  STUDIO_GRID,
  SecondaryAction,
  StageBar,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolTabs,
  ToolText,
} from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import {
  HistoryButton,
  HistoryEmpty,
  HistoryList,
  HistoryRow,
  HistorySection,
  HistoryThumb,
} from "@/components/tool/kit/History";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { useFileIntake } from "@/components/tool/studio/useFileIntake";
import { useHeldFile } from "@/components/tool/paid/useHeldFile";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { VideoDeck } from "@/components/tool/viewer/VideoDeck";
import type { PoolStatusSnapshot } from "@/lib/audio/tts-manager";
import type { GenerationStorageStats } from "@/lib/storage/generation-store";
import {
  DEFAULT_DUB_SETTINGS,
  DUB_EXPRESSION_TAGS,
  MAX_DUB_DURATION_SEC,
  buildDualSrtFromSegments,
  buildSrtFromSegments,
  dubCredits,
  getDubLanguageLabel,
  parseSubtitleText,
  stripDramaTagsForSubtitles,
  type DubJobSnapshot,
  type DubSegment,
  type DubSettings,
  type VadReferenceInfo,
} from "@/lib/video/dub-types";
import { BindVideoModal } from "./BindVideoModal";
import { DubControls } from "./DubControls";
import {
  buildVad20sReferenceFromBuffer,
  detectMediaKind,
  extractAndNormalizeAudioForServer,
  normalizeCustomCloneAudioFile,
  probeMediaFile,
  vadServerRefToExtracted,
  type ExtractedSpeakerRef,
  type NormalizedBrowserAudio,
} from "./video-audio-utils";

const ACTIVE_DUB_STATUSES = new Set([
  "queued",
  "waiting_for_server",
  "transcribing",
  "translating",
  "synthesizing",
  "mixing",
]);

type LoadedMedia = {
  file: File;
  kind: "video" | "audio";
  url: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
};

type OverlayCaptionMode = "translated" | "original" | "dual" | "off";

/** Plain-language job state. The server's own stage text stays in the tooltip. */
function dubStatusLabel(job: DubJobSnapshot): string {
  switch (job.status) {
    case "queued":
      return "Queued";
    case "waiting_for_server":
      return "Starting the voice server";
    case "transcribing":
      return "Transcribing";
    case "translating":
      return "Translating";
    case "synthesizing":
      return job.segmentsTotal > 0 ? `Dubbing ${job.segmentsDone}/${job.segmentsTotal}` : "Dubbing";
    case "mixing":
      return "Mixing and saving";
    case "completed":
      return "Ready";
    case "failed":
      return "Failed";
  }
}

/** Long files are processed in parts; surface only that from the in-browser stage text. */
function plainStageDetail(label: string): string {
  const part = /Trip (\d+)\/(\d+)/i.exec(label);
  return part && Number(part[2]) > 1 ? `part ${part[1]} of ${part[2]}` : "";
}

/** Both left-hand blocks (tool, history) share the column beside the sticky rail. */
const LEFT_COLUMN = "lg:col-start-1 lg:self-stretch";
/** At least a screen tall, but free to grow with the script. */
const STAGE_FILL = "lg:min-h-[max(540px,calc(100dvh-var(--fb-bar)-var(--fb-head)))]";

export function VideoDubbingStudio({ maxSizeMB = 2048 }: { maxSizeMB?: number }) {
  const { isLoaded, isSignedIn, user } = useAuthSession();
  const ownerUserId = isSignedIn ? (user?.id ?? null) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const syncedAudioRef = useRef<HTMLAudioElement>(null);
  const normalizedAudioRef = useRef<NormalizedBrowserAudio | null>(null);
  const focusedSegmentIdRef = useRef<string | null>(null);
  const prevOwnerRef = useRef<string | null>(null);

  const [dragging, setDragging] = useState(false);
  const [media, setMedia] = useState<LoadedMedia | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DubSettings>(DEFAULT_DUB_SETTINGS);

  const [segments, setSegments] = useState<DubSegment[]>([]);
  const [detectedLangLabel, setDetectedLangLabel] = useState<string | null>(null);
  const [speakerRef, setSpeakerRef] = useState<ExtractedSpeakerRef | null>(null);
  const [customUploadRef, setCustomUploadRef] = useState<ExtractedSpeakerRef | null>(null);
  const [customUploadFileName, setCustomUploadFileName] = useState<string | null>(null);
  const [customUploadLoading, setCustomUploadLoading] = useState(false);

  const [savedClones, setSavedClones] = useState<SavedCustomVoice[]>([]);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);

  const [browserStage, setBrowserStage] = useState<{ label: string; percent: number } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [pool, setPool] = useState<PoolStatusSnapshot | null>(null);
  const [jobs, setJobs] = useState<DubJobSnapshot[]>([]);
  const [storage, setStorage] = useState<GenerationStorageStats | null>(null);
  const [workerAuth, setWorkerAuth] = useState<{ url: string; token: string; expiresAt: number } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState("run AI dubbing");

  // Preview A/B & caption mode
  const [previewTrack, setPreviewTrack] = useState<"original" | "dubbed">("dubbed");
  const [captionMode, setCaptionMode] = useState<OverlayCaptionMode>("translated");
  const [activeDubJobId, setActiveDubJobId] = useState<string | null>(null);
  const [mediaCurrentSec, setMediaCurrentSec] = useState(0);
  const [mediaPeaks, setMediaPeaks] = useState<number[]>([]);

  // Bind modal job
  const [bindModalJob, setBindModalJob] = useState<DubJobSnapshot | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const fetchStatus = useCallback(async (opts?: { wake?: boolean }) => {
    const qs = opts?.wake ? "?wake=1" : "";
    const res = await fetch(`/api/video/dub/status${qs}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      pool: PoolStatusSnapshot;
      jobs: DubJobSnapshot[];
      storage: GenerationStorageStats | null;
      workerAuth?: { url: string; token: string; expiresAt: number } | null;
    };
    setPool(data.pool);
    setJobs(data.jobs);
    setStorage(data.storage);
    if (data.workerAuth !== undefined) {
      setWorkerAuth(data.workerAuth);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (prevOwnerRef.current !== ownerUserId) {
      prevOwnerRef.current = ownerUserId;
      setJobs([]);
      setStorage(null);
      setWorkerAuth(null);
      setActiveDubJobId(null);
      setActiveCloneId(null);
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

  const latestCompletedForMedia = useMemo(() => {
    const match = jobs.find(
      (j) =>
        j.status === "completed" &&
        (activeDubJobId ? j.id === activeDubJobId : !media || j.sourceVideoName === media.name),
    );
    return match ?? jobs.find((j) => j.status === "completed") ?? null;
  }, [jobs, activeDubJobId, media]);

  const activeDubAudioUrl = latestCompletedForMedia?.audioUrl ?? null;

  // Keep synced external dubbed <audio> locked tightly to <video> when user toggles Dubbed A/B preview
  useEffect(() => {
    const vEl = videoElRef.current;
    const aEl = syncedAudioRef.current;
    if (!vEl) return;

    const usingSeparateAudioSync = previewTrack === "dubbed" && Boolean(activeDubAudioUrl);
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
  }, [previewTrack, activeDubAudioUrl]);

  useEffect(() => {
    return () => {
      if (media?.url) URL.revokeObjectURL(media.url);
    };
  }, [media?.url]);

  // Audio files show their waveform where a video shows its picture. Skipped for
  // very long files: decoding those would cost more memory than the picture is worth.
  useEffect(() => {
    setMediaPeaks([]);
    if (!media || media.kind !== "audio" || media.size > 60 * 1024 * 1024 || media.duration > 20 * 60) return;
    let cancelled = false;
    void (async () => {
      try {
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(await media.file.arrayBuffer());
        await context.close();
        if (!cancelled) setMediaPeaks(computePeaks(decoded.getChannelData(0)));
      } catch {
        // The flat line stays; playback and dubbing do not need the picture.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [media?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  useFileIntake((files) => {
    if (files[0]) void ingestMediaFile(files[0]);
  }, setDragging);

  useHeldFile(media?.file ?? null, (file, held) => {
    if (held && typeof held === "object") setSettings((current) => ({ ...current, ...(held as DubSettings) }));
    void ingestMediaFile(file);
  });

  function patchSettings(next: Partial<DubSettings>) {
    setSettings((cur) => ({ ...cur, ...next }));
  }

  async function ingestMediaFile(file: File) {
    setLoadError(null);
    setStatusError(null);

    const kind = detectMediaKind(file);
    if (!kind) {
      setLoadError(
        "Unsupported file type. Choose Video (MP4, MOV, WebM, MKV, AVI) or Audio (MP3, WAV, M4A, FLAC, OGG).",
      );
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      setLoadError(`File is ${formatBytes(file.size)} — maximum local file size is ${maxSizeMB} MB.`);
      return;
    }

    let duration = 0;
    let width = 0;
    let height = 0;

    try {
      const meta = await probeMediaFile(file);
      duration = meta.duration;
      width = meta.width;
      height = meta.height;
    } catch {
      // Some containers (MKV/AVI/unusual codecs) aren't directly playable by HTMLVideoElement;
      // allow ingesting them so browser FFmpeg WASM extracts the normalized audio cleanly.
      duration = 0;
    }

    if (duration > MAX_DUB_DURATION_SEC + 5) {
      setLoadError("Media exceeds the maximum 2-hour (120 minute) limit. Trim it shorter and try again.");
      return;
    }

    if (media?.url) URL.revokeObjectURL(media.url);
    normalizedAudioRef.current = null;
    setSpeakerRef((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setSegments([]);
    setDetectedLangLabel(null);
    setActiveDubJobId(null);
    setPreviewTrack("original");

    setMedia({
      file,
      kind,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      duration,
      width,
      height,
    });
  }

  async function ensureNormalizedBrowserAudio(targetMedia: LoadedMedia): Promise<NormalizedBrowserAudio> {
    if (normalizedAudioRef.current) {
      return normalizedAudioRef.current;
    }

    setBrowserStage({ label: "Extracting audio in browser (video stays local)...", percent: 8 });
    try {
      const normalized = await extractAndNormalizeAudioForServer(
        targetMedia.file,
        targetMedia.duration,
        (label, percent) => setBrowserStage({ label, percent }),
      );
      normalizedAudioRef.current = normalized;

      if (!targetMedia.duration && normalized.durationSeconds > 0) {
        setMedia((cur) => (cur ? { ...cur, duration: normalized.durationSeconds } : cur));
      }
      return normalized;
    } finally {
      setBrowserStage(null);
    }
  }

  async function handleCustomVoiceUpload(file: File) {
    setStatusError(null);
    setCustomUploadLoading(true);
    try {
      const ref = await normalizeCustomCloneAudioFile(file, (label) =>
        setBrowserStage({ label, percent: 25 }),
      );
      setCustomUploadRef((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return ref;
      });
      setCustomUploadFileName(file.name);
      setActiveCloneId(null);
      patchSettings({ voiceMode: "clone", cloneSource: "custom_upload" });
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not process custom voice clip.");
    } finally {
      setBrowserStage(null);
      setCustomUploadLoading(false);
    }
  }

  async function runServerDeepgramTranscription(targetMedia = media): Promise<DubSegment[] | null> {
    if (!targetMedia) return null;
    if (!isSignedIn) {
      setGateAction("transcribe this file");
      setGateOpen(true);
      return null;
    }

    setStatusError(null);
    try {
      const normalized = await ensureNormalizedBrowserAudio(targetMedia);
      const tripsToRun =
        normalized.trips.length > 0
          ? normalized.trips
          : [
              {
                tripIndex: 0,
                totalTrips: 1,
                startSec: 0,
                endSec: normalized.durationSeconds || targetMedia.duration || 0,
                durationSec: normalized.durationSeconds || targetMedia.duration || 0,
                label: "Trip 1/1",
                blob: normalized.uploadBlob,
                fileName: normalized.uploadFileName,
                mimeType: normalized.uploadMimeType,
              },
            ];

      setTranscribing(true);
      const mergedSegments: DubSegment[] = [];
      let detectedLang: string | undefined;
      let totalDurationMeasured = targetMedia.duration || normalized.durationSeconds || 0;
      let capturedSpeakerRef: ExtractedSpeakerRef | null = null;

      for (let t = 0; t < tripsToRun.length; t += 1) {
        const trip = tripsToRun[t];
        const basePct = 18 + Math.round((t / tripsToRun.length) * 76);
        setBrowserStage({
          label: `${trip.label}: Deepgram ASR + Nemotron 3 Ultra translation...`,
          percent: basePct,
        });

        const form = new FormData();
        form.append("audio", trip.blob, trip.fileName);
        form.append("sourceLanguage", settings.sourceLanguage);
        form.append("targetLanguage", settings.targetLanguage);
        form.append("tone", settings.tone);
        form.append("autoTranslate", "true");
        form.append("tripOffsetSec", String(trip.startSec));
        form.append("skipVad", capturedSpeakerRef ? "true" : "false");

        let res: Response | null = null;
        if (workerAuth && workerAuth.expiresAt > Date.now() + 60_000) {
          try {
            const direct = await fetch(`${workerAuth.url}/api/video/dub/transcribe`, {
              method: "POST",
              headers: { "x-worker-token": workerAuth.token },
              body: form,
            });
            if (direct.status < 500) {
              res = direct;
            }
          } catch {
            // Fall back to Next.js proxy
          }
        }
        if (!res) {
          res = await fetch("/api/video/dub/transcribe", {
            method: "POST",
            body: form,
          });
        }

        const data = (await res.json()) as {
          ok?: boolean;
          detectedLanguage?: string;
          durationSeconds?: number;
          segments?: DubSegment[];
          speakerRef?: (VadReferenceInfo & { audioBase64: string }) | null;
          error?: string;
        };

        if (!res.ok || !data.segments) {
          throw new Error(data.error || `Transcription failed on ${trip.label}.`);
        }

        if (data.detectedLanguage && !detectedLang) {
          detectedLang = data.detectedLanguage;
          setDetectedLangLabel(data.detectedLanguage);
        }
        if (data.durationSeconds && tripsToRun.length === 1) {
          totalDurationMeasured = Math.max(totalDurationMeasured, data.durationSeconds);
        }
        if (data.speakerRef && !capturedSpeakerRef) {
          capturedSpeakerRef = vadServerRefToExtracted(data.speakerRef);
          setSpeakerRef((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return capturedSpeakerRef;
          });
        }

        for (const seg of data.segments) {
          mergedSegments.push({
            ...seg,
            id: `seg_${mergedSegments.length + 1}`,
          });
        }
        setSegments([...mergedSegments]);
      }

      if (totalDurationMeasured > 1 && (!targetMedia.duration || targetMedia.duration < 1)) {
        setMedia((cur) => (cur ? { ...cur, duration: totalDurationMeasured } : cur));
      }

      if (!capturedSpeakerRef && normalized.audioBuffer && mergedSegments.length > 0) {
        const fallbackRef = buildVad20sReferenceFromBuffer(normalized.audioBuffer, mergedSegments);
        if (fallbackRef) {
          setSpeakerRef((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return fallbackRef;
          });
        }
      }

      if (mergedSegments.length === 0) {
        setStatusError(
          "No clear speech was detected. You can add dialogue lines manually or import an SRT/VTT file.",
        );
      }
      return mergedSegments;
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Audio transcription failed.");
      return null;
    } finally {
      setTranscribing(false);
      setBrowserStage(null);
    }
  }

  async function handleTranslateOnly(segsInput?: DubSegment[]): Promise<DubSegment[] | null> {
    if (!isSignedIn) {
      setGateAction("translate the script");
      setGateOpen(true);
      return null;
    }

    const list = segsInput ?? segments;
    if (list.length === 0) {
      setStatusError("Transcribe audio or import an SRT/VTT file before translating.");
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
      if (data.detectedLanguage) setDetectedLangLabel(data.detectedLanguage);
      return data.segments;
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not translate segments.");
      return null;
    } finally {
      setTranslating(false);
    }
  }

  async function handleStartDubbing() {
    if (!media) return;
    if (!isSignedIn) {
      setGateAction("dub this file");
      setGateOpen(true);
      return;
    }

    setStatusError(null);
    setSubmitting(true);

    try {
      // 1. Always extract & normalize ONLY audio in browser (never send video file to server)
      const normalized = await ensureNormalizedBrowserAudio(media);
      const effectiveDuration = media.duration || normalized.durationSeconds || 30;
      if (effectiveDuration > MAX_DUB_DURATION_SEC + 5) {
        throw new Error("Media duration exceeds the maximum 2-hour (120 minute) limit.");
      }

      // 2. Resolve custom voice if chosen (Saved clone > Uploaded custom clip > 20s VAD speaker ref)
      let refToSend: { name: string; audioBase64: string; text: string } | null = null;
      let vadInfoToSend: VadReferenceInfo | null = null;

      if (activeCloneId) {
        const saved = savedClones.find((c) => c.id === activeCloneId);
        if (saved) {
          refToSend = { name: saved.name, audioBase64: saved.audioBase64, text: saved.text };
        }
      } else if (settings.voiceMode === "clone") {
        if (settings.cloneSource === "custom_upload" && customUploadRef) {
          refToSend = {
            name: customUploadFileName?.replace(/\.[^/.]+$/, "").slice(0, 30) || "Custom voice",
            audioBase64: customUploadRef.audioBase64,
            text: customUploadRef.text,
          };
        } else if (speakerRef) {
          refToSend = {
            name: `${media.name.replace(/\.[^/.]+$/, "").slice(0, 22)} (20s VAD)`,
            audioBase64: speakerRef.audioBase64,
            text: speakerRef.text,
          };
          vadInfoToSend = {
            startSec: speakerRef.startSec,
            endSec: speakerRef.endSec,
            durationSec: speakerRef.durationSeconds,
            text: speakerRef.text,
          };
        }
      }

      // Send normalized audio when we need server Deepgram/VAD/OpenRouter pipeline OR background ducking
      const needServerSourceAudio = segments.length === 0 || settings.keepBackground;

      let res: Response;
      const payload = {
        sourceVideoName: media.name,
        mediaKind: media.kind,
        durationSeconds: effectiveDuration,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        voiceMode: settings.voiceMode,
        cloneSource: settings.cloneSource,
        voiceId: settings.voiceId,
        customVoice: refToSend,
        tone: settings.tone,
        keepBackground: settings.keepBackground,
        backgroundLevel: settings.backgroundLevel,
        syncToTimeline: settings.syncToTimeline,
        preferredStudio: settings.preferredStudio,
        segments,
        vadReferenceInfo: vadInfoToSend,
      };

      if (needServerSourceAudio) {
        setBrowserStage({ label: "Uploading compact audio to dubbing pipeline...", percent: 88 });
        const form = new FormData();
        form.append("payload", JSON.stringify(payload));
        form.append("sourceAudio", normalized.uploadBlob, normalized.uploadFileName);
        let directRes: Response | null = null;
        if (workerAuth && workerAuth.expiresAt > Date.now() + 60_000) {
          try {
            const direct = await fetch(`${workerAuth.url}/api/video/dub/jobs`, {
              method: "POST",
              headers: { "x-worker-token": workerAuth.token },
              body: form,
            });
            if (direct.status < 500) {
              directRes = direct;
            }
          } catch {
            // Fall back to Next.js proxy
          }
        }
        res =
          directRes ??
          (await fetch("/api/video/dub/jobs", {
            method: "POST",
            body: form,
          }));
      } else {
        res = await fetch("/api/video/dub/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = (await res.json()) as { job?: DubJobSnapshot; error?: string };
      if (!res.ok || !data.job) {
        throw new Error(data.error || "Could not start dubbing job.");
      }

      setJobs((cur) => [data.job!, ...cur.filter((x) => x.id !== data.job!.id)]);
      setActiveDubJobId(data.job.id);
      setPreviewTrack("dubbed");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to start AI dubbing.");
    } finally {
      setBrowserStage(null);
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
      if (media) {
        const normalized = await ensureNormalizedBrowserAudio(media);
        if (normalized.audioBuffer) {
          const refClip = buildVad20sReferenceFromBuffer(normalized.audioBuffer, parsed);
          if (refClip) {
            setSpeakerRef((prev) => {
              if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
              return refClip;
            });
          }
        }
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to read caption file.");
    }
  }

  function insertExpressionTagIntoFocused(tag: string) {
    const targetId = focusedSegmentIdRef.current ?? segments[0]?.id;
    if (!targetId) return;
    setSegments((cur) =>
      cur.map((seg) => {
        if (seg.id !== targetId) return seg;
        const base = (seg.translatedText || "").trim();
        const isWrapper = tag === "<emphasis>" || tag === "<slow>" || tag === "<fast>";
        const nextText = isWrapper
          ? base
            ? `${tag}${base}${tag.replace("<", "</")}`
            : `${tag}text${tag.replace("<", "</")}`
          : base
            ? `${tag} ${base}`
            : `${tag} `;
        return { ...seg, translatedText: nextText };
      }),
    );
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
    if (captionMode === "off") return null;
    const list: DubSegment[] =
      latestCompletedForMedia && previewTrack === "dubbed"
        ? latestCompletedForMedia.segments
        : segments;
    return list.find((s) => {
      const aligned = s as DubSegment & { alignedStartSec?: number; alignedEndSec?: number };
      const start = previewTrack === "dubbed" ? (aligned.alignedStartSec ?? s.startSec) : s.startSec;
      const end = previewTrack === "dubbed" ? (aligned.alignedEndSec ?? s.endSec) : s.endSec;
      return mediaCurrentSec >= start - 0.05 && mediaCurrentSec <= end + 0.15;
    });
  }, [captionMode, latestCompletedForMedia, previewTrack, segments, mediaCurrentSec]);

  const translatedCount = useMemo(
    () => segments.filter((s) => s.translatedText.trim().length > 0).length,
    [segments],
  );
  const estimatedCredits = media ? dubCredits(media.duration || 60) : 5;

  const targetLabel = getDubLanguageLabel(settings.targetLanguage);
  const needsSignIn = isLoaded && !isSignedIn;

  /** The dub started (or opened) from the file on the stage. */
  const stageJob = activeDubJobId ? (jobs.find((j) => j.id === activeDubJobId) ?? null) : null;
  const runningJob = stageJob && ACTIVE_DUB_STATUSES.has(stageJob.status) ? stageJob : null;
  const resultJob =
    stageJob && stageJob.status === "completed" && stageJob.audioUrl ? stageJob : null;
  const failedJob = stageJob && stageJob.status === "failed" ? stageJob : null;

  // One pipeline: extract (0) → transcribe (1) → translate (2) → dub (3).
  const uploadingAudio = submitting && Boolean(browserStage) && (browserStage?.percent ?? 0) >= 88;
  let activeStep: number | null = null;
  let stepLabel = "";
  if (customUploadLoading) {
    stepLabel = "Preparing voice sample";
  } else if (transcribing) {
    activeStep = 1;
    stepLabel = "Transcribing and translating";
  } else if (translating) {
    activeStep = 2;
    stepLabel = "Translating";
  } else if (browserStage) {
    activeStep = uploadingAudio ? 3 : 0;
    stepLabel = uploadingAudio ? "Uploading audio" : "Extracting audio on your device";
  } else if (submitting) {
    activeStep = 3;
    stepLabel = "Starting the dub";
  } else if (runningJob) {
    activeStep =
      runningJob.status === "transcribing"
        ? 1
        : runningJob.status === "translating"
          ? 2
          : runningJob.status === "synthesizing" || runningJob.status === "mixing"
            ? 3
            : runningJob.segments.length > 0
              ? 3
              : 1;
    stepLabel = dubStatusLabel(runningJob);
  }
  const stepPercent = browserStage
    ? browserStage.percent
    : !submitting && !transcribing && !translating && runningJob
      ? runningJob.progress
      : null;
  const stepDetail = browserStage ? plainStageDetail(browserStage.label) : "";
  const stepTitle = browserStage?.label ?? runningJob?.stageLabel;
  const stepsDone = resultJob
    ? 4
    : segments.length > 0
      ? translatedCount === segments.length
        ? 3
        : 2
      : 0;

  const pipelineBusy = submitting || transcribing || translating || Boolean(browserStage);
  /** A dub into the language now selected is still running, so the button tracks it. */
  const actionJob =
    runningJob && runningJob.targetLanguage === settings.targetLanguage ? runningJob : null;
  const downloadJob =
    !pipelineBusy && resultJob?.downloadUrl && resultJob.targetLanguage === settings.targetLanguage
      ? resultJob
      : null;

  const railAction =
    downloadJob && downloadJob.downloadUrl ? (
      <>
        <DownloadAction
          href={downloadJob.downloadUrl}
          filename={downloadJob.fileName}
          label="Download dubbed audio"
          hint={`${getDubLanguageLabel(downloadJob.targetLanguage)} · MP3${
            downloadJob.byteLength ? ` · ${formatBytes(downloadJob.byteLength)}` : ""
          }`}
        />
        <ActionRow>
          <SecondaryAction onClick={() => setBindModalJob(downloadJob)} icon={<Film size={13} aria-hidden />}>
            Add to video
          </SecondaryAction>
          <SecondaryAction
            onClick={() => setActiveDubJobId(null)}
            icon={<RotateCcw size={13} aria-hidden />}
          >
            Dub again
          </SecondaryAction>
        </ActionRow>
      </>
    ) : (
      <PrimaryAction
        label={media && needsSignIn ? "Sign in to dub" : `Dub into ${targetLabel}`}
        busyLabel={`${stepLabel || "Working"}…`}
        icon={
          media && needsSignIn ? <Lock size={18} aria-hidden /> : <Languages size={19} aria-hidden />
        }
        busy={pipelineBusy || Boolean(actionJob)}
        progress={stepPercent === null ? undefined : stepPercent / 100}
        disabled={!media || customUploadLoading}
        onClick={() => void handleStartDubbing()}
        hint={
          !media
            ? "Add a video or audio file to get started"
            : needsSignIn
              ? `${estimatedCredits} credits to dub into ${targetLabel}`
              : media.duration
                ? `${estimatedCredits} credits · ${formatTime(media.duration, false)} at 5 per minute`
                : "5 credits per minute"
        }
      />
    );

  return (
    <>
      <StudioFrame
        id="video-dubbing"
        label="Video dubbing studio"
        fill={false}
        gridClassName={`${STUDIO_GRID} lg:grid-rows-[auto_1fr]`}
      >
        {/* 1 · File in, preview, pipeline, script */}
        <StudioStage flush className={`lg:row-start-1 ${LEFT_COLUMN} ${STAGE_FILL}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.mp3,.wav,.m4a,.aac,.flac,.ogg"
            tabIndex={-1}
            aria-label="Choose a video or audio file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void ingestMediaFile(file);
            }}
            className="sr-only"
          />
          <input
            ref={captionInputRef}
            type="file"
            accept=".srt,.vtt,text/vtt"
            tabIndex={-1}
            aria-label="Choose a subtitle file"
            onChange={(e) => void handleImportCaptions(e)}
            className="sr-only"
          />

          {!media ? (
            <>
              {/* Drives the finished / problem sounds */}
              <span aria-hidden className="hidden" data-success={resultJob?.id} data-error={failedJob?.id ?? loadError ?? statusError ?? undefined} />
              <StageNotes
                failed={failedJob ? `${failedJob.error || "The dub failed."} You can try again.` : null}
                loadError={loadError}
                statusError={statusError}
                onDismiss={() => setStatusError(null)}
              />
              <Dropzone
                title="Drop a video to dub"
                description="Translate the speech into another language, in the speaker's own voice. Audio files work too."
                buttonLabel="Choose a file"
                limits="MP4, MOV, WebM, MKV, MP3, WAV, M4A and more · up to 2 hours"
                note="Your video stays on this device. Only its audio is uploaded."
                onChoose={() => fileInputRef.current?.click()}
                dragging={dragging}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void ingestMediaFile(file);
                }}
                chips={
                  <>
                    <DropChip>12 languages</DropChip>
                    <DropChip>Editable script</DropChip>
                    <DropChip>Subtitles included</DropChip>
                  </>
                }
              />
            </>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <FileRow
                flush
                className="shrink-0 border-b border-line"
                icon={media.kind === "video" ? <Film size={17} aria-hidden /> : <FileAudio size={17} aria-hidden />}
                name={media.name}
                meta={[
                  media.duration ? formatTime(media.duration, false) : null,
                  media.kind === "video" && media.width > 0 ? `${media.width} × ${media.height}` : null,
                  formatBytes(media.size),
                  detectedLangLabel ? `${detectedLangLabel} detected` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onReplace={() => fileInputRef.current?.click()}
              >
                {media.kind === "video" && (segments.length > 0 || latestCompletedForMedia) ? (
                  <select
                    aria-label="Preview caption language"
                    value={captionMode}
                    onChange={(e) => setCaptionMode(e.target.value as OverlayCaptionMode)}
                    className="fb-input !h-9 !w-auto cursor-pointer !text-[13px]"
                  >
                    <option value="translated">Captions: translated</option>
                    <option value="original">Captions: original</option>
                    <option value="dual">Captions: both</option>
                    <option value="off">Captions: off</option>
                  </select>
                ) : null}
                {activeDubAudioUrl ? (
                  <ToolTabs
                    label="Preview audio"
                    options={[
                      { value: "original", label: "Original" },
                      {
                        value: "dubbed",
                        label: "Dubbed",
                        title: getDubLanguageLabel(
                          latestCompletedForMedia?.targetLanguage || settings.targetLanguage,
                        ),
                      },
                    ]}
                    value={previewTrack}
                    onChange={setPreviewTrack}
                  />
                ) : null}
              </FileRow>

              <StageNotes
                failed={failedJob ? `${failedJob.error || "The dub failed."} You can try again.` : null}
                loadError={loadError}
                statusError={statusError}
                onDismiss={() => setStatusError(null)}
              />

              <VideoDeck
                videoRef={videoElRef}
                src={media.url}
                kind={media.kind}
                duration={media.duration}
                peaks={mediaPeaks}
                title={media.name}
                marks={segments.map((seg) => ({ id: seg.id, start: seg.startSec, end: seg.endSec, label: seg.sourceText }))}
                onTime={setMediaCurrentSec}
                onVolume={(value) => {
                  if (syncedAudioRef.current) syncedAudioRef.current.volume = value;
                }}
                className={`shrink-0 ${media.kind === "video" ? "h-[clamp(320px,56vh,680px)]" : "h-[clamp(280px,40vh,420px)]"}`}
                captions={
                  activeCaptionSegment && captionMode !== "off" ? (
                    <div className="max-w-[92%] bg-ink/90 px-4 py-2 text-center text-white">
                      {(captionMode === "translated" || captionMode === "dual") && (
                        <p className="text-[clamp(14px,1.25vw,20px)] font-medium leading-snug">
                          {stripDramaTagsForSubtitles(
                            activeCaptionSegment.translatedText || activeCaptionSegment.sourceText,
                          )}
                        </p>
                      )}
                      {(captionMode === "original" || captionMode === "dual") && activeCaptionSegment.sourceText && (
                        <p
                          className={
                            captionMode === "dual"
                              ? "mt-0.5 text-[clamp(12.5px,1vw,16px)] leading-snug text-white/65"
                              : "text-[clamp(14px,1.25vw,20px)] font-medium leading-snug"
                          }
                        >
                          {stripDramaTagsForSubtitles(activeCaptionSegment.sourceText)}
                        </p>
                      )}
                    </div>
                  ) : null
                }
              >
                {activeDubAudioUrl ? <audio ref={syncedAudioRef} src={activeDubAudioUrl} preload="auto" /> : null}
              </VideoDeck>

              <DubStepper
                activeStep={activeStep}
                stepsDone={stepsDone}
                label={stepLabel}
                detail={stepDetail}
                percent={stepPercent}
                title={stepTitle}
              />

              <section aria-label="Script" className="flex flex-1 flex-col bg-panel">
                <StageBar
                  className="!bg-panel"
                  end={
                    <>
                      <ToolText
                        onClick={() => void runServerDeepgramTranscription(media)}
                        disabled={Boolean(browserStage) || transcribing || submitting}
                        icon={
                          transcribing ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                          ) : (
                            <Wand2 size={14} aria-hidden />
                          )
                        }
                      >
                        {segments.length > 0 ? "Transcribe again" : "Transcribe"}
                      </ToolText>
                      {segments.length > 0 ? (
                        <ToolText
                          onClick={() => void handleTranslateOnly()}
                          disabled={translating}
                          icon={
                            translating ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden />
                            ) : (
                              <Languages size={14} aria-hidden />
                            )
                          }
                        >
                          Translate again
                        </ToolText>
                      ) : null}
                      <ToolText
                        onClick={() => captionInputRef.current?.click()}
                        icon={<Captions size={14} aria-hidden />}
                      >
                        Import
                      </ToolText>
                      <ToolText
                        icon={<Plus size={14} aria-hidden />}
                        onClick={() => {
                          const lastEnd = segments[segments.length - 1]?.endSec ?? 0;
                          const maxDur = media.duration || Math.max(lastEnd + 10, 60);
                          const startSec = Number(Math.min(Math.max(0, maxDur - 2), lastEnd + 0.2).toFixed(2));
                          const endSec = Number(Math.min(maxDur, startSec + 3).toFixed(2));
                          const newId = `seg_${Date.now().toString(36)}`;
                          focusedSegmentIdRef.current = newId;
                          setSegments((cur) => [
                            ...cur,
                            {
                              id: newId,
                              startSec,
                              endSec,
                              sourceText: "",
                              translatedText: "",
                            },
                          ]);
                        }}
                      >
                        Line
                      </ToolText>
                    </>
                  }
                >
                  <h3 className="fb-wide text-[18px]">Script</h3>
                  {segments.length > 0 ? (
                    <span className="fb-num text-[13px] text-faint">
                      [{segments.length} {segments.length === 1 ? "line" : "lines"}]
                    </span>
                  ) : null}
                </StageBar>

                {segments.length === 0 ? (
                  <p className="px-4 py-5 text-[14.5px] leading-relaxed text-muted sm:px-5">
                    Optional. Transcribe first to check and edit the translation line by line, or import subtitles
                    you already have. Otherwise the dub does it all in one go.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3 sm:px-5">
                      <span
                        className="mr-1.5 text-[13px] text-muted"
                        title="Cues shape how a line is spoken. They never appear in subtitles."
                      >
                        Add a delivery cue
                      </span>
                      {DUB_EXPRESSION_TAGS.map((t) => (
                        <ToolText
                          key={t.tag}
                          onClick={() => insertExpressionTagIntoFocused(t.tag)}
                          title={`Insert ${t.tag} into the selected line`}
                          className="!h-8 !px-2.5 !normal-case"
                        >
                          {t.label}
                        </ToolText>
                      ))}
                    </div>

                    <ol className="studio-main max-h-[560px] overflow-y-auto">
                      {segments.map((seg, idx) => {
                        const isRefSource = speakerRef && Math.abs(speakerRef.startSec - seg.startSec) < 0.25;
                        const live = mediaCurrentSec >= seg.startSec && mediaCurrentSec <= seg.endSec;
                        return (
                          <li
                            key={seg.id}
                            className={`relative grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-[164px_minmax(0,1fr)] sm:px-5 ${
                              live ? "bg-canvas" : ""
                            }`}
                          >
                            {live ? <span aria-hidden className="absolute inset-y-0 left-0 w-[4px] bg-accent" /> : null}
                            <div className="flex flex-row flex-wrap items-start justify-between gap-2 sm:flex-col sm:justify-start">
                              <ToolText
                                title="Play from this line"
                                className="fb-num !normal-case"
                                icon={
                                  <svg aria-hidden width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
                                    <path d="M2 .8 11 6l-9 5.2z" />
                                  </svg>
                                }
                                onClick={() => {
                                  const el = videoElRef.current;
                                  if (el) {
                                    el.currentTime = seg.startSec;
                                    void el.play().catch(() => {});
                                  }
                                }}
                              >
                                {formatTime(seg.startSec, true)}–{formatTime(seg.endSec, true)}
                              </ToolText>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {typeof seg.speaker === "number" && (
                                  <span className="border border-line-strong px-2 py-1 text-[12.5px] text-muted">
                                    Speaker {seg.speaker + 1}
                                  </span>
                                )}
                                {settings.voiceMode === "clone" &&
                                  settings.cloneSource !== "custom_upload" &&
                                  normalizedAudioRef.current?.audioBuffer && (
                                    <button
                                      type="button"
                                      aria-pressed={Boolean(isRefSource)}
                                      onClick={() => {
                                        const buf = normalizedAudioRef.current?.audioBuffer;
                                        if (!buf) return;
                                        const refClip = buildVad20sReferenceFromBuffer(buf, segments, seg.id, 20);
                                        if (refClip) {
                                          setSpeakerRef((prev) => {
                                            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
                                            return refClip;
                                          });
                                        }
                                      }}
                                      title="Take the voice sample starting at this line"
                                      className={`border px-2 py-1 text-[12.5px] transition-colors ${
                                        isRefSource
                                          ? "border-accent-deep bg-accent-deep text-white"
                                          : "border-line-strong text-muted hover:border-ink hover:text-ink"
                                      }`}
                                    >
                                      {isRefSource ? "Voice sample" : "Use as sample"}
                                    </button>
                                  )}
                                <ToolIcon
                                  label={`Remove segment ${idx + 1}`}
                                  slot="line-remove"
                                  className="!h-7 !w-7"
                                  onClick={() => setSegments((cur) => cur.filter((x) => x.id !== seg.id))}
                                >
                                  <Trash2 size={13} aria-hidden />
                                </ToolIcon>
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <textarea
                                rows={2}
                                value={seg.sourceText}
                                aria-label={`Original text, line ${idx + 1}`}
                                placeholder="Original line"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSegments((cur) =>
                                    cur.map((x) => (x.id === seg.id ? { ...x, sourceText: val } : x)),
                                  );
                                }}
                                className="fb-input resize-none !bg-canvas !text-[14.5px]"
                              />
                              <textarea
                                rows={2}
                                value={seg.translatedText}
                                aria-label={`${targetLabel} translation, line ${idx + 1}`}
                                onFocus={() => {
                                  focusedSegmentIdRef.current = seg.id;
                                }}
                                placeholder={`${targetLabel} translation`}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSegments((cur) =>
                                    cur.map((x) => (x.id === seg.id ? { ...x, translatedText: val } : x)),
                                  );
                                }}
                                className="fb-input resize-none !text-[14.5px]"
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-muted sm:px-5">
                      <span className="mr-1">Download subtitles</span>
                      <ToolText
                        onClick={() =>
                          downloadTextBlob(
                            buildSrtFromSegments(segments, false),
                            `${media.name.replace(/\.[^/.]+$/, "")}-original.srt`,
                          )
                        }
                      >
                        Original
                      </ToolText>
                      <ToolText
                        onClick={() =>
                          downloadTextBlob(
                            buildSrtFromSegments(segments, translatedCount > 0),
                            `${media.name.replace(/\.[^/.]+$/, "")}-${settings.targetLanguage}.srt`,
                          )
                        }
                      >
                        Translated
                      </ToolText>
                    </div>
                  </>
                )}
              </section>

              {dragging ? <DropOver label="Drop to replace" /> : null}
            </div>
          )}
        </StudioStage>

        {/* 2 · Action + settings (sticky on desktop, docked on phones) */}
        <DubControls
          action={railAction}
          settings={settings}
          onChange={patchSettings}
          speakerRef={speakerRef}
          customUploadRef={customUploadRef}
          customUploadFileName={customUploadFileName}
          customUploadLoading={customUploadLoading}
          onUploadCustomVoiceFile={(file) => void handleCustomVoiceUpload(file)}
          onClearCustomVoiceUpload={() => {
            setCustomUploadRef((prev) => {
              if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
              return null;
            });
            setCustomUploadFileName(null);
            patchSettings({ cloneSource: "auto_vad" });
          }}
          savedCustomVoices={savedClones}
          activeCustomVoiceId={activeCloneId}
          onSelectCustomVoice={setActiveCloneId}
          pool={pool}
        />

        {/* 3 · Everything dubbed in the last 24 hours */}
        <div className={`min-w-0 border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <HistorySection
            title="Your dubs"
            label="Your dubbed audio"
            count={jobs.length}
            note={
              storage
                ? `Kept for ${storage.ttlHours} hours. Older items may be cleared sooner when space is needed.`
                : undefined
            }
          >
            {jobs.length === 0 ? (
              isLoaded && !isSignedIn ? (
                <HistoryEmpty>
                  <span>
                    Sign in to dub and keep your tracks and subtitles here for 24 hours.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setGateAction("dub videos and keep them for 24 hours");
                        setGateOpen(true);
                      }}
                      className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-deep"
                    >
                      Sign in or create a free account
                    </button>
                  </span>
                </HistoryEmpty>
              ) : (
                <HistoryEmpty>Nothing here yet. Finished dubs show up in this list with their subtitles.</HistoryEmpty>
              )
            ) : (
              <HistoryList>
                {jobs.map((job) => {
                  const isRunning = ACTIVE_DUB_STATUSES.has(job.status);
                  const stem = job.sourceVideoName.replace(/\.[^/.]+$/, "") || "media";
                  const sourceSrt =
                    job.sourceSrtText || (job.segments.length > 0 ? buildSrtFromSegments(job.segments, false) : "");
                  const dualSrt =
                    job.dualSrtText || (job.segments.length > 0 ? buildDualSrtFromSegments(job.segments) : "");
                  const voiceName = job.voiceLabel.replace(/\s*\(20s VAD\)\s*$/i, "");

                  return (
                    <HistoryRow
                      key={job.id}
                      active={stageJob?.id === job.id}
                      thumb={
                        <HistoryThumb>
                          {isRunning ? (
                            <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
                          ) : (
                            <Film size={18} aria-hidden />
                          )}
                        </HistoryThumb>
                      }
                      title={`${job.sourceVideoName} → ${getDubLanguageLabel(job.targetLanguage)}`}
                      badge={
                        job.status === "completed" ? (
                          <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                        ) : null
                      }
                      metaTitle={job.stageLabel}
                      meta={[
                        dubStatusLabel(job),
                        voiceName || null,
                        job.vadReferenceInfo
                          ? `voice sample ${formatTime(job.vadReferenceInfo.startSec, false)}–${formatTime(job.vadReferenceInfo.endSec, false)}`
                          : null,
                        formatTime(job.elapsedMs / 1000, false),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      progress={isRunning ? Math.round(job.progress) : undefined}
                      progressLabel={dubStatusLabel(job)}
                      progressTitle={job.stageLabel}
                      error={job.status === "failed" ? job.error : undefined}
                      actions={
                        <>
                          {job.status === "completed" && job.audioUrl ? (
                            <>
                              {job.videoDownloadUrl ? (
                                <HistoryButton href={job.videoDownloadUrl} icon={<Download size={14} aria-hidden />}>
                                  Saved video
                                </HistoryButton>
                              ) : null}
                              <HistoryButton onClick={() => setBindModalJob(job)} icon={<Film size={14} aria-hidden />}>
                                Add to video
                              </HistoryButton>
                              {job.downloadUrl ? (
                                <HistoryButton
                                  loud
                                  href={job.downloadUrl}
                                  filename={job.fileName}
                                  icon={<Download size={14} aria-hidden />}
                                >
                                  Audio
                                </HistoryButton>
                              ) : null}
                            </>
                          ) : null}
                          <ToolIcon
                            label="Delete dubbing job"
                            slot="history-remove"
                            onClick={() => void handleDeleteJob(job.id)}
                          >
                            <Trash2 size={15} aria-hidden />
                          </ToolIcon>
                        </>
                      }
                    >
                      {job.status === "completed" && job.audioUrl ? (
                        <div className="space-y-3 px-4 pb-4 sm:px-6">
                          <AudioPlayer
                            src={job.audioUrl}
                            duration={Math.max(1, job.durationSeconds)}
                            peaks={job.peaks}
                            fileName={job.fileName}
                            formatLabel={`MP3${job.byteLength ? ` · ${formatBytes(job.byteLength)}` : ""}`}
                            compact
                            tone="light"
                          />
                          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                            {media && (
                              <ToolText
                                onClick={() => {
                                  setActiveDubJobId(job.id);
                                  setPreviewTrack("dubbed");
                                }}
                                icon={<RefreshCw size={14} aria-hidden />}
                              >
                                Play with the video
                              </ToolText>
                            )}
                            {(job.srtText || sourceSrt || dualSrt) && <span className="ml-1">Subtitles</span>}
                            {job.srtText && (
                              <ToolText
                                title="Download translated subtitles"
                                onClick={() => downloadTextBlob(job.srtText, `${stem}-${job.targetLanguage}.srt`)}
                              >
                                Translated
                              </ToolText>
                            )}
                            {sourceSrt && (
                              <ToolText
                                title="Download original subtitles"
                                onClick={() => downloadTextBlob(sourceSrt, `${stem}-original.srt`)}
                              >
                                Original
                              </ToolText>
                            )}
                            {dualSrt && (
                              <ToolText
                                title="Download subtitles in both languages"
                                onClick={() => downloadTextBlob(dualSrt, `${stem}-dual.srt`)}
                              >
                                Both
                              </ToolText>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </HistoryRow>
                  );
                })}
              </HistoryList>
            )}
          </HistorySection>
        </div>
      </StudioFrame>

      <BindVideoModal
        job={bindModalJob}
        loadedVideoFile={media?.kind === "video" ? media.file : null}
        workerAuth={workerAuth}
        onClose={() => setBindModalJob(null)}
        onDownloadText={downloadTextBlob}
        onSavedToVault={(updated) => {
          setJobs((cur) => cur.map((j) => (j.id === updated.id ? updated : j)));
        }}
      />

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action={gateAction}
        cost={estimatedCredits}
        file={media?.file}
        settings={settings}
      />
    </>
  );
}

function StageNotes({
  failed,
  loadError,
  statusError,
  onDismiss,
}: {
  failed: string | null;
  loadError: string | null;
  statusError: string | null;
  onDismiss: () => void;
}) {
  if (!failed && !loadError && !statusError) return null;
  return (
    <div className="shrink-0 space-y-2 p-3">
      {failed ? <Note tone="error">{failed}</Note> : null}
      {loadError ? <Note tone="error">{loadError}</Note> : null}
      {statusError ? (
        <Note tone="error">
          {statusError}{" "}
          <button type="button" onClick={onDismiss} className="font-semibold underline underline-offset-2">
            Dismiss
          </button>
        </Note>
      ) : null}
    </div>
  );
}

const DUB_STEPS = ["Extract", "Transcribe", "Translate", "Dub"] as const;

/** The whole pipeline in one place: four cells, and one progress line for the active one. */
function DubStepper({
  activeStep,
  stepsDone,
  label,
  detail,
  percent,
  title,
}: {
  activeStep: number | null;
  stepsDone: number;
  label: string;
  detail: string;
  percent: number | null;
  title?: string;
}) {
  return (
    <div className="shrink-0 border-b border-line bg-panel">
      <ol className="grid grid-cols-4" aria-label="Dubbing steps">
        {DUB_STEPS.map((name, index) => {
          const active = activeStep === index;
          const done = !active && ((activeStep !== null && index < activeStep) || index < stepsDone);
          return (
            <li
              key={name}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-[52px] min-w-0 items-center gap-2.5 border-l border-line px-2 first:border-l-0 max-xl:justify-center xl:px-5 ${
                active ? "bg-ink text-white" : ""
              }`}
            >
              <span
                className={`fb-num grid h-6 w-6 shrink-0 place-items-center text-[12.5px] font-semibold max-xl:hidden ${
                  done ? "bg-accent-deep text-white" : active ? "bg-accent-deep text-white" : "border border-line-strong text-faint"
                }`}
              >
                {done ? (
                  <Check size={13} strokeWidth={3} aria-hidden />
                ) : active ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span className={`truncate text-[11.5px] uppercase xl:text-[13px] ${active || done ? "font-semibold" : "text-muted"}`}>
                {name}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {label ? (
        <div className="border-t border-line px-4 py-3 sm:px-5" role="status" title={title}>
          <div className="flex items-center justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-semibold">
              {label}
              {detail ? <span className="font-normal text-muted"> · {detail}</span> : null}
            </span>
            {percent !== null ? (
              <span className="fb-num shrink-0 text-muted">{Math.round(percent)}%</span>
            ) : null}
          </div>
          <div className="mt-2 h-[6px] overflow-hidden bg-line-strong/50">
            <div
              className={`h-full bg-accent transition-[width] duration-300 ${percent === null ? "fb-blink" : ""}`}
              style={{ width: percent === null ? "100%" : `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
