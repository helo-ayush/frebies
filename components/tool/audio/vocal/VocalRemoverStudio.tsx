"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Mic,
  Music,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { computePeaks, useAudioFile, type AudioItem } from "@/components/tool/audio/useAudioFile";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  Chip,
  FileRow,
  Note,
  PrimaryAction,
  ResultCard,
  STUDIO_GRID,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { Dropzone } from "@/components/tool/kit/Dropzone";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { buttonClasses } from "@/components/ui/Button";
import {
  submitWorkerMultipartForm,
  type BrowserWorkerAuth,
} from "@/lib/worker/browser-upload";
import {
  DEFAULT_VOCAL_SETTINGS,
  MIXER_PRESETS,
  VOCAL_COST,
  formatBytes,
  formatElapsedClock,
  formatTime,
  type MixerPreset,
  type VocalJobSnapshot,
  type VocalSettings,
} from "./model";
import { VocalControls } from "./VocalControls";

type GpuStatusPayload = {
  state: "ready" | "booting" | "sleeping" | "error";
  warmupState: "ready" | "loading" | "error";
  vocalModelsLoaded: string[];
  hardware: {
    device: string;
    total_gb: number;
    used_gb: number;
    free_gb: number;
  } | null;
  bootElapsedMs: number;
  lastError: string | null;
};

const ACTIVE_STATUSES = new Set([
  "queued",
  "waiting_for_server",
  "extracting",
  "separating",
  "post_processing",
]);
const ITEMS_PER_PAGE = 5;

/** Both left-hand blocks (track, history) share the column beside the sticky rail. */
const LEFT_COLUMN = "lg:col-start-1 lg:-mr-px lg:self-stretch lg:border-r lg:border-line";
/**
 * ResultCard keeps its buttons on one unshrinkable row. This lets the title keep
 * a readable width and the buttons wrap, so nothing is cut off on a phone.
 */
const RESULT_CARD_FIT = "[&>div:nth-child(2)]:basis-[150px] [&>div:last-child]:max-w-full";
const ICON_BUTTON =
  "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40";

function encodePcm16Wav(audioBuffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const dataSize = length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function buildDemoSongItem(): AudioItem {
  const sampleRate = 44100;
  const duration = 6;
  const totalSamples = sampleRate * duration;
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bassNotes = [110, 130.81, 98, 123.47];
  const vocalNotes = [440, 493.88, 523.25, 440, 392, 440, 587.33, 523.25];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.min(bassNotes.length - 1, Math.floor((t / duration) * bassNotes.length));
    const bassFreq = bassNotes[barIdx];
    const kickEnv = Math.exp(-((t % 0.5) * 14));
    const kick = Math.sin(2 * Math.PI * (55 + 70 * kickEnv) * (t % 0.5)) * kickEnv * 0.42;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.25;

    const noteIdx = Math.min(vocalNotes.length - 1, Math.floor((t / duration) * vocalNotes.length));
    const noteT = t - (noteIdx * duration) / vocalNotes.length;
    const vocalEnv = Math.min(1, noteT * 18) * Math.exp(-noteT * 0.9);
    const vFreq = vocalNotes[noteIdx] * (1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t));
    const vocal =
      (Math.sin(2 * Math.PI * vFreq * t) * 0.65 +
        Math.sin(2 * Math.PI * vFreq * 2 * t) * 0.24 +
        Math.sin(2 * Math.PI * vFreq * 3 * t) * 0.11) *
      vocalEnv *
      0.34;

    const padL = Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.1;
    const padR = Math.sin(2 * Math.PI * bassFreq * 2.5 * t) * 0.1;

    left[i] = Math.max(-0.95, Math.min(0.95, vocal + kick + bass + padL));
    right[i] = Math.max(-0.95, Math.min(0.95, vocal + kick + bass + padR));
  }

  const numChannels = 2;
  const dataSize = totalSamples * numChannels * 2;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);
  const writeStr = (off: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(off + j, s.charCodeAt(j));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < totalSamples; i++) {
    view.setInt16(off, Math.round(left[i] * 32767), true);
    view.setInt16(off + 2, Math.round(right[i] * 32767), true);
    off += 4;
  }

  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const file = new File([blob], "demo-vocal-synth-mix.wav", { type: "audio/wav" });
  const peaks = computePeaks(left, 80);

  return {
    id: `demo_${Date.now()}`,
    file,
    url: URL.createObjectURL(blob),
    name: file.name,
    size: file.size,
    duration,
    sampleRate,
    channels: 2,
    peaks,
    channelPeaks: [peaks, computePeaks(right, 80)],
    decoding: false,
  };
}

