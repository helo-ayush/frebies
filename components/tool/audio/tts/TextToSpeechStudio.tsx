"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Progress } from "@/components/arc/progress/progress";
import { useAuthSession } from "@/components/auth/AuthContext";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  Chip,
  Note,
  PrimaryAction,
  ResultCard,
  STUDIO_GRID,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { buttonClasses } from "@/components/ui/Button";
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
  TTS_CREDITS_PER_1K,
  TTS_LANGUAGES,
  TTS_MAX_CHARS,
  TTS_STYLES,
  estimateSpeechSeconds,
  formatElapsedClock,
  speechCredits,
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

/** State tag for a history row. Finished clips need none: the player says it. */
function jobStatusTag(job: TtsJobSnapshot): { label: string; className: string } | null {
  switch (job.status) {
    case "waiting_for_server":
      return { label: "Warming up", className: "bg-[#fdf9f2] text-[#77603f]" };
    case "queued":
      return {
        label: job.queuePosition ? `Queued #${job.queuePosition}` : "Queued",
        className: "bg-card text-muted",
      };
    case "synthesizing":
      return {
        label: job.chunksTotal > 1 ? `Creating ${job.chunksDone}/${job.chunksTotal}` : "Creating",
        className: "bg-accent-soft text-accent-deep",
      };
    case "processing_audio":
      return {
        label: `Saving ${job.format.toUpperCase()}`,
        className: "bg-accent-soft text-accent-deep",
      };
    case "completed":
      return null;
    case "failed":
      return { label: "Failed", className: "bg-danger-soft text-danger" };
  }
}

const DRAFT_SCRIPT_STORAGE_KEY = "frebies.tts.draftScript.v1";

/** Both left-hand blocks (script, history) share the column beside the sticky rail. */
const LEFT_COLUMN = "lg:col-start-1 lg:-mr-px lg:self-stretch lg:border-r lg:border-line";
/**
 * ResultCard keeps its buttons on one unshrinkable row. This lets the title keep
 * a readable width and the buttons wrap, so nothing is cut off on a phone.
 */
