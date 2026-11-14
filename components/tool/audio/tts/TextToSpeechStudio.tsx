"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  Lock,
  Mic2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Progress } from "@/components/arc/progress/progress";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import {
  GenerationExpiryBadge,
  GenerationStorageNotice,
} from "@/components/tool/GenerationRetentionBadge";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import type { PoolStatusSnapshot, TtsJobSnapshot } from "@/lib/audio/tts-manager";
import type { GenerationStorageStats } from "@/lib/storage/generation-store";
import {
  CueBar,
  MoodPanel,
  OutputPanel,
  SettingsTabs,
  TabPanel,
  VoicePanel,
  type SettingsTab,
} from "./TtsControls";
import { VoiceClonePanel } from "./VoiceClonePanel";
import {
  DEFAULT_TTS_SETTINGS,
  SAMPLE_SCRIPT,
  TTS_LANGUAGES,
  TTS_MAX_CHARS,
  TTS_STYLES,
  estimateSpeechSeconds,
  formatElapsedClock,
  voiceMeta,
  type SavedCustomVoice,
  type TtsSettings,
  type VoiceId,
} from "./model";
import { loadSavedClonedVoices, persistSavedClonedVoices } from "./voice-clone-utils";

const ACTIVE_STATUSES = new Set([
  "queued",
  "waiting_for_server",
  "synthesizing",
  "processing_audio",
]);

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function friendlyJobStage(job: TtsJobSnapshot): string {
  switch (job.status) {
    case "waiting_for_server":
      return "Warming up voice studio — your audio will start automatically.";
    case "queued":
      return job.queuePosition && job.queuePosition > 1
        ? `Waiting in line (#${job.queuePosition})...`
        : "Getting ready to generate...";
    case "synthesizing":
      return job.chunksTotal > 1
        ? `Speaking part ${Math.min(job.chunksTotal, job.chunksDone + 1)} of ${job.chunksTotal}...`
        : "Creating your voiceover...";
    case "processing_audio":
      return `Finishing ${job.format.toUpperCase()} audio file...`;
    case "completed":
      return "Ready to play and download";
    case "failed":
      return "Generation failed";
  }
}

function friendlyJobError(raw: string | null | undefined): string {
  if (!raw) return "Could not create this voice clip. Please try again.";
  if (
    /<html|<!doctype|AudioTTS|ModelScope|Gradio|Tengine|nginx|gateway|HTTP 50[0-4]|\b(studio|server|worker|gpu|space|backend)\b/i.test(
      raw,
    )
  ) {
    return "Generation timed out before finishing. Please click Try again.";
  }
  return raw;
}

