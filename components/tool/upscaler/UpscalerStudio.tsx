"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  Cpu,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Rows2,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { ImageCompare } from "@/components/arc/image-compare/image-compare";
import {
  GenerationExpiryBadge,
  GenerationStorageNotice,
} from "@/components/tool/GenerationRetentionBadge";
import { CreditGate } from "@/components/tool/paid/CreditGate";
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
  const { isSignedIn } = useAuthSession();
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
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
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
    setSubmitBanner(null);
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
      setSubmitBanner(
        `Queued ${stagedSource.file.name} (${settings.factor}×). Saved for 24h in your vault — feel free to queue another image.`,
      );
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: Workspace Stage & Async Queue */}
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
                  ? `${gpuStatus.hardware?.device || "NVIDIA L20"} Ready`
                  : gpuStatus?.state === "booting"
                    ? `Starting L20 GPU engine (${formatElapsedClock(gpuStatus.bootElapsedMs)})`
                    : "GPU worker in sleep mode (auto-wakes on submit)"}
              </span>
              {gpuStatus?.state === "ready" ? (
                <span className="hidden rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[10.5px] font-medium text-muted sm:inline-flex">
                  {gpuStatus.proUpscalerReady
                    ? "Free FP16 + Pro SeedVR2-3B FP8 loaded"
                    : "Free FP16 loaded · Pro SeedVR2-3B warming"}
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
                Wake GPU now
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
            ref={queue.inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={handleQueueFileChange}
          />

          {/* Interactive Compare Mode vs Staged Input Dropzone */}
          {compareJob && compareJob.outputUrl ? (
            <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(15,15,16,0.04)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">
                      {compareJob.sourceFileName}
                    </span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                      {compareJob.modelLabel} · {compareJob.precision}
                    </span>
                    <span className="text-[11px] font-medium text-muted tabular-nums">
                      {compareJob.originalWidth}×{compareJob.originalHeight} → {compareJob.width}×
                      {compareJob.height}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-line bg-[#f7f7f5] p-0.5">
                    <button
                      type="button"
                      onClick={() => setCompareView("split-h")}
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                        compareView === "split-h" ? "bg-white text-ink shadow-sm" : "text-muted"
                      }`}
                    >
                      <Columns2 size={12} /> Split
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareView("split-v")}
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                        compareView === "split-v" ? "bg-white text-ink shadow-sm" : "text-muted"
                      }`}
                    >
                      <Rows2 size={12} /> Stack
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareView("loupe")}
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                        compareView === "loupe" ? "bg-white text-ink shadow-sm" : "text-muted"
                      }`}
                    >
                      <Search size={12} /> 3× Loupe
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareView("result")}
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                        compareView === "result" ? "bg-white text-ink shadow-sm" : "text-muted"
                      }`}
                    >
                      <Eye size={12} /> Result
                    </button>
                  </div>

                  {compareJob.downloadUrl ? (
                    <a
                      href={compareJob.downloadUrl}
                      download={compareJob.fileName}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[11.5px] font-medium text-white transition hover:bg-ink/90"
                    >
                      <Download size={12} />
                      Download
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setCompareJobId(null)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-[11.5px] font-medium text-ink hover:bg-rail"
                  >
                    <X size={12} />
                    New upload
                  </button>
                </div>
              </div>

              {compareView === "split-h" || compareView === "split-v" ? (
                <div className="overflow-hidden rounded-xl border border-line bg-[#f3f3f1]">
                  <ImageCompare
                    orientation={compareView === "split-v" ? "vertical" : "horizontal"}
                    aspectRatio={
                      compareJob.width && compareJob.height
                        ? `${Math.max(compareJob.width, 1)} / ${Math.max(compareJob.height, 1)}`
                        : "16 / 10"
                    }
                    className="max-h-[460px] w-full"
                    labels={["Original", `${compareJob.factor}× ${compareJob.modelLabel}`]}
                    before={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={compareJob.sourceUrl ?? compareJob.outputUrl}
                        alt="Original"
                        className="h-full w-full bg-[#f3f3f1] object-contain"
                      />
                    }
                    after={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={compareJob.outputUrl}
                        alt="Upscaled"
                        className="h-full w-full bg-[#f3f3f1] object-contain"
                      />
                    }
                  />
                </div>
              ) : compareView === "loupe" ? (
                <div
                  className="relative flex max-h-[460px] cursor-crosshair items-center justify-center overflow-hidden rounded-xl border border-line bg-[#f3f3f1]"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                    setLoupePos({ x, y, active: true });
                  }}
                  onMouseLeave={() => setLoupePos((p) => ({ ...p, active: false }))}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={compareJob.outputUrl}
                    alt="Upscaled 3x loupe inspect"
                    className="max-h-[460px] w-full object-contain"
                  />
                  {loupePos.active ? (
                    <div
                      className="pointer-events-none absolute h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                      style={{
                        left: `${loupePos.x}%`,
                        top: `${loupePos.y}%`,
                        backgroundImage: `url(${compareJob.outputUrl})`,
                        backgroundSize: "300%",
                        backgroundPosition: `${loupePos.x}% ${loupePos.y}%`,
                      }}
                    />
                  ) : null}
                  <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-[10.5px] font-medium text-white">
                    Move cursor across image to inspect 3× fine detail
                  </span>
                </div>
              ) : (
                <div className="flex max-h-[460px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[#f3f3f1] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={compareJob.outputUrl}
                    alt={compareJob.fileName}
                    className="max-h-[440px] w-auto object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
              className={`rounded-2xl border bg-white p-5 transition ${
                queue.dragging ? "border-accent bg-accent-soft/20" : "border-line"
              }`}
            >
              {!stagedSource ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f3f1] text-ink">
                    <Upload size={20} />
                  </div>
                  <p className="text-[14px] font-semibold text-ink">
                    Drop an image to upscale on NVIDIA L20 GPU
                  </p>
                  <p className="mt-1 max-w-md text-[12px] text-muted">
                    Choose Free FP16 models (UltraSharpV2 Lite, OmniSR, HAT, Real-ESRGAN) or switch
                    to Pro SeedVR2-3B FP8 diffusion. Up to {maxSizeMB} MB per file.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => queue.openPicker()}
                      className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white shadow-sm transition hover:bg-ink/90"
                    >
                      <ImageIcon size={14} />
                      Select image
                    </button>
                  </div>

                  <div className="mt-6 w-full border-t border-line pt-4">
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                      Or test immediately with a built-in sample
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SAMPLE_UPSCALE_IMAGES.map((sample) => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => void handleSelectSample(sample)}
                          className="rounded-xl border border-line bg-[#fafaf8] px-3 py-2 text-left transition hover:border-ink/35 hover:bg-white"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[12px] font-semibold text-ink">{sample.label}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                                sample.suggestedTier === "pro"
                                  ? "bg-accent-soft text-accent"
                                  : "bg-[#eeeeea] text-muted"
                              }`}
                            >
                              {sample.suggestedTier === "pro" ? "Pro 3B" : "Free FP16"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10.5px] text-faint">{sample.subtitle}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[13px] font-semibold text-ink">
                        {stagedSource.file.name}
                      </span>
                      <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium text-muted tabular-nums">
                        {stagedSource.width ?? "?"}×{stagedSource.height ?? "?"} →{" "}
                        {targetDims.width || "?"}×{targetDims.height || "?"}
                      </span>
                      <span className="text-[11px] text-faint">
                        {formatBytes(stagedSource.file.size)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => queue.openPicker()}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-ink hover:bg-rail"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          queue.clearAll();
                          setSampleItem(null);
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-muted hover:text-ink"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="flex max-h-[340px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[#f3f3f1] p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stagedSource.preview}
                      alt={stagedSource.file.name}
                      className="max-h-[310px] w-auto rounded object-contain shadow-sm"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-[11.5px] text-muted">
                      Jobs run in the background and remain saved for{" "}
                      <strong className="font-medium text-ink">24 hours</strong> — submit and queue
                      another right away.
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
                      {submitting ? "Submitting..." : `Submit Upscale (${settings.factor}×)`}
                      <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px] font-medium">
                        {creditCost} cr
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {queue.error ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  {queue.error}
                </p>
              ) : null}
              {errorMsg ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  {errorMsg}
                </p>
              ) : null}
              {submitBanner ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="shrink-0" />
                    {submitBanner}
                  </span>
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
          )}

          {/* 24h Cloud Vault History */}
          <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">24-hour Upscale Vault</h2>
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

            <GenerationStorageNotice noun="Upscaled images" />

            {!isSignedIn ? (
              <div className="rounded-xl border border-dashed border-line bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-muted">
                Sign in to submit GPU upscaling jobs and access your saved 24-hour image vault
                across sessions.
              </div>
            ) : loadingJobs && jobs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted">
                <Loader2 size={15} className="animate-spin" /> Loading 24-hour vault...
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-muted">
                No upscaled images yet. Upload or pick a sample above to start your first GPU job.
              </div>
            ) : (
              <div className="space-y-2.5">
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;

                  return (
                    <div
                      key={job.id}
                      className="rounded-xl border border-line bg-[#fafaf8] p-3 transition hover:border-ink/20"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          {job.outputUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={job.outputUrl}
                              alt={job.fileName}
                              className="h-14 w-14 shrink-0 rounded-lg border border-line bg-white object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-muted">
                              {isRunning ? (
                                <Loader2 size={18} className="animate-spin text-accent" />
                              ) : (
                                <ImageIcon size={18} />
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-[12.5px] font-semibold text-ink">
                                {job.sourceFileName}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  job.tier === "pro"
                                    ? "bg-accent-soft text-accent"
                                    : "bg-white text-ink border border-line"
                                }`}
                              >
                                {job.modelLabel} · {job.precision}
                              </span>
                              {job.status === "completed" ? (
                                <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                              ) : null}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                              <span className="tabular-nums">
                                {job.originalWidth || "?"}×{job.originalHeight || "?"} →{" "}
                                {job.width || "?"}×{job.height || "?"} ({job.factor}×)
                              </span>
                              <span>·</span>
                              <span className="uppercase">{job.format}</span>
                              {job.byteLength ? (
                                <>
                                  <span>·</span>
                                  <span>{formatBytes(job.byteLength)}</span>
                                </>
                              ) : null}
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock size={10} /> {formatElapsedClock(elapsed)}
                              </span>
                            </div>

                            {isRunning ? (
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-muted">
                                  <span>{job.stageLabel}</span>
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
                              <p className="mt-1 text-[11px] text-rose-600">
                                {job.error || "Upscale failed."}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {job.status === "completed" && job.outputUrl ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setCompareJobId(job.id)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-[11.5px] font-medium text-ink hover:border-ink/35"
                              >
                                <Columns2 size={12} /> Compare
                              </button>
                              {job.downloadUrl ? (
                                <a
                                  href={job.downloadUrl}
                                  download={job.fileName}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11.5px] font-medium text-white hover:bg-ink/90"
                                >
                                  <Download size={12} /> Save
                                </a>
                              ) : null}
                            </>
                          ) : null}

                          {!isRunning ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                title="Re-run upscale with same image"
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: 3-Tab Customization Rail */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(15,15,16,0.04)] lg:sticky lg:top-20 lg:self-start">
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
        </div>
      </div>

      <CreditGate
        open={showCreditGate}
        onClose={() => setShowCreditGate(false)}
        action="Run AI Image Upscaler"
        cost={creditCost}
      />
    </div>
  );
}
