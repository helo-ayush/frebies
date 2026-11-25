"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Columns2,
  Download,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { GenerationExpiryBadge } from "@/components/tool/GenerationRetentionBadge";
import {
  ActionRow,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  STUDIO_GRID,
  STUDIO_HEIGHT,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolText,
} from "@/components/tool/kit";
import {
  HistoryButton,
  HistoryEmpty,
  HistoryList,
  HistoryPager,
  HistoryRow,
  HistorySection,
  HistoryThumb,
} from "@/components/tool/kit/History";
import { ImageViewer, ViewTabs, type ViewMode } from "@/components/tool/viewer/ImageViewer";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { useHeldFile } from "@/components/tool/paid/useHeldFile";
import { asFileList } from "@/lib/held-file";
import { EngineRow } from "@/components/tool/paid/EngineRow";
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

/** Both left-hand blocks (tool, history) share the column beside the sticky rail. */
const LEFT_COLUMN = "lg:col-start-1 lg:self-stretch";

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
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [page, setPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const stagedSource = queue.activeItem ?? sampleItem;
  const stagedSourceId = stagedSource?.id ?? null;

  useHeldFile(stagedSource?.file ?? null, (file, held) => {
    if (held && typeof held === "object") setSettings((current) => ({ ...current, ...(held as UpscaleSettings) }));
    queue.acceptFiles(asFileList(file));
  });

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
        <StudioStage flush className={`lg:row-start-1 ${LEFT_COLUMN} ${STUDIO_HEIGHT}`}>
          {resultJob && resultJob.outputUrl ? (
            <>
              <FileRow
                flush
                className="border-b border-line"
                icon={<ImageIcon size={17} aria-hidden />}
                name={resultJob.sourceFileName}
                meta={`${resultJob.originalWidth || "?"} × ${resultJob.originalHeight || "?"} → ${
                  resultJob.width || "?"
                } × ${resultJob.height || "?"} px`}
                onRemove={dismissResult}
              >
                {resultJob.sourceUrl ? (
                  <ViewTabs mode={viewMode} onChange={setViewMode} afterLabel={`Upscaled ${resultJob.factor}×`} />
                ) : null}
              </FileRow>

              <ImageViewer
                title={resultJob.sourceFileName}
                before={{
                  src: resultJob.sourceUrl ?? resultJob.outputUrl,
                  width: resultJob.sourceUrl ? resultJob.originalWidth || resultJob.width : resultJob.width,
                  height: resultJob.sourceUrl ? resultJob.originalHeight || resultJob.height : resultJob.height,
                  label: resultJob.sourceUrl ? "Original" : "Upscaled",
                  note: resultJob.sourceUrl ? `${resultJob.originalWidth} × ${resultJob.originalHeight}` : undefined,
                }}
                after={
                  resultJob.sourceUrl
                    ? {
                        src: resultJob.outputUrl,
                        width: resultJob.width,
                        height: resultJob.height,
                        label: `Upscaled ${resultJob.factor}×`,
                        note: `${resultJob.width} × ${resultJob.height}`,
                      }
                    : null
                }
                mode={viewMode}
                onModeChange={setViewMode}
              />
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
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-[13px] text-muted">Or try a sample</span>
                {SAMPLE_UPSCALE_IMAGES.map((sample) => (
                  <ToolText key={sample.id} onClick={() => void handleSelectSample(sample)}>
                    {sample.label}
                  </ToolText>
                ))}
              </div>
            </StudioDropzone>
          ) : (
            <div
              className="flex min-h-0 flex-1 flex-col"
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
            >
              <FileRow
                flush
                className="border-b border-line"
                icon={<ImageIcon size={17} aria-hidden />}
                name={stagedSource.file.name}
                meta={`${formatBytes(stagedSource.file.size)}${
                  stagedSource.width && stagedSource.height
                    ? ` · ${stagedSource.width} × ${stagedSource.height}${hasTarget ? ` → ${targetText}` : ""} px`
                    : ""
                }`}
                onReplace={() => queue.openPicker()}
                onRemove={clearSource}
              />

              {runningJob ? (
                <Note className="border-x-0 border-t-0">
                  {STATUS_LABELS[runningJob.status]}. It keeps running if you leave this page, and the
                  result is saved under Your upscales.
                </Note>
              ) : null}
              {failedJob ? (
                <Note tone="error" className="border-x-0 border-t-0">
                  {failedJob.error || "The upscale failed."} Change a setting or try again.
                </Note>
              ) : null}

              <ImageViewer
                title={stagedSource.file.name}
                before={{
                  src: stagedSource.preview,
                  width: stagedSource.width ?? 1,
                  height: stagedSource.height ?? 1,
                  label: "Original",
                  note: stagedSource.width ? `${stagedSource.width} × ${stagedSource.height}` : undefined,
                  alt: stagedSource.file.name,
                }}
                busy={submitting || Boolean(runningJob)}
                busyLabel={runningJob ? `${runningJob.progress}%` : "Uploading"}
                dragging={queue.dragging}
                dropLabel="Drop to replace"
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

          {/* Drives the finished / problem sounds */}
          <span aria-hidden className="hidden" data-success={finishedFeatured?.id} data-error={errorMsg ?? queue.error ?? undefined} />
          {queue.error ? <Note tone="error" className="m-3 shrink-0">{queue.error}</Note> : null}
          {errorMsg ? <Note tone="error" className="m-3 shrink-0">{errorMsg}</Note> : null}
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

          <EngineRow
            state={serverState === "ready" ? "ready" : serverState === "booting" ? "booting" : serverState === "error" ? "error" : "asleep"}
            label={serverText}
            actionLabel={gpuStatus && gpuStatus.state !== "ready" ? "Wake now" : "Refresh"}
            onAction={gpuStatus && gpuStatus.state !== "ready" ? () => void handleWakeGpu() : () => void fetchStatus(true)}
            busy={wakingGpu}
            icon={
              gpuStatus && gpuStatus.state !== "ready" ? <Zap size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden />
            }
          />
        </StudioRail>

        {/* 3 · Everything upscaled in the last 24 hours */}
        <div className={`min-w-0 border-t border-line lg:row-start-2 ${LEFT_COLUMN}`}>
          <HistorySection
            title="Your upscales"
            label="Your upscaled images"
            count={jobs.length}
            note="Kept for 24 hours. Older items may be cleared sooner when space is needed."
            pager={
              jobs.length > ITEMS_PER_PAGE ? (
                <HistoryPager page={safePage} pages={totalPages} onPage={setPage} />
              ) : null
            }
          >
            {!isLoaded ? null : !isSignedIn ? (
              <HistoryEmpty>Sign in to upscale images and find them here from any device.</HistoryEmpty>
            ) : loadingJobs && jobs.length === 0 ? (
              <HistoryEmpty>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Loading your upscales…
              </HistoryEmpty>
            ) : jobs.length === 0 ? (
              <HistoryEmpty>Nothing here yet. Finished upscales show up in this list.</HistoryEmpty>
            ) : (
              <HistoryList>
                {pagedJobs.map((job) => {
                  const isRunning = ACTIVE_STATUSES.has(job.status);
                  const isFailed = job.status === "failed";
                  const elapsed = isRunning ? nowMs - job.createdAt : job.elapsedMs;

                  return (
                    <HistoryRow
                      key={job.id}
                      active={resultJob?.id === job.id}
                      thumb={
                        <HistoryThumb src={job.outputUrl}>
                          {isRunning ? (
                            <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
                          ) : (
                            <ImageIcon size={18} aria-hidden />
                          )}
                        </HistoryThumb>
                      }
                      title={job.sourceFileName}
                      badge={
                        job.status === "completed" ? (
                          <GenerationExpiryBadge expiresAt={job.expiresAt} nowMs={nowMs} />
                        ) : null
                      }
                      metaTitle={`${job.modelLabel} · ${job.precision}`}
                      meta={
                        <>
                          {job.originalWidth || "?"} × {job.originalHeight || "?"} → {job.width || "?"} ×{" "}
                          {job.height || "?"}
                          {" · "}
                          {job.format.toUpperCase()}
                          {job.byteLength ? ` · ${formatBytes(job.byteLength)}` : ""}
                          {" · "}
                          {tierLabel(job.tier)} ({job.modelLabel})
                          {" · "}
                          {formatElapsedClock(elapsed)}
                        </>
                      }
                      progress={isRunning ? job.progress : undefined}
                      progressLabel={`${STATUS_LABELS[job.status]}…`}
                      progressTitle={job.stageLabel}
                      error={isFailed ? job.error || "Upscale failed." : undefined}
                      actions={
                        <>
                          {job.status === "completed" && job.outputUrl ? (
                            <>
                              <HistoryButton
                                onClick={() => setCompareJobId(job.id)}
                                icon={<Columns2 size={14} aria-hidden />}
                              >
                                Compare
                              </HistoryButton>
                              {job.downloadUrl ? (
                                <HistoryButton
                                  loud
                                  href={job.downloadUrl}
                                  filename={job.fileName}
                                  label={`Download ${job.fileName}`}
                                  icon={<Download size={14} aria-hidden />}
                                >
                                  Download
                                </HistoryButton>
                              ) : null}
                            </>
                          ) : null}
                          {!isRunning ? (
                            <>
                              <ToolIcon
                                label={`Upscale ${job.sourceFileName} again`}
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
                    />
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
        action="upscale this image"
        cost={creditCost}
        file={stagedSource?.file}
        settings={settings}
      />
    </>
  );
}