const RESULT_CARD_FIT = "[&>div:nth-child(2)]:basis-[150px] [&>div:last-child]:max-w-full";
const QUIET_LINK =
  "font-medium text-muted underline decoration-[#cfc9bd] underline-offset-4 transition-colors hover:text-ink hover:decoration-ink";

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
  const resultsRef = useRef<HTMLDivElement>(null);
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

  const signedOut = isLoaded && !isSignedIn;
  const credits = speechCredits(text);
  const latestJob = jobs[0] ?? null;
  const ttlHours = storage?.ttlHours ?? 24;

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleJobs = jobs.slice(startIndex, startIndex + pageSize);

  return (
    <>
      <StudioFrame
        id="text-to-speech"
        label="Text to speech studio"
        fill={false}
        gridClassName={`${STUDIO_GRID} lg:grid-rows-[auto_1fr]`}
      >
        {/* ============================================================ */}
        {/* 1 · Script                                                    */}
        {/* ============================================================ */}
        <StudioStage className={`gap-3 lg:row-start-1 ${LEFT_COLUMN}`}>
          {/* Scroll target: the newest clip and any error show up right here. */}
          <div ref={resultsRef} aria-hidden className="-mb-3 h-0 scroll-mt-24" />

          {pool && !pool.configured && (
            <Note tone="error">
              Voice generation is temporarily unavailable. Please try again shortly.
            </Note>
          )}

          {pool && pool.configured && queueing && (
            <Note tone="warn">
              The voice engine is starting up ({formatElapsedClock(displayBootElapsedMs)}). Queue
              your script now and it will start on its own.
            </Note>
          )}

          {submitError && <Note tone="error">{submitError}</Note>}

          {latestJob && (
            <LatestJob
              job={latestJob}
              elapsedMs={
                ACTIVE_STATUSES.has(latestJob.status)
                  ? latestJob.elapsedMs + driftMs
                  : latestJob.elapsedMs
              }
              retrying={retryingId === latestJob.id}
              onRetry={() => handleRetry(latestJob.id)}
            />
          )}

          <div
            className={`flex flex-col overflow-hidden rounded-[16px] border bg-white transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_4px_rgba(15,15,16,0.05)] ${
              overLimit
                ? "border-danger focus-within:border-danger"
                : "border-line focus-within:border-ink/40"
            }`}
          >
            <textarea
              id="tts-script-input"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="Type or paste what you want spoken…"
              rows={8}
              aria-label="Script to turn into speech"
              aria-invalid={overLimit || undefined}
              className="block min-h-[220px] w-full resize-y bg-transparent px-4 py-4 text-[16px] leading-[1.65] text-ink placeholder:text-faint focus:outline-none sm:px-5 sm:py-5 lg:h-[min(calc(100dvh_-_440px),520px)] lg:min-h-[260px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line-soft px-4 py-2.5 text-[12.5px] text-faint sm:px-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                <span className={overLimit ? "font-semibold text-danger" : ""}>
                  {charCount.toLocaleString()} / {TTS_MAX_CHARS.toLocaleString()} characters
                </span>
                {wordCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>about {formatTime(estSeconds)} of audio</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-faint lg:inline">Ctrl + Enter to generate</span>
                {!hasText ? (
                  <button
                    type="button"
                    onClick={() => {
                      setText(SAMPLE_SCRIPT);
                      setSubmitError(null);
                    }}
                    className={QUIET_LINK}
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
                    className={QUIET_LINK}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {overLimit && (
            <Note tone="error">
              Keep your script under {TTS_MAX_CHARS.toLocaleString()} characters.
            </Note>
          )}

          <CueBar onInsertTag={insertExpressionTag} />

          {/* Phones: the settings sit below the script, so offer a jump to them. */}
          <button
            type="button"
            onClick={() => openSettings("voice")}
            className="flex items-center gap-2.5 rounded-[12px] border border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-[#cfc9bd] lg:hidden"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                Voice: {voiceLabel}
                {customVoice ? " (cloned)" : ""}
              </span>
              <span className="block truncate text-[12px] text-faint">
                {langLabel} · {styleLabel} · {settings.speed.toFixed(2)}× · {settings.format.toUpperCase()}
              </span>
            </span>
            <span className="shrink-0 text-[12.5px] font-medium text-muted">Change</span>
            <ChevronRight size={15} className="shrink-0 text-faint" aria-hidden />
          </button>
        </StudioStage>

        {/* ============================================================ */}
        {/* 2 · Action + settings (sticky on desktop, docked on phones)   */}
        {/* ============================================================ */}
        <StudioRail
          sticky
          label="Voice and output settings"
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          action={
            <PrimaryAction
              label={signedOut ? "Sign in to generate" : queueing ? "Queue speech" : "Generate speech"}
              busyLabel="Starting…"
              icon={
                signedOut ? <Lock size={15} aria-hidden /> : <AudioLines size={16} aria-hidden />
              }
              busy={submitting}
              disabled={!isLoaded || (isSignedIn && !hasText) || overLimit}
              onClick={handleGenerate}
              hint={
                overLimit ? (
                  <span className="text-danger">
                    {(charCount - TTS_MAX_CHARS).toLocaleString()} characters over the limit
                  </span>
                ) : hasText ? (
                  <>
                    <span>{voiceLabel}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{charCount.toLocaleString()} characters</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {credits} {credits === 1 ? "credit" : "credits"}
                    </span>
                  </>
                ) : (
                  `${TTS_CREDITS_PER_1K} credit per 1,000 characters`
                )
              }
            />
          }
        >
          <div id="tts-settings-panel" className="scroll-mt-20 space-y-5">
            <SettingsTabs value={activeTab} onChange={setActiveTab} />

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
        </StudioRail>

        {/* ============================================================ */}
        {/* 3 · Everything generated so far                               */}
        {/* ============================================================ */}
        <StudioStage className={`border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <section aria-label="Your generated audio">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                Your audio
                {jobs.length > 0 && <Chip>{jobs.length}</Chip>}
              </h2>
              <p className="text-[12.5px] text-faint">
                Kept for {ttlHours} hours. Older clips can be cleared sooner if space runs out.
              </p>
            </div>

            {jobsLoading && jobs.length === 0 && isSignedIn ? (
              <div className="mt-4 space-y-4" aria-busy="true" aria-label="Loading audio history">
                {[0, 1].map((skeletonIdx) => (
                  <div key={skeletonIdx} className="animate-pulse space-y-2.5">
                    <div className="h-3.5 w-3/5 rounded-full bg-[#ebe8e1]" />
                    <div className="h-3 w-1/3 rounded-full bg-[#f0ede7]" />
                    <div className="h-[104px] rounded-[14px] bg-white" />
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              signedOut ? (
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  Sign in to generate speech. Your clips and cloned voices stay private to your
                  account.{" "}
                  <button
                    type="button"
                    onClick={() => setGateOpen(true)}
                    className="font-medium text-ink underline decoration-[#cfc9bd] underline-offset-4 transition-colors hover:decoration-ink"
                  >
                    Sign in or create a free account
                  </button>
                </p>
              ) : (
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  Nothing generated yet. Clips you make appear here with a player and a download
                  button.
                </p>
              )
            ) : (
              <>
                <ul className="mt-1 divide-y divide-line">
                  {visibleJobs.map((job) => {
                    const tag = jobStatusTag(job);
                    const isActive = ACTIVE_STATUSES.has(job.status);
                    const canDelete =
                      job.status !== "synthesizing" && job.status !== "processing_audio";
                    const liveJobElapsed = isActive ? job.elapsedMs + driftMs : job.elapsedMs;
                    const format = job.format.toUpperCase();

                    return (
                      <li key={job.id} className="py-4 last:pb-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">
                              {job.textPreview}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
                              {tag && (
                                <span
                                  className={`inline-flex h-6 items-center rounded-full px-2 text-[12px] font-medium tabular-nums ${tag.className}`}
                                >
                                  {tag.label}
                                </span>
                              )}
                              <span>{job.voiceName}</span>
                              <span aria-hidden>·</span>
                              <span>{format}</span>
                              {job.status === "completed" && job.durationSeconds ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="tabular-nums">
                                    {formatTime(job.durationSeconds, true)}
                                  </span>
                                </>
                              ) : null}
                              {job.status === "completed" && job.byteLength ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="tabular-nums">{formatBytes(job.byteLength)}</span>
                                </>
                              ) : null}
                              {isActive && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="tabular-nums">
                                    {formatElapsedClock(liveJobElapsed)}
                                  </span>
                                </>
                              )}
                              {!isActive && job.expiresAt && (
                                <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                              )}
                            </div>
                          </div>

                          {canDelete && (
                            <button
                              type="button"
                              aria-label="Remove audio item"
                              title="Remove"
                              disabled={deletingId === job.id}
                              onClick={() => handleDeleteJob(job.id)}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
                            >
                              <Trash2 size={15} aria-hidden />
                            </button>
                          )}
                        </div>

                        {isActive && (
                          <div className="mt-3">
                            <Progress
                              value={job.progress}
                              max={100}
                              label={friendlyJobStage(job)}
                              showValue
                            />
                          </div>
                        )}

                        {job.status === "completed" && job.audioUrl && (
                          <div className="mt-3 space-y-2.5">
                            <AudioPlayer
                              src={job.audioUrl}
                              duration={Math.max(1, job.durationSeconds ?? 1)}
                              peaks={job.peaks}
                              fileName={job.fileName}
                              formatLabel={format}
                              compact
                            />
                            {job.downloadUrl && (
                              <div className="flex justify-end">
                                <a
                                  href={job.downloadUrl}
                                  download={job.fileName}
                                  className={buttonClasses("secondary", "md", "h-10 rounded-[12px]")}
                                >
                                  <Download size={14} aria-hidden />
                                  Download {format}
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {job.status === "failed" && (
                          <FailedNote
                            className="mt-3"
                            message={friendlyJobError(job.error)}
                            retrying={retryingId === job.id}
                            onRetry={() => handleRetry(job.id)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>

                {totalPages > 1 && (
                  <nav
                    aria-label="Audio history pages"
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"
                  >
                    <span className="text-[12.5px] tabular-nums text-muted">
                      Showing {startIndex + 1}–{Math.min(startIndex + pageSize, jobs.length)} of{" "}
                      {jobs.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className={buttonClasses("secondary", "md")}
                      >
                        <ChevronLeft size={14} aria-hidden />
                        Prev
                      </button>
                      <span className="px-2 text-[12.5px] font-medium tabular-nums text-ink">
                        Page {safePage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage >= totalPages}
                        className={buttonClasses("secondary", "md")}
                      >
                        Next
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>
        </StudioStage>
      </StudioFrame>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="generate speech"
        cost={1}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

/** Play / pause for the newest clip, without opening the full player. */
function ClipPlayButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        data-sound="none"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Pause the newest clip" : "Play the newest clip"}
        className={buttonClasses("secondary", "lg", "min-w-[96px]")}
      >
        {playing ? (
          <Pause size={15} fill="currentColor" aria-hidden />
        ) : (
          <Play size={15} fill="currentColor" aria-hidden />
        )}
        {playing ? "Pause" : "Play"}
      </button>
    </>
  );
}

function FailedNote({
  message,
  retrying,
  onRetry,
  className = "",
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Note tone="error" className={className}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-[200px] break-words">{message}</span>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#f1cfc9] bg-white px-3 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
        >
          {retrying ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <RotateCcw size={13} aria-hidden />
          )}
          Try again
        </button>
      </span>
    </Note>
  );
}

/** The newest job, pinned above the script: progress, then play + download. */
function LatestJob({
  job,
  elapsedMs,
  retrying,
  onRetry,
}: {
  job: TtsJobSnapshot;
  elapsedMs: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (job.status === "failed") {
    return <FailedNote message={friendlyJobError(job.error)} retrying={retrying} onRetry={onRetry} />;
  }

  if (job.status === "completed") {
    if (!job.audioUrl) return null;
    const format = job.format.toUpperCase();
    const meta = [
      job.voiceName,
      job.durationSeconds ? formatTime(job.durationSeconds) : null,
      format,
      job.byteLength ? formatBytes(job.byteLength) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <ResultCard className={RESULT_CARD_FIT} title="Your audio is ready" meta={meta}>
        <ClipPlayButton src={job.audioUrl} />
        {job.downloadUrl && (
          <a
            href={job.downloadUrl}
            download={job.fileName}
            className={buttonClasses("success", "lg")}
          >
            <Download size={15} aria-hidden />
            Download {format}
          </a>
        )}
      </ResultCard>
    );
  }

  return (
    <div className="rounded-[14px] border border-accent/30 bg-white px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13.5px] font-medium text-ink">{job.textPreview}</p>
        <span className="shrink-0 text-[12.5px] tabular-nums text-faint">
          {formatElapsedClock(elapsedMs)}
        </span>
      </div>
      <Progress value={job.progress} max={100} label={friendlyJobStage(job)} showValue />
    </div>
  );
}