function jobStatusPill(job: TtsJobSnapshot): { label: string; className: string } {
  switch (job.status) {
    case "waiting_for_server":
      return { label: "Warming up", className: "bg-amber-50 text-amber-800 ring-amber-200" };
    case "queued":
      return {
        label: job.queuePosition ? `Queued #${job.queuePosition}` : "Queued",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
    case "synthesizing":
      return {
        label: job.chunksTotal > 1 ? `Creating ${job.chunksDone}/${job.chunksTotal}` : "Creating",
        className: "bg-accent/[0.08] text-[#a8432c] ring-accent/25",
      };
    case "processing_audio":
      return {
        label: `Saving ${job.format.toUpperCase()}`,
        className: "bg-sky-50 text-sky-800 ring-sky-200",
      };
    case "completed":
      return { label: "Ready", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    case "failed":
      return { label: "Failed", className: "bg-rose-50 text-rose-700 ring-rose-200" };
  }
}

function JobStatusIcon({ job }: { job: TtsJobSnapshot }) {
  const base = "grid h-9 w-9 shrink-0 place-items-center rounded-xl";
  switch (job.status) {
    case "completed":
      return (
        <span className={`${base} bg-emerald-50 text-emerald-600`}>
          <CheckCircle2 size={18} aria-hidden />
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-rose-50 text-rose-600`}>
          <AlertCircle size={18} aria-hidden />
        </span>
      );
    case "waiting_for_server":
      return (
        <span className={`${base} bg-amber-50 text-amber-600`}>
          <Clock size={18} aria-hidden />
        </span>
      );
    default:
      return (
        <span className={`${base} bg-accent/[0.1] text-accent`}>
          <Loader2 size={18} className="animate-spin" aria-hidden />
        </span>
      );
  }
}

const DRAFT_SCRIPT_STORAGE_KEY = "frebies.tts.draftScript.v1";

export function TextToSpeechStudio() {
  const { isLoaded, isSignedIn, user } = useAuthSession();
  const ownerUserId = isSignedIn ? user?.id ?? null : null;

  const [text, setText] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [savedClones, setSavedClones] = useState<SavedCustomVoice[]>([]);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);
  const [clonerOpen, setClonerOpen] = useState(false);

  const customVoice = useMemo(
    () => savedClones.find((entry) => entry.id === activeCloneId) ?? null,
    [savedClones, activeCloneId],
  );

  // Settings panel
  const [activeTab, setActiveTab] = useState<SettingsTab>("voice");
  const [settingsOpenMobile, setSettingsOpenMobile] = useState(false);

  const [pool, setPool] = useState<PoolStatusSnapshot | null>(null);
  const [jobs, setJobs] = useState<TtsJobSnapshot[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [storage, setStorage] = useState<GenerationStorageStats | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [submitting, setSubmitting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const prevOwnerIdRef = useRef<string | null | undefined>(undefined);
  const draftHydratedRef = useRef(false);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      const savedDraft = window.sessionStorage.getItem(DRAFT_SCRIPT_STORAGE_KEY);
      if (savedDraft) setText(savedDraft);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    try {
      if (text.trim()) {
        window.sessionStorage.setItem(DRAFT_SCRIPT_STORAGE_KEY, text);
      } else {
        window.sessionStorage.removeItem(DRAFT_SCRIPT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [text]);

  const patch = useCallback((next: Partial<TtsSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
  }, []);

  const handleSaveClone = useCallback(
    (voice: SavedCustomVoice) => {
      if (!ownerUserId) {
        setGateOpen(true);
        return;
      }
      setSavedClones((prev) => {
        const next = [voice, ...prev.filter((item) => item.id !== voice.id)].slice(0, 4);
        persistSavedClonedVoices(next, ownerUserId);
        return next;
      });
      setActiveCloneId(voice.id);
      setClonerOpen(false);
    },
    [ownerUserId],
  );

  const handleDeleteClone = useCallback(
    (id: string) => {
      setSavedClones((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (ownerUserId) {
          persistSavedClonedVoices(next, ownerUserId);
        }
        return next;
      });
      setActiveCloneId((prev) => (prev === id ? null : prev));
    },
    [ownerUserId],
  );

  const applySync = useCallback(
    (
      nextPool: PoolStatusSnapshot,
      nextJobs: TtsJobSnapshot[],
      nextStorage?: GenerationStorageStats | null,
    ) => {
      if (!mountedRef.current) return;
      const now = Date.now();
      setPool(nextPool);
      setJobs((prev) => {
        const byId = new Map<string, TtsJobSnapshot>();
        for (const j of nextJobs) {
          if (!deletedIdsRef.current.has(j.id)) {
            byId.set(j.id, j);
          }
        }
        for (const p of prev) {
          if (
            ACTIVE_STATUSES.has(p.status) &&
            !deletedIdsRef.current.has(p.id) &&
            !byId.has(p.id) &&
            now - p.createdAt < 25 * 60 * 1000
          ) {
            byId.set(p.id, p);
          }
        }
        return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      });
      setJobsLoading(false);
      if (nextStorage !== undefined) {
        setStorage(nextStorage);
      }
      setLastSyncAt(now);
      setNowMs(now);
    },
    [],
  );

  useEffect(() => {
    if (!ownerUserId) return;
    try {
      const key = `frebies:tts-active:${ownerUserId}`;
      const active = jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
      if (active.length > 0) {
        window.sessionStorage.setItem(key, JSON.stringify(active));
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [jobs, ownerUserId]);

  const fetchStatus = useCallback(
    async (opts?: { wake?: boolean; force?: boolean }) => {
      const qs = new URLSearchParams();
      if (opts?.wake) qs.set("wake", "1");
      if (opts?.force) qs.set("force", "1");
      const query = qs.toString();
      const url = `/api/audio/tts/status${query ? `?${query}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const data = (await res.json()) as {
        pool: PoolStatusSnapshot;
        jobs: TtsJobSnapshot[];
        storage?: GenerationStorageStats | null;
      };
      applySync(data.pool, data.jobs, data.storage);
      return data;
    },
    [applySync],
  );

  // Sync user-scoped workspace & auto-wake only when an authenticated session is active
  useEffect(() => {
    mountedRef.current = true;
    if (!isLoaded) return;

    if (prevOwnerIdRef.current !== ownerUserId) {
      prevOwnerIdRef.current = ownerUserId;
      deletedIdsRef.current.clear();
      setCurrentPage(1);
      setStorage(null);
      setSubmitError(null);
      setActiveCloneId(null);
      setClonerOpen(false);
      setSavedClones(loadSavedClonedVoices(ownerUserId));

      let cachedActive: TtsJobSnapshot[] = [];
      if (ownerUserId) {
        try {
          const raw = window.sessionStorage.getItem(`frebies:tts-active:${ownerUserId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as TtsJobSnapshot[];
            if (Array.isArray(parsed)) {
              cachedActive = parsed.filter(
                (j) => j?.id && ACTIVE_STATUSES.has(j.status) && Date.now() - j.createdAt < 25 * 60 * 1000,
              );
            }
          }
        } catch {
          // ignore
        }
      }
      setJobs(cachedActive);
      setJobsLoading(Boolean(isSignedIn));
    }

    fetchStatus({ wake: Boolean(isSignedIn) }).catch((err) => {
      if (mountedRef.current) {
        setJobsLoading(false);
        setSubmitError(
          err instanceof Error
            ? friendlyJobError(err.message)
            : "Could not load the voice tool. Please try again.",
        );
      }
    });
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isLoaded, isSignedIn, ownerUserId, fetchStatus]);

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => ACTIVE_STATUSES.has(job.status)),
    [jobs],
  );

  const isBooting =
    Boolean(isSignedIn) &&
    (pool?.poolState === "booting" ||
      Boolean(pool && pool.bootingCount > 0) ||
      jobs.some((job) => job.status === "waiting_for_server"));

  // Adaptive polling while signed in: fast during generation/boot, relaxed when idle
  useEffect(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (!isLoaded || !isSignedIn) return;
    const intervalMs = hasActiveJobs || isBooting ? 2500 : 12000;
    pollTimerRef.current = setTimeout(() => {
      fetchStatus({ wake: false }).catch(() => {
        // Keep last state until next check
      });
    }, intervalMs);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isLoaded, isSignedIn, pool, jobs, hasActiveJobs, isBooting, fetchStatus]);

  const hasExpiringSoon = useMemo(
    () =>
      jobs.some(
        (job) => job.expiresAt !== null && job.expiresAt > nowMs && job.expiresAt - nowMs <= 120_000,
      ),
    [jobs, nowMs],
  );

  // Smooth tick for elapsed boot timer, active clocks, and 24h remaining countdown badges
  useEffect(() => {
    if (!hasActiveJobs && !isBooting && jobs.length === 0) return;
    const stepMs = hasActiveJobs || isBooting || hasExpiringSoon ? 1000 : 30_000;
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, stepMs);
    return () => clearInterval(id);
  }, [hasActiveJobs, isBooting, hasExpiringSoon, jobs.length]);

  const driftMs = Math.max(0, nowMs - lastSyncAt);
  const displayBootElapsedMs =
    pool && (pool.bootElapsedMs > 0 || isBooting) ? pool.bootElapsedMs + driftMs : 0;

  const trimmed = text.trim();
  const charCount = text.length;
  const wordCount = countWords(text);
  const hasText = trimmed.length > 0;
  const overLimit = charCount > TTS_MAX_CHARS;
  const estSeconds = estimateSpeechSeconds(text, settings.speed);

  const readyCount = pool?.readyCount ?? 0;

  const voiceLabel = customVoice ? customVoice.name : voiceMeta(settings.voice).name;
  const langLabel =
    TTS_LANGUAGES.find((l) => l.value === settings.language)?.label ?? settings.language;
  const styleLabel = TTS_STYLES.find((s) => s.value === settings.style)?.label ?? settings.style;
  const settingsSummary = `${voiceLabel} · ${langLabel} · ${styleLabel} · ${settings.speed.toFixed(2)}×`;

  const insertExpressionTag = useCallback((tag: string) => {
    const el = textareaRef.current;
    setText((prev) => {
      if (!el) {
        return prev.trim() ? `${prev.trimEnd()} ${tag} ` : `${tag} `;
      }
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? start;
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const suffix = after.length === 0 || !/^\s/.test(after) ? " " : "";
      const next = `${before}${prefix}${tag}${suffix}${after}`;
      requestAnimationFrame(() => {
        el.focus();
        const cursor = before.length + prefix.length + tag.length + suffix.length;
        el.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  }, []);

  const openSettings = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    setSettingsOpenMobile(true);
    requestAnimationFrame(() => {
      document.getElementById("tts-settings-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, []);

  const scrollToResults = () => {
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleGenerate = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setGateOpen(true);
      return;
    }
    if (!hasText || overLimit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/audio/tts/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice: settings.voice,
          language: settings.language,
          style: settings.style,
          speed: settings.speed,
          pitch: settings.pitch,
          format: settings.format,
          bitrate: settings.bitrate,
          metadata: settings.metadata,
          paragraphPauses: settings.paragraphPauses,
          emphasizeNumbers: settings.emphasizeNumbers,
          temperature: settings.temperature,
          topP: settings.topP,
          preferredStudio: settings.preferredStudio,
          customVoice: customVoice
            ? {
                name: customVoice.name,
                audioBase64: customVoice.audioBase64,
                text: customVoice.text,
              }
            : null,
        }),
      });
      if (res.status === 401) {
        setGateOpen(true);
        return;
      }
      const data = (await res.json()) as {
        job?: TtsJobSnapshot;
        pool?: PoolStatusSnapshot;
        storage?: GenerationStorageStats;
        error?: string;
      };
      if (!res.ok || !data.job) {
        throw new Error(data.error || `Could not start voice generation (${res.status})`);
      }

      setCurrentPage(1);
      const nextJobs = [data.job, ...jobs.filter((j) => j.id !== data.job!.id)];
      if (data.pool) {
        applySync(data.pool, nextJobs, data.storage);
      } else {
        setJobs(nextJobs);
        if (data.storage) setStorage(data.storage);
      }
      scrollToResults();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not generate audio.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    if (!isSignedIn) {
      setGateOpen(true);
      return;
    }
    setRetryingId(jobId);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/audio/tts/jobs/${encodeURIComponent(jobId)}`, {
        method: "POST",
      });
      if (res.status === 401) {
        setGateOpen(true);
        return;
      }
      const data = (await res.json()) as {
        job?: TtsJobSnapshot;
        pool?: PoolStatusSnapshot;
        storage?: GenerationStorageStats;
        error?: string;
      };
      if (!res.ok || !data.job) {
        throw new Error(data.error || `Retry failed (${res.status})`);
      }
      const nextJobs = [data.job, ...jobs.filter((j) => j.id !== data.job!.id)];
      if (data.pool) {
        applySync(data.pool, nextJobs, data.storage);
      } else {
        setJobs(nextJobs);
        if (data.storage) setStorage(data.storage);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!isSignedIn) {
      setGateOpen(true);
      return;
    }
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/audio/tts/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        setGateOpen(true);
        return;
      }
      if (res.ok) {
        deletedIdsRef.current.add(jobId);
        const data = (await res.json().catch(() => ({}))) as {
          storage?: GenerationStorageStats;
        };
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        if (data.storage) setStorage(data.storage);
      }
    } catch {
      // Ignore transient delete errors
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const queueing = isBooting && readyCount === 0;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_372px] lg:grid-rows-[auto_1fr] lg:gap-x-6">
      {/* ============================================================ */}
      {/* 1 · Script card                                               */}
      {/* ============================================================ */}
      <section
        aria-label="Write your script"
        className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_1px_2px_rgba(15,15,16,0.04),0_12px_32px_-18px_rgba(15,15,16,0.16)] lg:col-start-1 lg:row-start-1"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-white">
              <AudioLines size={16} aria-hidden />
            </span>
            <div>
              <label htmlFor="tts-script-input" className="block text-[14px] font-semibold text-ink">
                Your script
              </label>
              <p className="text-[11.5px] text-faint">Type or paste what you want spoken.</p>
            </div>
          </div>
        </div>

        {pool && !pool.configured && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-800 sm:mx-6">
            <TriangleAlert size={14} className="shrink-0" aria-hidden />
            <span>Voice generation is temporarily unavailable. Please try again shortly.</span>
          </div>
        )}

        {pool && pool.configured && isBooting && readyCount === 0 && (
          <div className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2.5 text-[12px] text-amber-900 sm:mx-6">
            <div className="flex items-center gap-2.5">
              <Loader2 size={14} className="shrink-0 animate-spin text-amber-700" aria-hidden />
              <span>
                <span className="font-semibold">Preparing voice studio…</span>{" "}
                You can still press <strong>Queue audio</strong> — your audio will start
                automatically as soon as it’s ready.
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-white/85 px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-900">
              <Clock size={11} aria-hidden />
              {formatElapsedClock(displayBootElapsedMs)}
            </span>
          </div>
        )}

        <div className="px-5 pt-3 sm:px-6">
          <div
            className={`rounded-2xl border bg-[#fbfbfa] transition-colors focus-within:bg-white ${
              overLimit
                ? "border-rose-400 focus-within:border-rose-500"
                : "border-line focus-within:border-ink/40"
            }`}
          >
            <textarea
              id="tts-script-input"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="Write or paste anything you want spoken aloud…"
              rows={8}
              aria-label="Script to turn into speech"
              className="block min-h-[220px] w-full resize-y rounded-2xl bg-transparent px-4 py-4 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[11.5px] text-faint">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
                <span className={overLimit ? "font-semibold text-rose-700" : ""}>
                  {charCount.toLocaleString()} / {TTS_MAX_CHARS.toLocaleString()} chars
                </span>
                {wordCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{wordCount} words</span>
                    <span aria-hidden>·</span>
                    <span>~{formatTime(estSeconds)} of audio</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!hasText ? (
                  <button
                    type="button"
                    onClick={() => {
                      setText(SAMPLE_SCRIPT);
                      setSubmitError(null);
                    }}
                    className="rounded-full border border-line bg-white px-2.5 py-1 font-medium text-muted transition hover:border-ink/30 hover:text-ink"
                  >
                    Try a sample
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      setSubmitError(null);
                    }}
                    className="rounded-full px-2.5 py-1 font-medium text-faint transition hover:bg-[#f3f3f1] hover:text-ink"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {overLimit && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
              <TriangleAlert size={13} aria-hidden />
              Please keep your script under {TTS_MAX_CHARS.toLocaleString()} characters.
            </p>
          )}

          <div className="mt-3">
            <CueBar onInsertTag={insertExpressionTag} />
          </div>

          {submitError && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-800"
            >
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-[#fbfbfa] px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => openSettings("voice")}
            title="Change voice & settings"
            className="group inline-flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-line bg-white py-1.5 pl-1.5 pr-3 text-left transition hover:border-ink/30"
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                customVoice ? "bg-accent/[0.12] text-accent" : "bg-ink text-white"
              }`}
            >
              {customVoice ? (
                <Mic2 size={14} aria-hidden />
              ) : (
                <span className="text-[13px] font-semibold">{voiceLabel.charAt(0)}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-ink">
                {voiceLabel}
                {customVoice && (
                  <span className="ml-1.5 rounded-full bg-accent/[0.1] px-1.5 py-0.5 text-[9.5px] font-medium text-[#a8432c]">
                    Cloned
                  </span>
                )}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {langLabel} · {styleLabel} · {settings.format.toUpperCase()}
              </span>
            </span>
            <SlidersHorizontal
              size={13}
              className="ml-1 shrink-0 text-faint transition group-hover:text-ink"
              aria-hidden
            />
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-faint md:inline">Ctrl + Enter</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!isLoaded || (isSignedIn && !hasText) || overLimit || submitting}
              className="inline-flex h-11 min-w-[168px] items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[14px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(15,15,16,0.55)] transition hover:bg-[#222225] active:translate-y-px disabled:cursor-not-allowed disabled:bg-line disabled:text-faint disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Starting…
                </>
              ) : isLoaded && !isSignedIn ? (
                <>
                  <Lock size={14} aria-hidden />
                  Sign in to create audio
                </>
              ) : queueing ? (
                <>
                  <Clock size={15} aria-hidden />
                  Queue audio
                </>
              ) : (
                <>
                  <Sparkles size={15} aria-hidden />
                  Create audio
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2 · Settings sidebar (sticky on desktop, collapsible on mobile) */}
      {/* ============================================================ */}
      <aside
        id="tts-settings-panel"
        aria-label="Voice and output settings"
        className="min-w-0 lg:sticky lg:top-[72px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-88px)] lg:self-start lg:overflow-y-auto lg:rounded-[22px]"
      >
        <div className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
          {/* Mobile header: collapses the whole panel */}
          <button
            type="button"
            aria-expanded={settingsOpenMobile}
            onClick={() => setSettingsOpenMobile((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left lg:hidden"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-rail text-ink ring-1 ring-line">
                <SlidersHorizontal size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">Voice &amp; settings</span>
                <span className="block truncate text-[11.5px] text-faint">{settingsSummary}</span>
              </span>
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-faint transition-transform ${settingsOpenMobile ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {/* Desktop header */}
          <div className="hidden items-center gap-2.5 px-5 pt-5 lg:flex">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-rail text-ink ring-1 ring-line">
              <SlidersHorizontal size={15} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">Voice &amp; settings</p>
              <p className="truncate text-[11.5px] text-faint">{settingsSummary}</p>
            </div>
          </div>

          <div className={`${settingsOpenMobile ? "block" : "hidden"} px-4 pb-5 pt-2 lg:block lg:px-5 lg:pt-4`}>
            <SettingsTabs value={activeTab} onChange={setActiveTab} />

            <div className="mt-4">
              <TabPanel tab="voice" active={activeTab}>
                <VoicePanel
                  settings={settings}
                  activeCloneId={activeCloneId}
                  savedClones={savedClones}
                  clonerOpen={clonerOpen}
                  onPickPreset={(id: VoiceId) => {
                    setActiveCloneId(null);
                    patch({ voice: id });
                  }}
                  onPickClone={(id) => setActiveCloneId(id)}
                  onDeleteClone={handleDeleteClone}
                  onToggleCloner={() => {
                    if (!isSignedIn) {
                      setGateOpen(true);
                      return;
                    }
                    setClonerOpen((v) => !v);
                  }}
                  onPatch={patch}
                  cloner={
                    <VoiceClonePanel
                      open={clonerOpen}
                      customVoices={savedClones}
                      activeVoiceId={activeCloneId}
                      showSavedList={false}
                      onSelectVoice={(voice) => setActiveCloneId(voice.id)}
                      onSaveVoice={handleSaveClone}
                      onDeleteVoice={handleDeleteClone}
                      onClose={() => setClonerOpen(false)}
                    />
                  }
                />
              </TabPanel>

              <TabPanel tab="mood" active={activeTab}>
                <MoodPanel settings={settings} onPatch={patch} />
              </TabPanel>

              <TabPanel tab="output" active={activeTab}>
                <OutputPanel settings={settings} onPatch={patch} />
              </TabPanel>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 3 · Results feed (always visible, directly under the script)   */}
      {/* ============================================================ */}
      <section
        ref={resultsRef}
        aria-label="Your generated audio"
        className="min-w-0 scroll-mt-20 lg:col-start-1 lg:row-start-2"
      >
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            Your audio
            {jobs.length > 0 && (
              <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                {jobs.length}
              </span>
            )}
          </h2>
        </div>

        {jobs.length > 0 && (
          <div className="mb-3">
            <GenerationStorageNotice ttlHours={storage?.ttlHours ?? 24} />
          </div>
        )}

        {jobsLoading && jobs.length === 0 && isSignedIn ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading audio history">
            {[0, 1, 2].map((skeletonIdx) => (
              <div
                key={skeletonIdx}
                className="overflow-hidden rounded-[20px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,15,16,0.03)] sm:p-5"
              >
                <div className="flex items-start gap-3 animate-pulse">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-[#efeeea]" />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="h-3.5 w-4/5 rounded-full bg-[#efeeea]" />
                    <div className="h-3.5 w-1/2 rounded-full bg-[#f4f3ef]" />
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <div className="h-5 w-16 rounded-full bg-[#efeeea]" />
                      <div className="h-5 w-14 rounded-full bg-[#f4f3ef]" />
                      <div className="h-5 w-10 rounded-full bg-[#f4f3ef]" />
                    </div>
                  </div>
                  <div className="h-4 w-12 shrink-0 rounded-full bg-[#f4f3ef]" />
                </div>
                <div className="mt-4 h-12 rounded-xl bg-[#f7f6f3] animate-pulse" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          isLoaded && !isSignedIn ? (
            <div className="flex flex-col items-center rounded-[22px] border border-dashed border-[#d6d4cc] bg-white/60 px-6 py-11 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rail text-ink ring-1 ring-line">
                <Lock size={20} aria-hidden />
              </span>
              <p className="mt-3.5 text-[14px] font-semibold text-ink">
                Sign in to create &amp; save audio
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                Voice generation is available for signed-in accounts. Each user&apos;s generated
                clips and cloned voices stay private in their own workspace.
              </p>
              <button
                type="button"
                onClick={() => setGateOpen(true)}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[12.5px] font-medium text-white transition hover:bg-[#222225]"
              >
                <Lock size={13} aria-hidden />
                Sign in or create free account
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-[22px] border border-dashed border-[#d6d4cc] bg-white/60 px-6 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rail text-faint ring-1 ring-line">
                <AudioLines size={22} aria-hidden />
              </span>
              <p className="mt-3.5 text-[14px] font-semibold text-ink">Nothing generated yet</p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                Write a script above and press <strong className="font-semibold text-ink">Create audio</strong>.
                Progress, playback and downloads will show up right here.
              </p>
            </div>
          )
        ) : (
          (() => {
            const pageSize = 5;
            const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
            const safePage = Math.min(currentPage, totalPages);
            const startIndex = (safePage - 1) * pageSize;
            const visibleJobs = jobs.slice(startIndex, startIndex + pageSize);

            return (
              <div className="space-y-3">
                {visibleJobs.map((job) => {
              const badge = jobStatusPill(job);
              const isActive = ACTIVE_STATUSES.has(job.status);
              const canDelete = job.status !== "synthesizing" && job.status !== "processing_audio";
              const liveJobElapsed = isActive ? job.elapsedMs + driftMs : job.elapsedMs;

              return (
                <article
                  key={job.id}
                  className={`overflow-hidden rounded-[20px] border bg-white shadow-[0_1px_2px_rgba(15,15,16,0.03)] transition-colors ${
                    isActive ? "border-accent/35" : job.status === "failed" ? "border-rose-200" : "border-line"
                  }`}
                >
                  <div className="flex items-start gap-3 p-4 sm:p-5">
                    <JobStatusIcon job={job} />

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">
                        {job.textPreview}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 font-medium text-ink">
                          {job.voiceName}
                        </span>
                        <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 font-medium uppercase">
                          {job.format}
                        </span>
                        {!isActive && job.expiresAt && (
                          <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted">
                        <Clock size={11} className="text-faint" aria-hidden />
                        {formatElapsedClock(liveJobElapsed)}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label="Remove audio item"
                          disabled={deletingId === job.id}
                          onClick={() => handleDeleteJob(job.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[#f3f3f1] hover:text-ink disabled:opacity-40"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="border-t border-line-soft bg-accent/[0.025] px-4 py-3.5 sm:px-5">
                      <Progress
                        value={job.progress}
                        max={100}
                        label={friendlyJobStage(job)}
                        showValue
                      />
                    </div>
                  )}

                  {job.status === "completed" && job.audioUrl && (
                    <div className="space-y-3 border-t border-line-soft bg-[#fbfbfa] p-4 sm:p-5">
                      <AudioPlayer
                        src={job.audioUrl}
                        duration={Math.max(1, job.durationSeconds ?? 1)}
                        peaks={job.peaks}
                        fileName={job.fileName}
                        formatLabel={job.format.toUpperCase()}
                        compact
                      />
                      {job.downloadUrl && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11.5px] text-muted">
                            {job.durationSeconds ? formatTime(job.durationSeconds, true) : "—"} ·{" "}
                            {job.format.toUpperCase()}
                            {job.byteLength ? ` · ${formatBytes(job.byteLength)}` : ""}
                          </span>
                          <a
                            href={job.downloadUrl}
                            download={job.fileName}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#222225]"
                          >
                            <Download size={13} aria-hidden />
                            Download {job.format.toUpperCase()}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {job.status === "failed" && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-100 bg-rose-50/70 px-4 py-3 text-[12px] text-rose-800 sm:px-5">
                      <span className="min-w-0 flex-1 break-words">
                        {friendlyJobError(job.error)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRetry(job.id)}
                        disabled={retryingId === job.id}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-300 bg-white px-3.5 py-1.5 text-[11.5px] font-medium text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {retryingId === job.id ? (
                          <Loader2 size={11} className="animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw size={11} aria-hidden />
                        )}
                        Try again
                      </button>
                    </div>
                  )}
                </article>
              );
            })}

                {totalPages > 1 && (
                  <nav
                    aria-label="Audio history pages"
                    className="flex flex-wrap items-center justify-between gap-2 pt-2"
                  >
                    <span className="text-[12px] tabular-nums text-muted">
                      Showing {startIndex + 1}–{Math.min(startIndex + pageSize, jobs.length)} of {jobs.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-ink transition hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft size={13} aria-hidden />
                        Prev
                      </button>
                      <span className="px-2 text-[12px] font-medium tabular-nums text-ink">
                        Page {safePage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage >= totalPages}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-ink transition hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                        <ChevronRight size={13} aria-hidden />
                      </button>
                    </div>
                  </nav>
                )}
              </div>
            );
          })()
        )}
      </section>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="generate AI voices"
        cost={1}
      />
    </div>
  );
}
