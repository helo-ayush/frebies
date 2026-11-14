"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertCircle,
  AudioLines,
  Captions,
  CheckCircle2,
  Clock,
  Cloud,
  Download,
  FileAudio,
  Film,
  Languages,
  Loader2,
  Lock,
  Mic2,
  Plus,
  RefreshCw,
  ShieldCheck,
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

function dubStatusBadge(job: DubJobSnapshot): { label: string; className: string } {
  switch (job.status) {
    case "queued":
      return { label: "Queued", className: "bg-slate-50 text-slate-700 ring-slate-200" };
    case "waiting_for_server":
      return { label: "Warming GPU", className: "bg-amber-50 text-amber-800 ring-amber-200" };
    case "transcribing":
      return { label: "Deepgram ASR", className: "bg-sky-50 text-sky-800 ring-sky-200" };
    case "translating":
      return { label: "OpenRouter + Tags", className: "bg-violet-50 text-violet-800 ring-violet-200" };
    case "synthesizing":
      return {
        label:
          job.segmentsTotal > 0
            ? `Dubbing ${job.segmentsDone}/${job.segmentsTotal}`
            : "Synthesizing",
        className: "bg-accent/[0.08] text-[#a8432c] ring-accent/25",
      };
    case "mixing":
      return { label: "Mastering & Saving", className: "bg-sky-50 text-sky-800 ring-sky-200" };
    case "completed":
      return { label: "Ready in Vault", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    case "failed":
      return { label: "Failed", className: "bg-rose-50 text-rose-700 ring-rose-200" };
  }
}

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
      setGateAction("transcribe and chunk audio with Deepgram + OpenRouter");
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
          throw new Error(data.error || `Deepgram transcription failed on ${trip.label}.`);
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
      setGateAction("translate dialogue with OpenRouter & Drama 3 expression tags");
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
      setGateAction("run AI voice dubbing and save to your cloud vault");
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

  return (
    <div className="space-y-6">
      <section
        id="video-dubbing"
        aria-label="AI Video & Audio Dubbing Studio"
        className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_2px_12px_rgba(15,15,16,0.03)]"
      >
        {/* Studio header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
              <ToolGlyph path="/video/dubbing" size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">AI Dubbing Studio</h2>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-[#a8432c]">
                  SaaS Engine
                </span>
              </div>
              <p className="mt-0.5 text-micro text-faint">
                Extract audio locally, transcribe with Deepgram, dub with Drama 3 expression tags, then download MP3 or bind back to video.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe3d4] bg-[#f4faf5] px-2.5 py-1 text-[10.5px] font-medium text-[#2c6b3f]">
              <ShieldCheck size={11} aria-hidden />
              Zero-video upload
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-[#a8432c]">
              <Clock size={10} aria-hidden />
              Up to 2 hours · 5 cr/min
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-muted">
              <Cloud size={10} aria-hidden />
              Deepgram + OpenRouter + Drama 3
            </span>
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => {
                  setGateAction("run AI dubbing and manage your 24h dubbing vault");
                  setGateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
              >
                <Lock size={10} className="text-accent" aria-hidden />
                Sign in to dub
              </button>
            )}
          </div>
        </div>

        {/* Main 2-column studio grid */}
        <div className="grid lg:min-h-[700px] lg:grid-cols-[minmax(0,1fr)_396px]">
          <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.mp3,.wav,.m4a,.aac,.flac,.ogg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void ingestMediaFile(file);
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
                  className="shrink-0 text-[11px] font-medium underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {!media ? (
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
                  if (file) void ingestMediaFile(file);
                }}
                className={`flex flex-1 flex-col items-center justify-center rounded-[20px] border border-dashed px-6 py-12 text-center transition-colors ${
                  dragging
                    ? "border-accent bg-accent/[0.04]"
                    : "border-[#d7d7d3] bg-gradient-to-b from-[#fafaf9] to-[#f4f4f1]/60"
                }`}
              >
                <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-line bg-white text-ink shadow-[0_4px_16px_rgba(15,15,16,0.06)]">
                  <UploadCloud size={26} strokeWidth={1.5} aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.025em] text-ink">
                  Drop a video or audio file to dub
                </h3>
                <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">
                  Videos stay strictly inside your browser — we extract &amp; fix the audio codec locally before sending compact audio to Deepgram, OpenRouter, and Drama 3.
                </p>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-6 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#252528]"
                >
                  <Film size={14} aria-hidden />
                  Choose video or audio file
                </button>

                <p className="mt-3 text-[11px] text-faint">
                  Video (MP4, MOV, WebM, MKV, AVI) or Audio (MP3, WAV, M4A, FLAC, OGG) · up to 2 hours (120 min)
                </p>

                <div className="mt-6 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
                  {[
                    {
                      icon: Mic2,
                      title: "20s VAD voice cloning",
                      desc: "Finds the cleanest 20s continuous speech span — or upload a custom voice file.",
                    },
                    {
                      icon: Languages,
                      title: "Semantic + tag chunking",
                      desc: "Deepgram word timestamps grouped by OpenRouter with Drama 3 emotion cues.",
                    },
                    {
                      icon: Sparkles,
                      title: "Download or Bind later",
                      desc: "Get MP3 & SRTs from your vault, or bind dual audio + subtitles onto MP4 in-browser.",
                    },
                  ].map((item) => {
                    const CardIcon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="rounded-[14px] border border-line bg-white/85 p-3 shadow-[0_1px_3px_rgba(15,15,16,0.03)]"
                      >
                        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                          <CardIcon size={12} className="text-accent" aria-hidden />
                          {item.title}
                        </div>
                        <p className="mt-1 text-[10.5px] leading-snug text-faint">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Media preview player */}
                <div className="relative overflow-hidden rounded-[18px] border border-line bg-[#111113]">
                  {media.kind === "video" ? (
                    <div className="relative aspect-video w-full max-h-[340px] bg-black">
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
                              <p className="text-[12.5px] font-medium leading-snug">
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
                                      ? "text-[10.5px] leading-snug text-amber-200/90"
                                      : "text-[12.5px] font-medium leading-snug"
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
                    <div className="flex flex-col gap-3 bg-gradient-to-br from-[#17171a] to-[#232327] p-5 text-white">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-accent">
                          <FileAudio size={20} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold">{media.name}</p>
                          <p className="text-[11px] text-white/65">
                            Source audio file · {media.duration ? formatTime(media.duration, false) : "Preparing duration"} · {formatBytes(media.size)}
                          </p>
                        </div>
                      </div>
                      <audio
                        ref={audioElRef}
                        src={previewTrack === "dubbed" && activeDubAudioUrl ? activeDubAudioUrl : media.url}
                        controls
                        onTimeUpdate={(e) => setMediaCurrentSec(e.currentTarget.currentTime)}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Toolbar & A/B track switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 bg-[#18181b] px-4 py-2.5 text-white">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-white">{media.name}</p>
                      <p className="text-[10.5px] text-white/60">
                        {media.kind === "video" && media.width > 0 ? `${media.width}×${media.height} · ` : ""}
                        {media.duration ? `${formatTime(media.duration, false)} · ` : ""}
                        {formatBytes(media.size)}
                        {detectedLangLabel ? ` · Detected: ${detectedLangLabel}` : ""}
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
                            Dubbed ({getDubLanguageLabel(latestCompletedForMedia?.targetLanguage || settings.targetLanguage)})
                          </button>
                        </div>
                      )}

                      {media.kind === "video" && (segments.length > 0 || latestCompletedForMedia) && (
                        <select
                          aria-label="Preview caption language"
                          value={captionMode}
                          onChange={(e) => setCaptionMode(e.target.value as OverlayCaptionMode)}
                          className="h-7 rounded-full border border-white/20 bg-white/10 px-2.5 text-[10.5px] font-medium text-white outline-none"
                        >
                          <option value="translated" className="text-ink">
                            Sub: Translated
                          </option>
                          <option value="original" className="text-ink">
                            Sub: Original
                          </option>
                          <option value="dual" className="text-ink">
                            Sub: Dual
                          </option>
                          <option value="off" className="text-ink">
                            Sub: Off
                          </option>
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-white/85 hover:bg-white/10"
                      >
                        Replace file
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pipeline quick actions bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-[#fafaf9] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runServerDeepgramTranscription(media)}
                      disabled={Boolean(browserStage) || transcribing || submitting}
                      className="inline-flex h-8.5 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[#272729] disabled:opacity-50"
                    >
                      {transcribing || browserStage ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : (
                        <Wand2 size={12} aria-hidden />
                      )}
                      {segments.length > 0
                        ? "Re-analyze (Deepgram + OpenRouter)"
                        : "1. Extract Audio & Auto-Chunk"}
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
                      2. Re-translate &amp; tag
                    </button>
                  </div>

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
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink"
                  >
                    <Plus size={11} aria-hidden />
                    Add line
                  </button>
                </div>

                {browserStage && (
                  <div className="rounded-[12px] border border-line bg-white p-3">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
                        {browserStage.label}
                      </span>
                      <span className="font-mono text-[11px] text-faint">{browserStage.percent}%</span>
                    </div>
                    <Progress value={browserStage.percent} className="mt-2 h-1.5" />
                  </div>
                )}

                {/* Semantic script & Drama 3 expression tags editor */}
                {segments.length > 0 && (
                  <div className="rounded-[16px] border border-line bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2.5">
                      <div>
                        <p className="text-[12px] font-semibold text-ink">
                          Semantic dialogue chunks &amp; expression cues ({segments.length})
                        </p>
                        <p className="text-[10.5px] text-faint">
                          Grouped by Deepgram timestamps + OpenRouter meaning. Tags like [excited] guide Drama 3 delivery and stay hidden in subtitles.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadTextBlob(
                              buildSrtFromSegments(segments, false),
                              `${media.name.replace(/\.[^/.]+$/, "")}-original.srt`,
                            )
                          }
                          className="text-[11px] font-medium text-muted hover:text-ink"
                        >
                          Original .SRT
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadTextBlob(
                              buildSrtFromSegments(segments, translatedCount > 0),
                              `${media.name.replace(/\.[^/.]+$/, "")}-${settings.targetLanguage}.srt`,
                            )
                          }
                          className="text-[11px] font-medium text-ink underline-offset-2 hover:underline"
                        >
                          Translated .SRT
                        </button>
                      </div>
                    </div>

                    {/* Drama 3 Expression Tag insertion bar */}
                    <div className="flex flex-wrap items-center gap-1 border-b border-line-soft bg-[#fafaf9] px-3.5 py-2">
                      <span className="mr-1 text-[10.5px] font-medium text-muted">
                        Insert cue:
                      </span>
                      {DUB_EXPRESSION_TAGS.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() => insertExpressionTagIntoFocused(t.tag)}
                          className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-medium text-ink transition hover:border-ink hover:bg-rail"
                        >
                          {t.tag}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-[280px] divide-y divide-line-soft overflow-y-auto">
                      {segments.map((seg, idx) => {
                        const isRefSource =
                          speakerRef && Math.abs(speakerRef.startSec - seg.startSec) < 0.25;
                        return (
                          <div key={seg.id} className="grid gap-2 p-3 sm:grid-cols-[126px_minmax(0,1fr)]">
                            <div className="flex flex-col justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const el = videoElRef.current ?? audioElRef.current;
                                  if (el) {
                                    el.currentTime = seg.startSec;
                                    void el.play().catch(() => {});
                                  }
                                }}
                                title="Jump media to this chunk"
                                className="inline-flex w-fit items-center gap-1 rounded-md border border-line bg-rail px-2 py-1 font-mono text-[10.5px] font-medium text-ink hover:border-ink"
                              >
                                {formatTime(seg.startSec, true)}–{formatTime(seg.endSec, true)}
                              </button>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {typeof seg.speaker === "number" && (
                                  <span className="rounded bg-rail px-1.5 py-0.5 text-[9.5px] font-medium text-muted">
                                    S{seg.speaker + 1}
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
                                      className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium ${
                                        isRefSource
                                          ? "bg-accent/15 text-[#a8432c]"
                                          : "border border-line text-faint hover:text-ink"
                                      }`}
                                    >
                                      {isRefSource ? "VAD sample ✓" : "Clone from here"}
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
                                placeholder="Original spoken phrase..."
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
                                onFocus={() => {
                                  focusedSegmentIdRef.current = seg.id;
                                }}
                                placeholder={`Translated (${getDubLanguageLabel(settings.targetLanguage)}) with [expression] tags`}
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
          </div>

          <DubControls
            settings={settings}
            onChange={patchSettings}
            hasMedia={Boolean(media)}
            mediaKind={media?.kind ?? "video"}
            durationSec={media?.duration ?? 0}
            segmentCount={segments.length}
            translatedCount={translatedCount}
            estimatedCredits={estimatedCredits}
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
            onStartDub={() => void handleStartDubbing()}
            submitting={submitting}
            extracting={Boolean(browserStage) && !transcribing}
            transcribing={transcribing}
            translating={translating}
            isSignedIn={isSignedIn}
            pool={pool}
          />
        </div>
      </section>

      {/* Dedicated 24h User Profile Dub Vault & Bind-to-Video Workspace */}
      <section aria-label="Your dubbed audio vault" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <AudioLines size={15} className="text-accent" aria-hidden />
              Your dubbed library
              {jobs.length > 0 && (
                <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                  {jobs.length}
                </span>
              )}
            </h3>
          </div>
          {storage && jobs.length > 0 && <GenerationStorageNotice ttlHours={storage.ttlHours} />}
        </div>

        {jobs.length === 0 ? (
          isLoaded && !isSignedIn ? (
            <div className="flex flex-col items-center rounded-[22px] border border-dashed border-[#d6d4cc] bg-white/70 px-6 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rail text-ink ring-1 ring-line">
                <Lock size={18} aria-hidden />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-ink">
                Sign in to access your private dubbed vault
              </p>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">
                Every user&apos;s dubbed audio tracks and subtitles stay separated in Tigris cloud storage for 24 hours, ready to download or bind back to your original video anytime.
              </p>
              <button
                type="button"
                onClick={() => {
                  setGateAction("dub videos and access your private 24h vault");
                  setGateOpen(true);
                }}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[12px] font-medium text-white hover:bg-[#222225]"
              >
                <Lock size={12} aria-hidden />
                Sign in or create free account
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-[22px] border border-dashed border-[#d6d4cc] bg-white/60 px-6 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-ink">No dubbed audio saved yet</p>
              <p className="mt-1 max-w-md text-[12px] text-muted">
                Upload a video or audio above and click <strong className="text-ink">Generate Dubbed Audio</strong>. Completed tracks appear here with <strong className="text-ink">Download Audio</strong> and <strong className="text-ink">Bind to Video</strong>.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const badge = dubStatusBadge(job);
              const isRunning = ACTIVE_DUB_STATUSES.has(job.status);
              const stem = job.sourceVideoName.replace(/\.[^/.]+$/, "") || "media";
              const sourceSrt =
                job.sourceSrtText || (job.segments.length > 0 ? buildSrtFromSegments(job.segments, false) : "");
              const dualSrt =
                job.dualSrtText || (job.segments.length > 0 ? buildDualSrtFromSegments(job.segments) : "");

              return (
                <article
                  key={job.id}
                  className={`overflow-hidden rounded-[20px] border bg-white shadow-[0_1px_3px_rgba(15,15,16,0.03)] transition-colors ${
                    isRunning ? "border-accent/40" : job.status === "failed" ? "border-rose-200" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 p-4 sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {job.status === "completed" ? (
                          <CheckCircle2 size={15} className="text-[#2f8048]" aria-hidden />
                        ) : job.status === "failed" ? (
                          <AlertCircle size={15} className="text-[#b83d32]" aria-hidden />
                        ) : (
                          <Loader2 size={15} className="animate-spin text-accent" aria-hidden />
                        )}

                        <p className="truncate text-[13px] font-semibold text-ink">
                          {job.sourceVideoName} → {getDubLanguageLabel(job.targetLanguage)}
                        </p>

                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        <span className="rounded-full border border-line bg-[#fafaf9] px-2 py-0.5 text-[10px] text-muted">
                          {job.voiceLabel}
                        </span>

                        {job.status === "completed" && (
                          <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {job.stageLabel}
                        {job.vadReferenceInfo
                          ? ` · Cloned ${job.vadReferenceInfo.durationSec}s VAD (${formatTime(job.vadReferenceInfo.startSec, false)}–${formatTime(job.vadReferenceInfo.endSec, false)})`
                          : ""}
                      </p>
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
                        className="rounded-lg p-1.5 text-faint hover:bg-rail hover:text-[#b43b30]"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  </div>

                  {isRunning && (
                    <div className="border-t border-line-soft bg-accent/[0.025] px-4 py-3 sm:px-5">
                      <Progress value={job.progress} showValue label={job.stageLabel} />
                    </div>
                  )}

                  {job.status === "failed" && job.error && (
                    <div className="border-t border-rose-100 bg-rose-50/70 px-4 py-3 text-[11.5px] text-rose-800 sm:px-5">
                      {job.error}
                    </div>
                  )}

                  {job.status === "completed" && job.audioUrl && (
                    <div className="space-y-3 border-t border-line-soft bg-[#fbfbfa] p-4 sm:px-5">
                      <AudioPlayer
                        src={job.audioUrl}
                        duration={Math.max(1, job.durationSeconds)}
                        peaks={job.peaks}
                        fileName={job.fileName}
                        formatLabel={`MP3 · ${job.byteLength ? formatBytes(job.byteLength) : "Dubbed"}`}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                        {/* Subtitles & A/B sync helpers */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {media && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDubJobId(job.id);
                                setPreviewTrack("dubbed");
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                            >
                              <RefreshCw size={10} aria-hidden />
                              Preview synced in player
                            </button>
                          )}

                          {job.srtText && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadTextBlob(job.srtText, `${stem}-${job.targetLanguage}.srt`)
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                            >
                              <Captions size={10} aria-hidden />
                              Translated .SRT
                            </button>
                          )}

                          {sourceSrt && (
                            <button
                              type="button"
                              onClick={() => downloadTextBlob(sourceSrt, `${stem}-original.srt`)}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                            >
                              <Captions size={10} aria-hidden />
                              Original .SRT
                            </button>
                          )}

                          {dualSrt && (
                            <button
                              type="button"
                              onClick={() => downloadTextBlob(dualSrt, `${stem}-dual.srt`)}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-medium text-ink hover:bg-rail"
                            >
                              <Captions size={10} aria-hidden />
                              Dual .SRT
                            </button>
                          )}
                        </div>

                        {/* Two primary actions requested: Download Audio & Bind to Video */}
                        <div className="flex flex-wrap items-center gap-2">
                          {job.downloadUrl && (
                            <a
                              href={job.downloadUrl}
                              download={job.fileName}
                              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-[11.5px] font-semibold text-ink transition hover:border-ink hover:bg-rail"
                            >
                              <Download size={12} aria-hidden />
                              Download Audio (.mp3)
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => setBindModalJob(job)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[11.5px] font-semibold text-white transition hover:bg-[#242426]"
                          >
                            <Film size={12} aria-hidden />
                            Bind Audio to Video
                          </button>

                          {job.videoDownloadUrl && (
                            <a
                              href={job.videoDownloadUrl}
                              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#9bc5a7] bg-[#f4faf5] px-3.5 text-[11.5px] font-semibold text-[#1f5731] hover:bg-[#e5f5e9]"
                            >
                              <Download size={12} aria-hidden />
                              Saved MP4
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

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
    </div>
  );
}
