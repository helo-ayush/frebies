"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { ImageCompare } from "@/components/arc/image-compare/image-compare";
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
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { StudioDropzone } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  submitWorkerMultipartForm,
  type BrowserWorkerAuth,
} from "@/lib/worker/browser-upload";
import type { StudioImage } from "@/components/tool/studio/types";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  DEFAULT_UPSCALE_SETTINGS,
  SAMPLE_UPSCALE_IMAGES,
  formatBytes,
  formatElapsedClock,
  upscaleCredits,
  upscaleTarget,
  type SampleUpscalePreset,
  type UpscaleJobSnapshot,
  type UpscaleJobStatus,
  type UpscaleSettings,
} from "./model";
import { UpscalerControls } from "./UpscalerControls";

type GpuStatusPayload = {
  state: "ready" | "booting" | "sleeping" | "error";
  warmupState: "ready" | "loading" | "error";
  proUpscalerReady: boolean;
  proUpscalerStep: string;
  modelsLoaded: string[];
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

type CompareViewMode = "split-h" | "split-v" | "loupe" | "result";

const ACTIVE_STATUSES = new Set([
  "queued",
  "waiting_for_server",
  "upscaling",
  "post_processing",
]);
const ITEMS_PER_PAGE = 5;

/** Plain-language job states. The server's own stage text stays in the tooltip. */
const STATUS_LABELS: Record<UpscaleJobStatus, string> = {
  queued: "Queued",
  waiting_for_server: "Starting the server",
  upscaling: "Upscaling",
  post_processing: "Saving",
  completed: "Ready",
  failed: "Failed",
};

const COMPARE_VIEWS: { value: CompareViewMode; label: string }[] = [
  { value: "split-h", label: "Split" },
  { value: "split-v", label: "Stack" },
  { value: "loupe", label: "Zoom" },
  { value: "result", label: "Result" },
];

/** Both left-hand blocks (tool, history) share the column beside the sticky rail. */
const LEFT_COLUMN = "lg:col-start-1 lg:-mr-px lg:self-stretch lg:border-r lg:border-line";
/** Lets a result strip keep a readable title and wrap its buttons on a phone. */
const RESULT_CARD_FIT = "[&>div:nth-child(2)]:basis-[150px] [&>div:last-child]:max-w-full";

const ICON_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
const QUIET_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50";

function tierLabel(tier: UpscaleJobSnapshot["tier"]) {
  return tier === "pro" ? "Best detail" : "Fast";
}

async function buildSampleImageFile(preset: SampleUpscalePreset): Promise<StudioImage> {
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    if (preset.id === "portrait-photo") {
      const sky = ctx.createLinearGradient(0, 0, preset.width, preset.height);
      sky.addColorStop(0, "#f5d0a9");
      sky.addColorStop(0.55, "#e09f7d");
      sky.addColorStop(1, "#3b2f4a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, preset.width, preset.height);

      ctx.fillStyle = "rgba(255, 224, 178, 0.35)";
      ctx.beginPath();
      ctx.arc(preset.width * 0.72, preset.height * 0.25, 42, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2b2233";
      ctx.beginPath();
      ctx.arc(preset.width * 0.45, preset.height * 0.42, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(preset.width * 0.45, preset.height * 0.88, 72, 54, 0, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = "#d99b78";
      ctx.beginPath();
      ctx.arc(preset.width * 0.45, preset.height * 0.44, 28, 0, Math.PI * 2);
      ctx.fill();
    } else if (preset.id === "vector-poster") {
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, preset.width, preset.height);
      ctx.fillStyle = "#141416";
      ctx.fillRect(18, 18, preset.width - 36, 6);
      ctx.fillStyle = "#d95d39";
      ctx.beginPath();
      ctx.arc(preset.width * 0.5, preset.height * 0.5, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbfaf6";
      ctx.beginPath();
      ctx.arc(preset.width * 0.56, preset.height * 0.46, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141416";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillText("STUDIO 04", 20, 56);
      ctx.font = "12px monospace";
      ctx.fillText("4X VECTOR RESTORE", 20, preset.height - 24);
    } else {
      const bg = ctx.createRadialGradient(
        preset.width * 0.5,
        preset.height * 0.45,
        12,
        preset.width * 0.5,
        preset.height * 0.5,
        170,
      );
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(1, "#e7e2d8");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, preset.width, preset.height);

      ctx.fillStyle = "#1f2421";
      ctx.fillRect(preset.width * 0.42, 34, preset.width * 0.16, 26);
      ctx.fillStyle = "#2b6e5c";
      ctx.beginPath();
      ctx.roundRect(preset.width * 0.34, 62, preset.width * 0.32, 134, 18);
      ctx.fill();
      ctx.fillStyle = "#faf8f3";
      ctx.fillRect(preset.width * 0.37, 96, preset.width * 0.26, 64);
      ctx.fillStyle = "#1f2421";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("SERUM 4X", preset.width * 0.39, 124);
      ctx.font = "9px monospace";
      ctx.fillText("NET 50 ML", preset.width * 0.39, 144);
    }
  }

  const mimeType = preset.fileName.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas sample generation failed."))),
      mimeType,
      0.72,
    );
  });

  const file = new File([blob], preset.fileName, { type: mimeType });
  return {
    id: `sample_${preset.id}_${Date.now()}`,
    file,
    preview: URL.createObjectURL(blob),
    width: preset.width,
    height: preset.height,
  };
}

export function UpscalerStudio({ maxSizeMB }: { maxSizeMB: number }) {
  const { isLoaded, isSignedIn } = useAuthSession();
  const queue = useImageQueue({
    maxFiles: 1,
    maxSizeMB,
    formatHint: "JPG, PNG, WebP, AVIF, or HEIC",
    noun: "image",
  });

  const [settings, setSettings] = useState<UpscaleSettings>(DEFAULT_UPSCALE_SETTINGS);
  const [sampleItem, setSampleItem] = useState<StudioImage | null>(null);
  const samplePreviewRef = useRef<string | null>(null);

  const [gpuStatus, setGpuStatus] = useState<GpuStatusPayload | null>(null);
  const [workerAuth, setWorkerAuth] = useState<BrowserWorkerAuth | null>(null);
  const [jobs, setJobs] = useState<UpscaleJobSnapshot[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wakingGpu, setWakingGpu] = useState(false);
  /** The job started from the image on the stage, so its progress and result show there. */
  const [featuredJobId, setFeaturedJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCreditGate, setShowCreditGate] = useState(false);

  const [compareJobId, setCompareJobId] = useState<string | null>(null);
  const [compareView, setCompareView] = useState<CompareViewMode>("split-h");
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 50,
    active: false,
  });
  const [page, setPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const stagedSource = queue.activeItem ?? sampleItem;
  const stagedSourceId = stagedSource?.id ?? null;

  // A different image on the stage means the previous run no longer belongs there.
  useEffect(() => {
    setFeaturedJobId(null);
  }, [stagedSourceId]);

  useEffect(() => {
    return () => {
      if (samplePreviewRef.current) {
        URL.revokeObjectURL(samplePreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (queue.activeItem && samplePreviewRef.current) {
      URL.revokeObjectURL(samplePreviewRef.current);
      samplePreviewRef.current = null;
      setSampleItem(null);
    }
  }, [queue.activeItem]);

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
      const res = await fetch(`/api/image/upscale/status${force ? "?force=1" : ""}`, {
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
      const res = await fetch("/api/image/upscale/jobs", { cache: "no-store" });
      if (res.status === 401) return;
      if (!res.ok) return;
      const data = (await res.json()) as {
        jobs?: UpscaleJobSnapshot[];
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
    const shouldFastPoll =
      hasActiveJobs || gpuStatus?.state === "booting" || Boolean(jobs.length && !gpuStatus);
    const intervalMs = hasActiveJobs ? 2500 : gpuStatus?.state === "booting" ? 4000 : 25000;
    if (!shouldFastPoll && !isSignedIn) return;
    const timer = window.setInterval(() => {
      if (isSignedIn) {
        void fetchJobs();
      } else {
        void fetchStatus(false);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [fetchJobs, fetchStatus, gpuStatus, hasActiveJobs, isSignedIn, jobs.length]);

  const compareJob = useMemo(() => {
    if (!compareJobId) return null;
    return jobs.find((j) => j.id === compareJobId && j.status === "completed") ?? null;
  }, [compareJobId, jobs]);

  const totalPages = Math.max(1, Math.ceil(jobs.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = jobs.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  function handlePatch(patch: Partial<UpscaleSettings>) {
    setSettings((cur) => ({ ...cur, ...patch }));
  }

  function handleQueueFileChange(event: ChangeEvent<HTMLInputElement>) {
    setCompareJobId(null);
    setErrorMsg(null);
    queue.onPick(event);
  }

  async function handleSelectSample(preset: SampleUpscalePreset) {
    setCompareJobId(null);
    setErrorMsg(null);
    queue.clearAll();
    try {
      const sample = await buildSampleImageFile(preset);
      if (samplePreviewRef.current) {
        URL.revokeObjectURL(samplePreviewRef.current);
      }
      samplePreviewRef.current = sample.preview;
      setSampleItem(sample);
      setSettings((cur) => ({
        ...cur,
        tier: preset.suggestedTier,
        engineModel: preset.suggestedModel,
        profile: preset.suggestedProfile,
      }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not generate sample image.");
    }
  }

  async function handleWakeGpu() {
    if (!isSignedIn) {
      setShowCreditGate(true);
      return;
    }
    setWakingGpu(true);
    try {
      const res = await fetch("/api/image/upscale/status", { method: "POST" });
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
    if (!stagedSource) return;
    if (!isSignedIn) {
      setShowCreditGate(true);
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const form = new FormData();
      form.append("file", stagedSource.file);
      form.append("originalWidth", String(stagedSource.width ?? 0));
      form.append("originalHeight", String(stagedSource.height ?? 0));
      form.append("settings", JSON.stringify(settings));

      const res = await submitWorkerMultipartForm({
        workerAuth,
        refreshStatusUrl: "/api/image/upscale/status",
        onWorkerAuth: setWorkerAuth,
        workerPath: "/api/image/upscale/jobs",
        proxyPath: "/api/image/upscale/jobs",
        form,
        fileSizeBytes: stagedSource.file.size,
      });

      if (res.status === 401) {
        setShowCreditGate(true);
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        job?: UpscaleJobSnapshot;
        error?: string;
      } | null;

      if (!res.ok || !data?.job) {
        throw new Error(data?.error || `Upscale submission failed (HTTP ${res.status}).`);
      }

      setJobs((prev) => [data.job!, ...prev.filter((item) => item.id !== data.job!.id)]);
      setPage(1);
      setFeaturedJobId(data.job.id);
      void fetchJobs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not submit upscale job.");
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
    const res = await fetch(`/api/image/upscale/jobs/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      job?: UpscaleJobSnapshot;
      error?: string;
    } | null;
    if (!res.ok || !data?.job) {
      setErrorMsg(data?.error || "Could not retry this upscale job.");
      return;
    }
    setJobs((prev) => [data.job!, ...prev]);
    setPage(1);
  }

  async function handleDeleteJob(id: string) {
    const res = await fetch(`/api/image/upscale/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorMsg(data?.error || "Cannot delete job right now.");
      return;
    }
    if (compareJobId === id) setCompareJobId(null);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const targetDims = upscaleTarget(
    stagedSource?.width ?? 0,
    stagedSource?.height ?? 0,
    settings.factor,
    settings.targetPreset,
  );
  const creditCost = upscaleCredits(settings.tier, settings.factor);

  const featuredJob = featuredJobId ? (jobs.find((job) => job.id === featuredJobId) ?? null) : null;
  const finishedFeatured =
    featuredJob && featuredJob.status === "completed" && featuredJob.outputUrl ? featuredJob : null;
  /** The finished upscale shown on the stage: one opened from the list, or the run that just ended. */
  const resultJob = compareJob?.outputUrl ? compareJob : finishedFeatured;
  const runningJob =
    !resultJob && featuredJob && ACTIVE_STATUSES.has(featuredJob.status) ? featuredJob : null;
  const failedJob = !resultJob && featuredJob?.status === "failed" ? featuredJob : null;

  const needsSignIn = isLoaded && !isSignedIn;
  const hasTarget = targetDims.width > 0 && targetDims.height > 0;
  const targetText = `${targetDims.width} × ${targetDims.height}`;
  const runLabel = !stagedSource
    ? "Upscale image"
    : needsSignIn
      ? `Sign in to upscale ${settings.factor}×`
      : settings.targetPreset === "exact"
        ? hasTarget
          ? `Upscale ${settings.factor}× to ${targetText}`
          : `Upscale ${settings.factor}×`
        : hasTarget
          ? `Upscale to ${targetText}`
          : "Upscale image";
  const costText = `${creditCost} ${creditCost === 1 ? "credit" : "credits"}`;

  const serverState = gpuStatus?.state ?? null;
  const serverText = !gpuStatus
    ? "Checking the server…"
    : serverState === "ready"
      ? "Server ready"
      : serverState === "booting"
        ? `Server starting · ${formatElapsedClock(gpuStatus.bootElapsedMs)}`
        : serverState === "error"
          ? "Server hit an error. Try waking it."
          : "Server asleep. It wakes when you upscale.";
  const serverDot =
    serverState === "ready"
      ? "bg-success"
      : serverState === "booting"
        ? "animate-pulse bg-promo"
        : serverState === "error"
          ? "bg-danger"
          : "bg-[#b9b4a8]";

  function dismissResult() {
    setCompareJobId(null);
    setFeaturedJobId(null);
  }

  function clearSource() {
    queue.clearAll();
    setSampleItem(null);
  }

  function startOver() {
    dismissResult();
    clearSource();
  }

  return (
    <>
      <StudioFrame
        id="image-upscaler"
        label="Image upscaler studio"
        fill={false}
        gridClassName={`${STUDIO_GRID} lg:grid-rows-[auto_1fr]`}
      >
        {/* 1 · Image in, compare, result */}
        <StudioStage className={`lg:row-start-1 ${LEFT_COLUMN}`}>
          <div className="flex min-h-0 flex-col gap-3 lg:h-[calc(100dvh-236px)] lg:max-h-[820px] lg:min-h-[480px]">
            {resultJob && resultJob.outputUrl ? (
              <>
                <ResultCard
                  className={RESULT_CARD_FIT}
                  title={`${resultJob.sourceFileName} is ready`}
                  meta={`${resultJob.width} × ${resultJob.height} · ${resultJob.format.toUpperCase()}${
                    resultJob.byteLength ? ` · ${formatBytes(resultJob.byteLength)}` : ""
                  }`}
                >
                  {resultJob.downloadUrl ? (
                    <a
                      href={resultJob.downloadUrl}
                      download={resultJob.fileName}
                      className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2"
                    >
                      <Download size={15} aria-hidden />
                      Download
                    </a>
                  ) : null}
                </ResultCard>

                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={STAGE_LABEL}>Before and after</span>
                    <Chip>
                      {resultJob.originalWidth || "?"} × {resultJob.originalHeight || "?"} →{" "}
                      {resultJob.width || "?"} × {resultJob.height || "?"}
                    </Chip>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Segmented
                      label="Compare view"
                      className="w-[260px] max-w-full border border-line"
                      options={COMPARE_VIEWS}
                      value={compareView}
                      onChange={setCompareView}
                    />
                    <button
                      type="button"
                      onClick={dismissResult}
                      aria-label="Close result"
                      title="Close result"
                      className={ICON_BUTTON}
                    >
                      <X size={15} aria-hidden />
                    </button>
                  </div>
                </div>

                <div
                  className={`relative h-[320px] shrink-0 overflow-hidden rounded-[16px] border border-line bg-[#f3f1ec] sm:h-[420px] lg:h-auto lg:min-h-0 lg:flex-1 ${
                    compareView === "loupe" ? "cursor-crosshair" : ""
                  }`}
                  onMouseMove={
                    compareView === "loupe"
                      ? (e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                          const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                          setLoupePos({ x, y, active: true });
                        }
                      : undefined
                  }
                  onMouseLeave={
                    compareView === "loupe"
                      ? () => setLoupePos((p) => ({ ...p, active: false }))
                      : undefined
                  }
                >
                  {compareView === "split-h" || compareView === "split-v" ? (
                    <ImageCompare
                      orientation={compareView === "split-v" ? "vertical" : "horizontal"}
                      aspectRatio="auto"
                      className="!absolute inset-0 !h-full !w-full"
                      labels={["Original", `Upscaled ${resultJob.factor}×`]}
                      before={
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resultJob.sourceUrl ?? resultJob.outputUrl}
                          alt="Original"
                          className="h-full w-full bg-[#f3f1ec] object-contain"
                        />
                      }
                      after={
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resultJob.outputUrl}
                          alt="Upscaled"
                          className="h-full w-full bg-[#f3f1ec] object-contain"
                        />
                      }
                    />
                  ) : compareView === "loupe" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resultJob.outputUrl}
                        alt="Upscaled image, hover to zoom"
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                      {loupePos.active ? (
                        <div
                          className="pointer-events-none absolute h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                          style={{
                            left: `${loupePos.x}%`,
                            top: `${loupePos.y}%`,
                            backgroundImage: `url(${resultJob.outputUrl})`,
                            backgroundSize: "300%",
                            backgroundPosition: `${loupePos.x}% ${loupePos.y}%`,
                          }}
                        />
                      ) : null}
                      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-[12px] font-medium text-white">
                        Move the cursor to zoom in 3×
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultJob.outputUrl}
                      alt={resultJob.fileName}
                      className="absolute inset-0 h-full w-full object-contain p-2"
                    />
                  )}
                </div>
              </>
            ) : !stagedSource ? (
              <StudioDropzone
                title="Drop an image to upscale"
                description="Make it 2× or 4× larger with sharper detail, then compare before and after."
                buttonLabel="Choose an image"
                limits={`JPG, PNG, WebP, AVIF or HEIC · up to ${maxSizeMB} MB`}
                note="Runs on our server. Results are kept for 24 hours."
                onChoose={() => queue.openPicker()}
                dragging={queue.dragging}
                onDragOver={queue.onDragOver}
                onDragLeave={queue.onDragLeave}
                onDrop={queue.onDrop}
                minHeightClass="min-h-[380px] lg:min-h-0"
                chips={
                  <>
                    <span className="self-center text-[12.5px] text-faint">Or try a sample:</span>
                    {SAMPLE_UPSCALE_IMAGES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSelectSample(sample);
                        }}
                        className="inline-flex h-7 items-center rounded-full border border-line bg-white px-3 text-[12px] font-medium text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </>
                }
              />
            ) : (
              <div
                className="flex min-h-0 flex-1 flex-col gap-3"
                onDragOver={queue.onDragOver}
                onDragLeave={queue.onDragLeave}
                onDrop={queue.onDrop}
              >
                {runningJob ? (
                  <Note>
                    {STATUS_LABELS[runningJob.status]}. It keeps running if you leave this page, and the
                    result is saved under Your upscales.
                  </Note>
                ) : null}
                {failedJob ? (
                  <Note tone="error">
                    {failedJob.error || "The upscale failed."} Change a setting or try again.
                  </Note>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <span className={STAGE_LABEL}>Original</span>
                  <Chip>
                    {stagedSource.width ?? "?"} × {stagedSource.height ?? "?"}
                    {hasTarget ? ` → ${targetText}` : ""}
                  </Chip>
                </div>

                <div
                  className={`relative min-h-[280px] flex-1 overflow-hidden rounded-[16px] border transition-colors lg:min-h-0 ${
                    queue.dragging ? "border-accent bg-accent-soft" : "border-line bg-[#f3f1ec]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stagedSource.preview}
                    alt={stagedSource.file.name}
                    className="absolute inset-0 h-full w-full object-contain p-3"
                  />
                </div>

                <FileRow
                  icon={<ImageIcon size={16} aria-hidden />}
                  name={stagedSource.file.name}
                  meta={`${formatBytes(stagedSource.file.size)}${
                    stagedSource.width && stagedSource.height
                      ? ` · ${stagedSource.width} × ${stagedSource.height}`
                      : ""
                  }`}
                  onReplace={() => queue.openPicker()}
                  onRemove={clearSource}
                />
              </div>
            )}

            <input
              ref={queue.inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              tabIndex={-1}
              aria-label="Choose an image"
              className="sr-only"
              onChange={handleQueueFileChange}
            />

            {queue.error ? (
              <Note tone="error" className="shrink-0">
                {queue.error}
              </Note>
            ) : null}
            {errorMsg ? (
              <Note tone="error" className="shrink-0">
                {errorMsg}
              </Note>
            ) : null}
          </div>
        </StudioStage>

        {/* 2 · Action + settings (sticky on desktop, docked on phones) */}
        <StudioRail
          sticky
          label="Upscale settings"
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          action={
            resultJob?.downloadUrl ? (
              <>
                <DownloadAction
                  href={resultJob.downloadUrl}
                  filename={resultJob.fileName}
                  label={`Download ${resultJob.format.toUpperCase()}`}
                  hint={`${resultJob.width} × ${resultJob.height}${
                    resultJob.byteLength ? ` · ${formatBytes(resultJob.byteLength)}` : ""
                  }`}
                />
                <ActionRow>
                  {stagedSource ? (
                    <SecondaryAction onClick={dismissResult} icon={<Sparkles size={13} aria-hidden />}>
                      {compareJob ? "Back to image" : "Upscale again"}
                    </SecondaryAction>
                  ) : null}
                  <StartOverAction onClick={startOver} label="New image" />
                </ActionRow>
              </>
            ) : (
              <PrimaryAction
                label={runLabel}
                busyLabel={runningJob ? `${STATUS_LABELS[runningJob.status]}…` : "Uploading…"}
                icon={
                  stagedSource && needsSignIn ? (
                    <Lock size={15} aria-hidden />
                  ) : (
                    <Sparkles size={16} aria-hidden />
                  )
                }
                busy={submitting || Boolean(runningJob)}
                progress={runningJob ? runningJob.progress / 100 : undefined}
                disabled={!stagedSource}
                onClick={() => void handleSubmitJob()}
                hint={stagedSource ? `${costText} · saved for 24 hours` : "Add an image to get started"}
              />
            )
          }
        >
          <UpscalerControls
            settings={settings}
            onPatch={handlePatch}
            onReset={() => setSettings(DEFAULT_UPSCALE_SETTINGS)}
            sourceWidth={stagedSource?.width ?? 0}
            sourceHeight={stagedSource?.height ?? 0}
            hasImage={Boolean(stagedSource)}
            proUpscalerReady={Boolean(gpuStatus?.proUpscalerReady)}
            disabled={submitting}
          />

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-[12.5px] text-muted">
            <span role="status" className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${serverDot}`} aria-hidden />
              <span className="min-w-0">{serverText}</span>
            </span>
            {gpuStatus && gpuStatus.state !== "ready" ? (
              <button
                type="button"
                onClick={() => void handleWakeGpu()}
                disabled={wakingGpu}
                className={`${QUIET_BUTTON} shrink-0`}
              >
                {wakingGpu ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  <Zap size={13} aria-hidden />
                )}
                Wake now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void fetchStatus(true)}
                className={`${QUIET_BUTTON} shrink-0`}
              >
                <RefreshCw size={13} aria-hidden />
                Refresh
              </button>
            )}
          </div>
        </StudioRail>

        {/* 3 · Everything upscaled in the last 24 hours */}
        <StudioStage className={`border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <section aria-label="Your upscaled images">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                Your upscales
                {jobs.length > 0 ? <Chip>{jobs.length}</Chip> : null}
              </h2>
              {jobs.length > ITEMS_PER_PAGE ? (
                <div className="flex items-center gap-1 text-[12.5px] text-muted">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={`${ICON_BUTTON} disabled:pointer-events-none disabled:opacity-40`}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} aria-hidden />
                  </button>
                  <span className="px-1 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={`${ICON_BUTTON} disabled:pointer-events-none disabled:opacity-40`}
                    aria-label="Next page"
                  >
                    <ChevronRight size={15} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-faint">
              Kept for 24 hours. Older items may be cleared sooner when space is needed.
            </p>

            {!isLoaded ? null : !isSignedIn ? (
              <p className="mt-3 text-[13px] text-muted">
                Sign in to upscale images and find them here from any device.
              </p>
            ) : loadingJobs && jobs.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Loading your upscales…
              </p>
            ) : jobs.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                Nothing here yet. Finished upscales show up in this list.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;
                  const isOpen = resultJob?.id === job.id;

                  return (
                    <li
                      key={job.id}
                      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border bg-white p-2.5 ${
                        isOpen ? "border-ink" : "border-line"
                      }`}
                    >
                      {job.outputUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={job.outputUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-[9px] border border-line bg-card object-cover"
                        />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[9px] bg-card text-muted">
                          {isRunning ? (
                            <Loader2 size={17} className="animate-spin text-accent" aria-hidden />
                          ) : (
                            <ImageIcon size={17} aria-hidden />
                          )}
                        </span>
                      )}

                      <div className="min-w-0 flex-1 basis-[200px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">
                            {job.sourceFileName}
                          </span>
                          {job.status === "completed" ? (
                            <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                          ) : null}
                        </div>
                        <p
                          className="mt-0.5 text-[12px] leading-snug text-faint"
                          title={`${job.modelLabel} · ${job.precision}`}
                        >
                          <span className="tabular-nums">
                            {job.originalWidth || "?"} × {job.originalHeight || "?"} → {job.width || "?"} ×{" "}
                            {job.height || "?"}
                          </span>
                          {" · "}
                          {job.format.toUpperCase()}
                          {job.byteLength ? ` · ${formatBytes(job.byteLength)}` : ""}
                          {" · "}
                          {tierLabel(job.tier)} ({job.modelLabel})
                          {" · "}
                          <span className="tabular-nums">{formatElapsedClock(elapsed)}</span>
                        </p>

                        {isRunning ? (
                          <div className="mt-1.5" title={job.stageLabel}>
                            <div className="flex items-center justify-between text-[12px] text-muted">
                              <span>{STATUS_LABELS[job.status]}…</span>
                              <span className="tabular-nums">{job.progress}%</span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${job.sourceFileName} upscale progress`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={job.progress}
                              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line"
                            >
                              <div
                                className="h-full rounded-full bg-accent transition-all duration-300"
                                style={{ width: `${Math.max(6, job.progress)}%` }}
                              />
                            </div>
                          </div>
                        ) : isFailed ? (
                          <p className="mt-1 text-[12px] text-danger">{job.error || "Upscale failed."}</p>
                        ) : null}
                      </div>

                      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1">
                        {job.status === "completed" && job.outputUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setCompareJobId(job.id)}
                              className={QUIET_BUTTON}
                            >
                              <Columns2 size={13} aria-hidden />
                              Compare
                            </button>
                            {job.downloadUrl ? (
                              <a
                                href={job.downloadUrl}
                                download={job.fileName}
                                aria-label={`Download ${job.fileName}`}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12.5px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-1"
                              >
                                <Download size={13} aria-hidden />
                                Download
                              </a>
                            ) : null}
                          </>
                        ) : null}

                        {!isRunning ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleRetryJob(job.id)}
                              title="Upscale this image again"
                              aria-label={`Upscale ${job.sourceFileName} again`}
                              className={ICON_BUTTON}
                            >
                              <RotateCcw size={14} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteJob(job.id)}
                              title="Delete"
                              aria-label={`Delete ${job.sourceFileName}`}
                              className={`${ICON_BUTTON} hover:!text-danger`}
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </>
                        ) : null}
                      </div>
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
        action="upscale this image"
        cost={creditCost}
      />
    </>
  );
}