export function VocalRemoverStudio({ maxSizeMB }: { maxSizeMB: number }) {
  const { isSignedIn, isLoaded } = useAuthSession();
  const audioFile = useAudioFile({ maxSizeMB, maxDurationMin: 30 });

  const [settings, setSettings] = useState<VocalSettings>(DEFAULT_VOCAL_SETTINGS);
  const [demoItem, setDemoItem] = useState<AudioItem | null>(null);
  const demoUrlRef = useRef<string | null>(null);

  const [gpuStatus, setGpuStatus] = useState<GpuStatusPayload | null>(null);
  const [workerAuth, setWorkerAuth] = useState<BrowserWorkerAuth | null>(null);
  const [jobs, setJobs] = useState<VocalJobSnapshot[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wakingGpu, setWakingGpu] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCreditGate, setShowCreditGate] = useState(false);

  const [mixerJobId, setMixerJobId] = useState<string | null>(null);
  const [vocalsGain, setVocalsGain] = useState(1.0);
  const [instGain, setInstGain] = useState(1.0);
  const [vocalsMuted, setVocalsMuted] = useState(false);
  const [instMuted, setInstMuted] = useState(false);
  const [vocalsSolo, setVocalsSolo] = useState(false);
  const [instSolo, setInstSolo] = useState(false);

  const [mixerLoading, setMixerLoading] = useState(false);
  const [mixerPlaying, setMixerPlaying] = useState(false);
  const [mixerDuration, setMixerDuration] = useState(0);
  const [mixerCurrentTime, setMixerCurrentTime] = useState(0);
  const [exportingMix, setExportingMix] = useState(false);

  const [page, setPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Synchronized Web Audio Mixer refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vocalsBufRef = useRef<AudioBuffer | null>(null);
  const instBufRef = useRef<AudioBuffer | null>(null);
  const vocalsGainNodeRef = useRef<GainNode | null>(null);
  const instGainNodeRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playStartCtxTimeRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const loadedMixerUrlsRef = useRef<string>("");

  const stagedAudio = audioFile.item ?? demoItem;

  // Top of the stage: where the newest job and the mixer appear.
  const stageTopRef = useRef<HTMLDivElement>(null);
  const scrollToStageTop = useCallback(() => {
    requestAnimationFrame(() => {
      stageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (demoUrlRef.current) URL.revokeObjectURL(demoUrlRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      activeSourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          // Ignore stop race
        }
      });
      void audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (audioFile.item && demoUrlRef.current) {
      URL.revokeObjectURL(demoUrlRef.current);
      demoUrlRef.current = null;
      setDemoItem(null);
    }
  }, [audioFile.item]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => ACTIVE_STATUSES.has(job.status)),
    [jobs],
  );

  const fetchStatus = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/audio/vocal/status${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        status?: GpuStatusPayload;
        workerAuth?: BrowserWorkerAuth | null;
      };
      if (data.status) setGpuStatus(data.status);
      if (data.workerAuth !== undefined) setWorkerAuth(data.workerAuth);
    } catch {
      // Ignore transient status polling error
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!isSignedIn) {
      setJobs([]);
      return;
    }
    try {
      const res = await fetch("/api/audio/vocal/jobs", { cache: "no-store" });
      if (res.status === 401 || !res.ok) return;
      const data = (await res.json()) as {
        jobs?: VocalJobSnapshot[];
        status?: GpuStatusPayload;
      };
      if (Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
      if (data.status) setGpuStatus(data.status);
    } catch {
      // Ignore transient polling error
    }
  }, [isSignedIn]);

  useEffect(() => {
    void fetchStatus(false);
    if (isSignedIn) {
      setLoadingJobs(true);
      void fetchJobs().finally(() => setLoadingJobs(false));
    } else {
      setJobs([]);
    }
  }, [fetchStatus, fetchJobs, isSignedIn]);

  useEffect(() => {
    const intervalMs = hasActiveJobs ? 2500 : gpuStatus?.state === "booting" ? 4000 : 25000;
    if (!hasActiveJobs && gpuStatus?.state !== "booting" && !isSignedIn) return;
    const timer = window.setInterval(() => {
      if (isSignedIn) {
        void fetchJobs();
      } else {
        void fetchStatus(false);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [fetchJobs, fetchStatus, gpuStatus, hasActiveJobs, isSignedIn]);

  const mixerJob = useMemo(() => {
    if (mixerJobId) {
      return jobs.find((j) => j.id === mixerJobId && j.status === "completed") ?? null;
    }
    return null;
  }, [jobs, mixerJobId]);

  const effectiveVocalsGain = useMemo(() => {
    if (vocalsMuted) return 0;
    if (instSolo && !vocalsSolo) return 0;
    return vocalsGain;
  }, [instSolo, vocalsGain, vocalsMuted, vocalsSolo]);

  const effectiveInstGain = useMemo(() => {
    if (instMuted) return 0;
    if (vocalsSolo && !instSolo) return 0;
    return instGain;
  }, [instGain, instMuted, instSolo, vocalsSolo]);

  // Apply live gain slider/mute/solo changes immediately during playback
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (vocalsGainNodeRef.current) {
      vocalsGainNodeRef.current.gain.setTargetAtTime(effectiveVocalsGain, ctx.currentTime, 0.015);
    }
    if (instGainNodeRef.current) {
      instGainNodeRef.current.gain.setTargetAtTime(effectiveInstGain, ctx.currentTime, 0.015);
    }
  }, [effectiveVocalsGain, effectiveInstGain]);

  const stopMixerPlayback = useCallback((resetOffset = false) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // Already ended
      }
    });
    activeSourcesRef.current = [];

    if (resetOffset) {
      playOffsetRef.current = 0;
      setMixerCurrentTime(0);
    } else if (audioCtxRef.current) {
      const elapsed = audioCtxRef.current.currentTime - playStartCtxTimeRef.current;
      playOffsetRef.current = Math.min(mixerDuration, Math.max(0, playOffsetRef.current + elapsed));
      setMixerCurrentTime(playOffsetRef.current);
    }
    setMixerPlaying(false);
  }, [mixerDuration]);

  // Load selected job stems into Web Audio buffers
  const ensureMixerBuffers = useCallback(async (job: VocalJobSnapshot): Promise<boolean> => {
    const urlKey = `${job.vocalsUrl || ""}|${job.instrumentalUrl || ""}`;
    if (loadedMixerUrlsRef.current === urlKey && (vocalsBufRef.current || instBufRef.current)) {
      return true;
    }

    setMixerLoading(true);
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      const decodeOptional = async (url: string | null) => {
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed loading stem (HTTP ${res.status})`);
        const arr = await res.arrayBuffer();
        return ctx.decodeAudioData(arr);
      };

      const [vBuf, iBuf] = await Promise.all([
        decodeOptional(job.vocalsUrl),
        decodeOptional(job.instrumentalUrl),
      ]);

      vocalsBufRef.current = vBuf;
      instBufRef.current = iBuf;
      loadedMixerUrlsRef.current = urlKey;
      const dur = Math.max(vBuf?.duration ?? 0, iBuf?.duration ?? 0, job.durationSec || 0);
      setMixerDuration(dur);
      playOffsetRef.current = 0;
      setMixerCurrentTime(0);
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not load stems into mixer.");
      return false;
    } finally {
      setMixerLoading(false);
    }
  }, []);

  const startMixerPlayback = useCallback(
    async (job: VocalJobSnapshot, startAtSec?: number) => {
      const ok = await ensureMixerBuffers(job);
      if (!ok) return;
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      stopMixerPlayback(false);
      const offset = Math.max(
        0,
        Math.min(
          Math.max(vocalsBufRef.current?.duration ?? 0, instBufRef.current?.duration ?? 0) - 0.02,
          startAtSec ?? playOffsetRef.current,
        ),
      );
      playOffsetRef.current = Number.isFinite(offset) ? offset : 0;

      const newSources: AudioBufferSourceNode[] = [];
      if (vocalsBufRef.current) {
        const src = ctx.createBufferSource();
        src.buffer = vocalsBufRef.current;
        const gainNode = ctx.createGain();
        gainNode.gain.value = effectiveVocalsGain;
        src.connect(gainNode).connect(ctx.destination);
        vocalsGainNodeRef.current = gainNode;
        src.start(0, playOffsetRef.current);
        newSources.push(src);
      }
      if (instBufRef.current) {
        const src = ctx.createBufferSource();
        src.buffer = instBufRef.current;
        const gainNode = ctx.createGain();
        gainNode.gain.value = effectiveInstGain;
        src.connect(gainNode).connect(ctx.destination);
        instGainNodeRef.current = gainNode;
        src.start(0, playOffsetRef.current);
        newSources.push(src);
      }

      activeSourcesRef.current = newSources;
      playStartCtxTimeRef.current = ctx.currentTime;
      setMixerPlaying(true);

      const dur = Math.max(
        vocalsBufRef.current?.duration ?? 0,
        instBufRef.current?.duration ?? 0,
        0.1,
      );

      const tick = () => {
        if (!audioCtxRef.current) return;
        const pos = playOffsetRef.current + (audioCtxRef.current.currentTime - playStartCtxTimeRef.current);
        if (pos >= dur) {
          stopMixerPlayback(true);
          return;
        }
        setMixerCurrentTime(pos);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [effectiveInstGain, effectiveVocalsGain, ensureMixerBuffers, stopMixerPlayback],
  );

  function openJobInMixer(job: VocalJobSnapshot) {
    stopMixerPlayback(true);
    loadedMixerUrlsRef.current = "";
    vocalsBufRef.current = null;
    instBufRef.current = null;
    setVocalsGain(1.0);
    setInstGain(1.0);
    setVocalsMuted(false);
    setInstMuted(false);
    setVocalsSolo(false);
    setInstSolo(false);
    setMixerJobId(job.id);
    setMixerDuration(job.durationSec || 0);
    void ensureMixerBuffers(job);
  }

  function applyMixerPreset(preset: MixerPreset) {
    setVocalsGain(preset.vocalsGain);
    setInstGain(preset.instrumentalGain);
    setVocalsMuted(preset.vocalsMuted);
    setInstMuted(preset.instrumentalMuted);
    setVocalsSolo(false);
    setInstSolo(false);
  }

  async function handleExportCustomMix() {
    if (!mixerJob) return;
    setExportingMix(true);
    setErrorMsg(null);
    try {
      const ok = await ensureMixerBuffers(mixerJob);
      if (!ok) return;
      const vBuf = vocalsBufRef.current;
      const iBuf = instBufRef.current;
      const refBuf = vBuf || iBuf;
      if (!refBuf) throw new Error("No decoded audio stems loaded.");

      const channels = Math.max(vBuf?.numberOfChannels ?? 1, iBuf?.numberOfChannels ?? 1);
      const sampleRate = refBuf.sampleRate;
      const totalFrames = Math.max(vBuf?.length ?? 0, iBuf?.length ?? 0);

      const offline = new OfflineAudioContext(channels, totalFrames, sampleRate);
      if (vBuf && effectiveVocalsGain > 0) {
        const src = offline.createBufferSource();
        src.buffer = vBuf;
        const g = offline.createGain();
        g.gain.value = effectiveVocalsGain;
        src.connect(g).connect(offline.destination);
        src.start(0);
      }
      if (iBuf && effectiveInstGain > 0) {
        const src = offline.createBufferSource();
        src.buffer = iBuf;
        const g = offline.createGain();
        g.gain.value = effectiveInstGain;
        src.connect(g).connect(offline.destination);
        src.start(0);
      }

      const rendered = await offline.startRendering();
      const wavBlob = encodePcm16Wav(rendered);
      const url = URL.createObjectURL(wavBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const base = mixerJob.sourceFileName.replace(/\.[^/.]+$/, "");
      anchor.download = `${base}_custom_mix.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not render custom WAV mix.");
    } finally {
      setExportingMix(false);
    }
  }

  function handlePatch(patch: Partial<VocalSettings>) {
    setSettings((cur) => ({ ...cur, ...patch }));
  }

  function handlePickAudio(event: ChangeEvent<HTMLInputElement>) {
    setErrorMsg(null);
    audioFile.onPick(event);
  }

  function handleDropAudio(event: DragEvent<HTMLDivElement>) {
    setErrorMsg(null);
    audioFile.onDrop(event);
  }

  function handleLoadDemoSong() {
    setErrorMsg(null);
    audioFile.clear();
    const demo = buildDemoSongItem();
    if (demoUrlRef.current) URL.revokeObjectURL(demoUrlRef.current);
    demoUrlRef.current = demo.url;
    setDemoItem(demo);
  }

  async function handleWakeGpu() {
    if (!isSignedIn) {
      setShowCreditGate(true);
      return;
    }
    setWakingGpu(true);
    try {
      const res = await fetch("/api/audio/vocal/status", { method: "POST" });
      if (res.status === 401) {
        setShowCreditGate(true);
        return;
      }
      const data = (await res.json().catch(() => null)) as { status?: GpuStatusPayload } | null;
      if (data?.status) setGpuStatus(data.status);
    } finally {
      setWakingGpu(false);
    }
  }

  async function handleSubmitJob() {
    if (!stagedAudio) return;
    if (!isSignedIn) {
      setShowCreditGate(true);
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const form = new FormData();
      form.append("file", stagedAudio.file);
      form.append("settings", JSON.stringify(settings));

      const res = await submitWorkerMultipartForm({
        workerAuth,
        refreshStatusUrl: "/api/audio/vocal/status",
        onWorkerAuth: setWorkerAuth,
        workerPath: "/api/audio/vocal/jobs",
        proxyPath: "/api/audio/vocal/jobs",
        form,
        fileSizeBytes: stagedAudio.file.size,
      });

      if (res.status === 401) {
        setShowCreditGate(true);
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        job?: VocalJobSnapshot;
        error?: string;
      } | null;

      if (!res.ok || !data?.job) {
        throw new Error(data?.error || `Separation submission failed (HTTP ${res.status}).`);
      }

      setJobs((prev) => [data.job!, ...prev.filter((item) => item.id !== data.job!.id)]);
      setPage(1);
      // The queued track shows its progress at the top of the stage.
      scrollToStageTop();
      void fetchJobs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not submit separation job.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryJob(id: string) {
    if (!isSignedIn) {
      setShowCreditGate(true);
      return;
    }
    setErrorMsg(null);
    const res = await fetch(`/api/audio/vocal/jobs/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      job?: VocalJobSnapshot;
      error?: string;
    } | null;
    if (!res.ok || !data?.job) {
      setErrorMsg(data?.error || "Could not retry vocal separation job.");
      return;
    }
    setJobs((prev) => [data.job!, ...prev]);
    setPage(1);
  }

  async function handleDeleteJob(id: string) {
    const res = await fetch(`/api/audio/vocal/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorMsg(data?.error || "Cannot delete job right now.");
      return;
    }
    if (mixerJobId === id) {
      stopMixerPlayback(true);
      setMixerJobId(null);
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const totalPages = Math.max(1, Math.ceil(jobs.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = jobs.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const signedOut = isLoaded && !isSignedIn;
  const latestJob = jobs[0] ?? null;
  const mixerProgress = mixerDuration ? mixerCurrentTime / mixerDuration : 0;

  const stagedMeta = stagedAudio
    ? [
        stagedAudio.duration > 0 ? formatTime(stagedAudio.duration) : null,
        stagedAudio.sampleRate > 0 ? `${Math.round(stagedAudio.sampleRate / 100) / 10} kHz` : null,
        stagedAudio.channels > 0 ? (stagedAudio.channels > 1 ? "Stereo" : "Mono") : null,
        formatBytes(stagedAudio.size),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const outputSummary = `${
    settings.stems === "both"
      ? "Vocals and instrumental"
      : settings.stems === "vocals"
        ? "Vocals only"
        : "Instrumental only"
  } · ${settings.format === "mp3" ? `MP3 ${settings.bitrate} kbps` : "WAV"}`;

  /** Opening the mixer from the history list brings it into view at the top. */
  function showMixer(job: VocalJobSnapshot) {
    openJobInMixer(job);
    scrollToStageTop();
  }

  return (
    <>
      <StudioFrame
        id="vocal-remover"
        label="Vocal remover studio"
        fill={false}
        gridClassName={`${STUDIO_GRID} lg:grid-rows-[auto_1fr]`}
      >
        {/* ============================================================ */}
        {/* 1 · Track in, newest result, mixer                            */}
        {/* ============================================================ */}
        <StudioStage className={`gap-3 lg:row-start-1 ${LEFT_COLUMN}`}>
          <div ref={stageTopRef} aria-hidden className="-mb-3 h-0 scroll-mt-24" />

          <input
            ref={audioFile.inputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac"
            tabIndex={-1}
            aria-label="Choose an audio file"
            className="sr-only"
            onChange={handlePickAudio}
          />

          {audioFile.error ? <Note tone="error">{audioFile.error}</Note> : null}
          {errorMsg ? <Note tone="error">{errorMsg}</Note> : null}

          {latestJob ? (
            ACTIVE_STATUSES.has(latestJob.status) ? (
              <div className="rounded-[14px] border border-accent/30 bg-white px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
                    <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden />
                    <span className="truncate">{latestJob.sourceFileName}</span>
                  </p>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-faint">
                    {formatElapsedClock(nowMs - latestJob.createdAt)}
                  </span>
                </div>
                <JobProgress label={latestJob.stageLabel} progress={latestJob.progress} />
                <p className="mt-2 text-[12.5px] text-faint">
                  Runs in the background. You can add another track while this one finishes.
                </p>
              </div>
            ) : latestJob.status === "failed" ? (
              <Note tone="error">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1 basis-[200px] break-words">
                    {latestJob.sourceFileName}: {latestJob.error || "Vocal separation failed."}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRetryJob(latestJob.id)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#f1cfc9] bg-white px-3 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-soft"
                  >
                    <RotateCcw size={13} aria-hidden />
                    Try again
                  </button>
                </span>
              </Note>
            ) : latestJob.vocalsUrl || latestJob.instrumentalUrl ? (
              <ResultCard
                className={RESULT_CARD_FIT}
                title={`${latestJob.sourceFileName} is split`}
                meta={[
                  latestJob.durationSec > 0 ? formatTime(latestJob.durationSec) : null,
                  latestJob.format === "mp3" ? `MP3 ${latestJob.bitrate} kbps` : "WAV",
                  "kept for 24 hours",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {mixerJobId !== latestJob.id ? (
                  <button
                    type="button"
                    onClick={() => showMixer(latestJob)}
                    className={buttonClasses("secondary", "lg")}
                  >
                    <Play size={14} fill="currentColor" aria-hidden />
                    Play in mixer
                  </button>
                ) : null}
                {latestJob.vocalsDownloadUrl ? (
                  <a
                    href={latestJob.vocalsDownloadUrl}
                    download={latestJob.vocalsFileName ?? undefined}
                    aria-label="Download vocals"
                    className={buttonClasses("success", "lg")}
                  >
                    <Download size={15} aria-hidden />
                    Vocals
                  </a>
                ) : null}
                {latestJob.instrumentalDownloadUrl ? (
                  <a
                    href={latestJob.instrumentalDownloadUrl}
                    download={latestJob.instrumentalFileName ?? undefined}
                    aria-label="Download instrumental"
                    className={buttonClasses("success", "lg")}
                  >
                    <Download size={15} aria-hidden />
                    Instrumental
                  </a>
                ) : null}
              </ResultCard>
            ) : null
          ) : null}

          {mixerJob ? (
            <section aria-label="Stem mixer" className="rounded-[16px] border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
                <div className="min-w-0 flex-1 basis-[160px]">
                  <h2 className="text-[14px] font-semibold text-ink">Mixer</h2>
                  <p className="truncate text-[12.5px] text-faint">{mixerJob.sourceFileName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={exportingMix || mixerLoading}
                    onClick={() => void handleExportCustomMix()}
                    className={buttonClasses("secondary", "md", "h-10 rounded-[12px]")}
                  >
                    {exportingMix ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Download size={14} aria-hidden />
                    )}
                    Export this mix (WAV)
                  </button>
                  <button
                    type="button"
                    aria-label="Close mixer"
                    onClick={() => {
                      stopMixerPlayback(true);
                      setMixerJobId(null);
                    }}
                    className="grid h-10 w-10 place-items-center rounded-[12px] text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-4">
                {/* Transport */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-sound="none"
                    disabled={mixerLoading}
                    onClick={() => {
                      if (mixerPlaying) {
                        stopMixerPlayback(false);
                      } else {
                        void startMixerPlayback(mixerJob);
                      }
                    }}
                    aria-label={mixerPlaying ? "Pause mixer" : "Play mixed stems"}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-[#2a2a2b] disabled:opacity-60"
                  >
                    {mixerLoading ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : mixerPlaying ? (
                      <Pause size={16} fill="currentColor" aria-hidden />
                    ) : (
                      <Play size={16} fill="currentColor" className="translate-x-[1px]" aria-hidden />
                    )}
                  </button>

                  <input
                    type="range"
                    aria-label="Mixer position"
                    min={0}
                    max={Math.max(0.1, mixerDuration || 1)}
                    step={0.05}
                    value={mixerCurrentTime}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      playOffsetRef.current = next;
                      setMixerCurrentTime(next);
                      if (mixerPlaying) {
                        void startMixerPlayback(mixerJob, next);
                      }
                    }}
                    className="range min-w-0 flex-1"
                    style={fillStyle(mixerProgress)}
                  />

                  <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted">
                    {formatTime(mixerCurrentTime)} / {formatTime(mixerDuration)}
                  </span>
                </div>

                {/* Presets */}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mix presets">
                  {MIXER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyMixerPreset(preset)}
                      className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-[#cfc9bd] hover:bg-hover"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* One strip per stem */}
                <div className="grid gap-x-6 gap-y-4 border-t border-line-soft pt-4 sm:grid-cols-2">
                  {mixerJob.vocalsUrl ? (
                    <MixerStrip
                      label="Vocals"
                      icon={<Mic size={14} className="text-accent" aria-hidden />}
                      peaks={mixerJob.vocalsPeaks}
                      progress={mixerProgress}
                      tone="coral"
                      muted={vocalsMuted}
                      solo={vocalsSolo}
                      onToggleMute={() => setVocalsMuted((m) => !m)}
                      onToggleSolo={() => setVocalsSolo((s) => !s)}
                      gain={vocalsGain}
                      effectiveGain={effectiveVocalsGain}
                      onGain={setVocalsGain}
                    />
                  ) : null}

                  {mixerJob.instrumentalUrl ? (
                    <MixerStrip
                      label="Instrumental"
                      icon={<Music size={14} className="text-success" aria-hidden />}
                      peaks={mixerJob.instrumentalPeaks}
                      progress={mixerProgress}
                      tone="sage"
                      muted={instMuted}
                      solo={instSolo}
                      onToggleMute={() => setInstMuted((m) => !m)}
                      onToggleSolo={() => setInstSolo((s) => !s)}
                      gain={instGain}
                      effectiveGain={effectiveInstGain}
                      onGain={setInstGain}
                    />
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {!stagedAudio ? (
            <Dropzone
              title="Drop a song to split it"
              description="Get the vocals and the instrumental as two separate tracks you can play, rebalance and download."
              buttonLabel="Choose audio"
              limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB · 30 minutes`}
              note="Stems stay in your account for 24 hours."
              icon={<Music size={28} strokeWidth={1.5} aria-hidden />}
              onChoose={audioFile.openPicker}
              dragging={audioFile.dragging}
              onDragOver={audioFile.onDragOver}
              onDragLeave={audioFile.onDragLeave}
              onDrop={handleDropAudio}
              minHeightClass={
                mixerJob
                  ? "min-h-[340px]"
                  : "min-h-[380px] lg:min-h-[min(calc(100dvh_-_250px),640px)]"
              }
              chips={
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleLoadDemoSong();
                  }}
                  className="text-[13px] font-medium text-muted underline decoration-[#cfc9bd] underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                >
                  No track handy? Try a 6-second demo
                </button>
              }
            />
          ) : (
            <div
              onDragOver={audioFile.onDragOver}
              onDragLeave={audioFile.onDragLeave}
              onDrop={handleDropAudio}
              className={`flex flex-col gap-3 rounded-[16px] transition-shadow ${
                audioFile.dragging ? "ring-2 ring-accent ring-offset-4 ring-offset-paper" : ""
              }`}
            >
              <div className="rounded-[16px] border border-line bg-white px-4 py-5 sm:px-5">
                <MiniWaveform peaks={stagedAudio.peaks} progress={1} bars={80} height={88} tone="ink" />
                <p className="mt-4 text-[13px] text-muted">
                  You get: <span className="font-medium text-ink">{outputSummary}</span>
                </p>
              </div>

              <FileRow
                icon={<Music size={16} aria-hidden />}
                name={stagedAudio.name}
                meta={stagedMeta}
                onReplace={audioFile.openPicker}
                onRemove={() => {
                  audioFile.clear();
                  setDemoItem(null);
                }}
              />
            </div>
          )}
        </StudioStage>

        {/* ============================================================ */}
        {/* 2 · Action + settings (sticky on desktop, docked on phones)   */}
        {/* ============================================================ */}
        <StudioRail
          sticky
          label="Separation settings"
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          action={
            <PrimaryAction
              label={stagedAudio && signedOut ? "Sign in to separate" : "Separate vocals"}
              busyLabel="Uploading…"
              icon={
                stagedAudio && signedOut ? (
                  <Lock size={15} aria-hidden />
                ) : (
                  <AudioLines size={16} aria-hidden />
                )
              }
              busy={submitting}
              disabled={!stagedAudio}
              onClick={() => void handleSubmitJob()}
              hint={
                stagedAudio ? (
                  <>
                    <span className="tabular-nums">{VOCAL_COST} credits</span>
                    {gpuStatus?.state === "booting" ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">
                          engine starting {formatElapsedClock(gpuStatus.bootElapsedMs)}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  "Add a track to get started"
                )
              }
            />
          }
        >
          <div className="space-y-6">
            <VocalControls
              settings={settings}
              onPatch={handlePatch}
              onReset={() => setSettings(DEFAULT_VOCAL_SETTINGS)}
              disabled={submitting}
            />

            <EngineStatus
              status={gpuStatus}
              waking={wakingGpu}
              onWake={() => void handleWakeGpu()}
              onRefresh={() => void fetchStatus(true)}
            />
          </div>
        </StudioRail>

        {/* ============================================================ */}
        {/* 3 · Everything separated in the last 24 hours                 */}
        {/* ============================================================ */}
        <StudioStage className={`border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <section aria-label="Your separated tracks">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                Your tracks
                {jobs.length > 0 ? <Chip>{jobs.length}</Chip> : null}
              </h2>
              {jobs.length > ITEMS_PER_PAGE ? (
                <div className="flex items-center gap-1 text-[12.5px] text-muted">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={ICON_BUTTON}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} aria-hidden />
                  </button>
                  <span className="px-1.5 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={ICON_BUTTON}
                    aria-label="Next page"
                  >
                    <ChevronRight size={15} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] text-faint">
              Stems are kept for 24 hours. Older ones can be cleared sooner if space runs out.
            </p>

            {!isSignedIn ? (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Sign in to separate tracks and find your stems here.{" "}
                <button
                  type="button"
                  onClick={() => setShowCreditGate(true)}
                  className="font-medium text-ink underline decoration-[#cfc9bd] underline-offset-4 transition-colors hover:decoration-ink"
                >
                  Sign in or create a free account
                </button>
              </p>
            ) : loadingJobs && jobs.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-[13px] text-muted" aria-busy="true">
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Loading your tracks…
              </p>
            ) : jobs.length === 0 ? (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Nothing separated yet. Finished tracks appear here with a player and a download for
                each stem.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;
                  const formatLabel = job.format.toUpperCase();

                  return (
                    <li key={job.id} className="py-4 last:pb-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 basis-[220px]">
                          <p className="truncate text-[14px] font-medium text-ink">
                            {job.sourceFileName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] tabular-nums text-muted">
                            <span>
                              {[
                                job.durationSec > 0 ? formatTime(job.durationSec) : null,
                                job.format === "mp3" ? `MP3 ${job.bitrate} kbps` : "WAV",
                                `${Math.round(job.sampleRate / 100) / 10} kHz`,
                                isRunning ? formatElapsedClock(elapsed) : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className="text-faint">{job.modelLabel}</span>
                            {job.status === "completed" ? (
                              <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {job.status === "completed" && (job.vocalsUrl || job.instrumentalUrl) ? (
                            <button
                              type="button"
                              onClick={() => showMixer(job)}
                              className={buttonClasses("secondary", "md")}
                            >
                              <SlidersHorizontal size={14} aria-hidden />
                              Mixer
                            </button>
                          ) : null}

                          {!isRunning ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                aria-label={`Separate ${job.sourceFileName} again`}
                                title="Separate again with the same audio"
                                className={ICON_BUTTON}
                              >
                                <RotateCcw size={15} aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteJob(job.id)}
                                aria-label={`Delete ${job.sourceFileName}`}
                                title="Delete"
                                className={`${ICON_BUTTON} hover:!bg-danger-soft hover:!text-danger`}
                              >
                                <Trash2 size={15} aria-hidden />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {isRunning ? (
                        <JobProgress className="mt-3" label={job.stageLabel} progress={job.progress} />
                      ) : isFailed ? (
                        <Note tone="error" className="mt-3">
                          {job.error || "Vocal separation failed."}
                        </Note>
                      ) : (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          {job.vocalsUrl ? (
                            <StemBlock
                              label="Vocals"
                              icon={<Mic size={14} className="text-accent" aria-hidden />}
                              url={job.vocalsUrl}
                              downloadUrl={job.vocalsDownloadUrl}
                              fileName={job.vocalsFileName}
                              byteLength={job.vocalsByteLength}
                              peaks={job.vocalsPeaks}
                              duration={job.durationSec || 1}
                              formatLabel={formatLabel}
                            />
                          ) : null}

                          {job.instrumentalUrl ? (
                            <StemBlock
                              label="Instrumental"
                              icon={<Music size={14} className="text-success" aria-hidden />}
                              url={job.instrumentalUrl}
                              downloadUrl={job.instrumentalDownloadUrl}
                              fileName={job.instrumentalFileName}
                              byteLength={job.instrumentalByteLength}
                              peaks={job.instrumentalPeaks}
                              duration={job.durationSec || 1}
                              formatLabel={formatLabel}
                            />
                          ) : null}
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

      <CreditGate
        open={showCreditGate}
        onClose={() => setShowCreditGate(false)}
        action="separate vocals"
        cost={VOCAL_COST}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

/** Sets the ink fill of a `.range` input. */
function fillStyle(fraction: number): CSSProperties {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  return { "--fill": `${percent}%` } as CSSProperties;
}

function JobProgress({
  label,
  progress,
  className = "",
}: {
  label: string;
  progress: number;
  className?: string;
}) {
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div
      role="progressbar"
      aria-label={label || "Separation progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={className}
    >
      <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e9e6df]">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.max(6, percent)}%` }}
        />
      </div>
    </div>
  );
}

/** One stem in the mixer: mute / solo, its waveform and a volume fader. */
function MixerStrip({
  label,
  icon,
  peaks,
  progress,
  tone,
  muted,
  solo,
  onToggleMute,
  onToggleSolo,
  gain,
  effectiveGain,
  onGain,
}: {
  label: string;
  icon: ReactNode;
  peaks: number[];
  progress: number;
  tone: "coral" | "sage";
  muted: boolean;
  solo: boolean;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  gain: number;
  effectiveGain: number;
  onGain: (gain: number) => void;
}) {
  const name = label.toLowerCase();
  const toggle =
    "grid h-8 w-8 place-items-center rounded-lg text-[12.5px] font-semibold transition-colors";
  const idle = "border border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink";

  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {icon}
          {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={muted}
            aria-label={`Mute ${name}`}
            title="Mute"
            onClick={onToggleMute}
            className={`${toggle} ${muted ? "bg-danger text-white" : idle}`}
          >
            M
          </button>
          <button
            type="button"
            aria-pressed={solo}
            aria-label={`Solo ${name}`}
            title="Solo"
            onClick={onToggleSolo}
            className={`${toggle} ${solo ? "bg-ink text-white" : idle}`}
          >
            S
          </button>
        </div>
      </div>

      <MiniWaveform peaks={peaks} progress={progress} tone={tone} height={32} />

      <div className="mt-2.5 flex items-center gap-2.5">
        <Volume2 size={14} className="shrink-0 text-muted" aria-hidden />
        <input
          type="range"
          aria-label={`${label} volume`}
          min={0}
          max={150}
          step={5}
          value={Math.round(gain * 100)}
          onChange={(e) => onGain(Number(e.target.value) / 100)}
          className="range min-w-0 flex-1"
          style={fillStyle(gain / 1.5)}
        />
        <span className="w-11 shrink-0 text-right text-[12.5px] font-medium tabular-nums text-ink">
          {Math.round(effectiveGain * 100)}%
        </span>
      </div>
    </div>
  );
}

/** One finished stem in the history list: its name, a download and the player. */
function StemBlock({
  label,
  icon,
  url,
  downloadUrl,
  fileName,
  byteLength,
  peaks,
  duration,
  formatLabel,
}: {
  label: string;
  icon: ReactNode;
  url: string;
  downloadUrl: string | null;
  fileName: string | null;
  byteLength: number | null;
  peaks: number[];
  duration: number;
  formatLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
          {icon}
          {label}
        </span>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={fileName ?? undefined}
            aria-label={`Download ${label.toLowerCase()}`}
            className={buttonClasses("secondary", "sm")}
          >
            <Download size={13} aria-hidden />
            Download
            {byteLength ? (
              <span className="font-normal tabular-nums text-faint">{formatBytes(byteLength)}</span>
            ) : null}
          </a>
        ) : null}
      </div>
      <AudioPlayer
        src={url}
        duration={duration}
        peaks={peaks}
        fileName={fileName ?? undefined}
        formatLabel={formatLabel}
        compact
      />
    </div>
  );
}

/** Whether the separation engine is awake, with the manual wake / refresh. */
function EngineStatus({
  status,
  waking,
  onWake,
  onRefresh,
}: {
  status: GpuStatusPayload | null;
  waking: boolean;
  onWake: () => void;
  onRefresh: () => void;
}) {
  const state = status?.state;
  const label =
    state === "ready"
      ? "Engine ready"
      : state === "booting"
        ? `Engine starting · ${formatElapsedClock(status?.bootElapsedMs ?? 0)}`
        : "Engine asleep. It wakes when you start.";
  const dot =
    state === "ready"
      ? "bg-success"
      : state === "booting"
        ? "animate-pulse bg-promo"
        : state === "error"
          ? "bg-danger"
          : "bg-[#b9b5ac]";
  const action =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50";

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4 text-[12.5px] text-muted">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="tabular-nums">{label}</span>
      </span>
      {status && state !== "ready" ? (
        <button type="button" onClick={onWake} disabled={waking} className={action}>
          {waking ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
          Wake now
        </button>
      ) : (
        <button type="button" onClick={onRefresh} className={action}>
          Refresh
        </button>
      )}
    </div>
  );
}
