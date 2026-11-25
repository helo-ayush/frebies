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
  Download,
  Loader2,
  Lock,
  Mic,
  Music,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { buttonClasses } from "@/components/ui/Button";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { Waveform } from "@/components/tool/audio/Waveform";
import { computePeaks, useAudioFile, type AudioItem } from "@/components/tool/audio/useAudioFile";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  ActionRow,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  ResultButton,
  ResultCard,
  STUDIO_GRID,
  SecondaryAction,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolText,
} from "@/components/tool/kit";
import { Dropzone } from "@/components/tool/kit/Dropzone";
import {
  HistoryButton,
  HistoryEmpty,
  HistoryList,
  HistoryPager,
  HistoryRow,
  HistorySection,
  JobBar,
} from "@/components/tool/kit/History";
import { EngineRow } from "@/components/tool/paid/EngineRow";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { useHeldFile } from "@/components/tool/paid/useHeldFile";
import { asFileList } from "@/lib/held-file";
import { StudioRail } from "@/components/tool/studio/StudioRail";
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
const LEFT_COLUMN = "lg:col-start-1 lg:self-stretch";
/** At least a screen tall, but free to grow when the mixer is open. */
const STAGE_FILL = "lg:min-h-[max(540px,calc(100dvh-var(--fb-bar)-var(--fb-head)))]";

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
  const peaks = computePeaks(left);

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
    channelPeaks: [peaks, computePeaks(right)],
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
  /** The job started from exactly this track and these settings. */
  const [lastRun, setLastRun] = useState<{ id: string; key: string } | null>(null);

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

  useHeldFile(stagedAudio?.file ?? null, (file, held) => {
    if (held && typeof held === "object") setSettings((current) => ({ ...current, ...(held as VocalSettings) }));
    audioFile.accept(asFileList(file));
  });

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

  const runKey = stagedAudio ? `${stagedAudio.id}:${JSON.stringify(settings)}` : "";
  const lastJob = lastRun && lastRun.key === runKey ? (jobs.find((job) => job.id === lastRun.id) ?? null) : null;
  const runningJob = lastJob && ACTIVE_STATUSES.has(lastJob.status) ? lastJob : null;
  const finishedJob =
    lastJob && lastJob.status === "completed" && (lastJob.vocalsDownloadUrl || lastJob.instrumentalDownloadUrl)
      ? lastJob
      : null;

  async function handleSubmitJob() {
    if (!stagedAudio || runningJob) return;
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
      setLastRun({ id: data.job.id, key: runKey });
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

  function seekMixer(fraction: number) {
    const next = Math.min(1, Math.max(0, fraction)) * (mixerDuration || 0);
    playOffsetRef.current = next;
    setMixerCurrentTime(next);
    if (mixerPlaying && mixerJob) void startMixerPlayback(mixerJob, next);
  }

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
        <StudioStage flush className={`lg:row-start-1 ${LEFT_COLUMN} ${STAGE_FILL}`}>
          <div ref={stageTopRef} aria-hidden className="h-0 scroll-mt-24" />

          <input
            ref={audioFile.inputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac"
            tabIndex={-1}
            aria-label="Choose an audio file"
            className="sr-only"
            onChange={handlePickAudio}
          />

          {audioFile.error ? <Note tone="error" className="m-3 shrink-0">{audioFile.error}</Note> : null}
          {errorMsg ? <Note tone="error" className="m-3 shrink-0">{errorMsg}</Note> : null}

          {latestJob ? (
            ACTIVE_STATUSES.has(latestJob.status) ? (
              <div className="shrink-0 border-b border-line bg-panel px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold">
                    <Loader2 size={16} className="shrink-0 animate-spin text-accent-deep" aria-hidden />
                    <span className="truncate">{latestJob.sourceFileName}</span>
                  </p>
                  <span className="fb-num shrink-0 text-[13px] text-faint">
                    {formatElapsedClock(nowMs - latestJob.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
                  <span className="min-w-0 truncate">{latestJob.stageLabel}</span>
                  <span className="fb-num shrink-0">{Math.round(latestJob.progress)}%</span>
                </div>
                <JobBar className="mt-1.5" value={latestJob.progress} label={latestJob.stageLabel || "Separation progress"} />
                <p className="mt-2.5 text-[13px] text-muted">
                  Runs in the background. You can add another track while this one finishes.
                </p>
              </div>
            ) : latestJob.status === "failed" ? (
              <Note tone="error" className="m-3 shrink-0">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1 basis-[200px] break-words">
                    {latestJob.sourceFileName}: {latestJob.error || "Vocal separation failed."}
                  </span>
                  <ToolText onClick={() => void handleRetryJob(latestJob.id)} icon={<RotateCcw size={14} aria-hidden />}>
                    Try again
                  </ToolText>
                </span>
              </Note>
            ) : latestJob.vocalsUrl || latestJob.instrumentalUrl ? (
              <ResultCard
                stack
                title="Split"
                meta={[
                  latestJob.sourceFileName,
                  latestJob.durationSec > 0 ? formatTime(latestJob.durationSec) : null,
                  latestJob.format === "mp3" ? `MP3 ${latestJob.bitrate} kbps` : "WAV",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {mixerJobId !== latestJob.id ? (
                  <ResultButton onClick={() => showMixer(latestJob)} icon={<Play size={15} fill="currentColor" aria-hidden />}>
                    Mixer
                  </ResultButton>
                ) : null}
                {latestJob.vocalsDownloadUrl ? (
                  <ResultButton
                    loud
                    href={latestJob.vocalsDownloadUrl}
                    filename={latestJob.vocalsFileName ?? undefined}
                    label="Download vocals"
                    icon={<Download size={16} aria-hidden />}
                  >
                    Vocals
                  </ResultButton>
                ) : null}
                {latestJob.instrumentalDownloadUrl ? (
                  <ResultButton
                    loud
                    href={latestJob.instrumentalDownloadUrl}
                    filename={latestJob.instrumentalFileName ?? undefined}
                    label="Download instrumental"
                    icon={<Download size={16} aria-hidden />}
                  >
                    Instrumental
                  </ResultButton>
                ) : null}
              </ResultCard>
            ) : null
          ) : null}

          {mixerJob ? (
            <section aria-label="Stem mixer" className="shrink-0 border-t border-white/15 bg-ink text-white">
              <div className="flex items-stretch border-b border-white/15">
                <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-3">
                  <h2 className="fb-wide text-[18px]">Mixer</h2>
                  <p className="mt-1 truncate text-[13px] text-white/60">{mixerJob.sourceFileName}</p>
                </div>
                <ResultButton
                  loud
                  disabled={exportingMix || mixerLoading}
                  onClick={() => void handleExportCustomMix()}
                  icon={
                    exportingMix ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                      <Download size={16} aria-hidden />
                    )
                  }
                >
                  Export mix<span className="max-sm:sr-only"> (WAV)</span>
                </ResultButton>
                <ResultButton
                  label="Close mixer"
                  onClick={() => {
                    stopMixerPlayback(true);
                    setMixerJobId(null);
                  }}
                  icon={<X size={18} aria-hidden />}
                />
              </div>

              {/* One strip per stem */}
              {mixerJob.vocalsUrl ? (
                <MixerStrip
                  label="Vocals"
                  icon={<Mic size={17} aria-hidden />}
                  peaks={mixerJob.vocalsPeaks}
                  progress={mixerProgress}
                  onSeek={seekMixer}
                  muted={vocalsMuted}
                  solo={vocalsSolo}
                  onToggleMute={() => setVocalsMuted((m) => !m)}
                  onToggleSolo={() => setVocalsSolo((value) => !value)}
                  gain={vocalsGain}
                  effectiveGain={effectiveVocalsGain}
                  onGain={setVocalsGain}
                />
              ) : null}
              {mixerJob.instrumentalUrl ? (
                <MixerStrip
                  label="Instrumental"
                  icon={<Music size={17} aria-hidden />}
                  peaks={mixerJob.instrumentalPeaks}
                  progress={mixerProgress}
                  onSeek={seekMixer}
                  muted={instMuted}
                  solo={instSolo}
                  onToggleMute={() => setInstMuted((m) => !m)}
                  onToggleSolo={() => setInstSolo((value) => !value)}
                  gain={instGain}
                  effectiveGain={effectiveInstGain}
                  onGain={setInstGain}
                />
              ) : null}

              {/* Transport */}
              <div className="flex flex-wrap items-stretch">
                <span className="grid w-[92px] shrink-0 place-items-center bg-black/40 py-3">
                  <button
                    type="button"
                    data-sound="none"
                    disabled={mixerLoading}
                    data-playing={mixerPlaying || undefined}
                    onClick={() => {
                      if (mixerPlaying) {
                        stopMixerPlayback(false);
                      } else {
                        void startMixerPlayback(mixerJob);
                      }
                    }}
                    aria-label={mixerPlaying ? "Pause mixer" : "Play mixed stems"}
                    className="fb-play h-16 w-16"
                  >
                    {mixerLoading ? (
                      <Loader2 size={22} className="animate-spin" aria-hidden />
                    ) : mixerPlaying ? (
                      <svg aria-hidden width="22" height="22" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M2 1h3v10H2zM7 1h3v10H7z" />
                      </svg>
                    ) : (
                      <svg aria-hidden width="22" height="22" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M3 .8 11 6l-8 5.2z" />
                      </svg>
                    )}
                  </button>
                </span>
                <span className="flex min-w-[150px] flex-col justify-center px-5 py-3">
                  <span className="fb-wide fb-num text-[clamp(20px,2vw,28px)] normal-case">{formatTime(mixerCurrentTime)}</span>
                  <span className="fb-num mt-1 text-[13px] text-white/55">of {formatTime(mixerDuration)}</span>
                </span>
                <span className="flex min-w-[180px] flex-1 items-center px-4 max-sm:basis-full max-sm:py-3">
                  <input
                    type="range"
                    aria-label="Mixer position"
                    min={0}
                    max={Math.max(0.1, mixerDuration || 1)}
                    step={0.05}
                    value={mixerCurrentTime}
                    onChange={(e) => seekMixer(Number(e.target.value) / Math.max(0.1, mixerDuration || 1))}
                    className="range fb-deck-range min-w-0 flex-1"
                    style={fillStyle(mixerProgress)}
                  />
                </span>
                <span role="group" aria-label="Mix presets" className="flex flex-wrap items-stretch border-white/15 sm:border-l max-sm:w-full max-sm:border-t">
                  {MIXER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyMixerPreset(preset)}
                      className="min-h-[48px] flex-1 whitespace-nowrap border-l border-white/15 px-3.5 text-[13px] font-medium text-white/75 transition-colors first:border-l-0 hover:bg-white hover:text-ink"
                    >
                      {preset.label}
                    </button>
                  ))}
                </span>
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
              onChoose={audioFile.openPicker}
              dragging={audioFile.dragging}
              onDragOver={audioFile.onDragOver}
              onDragLeave={audioFile.onDragLeave}
              onDrop={handleDropAudio}
            >
              <ToolText onClick={handleLoadDemoSong}>Try a 6-second demo</ToolText>
            </Dropzone>
          ) : (
            <div
              onDragOver={audioFile.onDragOver}
              onDragLeave={audioFile.onDragLeave}
              onDrop={handleDropAudio}
              className="relative flex min-h-0 flex-1 flex-col"
            >
              <FileRow
                flush
                className="shrink-0 border-y border-line first:border-t-0"
                icon={<Music size={17} aria-hidden />}
                name={stagedAudio.name}
                meta={stagedMeta}
                onReplace={audioFile.openPicker}
                onRemove={() => {
                  audioFile.clear();
                  setDemoItem(null);
                }}
              />
              <AudioPlayer
                src={stagedAudio.url}
                duration={stagedAudio.duration}
                peaks={stagedAudio.peaks}
                fileName={stagedAudio.name}
                formatLabel={`splits into ${outputSummary.toLowerCase()}`}
                className="min-h-[330px]"
              />
              {audioFile.dragging ? <DropOver label="Drop to replace" /> : null}
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
            finishedJob ? (
              <StemDownloads
                job={finishedJob}
                onNew={() => {
                  audioFile.clear();
                  setDemoItem(null);
                }}
              />
            ) : (
              <PrimaryAction
                label={stagedAudio && signedOut ? "Sign in to separate" : "Separate vocals"}
                busyLabel={runningJob ? "Separating…" : "Uploading…"}
                progress={runningJob ? runningJob.progress / 100 : undefined}
                icon={
                  stagedAudio && signedOut ? (
                    <Lock size={18} aria-hidden />
                  ) : (
                    <AudioLines size={19} aria-hidden />
                  )
                }
                busy={submitting || Boolean(runningJob)}
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
            )
          }
        >
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
        </StudioRail>

        {/* ============================================================ */}
        {/* 3 · Everything separated in the last 24 hours                 */}
        {/* ============================================================ */}
        <div className={`min-w-0 border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <HistorySection
            title="Your tracks"
            label="Your separated tracks"
            count={jobs.length}
            note="Stems are kept for 24 hours. Older ones can be cleared sooner if space runs out."
            pager={
              jobs.length > ITEMS_PER_PAGE ? <HistoryPager page={safePage} pages={totalPages} onPage={setPage} /> : null
            }
          >
            {!isSignedIn ? (
              <HistoryEmpty>
                <span>
                  Sign in to separate tracks and find your stems here.{" "}
                  <button
                    type="button"
                    onClick={() => setShowCreditGate(true)}
                    className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-deep"
                  >
                    Sign in or create a free account
                  </button>
                </span>
              </HistoryEmpty>
            ) : loadingJobs && jobs.length === 0 ? (
              <HistoryEmpty>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Loading your tracks…
              </HistoryEmpty>
            ) : jobs.length === 0 ? (
              <HistoryEmpty>
                Nothing separated yet. Finished tracks appear here with a player and a download for each stem.
              </HistoryEmpty>
            ) : (
              <HistoryList>
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;

                  return (
                    <HistoryRow
                      key={job.id}
                      active={mixerJobId === job.id}
                      title={job.sourceFileName}
                      badge={
                        job.status === "completed" ? (
                          <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                        ) : null
                      }
                      meta={[
                        job.durationSec > 0 ? formatTime(job.durationSec) : null,
                        job.format === "mp3" ? `MP3 ${job.bitrate} kbps` : "WAV",
                        `${Math.round(job.sampleRate / 100) / 10} kHz`,
                        isRunning ? formatElapsedClock(elapsed) : null,
                        job.modelLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      progress={isRunning ? Math.round(job.progress) : undefined}
                      progressLabel={job.stageLabel}
                      error={isFailed ? job.error || "Vocal separation failed." : undefined}
                      actions={
                        <>
                          {job.status === "completed" && (job.vocalsUrl || job.instrumentalUrl) ? (
                            <HistoryButton
                              onClick={() => showMixer(job)}
                              icon={<SlidersHorizontal size={14} aria-hidden />}
                            >
                              Mixer
                            </HistoryButton>
                          ) : null}
                          {!isRunning ? (
                            <>
                              <ToolIcon
                                label={`Separate ${job.sourceFileName} again`}
                                onClick={() => void handleRetryJob(job.id)}
                              >
                                <RotateCcw size={15} aria-hidden />
                              </ToolIcon>
                              <ToolIcon
                                label={`Delete ${job.sourceFileName}`}
                                slot="history-remove"
                                onClick={() => void handleDeleteJob(job.id)}
                              >
                                <Trash2 size={15} aria-hidden />
                              </ToolIcon>
                            </>
                          ) : null}
                        </>
                      }
                    >
                      {!isRunning && !isFailed ? (
                        <div className="grid gap-3 px-4 pb-4 sm:px-6 xl:grid-cols-2">
                          {job.vocalsUrl ? (
                            <StemBlock
                              label="Vocals"
                              icon={<Mic size={15} aria-hidden />}
                              url={job.vocalsUrl}
                              downloadUrl={job.vocalsDownloadUrl}
                              fileName={job.vocalsFileName}
                              byteLength={job.vocalsByteLength}
                              peaks={job.vocalsPeaks}
                              duration={job.durationSec || 1}
                            />
                          ) : null}

                          {job.instrumentalUrl ? (
                            <StemBlock
                              label="Instrumental"
                              icon={<Music size={15} aria-hidden />}
                              url={job.instrumentalUrl}
                              downloadUrl={job.instrumentalDownloadUrl}
                              fileName={job.instrumentalFileName}
                              byteLength={job.instrumentalByteLength}
                              peaks={job.instrumentalPeaks}
                              duration={job.durationSec || 1}
                            />
                          ) : null}
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

      <CreditGate
        open={showCreditGate}
        onClose={() => setShowCreditGate(false)}
        action="separate vocals"
        cost={VOCAL_COST}
        file={stagedAudio?.file}
        settings={settings}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

/** The run button once the loaded track is split: one key per stem. */
function StemDownloads({ job, onNew }: { job: VocalJobSnapshot; onNew: () => void }) {
  const vocals = job.vocalsDownloadUrl
    ? { href: job.vocalsDownloadUrl, filename: job.vocalsFileName ?? undefined, bytes: job.vocalsByteLength }
    : null;
  const instrumental = job.instrumentalDownloadUrl
    ? { href: job.instrumentalDownloadUrl, filename: job.instrumentalFileName ?? undefined, bytes: job.instrumentalByteLength }
    : null;
  const first = vocals ?? instrumental;
  if (!first) return null;
  return (
    <>
      <DownloadAction
        label={vocals ? "Download vocals" : "Download instrumental"}
        href={first.href}
        filename={first.filename}
        hint={[job.format.toUpperCase(), first.bytes ? formatBytes(first.bytes) : null].filter(Boolean).join(" · ")}
      />
      <ActionRow>
        {vocals && instrumental ? (
          <a
            href={instrumental.href}
            download={instrumental.filename}
            className={buttonClasses("secondary", "md", "!h-11 px-3 !text-[13px]")}
          >
            <Download size={15} aria-hidden />
            <span className="truncate">Instrumental</span>
          </a>
        ) : null}
        <SecondaryAction onClick={onNew} icon={<RotateCcw size={14} aria-hidden />}>
          New track
        </SecondaryAction>
      </ActionRow>
    </>
  );
}

/** Sets the coral fill of a `.range` input. */
function fillStyle(fraction: number): CSSProperties {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  return { "--fill": `${percent}%` } as CSSProperties;
}

/** One stem in the mixer: mute / solo, its waveform and a volume fader. */
function MixerStrip({
  label,
  icon,
  peaks,
  progress,
  onSeek,
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
  onSeek: (fraction: number) => void;
  muted: boolean;
  solo: boolean;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  gain: number;
  effectiveGain: number;
  onGain: (gain: number) => void;
}) {
  const name = label.toLowerCase();
  const key = "grid h-9 w-9 place-items-center border text-[13px] font-semibold transition-colors";
  const idle = "border-white/30 text-white/75 hover:bg-white hover:text-ink";
  const silent = effectiveGain === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-white/15 px-5 py-4">
      <div className="flex w-[148px] shrink-0 items-center gap-3 max-sm:w-full">
        <span className={silent ? "text-white/40" : "text-accent"}>{icon}</span>
        <span className="text-[14.5px] font-semibold">{label}</span>
      </div>
      <div className="flex shrink-0 [&>*]:-ml-px">
        <button
          type="button"
          aria-pressed={muted}
          aria-label={`Mute ${name}`}
          title="Mute"
          onClick={onToggleMute}
          className={`${key} ${muted ? "relative z-[1] border-accent bg-accent-deep text-white" : idle}`}
        >
          M
        </button>
        <button
          type="button"
          aria-pressed={solo}
          aria-label={`Solo ${name}`}
          title="Solo"
          onClick={onToggleSolo}
          className={`${key} ${solo ? "relative z-[1] border-white bg-white text-ink" : idle}`}
        >
          S
        </button>
      </div>
      <Waveform
        peaks={peaks}
        progress={progress}
        idle="rgba(255,255,255,.34)"
        onSeek={onSeek}
        className={`h-14 min-w-[140px] flex-1 transition-opacity ${silent ? "opacity-35" : ""}`}
      />
      <div className="flex w-[190px] shrink-0 items-center gap-3 max-sm:w-full">
        <input
          type="range"
          aria-label={`${label} volume`}
          min={0}
          max={150}
          step={5}
          value={Math.round(gain * 100)}
          onChange={(e) => onGain(Number(e.target.value) / 100)}
          className="range fb-deck-range min-w-0 flex-1"
          style={fillStyle(gain / 1.5)}
        />
        <span className="fb-num w-12 shrink-0 text-right text-[13.5px] font-semibold">{Math.round(effectiveGain * 100)}%</span>
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
}: {
  label: string;
  icon: ReactNode;
  url: string;
  downloadUrl: string | null;
  fileName: string | null;
  byteLength: number | null;
  peaks: number[];
  duration: number;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-[14px] font-semibold">
          {icon}
          {label}
        </span>
        {downloadUrl ? (
          <HistoryButton
            href={downloadUrl}
            filename={fileName ?? undefined}
            label={`Download ${label.toLowerCase()}`}
            icon={<Download size={14} aria-hidden />}
          >
            {byteLength ? formatBytes(byteLength) : "Download"}
          </HistoryButton>
        ) : null}
      </div>
      <AudioPlayer
        src={url}
        duration={duration}
        peaks={peaks}
        fileName={fileName ?? label}
        compact
        tone="light"
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
  const asleep = Boolean(status) && state !== "ready";
  return (
    <EngineRow
      state={state === "ready" ? "ready" : state === "booting" ? "booting" : state === "error" ? "error" : "asleep"}
      label={
        state === "ready"
          ? "Engine ready"
          : state === "booting"
            ? `Engine starting · ${formatElapsedClock(status?.bootElapsedMs ?? 0)}`
            : "Engine asleep. It wakes when you start."
      }
      actionLabel={asleep ? "Wake now" : "Refresh"}
      onAction={asleep ? onWake : onRefresh}
      busy={waking}
      icon={asleep ? <Zap size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden />}
    />
  );
}
