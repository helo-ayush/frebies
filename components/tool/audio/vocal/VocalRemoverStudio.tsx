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
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { computePeaks, useAudioFile, type AudioItem } from "@/components/tool/audio/useAudioFile";
import {
  GenerationExpiryBadge,
  GenerationStorageNotice,
} from "@/components/tool/GenerationRetentionBadge";
import { CreditGate } from "@/components/tool/paid/CreditGate";
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
  const { isSignedIn } = useAuthSession();
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
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
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
    setSubmitBanner(null);
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
      setSubmitBanner(
        `Queued "${stagedAudio.name}" on GPU. Stems save for 24 hours automatically — feel free to queue another track.`,
      );
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: Dropzone, Interactive Stem Mixer, 24h Vault */}
        <div className="space-y-4">
          {/* GPU Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(15,15,16,0.03)]">
            <div className="flex items-center gap-2 text-[12px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  gpuStatus?.state === "ready"
                    ? "bg-emerald-500"
                    : gpuStatus?.state === "booting"
                      ? "animate-pulse bg-amber-500"
                      : gpuStatus?.state === "error"
                        ? "bg-rose-500"
                        : "bg-zinc-400"
                }`}
              />
              <Cpu size={13} className="text-muted" aria-hidden />
              <span className="font-medium text-ink">
                {gpuStatus?.state === "ready"
                  ? `${gpuStatus.hardware?.device || "NVIDIA L20"} Vocal Separator Ready`
                  : gpuStatus?.state === "booting"
                    ? `Booting NVIDIA L20 Vocal Studio (${formatElapsedClock(gpuStatus.bootElapsedMs)})`
                    : "GPU Studio asleep (auto-wakes when you separate)"}
              </span>
              {gpuStatus?.state === "ready" ? (
                <span className="hidden rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[10.5px] font-medium text-muted sm:inline-flex">
                  BS-RoFormer ViperX · Kim Vocal 2 · MDX Inst HQ3
                </span>
              ) : null}
            </div>

            {gpuStatus && gpuStatus.state !== "ready" ? (
              <button
                type="button"
                onClick={handleWakeGpu}
                disabled={wakingGpu}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-[#fafaf8] px-2.5 text-[11px] font-medium text-ink transition hover:border-ink/30"
              >
                {wakingGpu ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                Wake GPU
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void fetchStatus(true)}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted transition hover:bg-rail hover:text-ink"
              >
                <RefreshCw size={11} />
                Refresh
              </button>
            )}
          </div>

          <input
            ref={audioFile.inputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac"
            className="hidden"
            onChange={handlePickAudio}
          />

          {/* Audio Upload & Staged Card */}
          <div
            onDragOver={audioFile.onDragOver}
            onDragLeave={audioFile.onDragLeave}
            onDrop={handleDropAudio}
            className={`rounded-2xl border bg-white p-5 transition ${
              audioFile.dragging ? "border-accent bg-accent-soft/20" : "border-line"
            }`}
          >
            {!stagedAudio ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f3f1] text-ink">
                  <Upload size={20} />
                </div>
                <p className="text-[14px] font-semibold text-ink">
                  Drop a song, podcast, or video file to isolate stems
                </p>
                <p className="mt-1 max-w-md text-[12px] text-muted">
                  Powered by BS-RoFormer ViperX & MDX-Net on NVIDIA L20 GPU. Long tracks auto-split
                  into seamless studio chunks and save for 24 hours. Up to {maxSizeMB} MB.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={audioFile.openPicker}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white shadow-sm transition hover:bg-ink/90"
                  >
                    <Music size={14} />
                    Choose audio file
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadDemoSong}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-[#fafaf8] px-3.5 text-[12px] font-medium text-ink transition hover:border-ink/35"
                  >
                    <Sparkles size={13} className="text-accent" />
                    Load 6s demo track
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">
                      {stagedAudio.name}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted tabular-nums">
                      {formatTime(stagedAudio.duration)} ·{" "}
                      {Math.round(stagedAudio.sampleRate / 100) / 10} kHz ·{" "}
                      {stagedAudio.channels > 1 ? "Stereo" : "Mono"} ·{" "}
                      {formatBytes(stagedAudio.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={audioFile.openPicker}
                      className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-ink hover:bg-rail"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        audioFile.clear();
                        setDemoItem(null);
                      }}
                      className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-muted hover:text-ink"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-[#fafaf8] px-4 py-3">
                  <MiniWaveform peaks={stagedAudio.peaks} progress={1} height={42} tone="ink" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11.5px] text-muted">
                    Runs in the background with 24-hour stem vault retention — feel free to queue
                    multiple tracks.
                  </p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSubmitJob()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} className="text-accent" />
                    )}
                    {submitting ? "Submitting..." : "Separate Stems"}
                    <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px] font-medium">
                      {VOCAL_COST} cr
                    </span>
                  </button>
                </div>
              </div>
            )}

            {audioFile.error ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {audioFile.error}
              </p>
            ) : null}
            {errorMsg ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {errorMsg}
              </p>
            ) : null}
            {submitBanner ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
                <span>{submitBanner}</span>
                <button
                  type="button"
                  onClick={() => setSubmitBanner(null)}
                  className="text-emerald-700 hover:text-emerald-950"
                >
                  <X size={13} />
                </button>
              </div>
            ) : null}
          </div>

          {/* Interactive Multi-Stem Mixer */}
          {mixerJob ? (
            <div className="space-y-4 rounded-2xl border border-ink/15 bg-white p-4 shadow-[0_2px_8px_rgba(15,15,16,0.05)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Sliders size={14} />
                  </span>
                  <div>
                    <h2 className="text-[13.5px] font-semibold text-ink">
                      Interactive Stem Mixer · {mixerJob.sourceFileName}
                    </h2>
                    <p className="text-[11px] text-muted">
                      Phase-locked real-time balance ({mixerJob.modelLabel}) + browser custom WAV
                      mixdown
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={exportingMix || mixerLoading}
                    onClick={() => void handleExportCustomMix()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[11.5px] font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
                  >
                    {exportingMix ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    Export Custom Mix (WAV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopMixerPlayback(true);
                      setMixerJobId(null);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-[11px] font-medium text-muted hover:text-ink"
                  >
                    <X size={12} /> Close
                  </button>
                </div>
              </div>

              {/* Mixer Transport & Scrub Bar */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#fafaf8] px-3 py-2.5">
                <button
                  type="button"
                  disabled={mixerLoading}
                  onClick={() => {
                    if (mixerPlaying) {
                      stopMixerPlayback(false);
                    } else {
                      void startMixerPlayback(mixerJob);
                    }
                  }}
                  aria-label={mixerPlaying ? "Pause mixer" : "Play mixed stems"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm transition hover:bg-ink/90 disabled:opacity-60"
                >
                  {mixerLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : mixerPlaying ? (
                    <Pause size={14} />
                  ) : (
                    <Play size={14} className="translate-x-[1px]" />
                  )}
                </button>

                <div className="min-w-[160px] flex-1">
                  <input
                    type="range"
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
                    className="w-full accent-accent"
                  />
                </div>

                <span className="text-[11.5px] font-medium text-muted tabular-nums">
                  {formatTime(mixerCurrentTime)} / {formatTime(mixerDuration)}
                </span>
              </div>

              {/* Mix Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                  Presets
                </span>
                {MIXER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyMixerPreset(preset)}
                    className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-ink/35 hover:bg-rail"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Stem Channel Strips */}
              <div className="grid gap-3 sm:grid-cols-2">
                {mixerJob.vocalsUrl ? (
                  <div className="rounded-xl border border-line bg-[#fafaf8] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <Mic size={13} className="text-accent" /> Vocals
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setVocalsMuted((m) => !m)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            vocalsMuted
                              ? "bg-rose-600 text-white"
                              : "border border-line bg-white text-muted hover:text-ink"
                          }`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => setVocalsSolo((s) => !s)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            vocalsSolo
                              ? "bg-amber-500 text-white"
                              : "border border-line bg-white text-muted hover:text-ink"
                          }`}
                        >
                          S
                        </button>
                      </div>
                    </div>

                    <MiniWaveform
                      peaks={mixerJob.vocalsPeaks}
                      progress={mixerDuration ? mixerCurrentTime / mixerDuration : 0}
                      tone="coral"
                      height={28}
                    />

                    <div className="mt-2.5 flex items-center gap-2">
                      <Volume2 size={13} className="shrink-0 text-muted" />
                      <input
                        type="range"
                        min={0}
                        max={150}
                        step={5}
                        value={Math.round(vocalsGain * 100)}
                        onChange={(e) => setVocalsGain(Number(e.target.value) / 100)}
                        className="w-full accent-accent"
                      />
                      <span className="w-10 text-right text-[11px] font-medium text-ink tabular-nums">
                        {Math.round(effectiveVocalsGain * 100)}%
                      </span>
                    </div>
                  </div>
                ) : null}

                {mixerJob.instrumentalUrl ? (
                  <div className="rounded-xl border border-line bg-[#fafaf8] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <Music size={13} className="text-emerald-700" /> Instrumental
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInstMuted((m) => !m)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            instMuted
                              ? "bg-rose-600 text-white"
                              : "border border-line bg-white text-muted hover:text-ink"
                          }`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => setInstSolo((s) => !s)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            instSolo
                              ? "bg-amber-500 text-white"
                              : "border border-line bg-white text-muted hover:text-ink"
                          }`}
                        >
                          S
                        </button>
                      </div>
                    </div>

                    <MiniWaveform
                      peaks={mixerJob.instrumentalPeaks}
                      progress={mixerDuration ? mixerCurrentTime / mixerDuration : 0}
                      tone="sage"
                      height={28}
                    />

                    <div className="mt-2.5 flex items-center gap-2">
                      <Volume2 size={13} className="shrink-0 text-muted" />
                      <input
                        type="range"
                        min={0}
                        max={150}
                        step={5}
                        value={Math.round(instGain * 100)}
                        onChange={(e) => setInstGain(Number(e.target.value) / 100)}
                        className="w-full accent-emerald-700"
                      />
                      <span className="w-10 text-right text-[11px] font-medium text-ink tabular-nums">
                        {Math.round(effectiveInstGain * 100)}%
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 24h Cloud Vault History */}
          <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">24-hour Stem Vault</h2>
                <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium text-muted tabular-nums">
                  {jobs.length}
                </span>
              </div>
              {jobs.length > ITEMS_PER_PAGE ? (
                <div className="flex items-center gap-1 text-[11.5px] text-muted">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-line p-1 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="px-1.5 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-md border border-line p-1 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              ) : null}
            </div>

            <GenerationStorageNotice noun="Separated stems" />

            {!isSignedIn ? (
              <div className="rounded-xl border border-dashed border-line bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-muted">
                Sign in to run GPU stem separation and keep your Vocals & Instrumental tracks saved
                for 24 hours.
              </div>
            ) : loadingJobs && jobs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted">
                <Loader2 size={15} className="animate-spin" /> Loading 24-hour stem vault...
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-muted">
                No separated stems yet. Upload a track or click &ldquo;Load 6s demo track&rdquo; to
                try BS-RoFormer ViperX.
              </div>
            ) : (
              <div className="space-y-3">
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;

                  return (
                    <div
                      key={job.id}
                      className="rounded-xl border border-line bg-[#fafaf8] p-3.5 transition hover:border-ink/20"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-ink">
                              {job.sourceFileName}
                            </span>
                            <span className="rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                              {job.modelLabel}
                            </span>
                            <span className="rounded bg-[#eeeeea] px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
                              {Math.round(job.sampleRate / 100) / 10} kHz · {job.format}
                              {job.format === "mp3" ? ` ${job.bitrate}k` : ""}
                            </span>
                            {job.status === "completed" ? (
                              <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted tabular-nums">
                            {job.durationSec > 0 ? <span>{formatTime(job.durationSec)}</span> : null}
                            {job.chunkCount > 1 ? <span>· {job.chunkCount} chunks</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} /> {formatElapsedClock(elapsed)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {job.status === "completed" &&
                          (job.vocalsUrl || job.instrumentalUrl) ? (
                            <button
                              type="button"
                              onClick={() => openJobInMixer(job)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[11.5px] font-medium text-ink transition hover:border-ink/35"
                            >
                              <Sliders size={12} className="text-accent" /> Open in Stem Mixer
                            </button>
                          ) : null}

                          {!isRunning ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                title="Re-run separation with same audio"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-muted hover:text-ink"
                              >
                                <RotateCcw size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteJob(job.id)}
                                title="Delete from vault"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-muted hover:text-rose-600"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {isRunning ? (
                        <div className="mt-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 size={12} className="animate-spin text-accent" />
                              {job.stageLabel}
                            </span>
                            <span className="tabular-nums">{job.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e6e4dc]">
                            <div
                              className="h-full rounded-full bg-accent transition-all duration-300"
                              style={{ width: `${Math.max(6, job.progress)}%` }}
                            />
                          </div>
                        </div>
                      ) : isFailed ? (
                        <p className="mt-2 text-[11.5px] text-rose-600">
                          {job.error || "Vocal separation failed."}
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                          {job.vocalsUrl ? (
                            <div className="rounded-lg border border-line bg-white p-2.5">
                              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                                  <Mic size={11} className="text-accent" /> Vocals stem
                                </span>
                                {job.vocalsDownloadUrl ? (
                                  <a
                                    href={job.vocalsDownloadUrl}
                                    download={job.vocalsFileName ?? undefined}
                                    className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                                  >
                                    <Download size={10} />
                                    {job.vocalsByteLength
                                      ? formatBytes(job.vocalsByteLength)
                                      : "Save"}
                                  </a>
                                ) : null}
                              </div>
                              <AudioPlayer
                                src={job.vocalsUrl}
                                duration={job.durationSec || 1}
                                peaks={job.vocalsPeaks}
                                fileName={job.vocalsFileName ?? undefined}
                                formatLabel={job.format.toUpperCase()}
                                compact
                              />
                            </div>
                          ) : null}

                          {job.instrumentalUrl ? (
                            <div className="rounded-lg border border-line bg-white p-2.5">
                              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                                  <Music size={11} className="text-emerald-700" /> Instrumental stem
                                </span>
                                {job.instrumentalDownloadUrl ? (
                                  <a
                                    href={job.instrumentalDownloadUrl}
                                    download={job.instrumentalFileName ?? undefined}
                                    className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                                  >
                                    <Download size={10} />
                                    {job.instrumentalByteLength
                                      ? formatBytes(job.instrumentalByteLength)
                                      : "Save"}
                                  </a>
                                ) : null}
                              </div>
                              <AudioPlayer
                                src={job.instrumentalUrl}
                                duration={job.durationSec || 1}
                                peaks={job.instrumentalPeaks}
                                fileName={job.instrumentalFileName ?? undefined}
                                formatLabel={job.format.toUpperCase()}
                                compact
                              />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: 3-Tab Customization Rail */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(15,15,16,0.04)] lg:sticky lg:top-20 lg:self-start">
          <VocalControls
            settings={settings}
            onPatch={handlePatch}
            onReset={() => setSettings(DEFAULT_VOCAL_SETTINGS)}
            disabled={submitting}
          />
        </div>
      </div>

      <CreditGate
        open={showCreditGate}
        onClose={() => setShowCreditGate(false)}
        action="Separate Vocals & Instrumental on GPU"
        cost={VOCAL_COST}
      />
    </div>
  );
}
