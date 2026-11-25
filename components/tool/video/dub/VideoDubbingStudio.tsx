"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  Captions,
  Check,
  CheckCircle2,
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
import { Progress } from "@/components/arc/progress/progress";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import type { SavedCustomVoice } from "@/components/tool/audio/tts/model";
import { loadSavedClonedVoices } from "@/components/tool/audio/tts/voice-clone-utils";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  ActionRow,
  Chip,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  ResultCard,
  STAGE_LABEL,
  STUDIO_GRID,
  SecondaryAction,
  Segmented,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { buttonClasses } from "@/components/ui/Button";
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
const LEFT_COLUMN = "lg:col-start-1 lg:-mr-px lg:self-stretch lg:border-r lg:border-line";
/** Lets a result strip keep a readable title and wrap its buttons on a phone. */
const RESULT_CARD_FIT = "[&>div:nth-child(2)]:basis-[150px] [&>div:last-child]:max-w-full";

const QUIET_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-45";
const GREEN_LINK =
  "inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2";

export function VideoDubbingStudio({ maxSizeMB = 2048 }: { maxSizeMB?: number }) {
  const { isLoaded, isSignedIn, user } = useAuthSession();
  const ownerUserId = isSignedIn ? (user?.id ?? null) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
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
          media && needsSignIn ? <Lock size={15} aria-hidden /> : <Languages size={16} aria-hidden />
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
        <StudioStage className={`lg:row-start-1 ${LEFT_COLUMN}`}>
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

          {loadError || statusError || failedJob || resultJob ? (
            <div className="mb-3 space-y-2">
              {resultJob ? (
                <ResultCard
                  className={RESULT_CARD_FIT}
                  title={`${getDubLanguageLabel(resultJob.targetLanguage)} dub is ready`}
                  meta={`${resultJob.sourceVideoName} · MP3${
                    resultJob.byteLength ? ` · ${formatBytes(resultJob.byteLength)}` : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setBindModalJob(resultJob)}
                    className={buttonClasses("secondary", "md", "h-10 rounded-[12px]")}
                  >
                    <Film size={14} aria-hidden />
                    Add to video
                  </button>
                  {resultJob.downloadUrl ? (
                    <a
                      href={resultJob.downloadUrl}
                      download={resultJob.fileName}
                      className={GREEN_LINK}
                    >
                      <Download size={15} aria-hidden />
                      Download audio
                    </a>
                  ) : null}
                </ResultCard>
              ) : null}

              {failedJob ? (
                <Note tone="error">
                  {failedJob.error || "The dub failed."} You can try again.
                </Note>
              ) : null}

              {loadError ? <Note tone="error">{loadError}</Note> : null}

              {statusError ? (
                <Note tone="error">
                  {statusError}{" "}
                  <button
                    type="button"
                    onClick={() => setStatusError(null)}
                    className="font-medium underline underline-offset-2"
                  >
                    Dismiss
                  </button>
                </Note>
              ) : null}
            </div>
          ) : null}

          {!media ? (
            <div className="flex flex-col lg:h-[calc(100dvh-236px)] lg:max-h-[820px] lg:min-h-[480px]">
              <Dropzone
                title="Drop a video or audio file to dub"
                description="Translate the speech into another language, in the speaker's own voice."
                buttonLabel="Choose a file"
                limits="MP4, MOV, WebM, MKV, MP3, WAV, M4A and more · up to 2 hours"
                note="Your video stays on this device. Only its audio is uploaded."
                icon={<Film size={27} strokeWidth={1.5} aria-hidden />}
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
                minHeightClass="min-h-[380px] lg:min-h-0"
                chips={
                  <>
                    <DropChip>12 languages</DropChip>
                    <DropChip>Editable script</DropChip>
                    <DropChip>Subtitles included</DropChip>
                  </>
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={STAGE_LABEL}>Preview</span>
                  {media.duration ? <Chip>{formatTime(media.duration, false)}</Chip> : null}
                  {detectedLangLabel ? <Chip>Detected: {detectedLangLabel}</Chip> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeDubAudioUrl && (
                    <Segmented
                      label="Preview audio"
                      className="w-[196px] border border-line"
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
                  )}

                  {media.kind === "video" && (segments.length > 0 || latestCompletedForMedia) && (
                    <select
                      aria-label="Preview caption language"
                      value={captionMode}
                      onChange={(e) => setCaptionMode(e.target.value as OverlayCaptionMode)}
                      className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] font-medium text-ink outline-none transition-colors focus:border-ink focus-visible:ring-2 focus-visible:ring-accent/30"
                    >
                      <option value="translated">Captions: translated</option>
                      <option value="original">Captions: original</option>
                      <option value="dual">Captions: both</option>
                      <option value="off">Captions: off</option>
                    </select>
                  )}
                </div>
              </div>

              {media.kind === "video" ? (
                <div className="relative aspect-video max-h-[340px] w-full overflow-hidden rounded-[16px] border border-line bg-black">
                  <video
                    ref={videoElRef}
                    key={media.url}
                    src={media.url}
                    controls
                    playsInline
                    onTimeUpdate={(e) => setMediaCurrentSec(e.currentTarget.currentTime)}
                    className="h-full w-full object-contain"
                  />
                  {activeDubAudioUrl && (
                    <audio ref={syncedAudioRef} src={activeDubAudioUrl} preload="auto" />
                  )}

                  {activeCaptionSegment && captionMode !== "off" && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-12 flex justify-center">
                      <div className="max-w-[92%] space-y-0.5 rounded-lg bg-black/80 px-3 py-1.5 text-center text-white backdrop-blur-sm">
                        {(captionMode === "translated" || captionMode === "dual") && (
                          <p className="text-[13px] font-medium leading-snug">
                            {stripDramaTagsForSubtitles(
                              activeCaptionSegment.translatedText || activeCaptionSegment.sourceText,
                            )}
                          </p>
                        )}
                        {(captionMode === "original" || captionMode === "dual") &&
                          activeCaptionSegment.sourceText && (
                            <p
                              className={
                                captionMode === "dual"
                                  ? "text-[12px] leading-snug text-amber-200/90"
                                  : "text-[13px] font-medium leading-snug"
                              }
                            >
                              {stripDramaTagsForSubtitles(activeCaptionSegment.sourceText)}
                            </p>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[16px] border border-line bg-white p-3">
                  <audio
                    ref={audioElRef}
                    src={previewTrack === "dubbed" && activeDubAudioUrl ? activeDubAudioUrl : media.url}
                    controls
                    onTimeUpdate={(e) => setMediaCurrentSec(e.currentTarget.currentTime)}
                    className="w-full"
                  />
                </div>
              )}

              <FileRow
                icon={
                  media.kind === "video" ? (
                    <Film size={16} aria-hidden />
                  ) : (
                    <FileAudio size={16} aria-hidden />
                  )
                }
                name={media.name}
                meta={`${
                  media.kind === "video" && media.width > 0 ? `${media.width} × ${media.height} · ` : ""
                }${formatBytes(media.size)}`}
                onReplace={() => fileInputRef.current?.click()}
              />

              <DubStepper
                activeStep={activeStep}
                stepsDone={stepsDone}
                label={stepLabel}
                detail={stepDetail}
                percent={stepPercent}
                title={stepTitle}
              />

              <section aria-label="Script" className="rounded-[16px] border border-line bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13.5px] font-semibold text-ink">Script</h3>
                    {segments.length > 0 ? (
                      <Chip>
                        {segments.length} {segments.length === 1 ? "line" : "lines"}
                      </Chip>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void runServerDeepgramTranscription(media)}
                      disabled={Boolean(browserStage) || transcribing || submitting}
                      className={QUIET_BUTTON}
                    >
                      {transcribing ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        <Wand2 size={13} aria-hidden />
                      )}
                      {segments.length > 0 ? "Transcribe again" : "Transcribe first"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleTranslateOnly()}
                      disabled={segments.length === 0 || translating}
                      className={QUIET_BUTTON}
                    >
                      {translating ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        <Languages size={13} aria-hidden />
                      )}
                      Translate again
                    </button>

                    <button
                      type="button"
                      onClick={() => captionInputRef.current?.click()}
                      className={QUIET_BUTTON}
                    >
                      <Captions size={13} aria-hidden />
                      Import subtitles
                    </button>

                    <button
                      type="button"
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
                      className={QUIET_BUTTON}
                    >
                      <Plus size={13} aria-hidden />
                      Add line
                    </button>
                  </div>
                </div>

                {segments.length === 0 ? (
                  <p className="border-t border-line-soft px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                    Optional. Transcribe first to check and edit the translation line by line, or import
                    subtitles you already have. Otherwise the dub does it all in one go.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1 border-t border-line-soft px-3.5 py-2">
                      <span
                        className="mr-1 text-[12.5px] text-muted"
                        title="Cues shape how a line is spoken. They never appear in subtitles."
                      >
                        Add a delivery cue:
                      </span>
                      {DUB_EXPRESSION_TAGS.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() => insertExpressionTagIntoFocused(t.tag)}
                          title={`Insert ${t.tag} into the selected line`}
                          className="h-7 rounded-full border border-line bg-white px-2.5 text-[12px] font-medium text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="studio-main max-h-[420px] divide-y divide-line-soft overflow-y-auto border-t border-line-soft">
                      {segments.map((seg, idx) => {
                        const isRefSource =
                          speakerRef && Math.abs(speakerRef.startSec - seg.startSec) < 0.25;
                        return (
                          <div key={seg.id} className="grid gap-2 p-3 sm:grid-cols-[148px_minmax(0,1fr)]">
                            <div className="flex flex-row flex-wrap items-center justify-between gap-1.5 sm:flex-col sm:items-start sm:justify-start">
                              <button
                                type="button"
                                onClick={() => {
                                  const el = videoElRef.current ?? audioElRef.current;
                                  if (el) {
                                    el.currentTime = seg.startSec;
                                    void el.play().catch(() => {});
                                  }
                                }}
                                title="Play from this line"
                                className="inline-flex h-7 w-fit items-center rounded-lg bg-card px-2 font-mono text-[12px] font-medium text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              >
                                {formatTime(seg.startSec, true)}–{formatTime(seg.endSec, true)}
                              </button>

                              <div className="flex flex-wrap items-center gap-1">
                                {typeof seg.speaker === "number" && (
                                  <span className="rounded bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted">
                                    Speaker {seg.speaker + 1}
                                  </span>
                                )}
                                {settings.voiceMode === "clone" &&
                                  settings.cloneSource !== "custom_upload" &&
                                  normalizedAudioRef.current?.audioBuffer && (
                                    <button
                                      type="button"
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
                                      className={`rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors ${
                                        isRefSource
                                          ? "bg-accent-soft text-accent-deep"
                                          : "text-faint hover:bg-hover hover:text-ink"
                                      }`}
                                    >
                                      {isRefSource ? "Voice sample ✓" : "Use as sample"}
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  aria-label={`Remove segment ${idx + 1}`}
                                  onClick={() => setSegments((cur) => cur.filter((x) => x.id !== seg.id))}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                >
                                  <Trash2 size={13} aria-hidden />
                                </button>
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
                                className="w-full resize-none rounded-[10px] border border-line bg-card px-2.5 py-2 text-[13px] leading-snug text-ink outline-none transition-colors focus:border-ink focus:bg-white"
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
                                className="w-full resize-none rounded-[10px] border border-line bg-white px-2.5 py-2 text-[13px] leading-snug text-ink outline-none transition-colors focus:border-ink"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 border-t border-line-soft px-3.5 py-2 text-[12.5px] text-faint">
                      <span className="mr-1">Download subtitles:</span>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            buildSrtFromSegments(segments, false),
                            `${media.name.replace(/\.[^/.]+$/, "")}-original.srt`,
                          )
                        }
                        className={QUIET_BUTTON}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            buildSrtFromSegments(segments, translatedCount > 0),
                            `${media.name.replace(/\.[^/.]+$/, "")}-${settings.targetLanguage}.srt`,
                          )
                        }
                        className={QUIET_BUTTON}
                      >
                        Translated
                      </button>
                    </div>
                  </>
                )}
              </section>
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
        <StudioStage className={`border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <section aria-label="Your dubbed audio" className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              Your dubs
              {jobs.length > 0 ? <Chip>{jobs.length}</Chip> : null}
            </h2>
            {storage ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-faint">
                Kept for {storage.ttlHours} hours. Older items may be cleared sooner when space is needed.
              </p>
            ) : null}

            {jobs.length === 0 ? (
              isLoaded && !isSignedIn ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-[13px] text-muted">
                    Sign in to dub and keep your tracks and subtitles here for 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGateAction("dub videos and keep them for 24 hours");
                      setGateOpen(true);
                    }}
                    className={buttonClasses("secondary", "md")}
                  >
                    <Lock size={13} aria-hidden />
                    Sign in
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  Nothing here yet. Finished dubs show up in this list with their subtitles.
                </p>
              )
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {jobs.map((job) => {
                  const isRunning = ACTIVE_DUB_STATUSES.has(job.status);
                  const stem = job.sourceVideoName.replace(/\.[^/.]+$/, "") || "media";
                  const sourceSrt =
                    job.sourceSrtText || (job.segments.length > 0 ? buildSrtFromSegments(job.segments, false) : "");
                  const dualSrt =
                    job.dualSrtText || (job.segments.length > 0 ? buildDualSrtFromSegments(job.segments) : "");
                  const voiceName = job.voiceLabel.replace(/\s*\(20s VAD\)\s*$/i, "");

                  return (
                    <li key={job.id} className="py-4 last:pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {job.status === "completed" ? (
                              <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
                            ) : job.status === "failed" ? (
                              <AlertCircle size={16} className="shrink-0 text-danger" aria-hidden />
                            ) : (
                              <Loader2 size={16} className="shrink-0 animate-spin text-accent" aria-hidden />
                            )}

                            <p className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
                              {job.sourceVideoName} → {getDubLanguageLabel(job.targetLanguage)}
                            </p>

                            {job.status === "completed" && (
                              <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                            )}
                          </div>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-faint" title={job.stageLabel}>
                            {dubStatusLabel(job)}
                            {voiceName ? ` · ${voiceName}` : ""}
                            {job.vadReferenceInfo
                              ? ` · voice sample ${formatTime(job.vadReferenceInfo.startSec, false)}–${formatTime(job.vadReferenceInfo.endSec, false)}`
                              : ""}
                            {" · "}
                            <span className="tabular-nums">{formatTime(job.elapsedMs / 1000, false)}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDeleteJob(job.id)}
                          aria-label="Delete dubbing job"
                          title="Delete"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>

                      {isRunning && (
                        <div className="mt-2.5" title={job.stageLabel}>
                          <Progress value={job.progress} showValue label={dubStatusLabel(job)} />
                        </div>
                      )}

                      {job.status === "failed" && job.error && (
                        <Note tone="error" className="mt-2.5">
                          {job.error}
                        </Note>
                      )}

                      {job.status === "completed" && job.audioUrl && (
                        <div className="mt-3 space-y-2.5">
                          <AudioPlayer
                            src={job.audioUrl}
                            duration={Math.max(1, job.durationSeconds)}
                            peaks={job.peaks}
                            fileName={job.fileName}
                            formatLabel={`MP3 · ${job.byteLength ? formatBytes(job.byteLength) : "Dubbed"}`}
                          />

                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <div className="flex flex-wrap items-center gap-0.5 text-[12.5px] text-faint">
                              {media && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDubJobId(job.id);
                                    setPreviewTrack("dubbed");
                                  }}
                                  className={QUIET_BUTTON}
                                >
                                  <RefreshCw size={13} aria-hidden />
                                  Play with the video
                                </button>
                              )}

                              {(job.srtText || sourceSrt || dualSrt) && (
                                <span className="ml-1 mr-0.5">Subtitles:</span>
                              )}

                              {job.srtText && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadTextBlob(job.srtText, `${stem}-${job.targetLanguage}.srt`)
                                  }
                                  className={QUIET_BUTTON}
                                  aria-label="Download translated subtitles"
                                >
                                  Translated
                                </button>
                              )}

                              {sourceSrt && (
                                <button
                                  type="button"
                                  onClick={() => downloadTextBlob(sourceSrt, `${stem}-original.srt`)}
                                  className={QUIET_BUTTON}
                                  aria-label="Download original subtitles"
                                >
                                  Original
                                </button>
                              )}

                              {dualSrt && (
                                <button
                                  type="button"
                                  onClick={() => downloadTextBlob(dualSrt, `${stem}-dual.srt`)}
                                  className={QUIET_BUTTON}
                                  aria-label="Download subtitles in both languages"
                                >
                                  Both
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {job.videoDownloadUrl && (
                                <a
                                  href={job.videoDownloadUrl}
                                  className={buttonClasses("secondary", "md", "h-9 rounded-[10px]")}
                                >
                                  <Download size={14} aria-hidden />
                                  Saved video
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => setBindModalJob(job)}
                                className={buttonClasses("secondary", "md", "h-9 rounded-[10px]")}
                              >
                                <Film size={14} aria-hidden />
                                Add to video
                              </button>

                              {job.downloadUrl && (
                                <a
                                  href={job.downloadUrl}
                                  download={job.fileName}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-success px-3.5 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2"
                                >
                                  <Download size={14} aria-hidden />
                                  Download audio
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </StudioStage>
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
      />
    </>
  );
}

const DUB_STEPS = ["Extract", "Transcribe", "Translate", "Dub"] as const;

/** The whole pipeline in one place: four steps, and a single progress line for the active one. */
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
    <div className="rounded-[14px] border border-line bg-white px-3.5 py-3">
      <ol className="flex items-start gap-1 sm:items-center sm:gap-2" aria-label="Dubbing steps">
        {DUB_STEPS.map((name, index) => {
          const active = activeStep === index;
          const done = !active && ((activeStep !== null && index < activeStep) || index < stepsDone);
          return (
            <li
              key={name}
              aria-current={active ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:gap-2"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums ${
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-accent text-white"
                      : "bg-card text-faint"
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
              <span
                className={`truncate text-[12px] sm:text-[13px] ${
                  active || done ? "font-medium text-ink" : "text-faint"
                }`}
              >
                {name}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
              {index < DUB_STEPS.length - 1 ? (
                <span aria-hidden className="hidden h-px min-w-3 flex-1 bg-line sm:block" />
              ) : null}
            </li>
          );
        })}
      </ol>

      {label ? (
        <div className="mt-3" role="status" title={title}>
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate font-medium text-ink">
              {label}
              {detail ? <span className="font-normal text-faint"> · {detail}</span> : null}
            </span>
            {percent !== null ? (
              <span className="shrink-0 tabular-nums text-faint">{Math.round(percent)}%</span>
            ) : null}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full bg-accent transition-[width] duration-300 ${
                percent === null ? "animate-pulse" : ""
              }`}
              style={{ width: percent === null ? "100%" : `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
