"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Download,
  Grid,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
} from "lucide-react";
import { ImageCompare } from "@/components/arc/image-compare/image-compare";
import {
  ActionRow,
  Chip,
  FileRow,
  Note,
  PrimaryAction,
  ResultCard,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import type { StudioImage } from "@/components/tool/studio/types";
import {
  ImageCompressSettings,
  DEFAULT_COMPRESS_SETTINGS,
  type CompressSettings,
} from "./ImageCompressSettings";
import { compressFile, type CompressOutcome, type CompressRequest } from "@/lib/image/compress";
import {
  FORMAT_LABEL,
  downloadAllAsZip,
  downloadBlob,
  formatBytes,
  outputFilename,
  roundSize,
} from "@/lib/image/encode";
import {
  goalLabel,
  maxEdgeOf,
  reductionPercent,
  resolveOutputFormat,
  targetBytes,
  targetLabel,
} from "./model";

const MAX_FILES = 20;
/** Padding between the preview stage edge and the image, in px. */
const STAGE_PADDING = 20;

function sourceFormat(file: File | undefined): string {
  if (!file) return "IMAGE";
  const ext = file.name.split(".").pop()?.toUpperCase();
  if (ext) return ext;
  const mime = file.type.split("/")[1]?.toUpperCase();
  return mime || "IMAGE";
}

type CompressorStudioResult = CompressOutcome & {
  previewUrl: string;
  name: string;
  /** The settings this file was made with. See `settingsKey` in the studio. */
  settingsKey: string;
};

function revokePreview(result: { previewUrl: string }) {
  if (result.previewUrl.startsWith("blob:")) URL.revokeObjectURL(result.previewUrl);
}

export function CompressorStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    items,
    activeItem,
    setActiveId,
    openPicker,
    dragging,
    error,
    inputRef,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clearAll,
  } = useImageQueue({
    maxFiles: MAX_FILES,
    maxSizeMB,
    formatHint: "JPG, PNG, WebP, AVIF, HEIC or BMP",
  });

  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_COMPRESS_SETTINGS);
  const [scaleToFit, setScaleToFit] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<"converted" | "original" | "split">("converted");
  const [splitPos, setSplitPos] = useState(50);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name?: string } | null>(null);
  const [results, setResults] = useState<Record<string, CompressorStudioResult>>({});

  const resultsRef = useRef<Record<string, CompressorStudioResult>>({});
  resultsRef.current = results;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(resultsRef.current).forEach((res) => {
        if (res.previewUrl && res.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(res.previewUrl);
        }
      });
    };
  }, []);

  function patchSettings(patch: Partial<CompressSettings>) {
    setSettings((curr) => ({ ...curr, ...patch }));
    setNotice(null);
  }

  function resetSettings() {
    setSettings(DEFAULT_COMPRESS_SETTINGS);
    setNotice(null);
  }

  const dimensions =
    activeItem?.width && activeItem.height
      ? { width: activeItem.width, height: activeItem.height }
      : null;

  // The one place the options for a compress call are built: the live preview,
  // the batch run and the ZIP download all go through `compressItem` below.
  const sharedOptions = {
    goal: settings.goal,
    quality: settings.quality,
    targetBytes: targetBytes(settings),
    percent: settings.percent,
    maxEdge: settings.resizeMode === "maxEdge" ? settings.maxEdgePx : maxEdgeOf(settings),
    scalePercent: settings.resizeMode === "scale" ? settings.scalePercent : undefined,
    customWidth: settings.resizeMode === "custom" ? settings.customWidth : undefined,
    customHeight: settings.resizeMode === "custom" ? settings.customHeight : undefined,
    keepOriginalIfLarger: settings.keepSmaller,
    sharpen: settings.sharpenAmount > 0 ? settings.sharpenAmount : settings.sharpen ? 0.3 : 0,
    grayscale: settings.grayscale,
  };

  function compressOptions(file: File): CompressRequest {
    const format = resolveOutputFormat(settings, file);
    return {
      ...sharedOptions,
      format,
      backgroundColor:
        !settings.preserveAlpha || format === "jpeg" ? settings.backgroundColor : null,
    };
  }

  // Everything a compress call reads, as one string. It is built from the same
  // object as the options, so the two cannot drift. A stored result only counts
  // while the key it was made with still matches, so nothing made with older
  // settings can be shown as ready or end up in a download.
  const settingsKey = JSON.stringify([
    sharedOptions,
    settings.format,
    settings.preserveAlpha,
    settings.backgroundColor,
  ]);
  const settingsKeyRef = useRef(settingsKey);
  settingsKeyRef.current = settingsKey;

  function currentResult(id: string): CompressorStudioResult | null {
    const res = results[id];
    return res && res.settingsKey === settingsKey ? res : null;
  }

  /** Made with the current settings: safe to download. */
  const activeResult = activeItem ? currentResult(activeItem.id) : null;
  /** What the preview draws: this image's last render, kept on screen while a new one is made. */
  const shownResult = activeItem ? (results[activeItem.id] ?? null) : null;

  // Settings changed (or another image came on screen): drop every result made
  // with other settings. Only the image on screen keeps its old render, purely
  // as a picture, until the live preview replaces it.
  useEffect(() => {
    const keepId = activeItem?.id;
    const staleIds = Object.entries(resultsRef.current)
      .filter(([id, res]) => res.settingsKey !== settingsKey && id !== keepId)
      .map(([id]) => id);
    if (staleIds.length === 0) return;
    staleIds.forEach((id) => revokePreview(resultsRef.current[id]));
    setResults((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([id, res]) => res.settingsKey === settingsKey || !staleIds.includes(id),
        ),
      ),
    );
  }, [settingsKey, activeItem?.id]);

  const origWidth = dimensions?.width || 1920;
  const origHeight = dimensions?.height || 1080;

  function handleCustomWidthChange(val: number) {
    const clamped = Math.max(16, val);
    patchSettings({ customWidth: clamped });
    if (settings.lockAspect && origWidth > 0) {
      const ratio = origHeight / origWidth;
      patchSettings({
        customWidth: clamped,
        customHeight: Math.max(16, Math.round(clamped * ratio)),
      });
    }
  }

  function handleCustomHeightChange(val: number) {
    const clamped = Math.max(16, val);
    patchSettings({ customHeight: clamped });
    if (settings.lockAspect && origHeight > 0) {
      const ratio = origWidth / origHeight;
      patchSettings({
        customHeight: clamped,
        customWidth: Math.max(16, Math.round(clamped * ratio)),
      });
    }
  }

  /** Compresses one image with the current settings. Every result is made here. */
  async function compressItem(item: StudioImage): Promise<CompressorStudioResult> {
    const outcome = await compressFile(item.file, compressOptions(item.file));
    return {
      ...outcome,
      previewUrl: URL.createObjectURL(outcome.blob),
      name: outputFilename(
        item.file.name,
        outcome.format,
        outcome.keptOriginal ? "-original" : "-compressed",
      ),
      settingsKey,
    };
  }

  /**
   * A result for every queued image, made with the settings in force when this
   * is called. Stored results are reused only if they match those settings;
   * anything missing or outdated is compressed again.
   */
  async function gatherResults(
    onStep?: (index: number, item: StudioImage) => void,
  ): Promise<CompressorStudioResult[]> {
    const runKey = settingsKey;
    const fresh: Record<string, CompressorStudioResult> = {};
    const outputs: CompressorStudioResult[] = [];

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        onStep?.(i, item);

        const existing: CompressorStudioResult | undefined = resultsRef.current[item.id];
        let entry = existing && existing.settingsKey === runKey ? existing : null;
        if (!entry) {
          entry = await compressItem(item);
          fresh[item.id] = entry;
        }
        outputs.push(entry);
      }
    } catch (thrown) {
      Object.values(fresh).forEach(revokePreview);
      throw thrown;
    }

    if (Object.keys(fresh).length > 0) {
      if (settingsKeyRef.current !== runKey) {
        // The settings moved on mid-run: hand the files back, but do not keep them.
        Object.values(fresh).forEach(revokePreview);
      } else {
        setResults((prev) => {
          for (const [id, entry] of Object.entries(fresh)) {
            const old = prev[id];
            if (old && old !== entry) revokePreview(old);
          }
          return { ...prev, ...fresh };
        });
      }
    }

    return outputs;
  }

  // Real-time live compression for active item
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }

    // Nothing to do without an image, or when it already has a result for these settings.
    if (!activeItem || resultsRef.current[activeItem.id]?.settingsKey === settingsKey) {
      setPreviewBusy(false);
      return;
    }

    let cancelled = false;
    setPreviewBusy(true);

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const entry = await compressItem(activeItem);
        // Superseded by newer settings or another image while it was encoding.
        if (cancelled) {
          revokePreview(entry);
          return;
        }
        setResults((prev) => {
          const old = prev[activeItem.id];
          if (old && old !== entry) revokePreview(old);
          return { ...prev, [activeItem.id]: entry };
        });
      } catch (err) {
        console.error("Live compression preview failed:", err);
        // No result could be made for these settings: stop showing the outdated one.
        if (!cancelled) {
          setResults((prev) => {
            const old = prev[activeItem.id];
            if (!old || old.settingsKey === settingsKey) return prev;
            revokePreview(old);
            const next = { ...prev };
            delete next[activeItem.id];
            return next;
          });
        }
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
    // `settingsKey` covers every setting the compress call reads.
  }, [activeItem?.id, activeItem?.file, settingsKey]);

  async function saveZip(outputs: CompressorStudioResult[]) {
    await downloadAllAsZip(
      outputs.map((res) => ({ blob: res.blob, name: res.name })),
      "frebies-compressed.zip",
    );
    setNoticeTone("success");
    setNotice(`Saved ZIP with ${outputs.length} compressed files.`);
  }

  // Handle batch compression / download
  async function handleCompressAll() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setProgress({ current: 0, total: items.length });

    try {
      const outputs = await gatherResults((index, item) =>
        setProgress({ current: index + 1, total: items.length, name: item.file.name }),
      );

      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
        setNoticeTone("success");
        setNotice(`Saved ${outputs[0].name} (${formatBytes(outputs[0].bytes)}).`);
      } else if (outputs.length > 1) {
        await saveZip(outputs);
      }
    } catch (thrown) {
      setNoticeTone("error");
      setNotice(thrown instanceof Error ? thrown.message : "An error occurred during compression.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleDownloadZip() {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await saveZip(await gatherResults());
    } catch (err) {
      setNoticeTone("error");
      setNotice("Could not generate ZIP archive. Please download files individually.");
    } finally {
      setBusy(false);
    }
  }

  // Stage measurement for "Fit" scaling. The stage only mounts once an image
  // is added, so it is tracked through a callback ref rather than a mount-only effect.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 760,
    height: 480,
  });

  useEffect(() => {
    if (!stageEl) return;

    const updateSize = () => {
      const rect = stageEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize);
      ro.observe(stageEl);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [stageEl]);

  const currentW =
    viewMode === "original"
      ? (dimensions?.width || 1)
      : shownResult
        ? shownResult.width
        : (dimensions?.width || 1);
  const currentH =
    viewMode === "original"
      ? (dimensions?.height || 1)
      : shownResult
        ? shownResult.height
        : (dimensions?.height || 1);

  // Room inside the stage once its padding is taken off
  const availableW = Math.max(120, stageSize.width - STAGE_PADDING * 2);
  const availableH = Math.max(120, stageSize.height - STAGE_PADDING * 2);

  const scaleX = availableW / Math.max(1, currentW);
  const scaleY = availableH / Math.max(1, currentH);
  const fitMultiplier = Math.max(0.01, Math.min(scaleX, scaleY));

  const fitW = Math.max(1, roundSize(currentW * fitMultiplier));
  const fitH = Math.max(1, roundSize(currentH * fitMultiplier));

  const renderedW = scaleToFit ? fitW : currentW;
  const renderedH = scaleToFit ? fitH : currentH;

  const isMagnified = renderedW > currentW || currentW < 256;

  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalOutputBytes = items.reduce((sum, item) => {
    return sum + (currentResult(item.id)?.bytes ?? item.file.size);
  }, 0);
  const totalSavings = totalInputBytes > 0 ? reductionPercent(totalInputBytes, totalOutputBytes) : 0;

  const count = items.length;
  const isBatch = count > 1;
  /** Every image in the queue has a compressed file waiting. */
  const ready =
    count > 0 && items.every((item) => currentResult(item.id)) && Boolean(activeResult);
  /** A batch run is in flight (as opposed to a ZIP being packed for download). */
  const compressing = busy && progress !== null;
  const activeSavings = shownResult
    ? reductionPercent(shownResult.originalBytes, shownResult.bytes)
    : 0;
  const resized = Boolean(
    shownResult &&
      dimensions &&
      (shownResult.width !== dimensions.width || shownResult.height !== dimensions.height),
  );

  const goalPhrase =
    settings.goal === "target"
      ? targetBytes(settings) > 0
        ? ` to ${targetLabel(settings)}`
        : ""
      : settings.goal === "percent"
        ? ` by ${settings.percent}%`
        : ` at ${settings.quality}% quality`;

  function startOver() {
    clearAll();
    setNotice(null);
  }

  const fileButtons = (
    <>
      <SecondaryAction onClick={() => openPicker()} icon={<ImagePlus size={13} aria-hidden />}>
        Add images
      </SecondaryAction>
      <StartOverAction onClick={startOver} />
    </>
  );
  // On phones the dock keeps only the big button; these two sit under the file instead.
  const fileActions = count > 0 ? <ActionRow className="max-lg:hidden">{fileButtons}</ActionRow> : null;

  const action =
    ready && activeResult && !compressing ? (
      <>
        <PrimaryAction
          tone="success"
          label={
            isBatch
              ? `Download ${count} images (ZIP)`
              : `Download ${FORMAT_LABEL[activeResult.format]} · ${formatBytes(activeResult.bytes)}`
          }
          busyLabel="Preparing ZIP…"
          icon={<Download size={16} aria-hidden />}
          busy={busy}
          onClick={isBatch ? handleDownloadZip : handleCompressAll}
          hint={
            isBatch
              ? `${formatBytes(totalInputBytes)} → ${formatBytes(totalOutputBytes)}`
              : undefined
          }
        />
        {fileActions}
      </>
    ) : (
      <>
        <PrimaryAction
          label={
            count === 0
              ? "Compress images"
              : isBatch
                ? `Compress ${count} images${goalPhrase}`
                : `Compress${goalPhrase}`
          }
          busyLabel={
            progress ? `Compressing ${progress.current} of ${progress.total}…` : "Compressing…"
          }
          icon={<Minimize2 size={16} aria-hidden />}
          busy={busy || (count === 1 && previewBusy)}
          progress={
            busy && progress ? Math.max(0, (progress.current - 0.5) / progress.total) : undefined
          }
          disabled={count === 0}
          onClick={handleCompressAll}
          hint={
            count === 0
              ? "Add images to get started"
              : isBatch
                ? "Saves everything as one ZIP"
                : undefined
          }
        />
        {fileActions}
      </>
    );

  return (
    <StudioFrame id="compressor" label="Image compression studio">
      <StudioStage>
        {count === 0 ? (
          <StudioDropzone
            title="Drop images to compress"
            description={`Hit an exact file size, pick a quality, or cut a percentage. One image or a batch of ${MAX_FILES}.`}
            buttonLabel="Choose images"
            limits={`JPG, PNG, WebP, AVIF, HEIC, BMP · up to ${maxSizeMB} MB each`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <StudioChip>Exact KB or MB target</StudioChip>
                <StudioChip>Quality slider</StudioChip>
                <StudioChip>Batch to ZIP</StudioChip>
              </>
            }
          />
        ) : (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-1 lg:overflow-y-auto"
          >
            {(ready && activeResult) || (!isBatch && shownResult) ? (
              <ResultCard
                className="shrink-0"
                title={
                  !activeResult
                    ? "Compressing…"
                    : isBatch
                      ? totalSavings > 0
                        ? `${count} images · ${totalSavings}% smaller`
                        : `${count} images ready`
                      : activeResult.keptOriginal
                        ? "Already as small as it gets"
                        : activeSavings > 0
                          ? `${activeSavings}% smaller`
                          : "Compressed"
                }
                meta={
                  !activeResult
                    ? "Applying your settings"
                    : isBatch
                      ? `${formatBytes(totalInputBytes)} → ${formatBytes(totalOutputBytes)}`
                      : activeResult.keptOriginal
                        ? `Kept the original (${formatBytes(activeResult.bytes)}). Try a lower quality or a smaller target.`
                        : `${formatBytes(activeResult.originalBytes)} → ${formatBytes(activeResult.bytes)} · ${activeResult.width} × ${activeResult.height} px`
                }
              >
                <button
                  type="button"
                  onClick={isBatch ? handleDownloadZip : handleCompressAll}
                  disabled={!activeResult || busy}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  <Download size={15} aria-hidden />
                  {isBatch ? "Download ZIP" : "Download"}
                </button>
              </ResultCard>
            ) : null}

            {/* Stage toolbar: what is happening on the left, how to look at it on the right */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip>
                  {sourceFormat(activeItem?.file)}
                  {shownResult ? ` → ${FORMAT_LABEL[shownResult.format]}` : ""}
                  {previewBusy ? (
                    <Loader2 size={12} className="animate-spin" aria-label="Updating preview" />
                  ) : null}
                </Chip>
                <Chip>{goalLabel(settings)}</Chip>
                {isBatch ? (
                  <Chip>
                    {count} images · {formatBytes(totalInputBytes)}
                  </Chip>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {shownResult ? (
                  <ToolbarGroup label="Preview">
                    <ToolbarToggle
                      active={viewMode === "converted"}
                      onClick={() => setViewMode("converted")}
                    >
                      Compressed
                    </ToolbarToggle>
                    <ToolbarToggle
                      active={viewMode === "original"}
                      onClick={() => setViewMode("original")}
                    >
                      Original
                    </ToolbarToggle>
                    <ToolbarToggle active={viewMode === "split"} onClick={() => setViewMode("split")}>
                      Compare
                    </ToolbarToggle>
                  </ToolbarGroup>
                ) : null}

                <ToolbarGroup label="Zoom">
                  <ToolbarToggle
                    active={scaleToFit}
                    onClick={() => setScaleToFit(true)}
                    title={`Fit to the stage (${Math.round(fitMultiplier * 100)}%)`}
                  >
                    <Maximize2 size={12} aria-hidden />
                    Fit
                  </ToolbarToggle>
                  <ToolbarToggle
                    active={!scaleToFit}
                    onClick={() => setScaleToFit(false)}
                    title="Actual size: one image pixel per screen pixel"
                    ariaLabel="Show actual size"
                  >
                    100%
                  </ToolbarToggle>
                </ToolbarGroup>

                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  aria-pressed={showGrid}
                  title="Toggle transparency grid"
                  aria-label="Toggle transparency grid"
                  className={`grid h-[34px] w-[34px] place-items-center rounded-[10px] border transition-colors ${
                    showGrid
                      ? "border-ink bg-white text-ink"
                      : "border-line bg-white text-muted hover:text-ink"
                  }`}
                >
                  <Grid size={14} aria-hidden />
                </button>

                {isBatch && activeResult ? (
                  <button
                    type="button"
                    onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                    title={`Download ${activeResult.name} (${formatBytes(activeResult.bytes)})`}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                  >
                    <Download size={13} aria-hidden />
                    Save this one
                  </button>
                ) : null}
              </div>
            </div>

            {/* Preview */}
            <div
              ref={setStageEl}
              className={`relative min-h-[300px] flex-1 overflow-hidden rounded-[16px] border transition-colors lg:min-h-[200px] ${
                dragging ? "border-accent" : "border-line"
              } ${
                showGrid
                  ? "bg-white bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
                  : "bg-card"
              }`}
            >
              {activeItem && (
                <div className="absolute inset-0 flex overflow-auto" style={{ padding: STAGE_PADDING }}>
                  <div className="relative m-auto flex shrink-0 items-center justify-center">
                    {shownResult && viewMode === "split" ? (
                      <div
                        className="relative shrink-0 select-none"
                        style={{
                          width: `${renderedW}px`,
                          height: `${renderedH}px`,
                          maxWidth: scaleToFit ? "100%" : "none",
                          maxHeight: scaleToFit ? "100%" : "none",
                        }}
                      >
                        <span className="pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-md bg-black/65 px-2 py-0.5 text-[12px] font-semibold text-white">
                          Original · {formatBytes(activeItem.file.size)}
                        </span>
                        <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-md bg-black/65 px-2 py-0.5 text-[12px] font-semibold text-white">
                          Compressed · {formatBytes(shownResult.bytes)}
                        </span>

                        <ImageCompare
                          before={
                            <img
                              src={activeItem.preview}
                              alt="Original"
                              style={{ objectFit: "contain", imageRendering: isMagnified ? "pixelated" : "auto" }}
                            />
                          }
                          after={
                            <img
                              src={shownResult.previewUrl}
                              alt="Compressed"
                              style={{ objectFit: "contain", imageRendering: isMagnified ? "pixelated" : "auto" }}
                            />
                          }
                          position={splitPos}
                          onPositionChange={setSplitPos}
                          labels={false}
                          label="Before after split slider"
                          className="h-full w-full rounded-[8px] shadow-md"
                        />
                      </div>
                    ) : (
                      <img
                        src={shownResult && viewMode === "converted" ? shownResult.previewUrl : activeItem.preview}
                        alt={`Preview of ${activeItem.file.name}`}
                        className="shrink-0 select-none rounded-[8px] border border-black/10 object-contain shadow-md transition-all"
                        style={{
                          width: `${renderedW}px`,
                          height: `${renderedH}px`,
                          maxWidth: scaleToFit ? "100%" : "none",
                          maxHeight: scaleToFit ? "100%" : "none",
                          imageRendering: isMagnified ? "pixelated" : "auto",
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Batch filmstrip */}
            {isBatch && (
              <ul
                aria-label="Images in this batch"
                className="flex shrink-0 gap-2 overflow-x-auto p-0.5"
              >
                {items.map((item) => {
                  const isSelected = item.id === activeItem?.id;
                  const itemRes = currentResult(item.id);

                  return (
                    <li key={item.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        data-slot="queue-item"
                        aria-current={isSelected ? "true" : undefined}
                        aria-label={`Show ${item.file.name}`}
                        title={`${item.file.name} · ${formatBytes(item.file.size)}${
                          itemRes ? ` → ${formatBytes(itemRes.bytes)}` : ""
                        }`}
                        className={`relative block h-[68px] w-[92px] overflow-hidden rounded-[10px] border bg-white transition-colors ${
                          isSelected
                            ? "border-ink ring-1 ring-ink"
                            : "border-line hover:border-[#cfc9bd]"
                        }`}
                      >
                        <img
                          src={itemRes ? itemRes.previewUrl : item.preview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-px text-[11px] font-semibold uppercase text-white">
                          {itemRes
                            ? `−${Math.max(0, reductionPercent(itemRes.originalBytes, itemRes.bytes))}%`
                            : sourceFormat(item.file)}
                        </span>
                        {itemRes && (
                          <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-success text-white">
                            <Check size={10} strokeWidth={3} aria-hidden />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => openPicker()}
                    aria-label="Add more images to batch"
                    className="grid h-[68px] w-[68px] place-items-center rounded-[10px] border border-dashed border-[#d5d1c8] bg-white text-faint transition-colors hover:border-[#b5ae9f] hover:text-ink"
                  >
                    <Plus size={18} aria-hidden />
                  </button>
                </li>
              </ul>
            )}

            {activeItem && (
              <FileRow
                className="shrink-0"
                icon={<ImageIcon size={16} aria-hidden />}
                name={activeItem.file.name}
                meta={
                  <>
                    {formatBytes(activeItem.file.size)}
                    {dimensions ? ` · ${dimensions.width} × ${dimensions.height} px` : ""}
                    {shownResult ? (
                      <span className="font-medium text-ink">
                        {` → ${formatBytes(shownResult.bytes)}`}
                        {activeSavings > 0 ? ` (−${activeSavings}%)` : ""}
                        {resized ? ` · ${shownResult.width} × ${shownResult.height} px` : ""}
                      </span>
                    ) : null}
                  </>
                }
                onReplace={() => openPicker(activeItem.id)}
                onRemove={() => removeItem(activeItem.id)}
              />
            )}

            <div className="flex shrink-0 gap-2 lg:hidden [&>*]:flex-1">{fileButtons}</div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/bmp,.jpg,.jpeg,.png,.webp,.avif,.heic,.bmp"
          multiple
          tabIndex={-1}
          aria-label="Choose images"
          className="sr-only"
          onChange={onPick}
        />

        <span
          aria-hidden
          className="hidden"
          data-success={noticeTone === "success" ? notice : undefined}
          data-error={error ?? (noticeTone === "error" ? notice : undefined)}
        />

        {error ? (
          <Note tone="error" className="mt-3 shrink-0">
            {error}
          </Note>
        ) : null}

        {notice ? (
          <Note tone={noticeTone === "error" ? "error" : "success"} className="mt-3 shrink-0">
            {notice}
          </Note>
        ) : null}
      </StudioStage>

      <ImageCompressSettings
        action={action}
        settings={settings}
        dimensions={dimensions}
        originalBytes={activeItem ? activeItem.file.size : null}
        hasImage={Boolean(activeItem)}
        onPatch={patchSettings}
        onCustomWidth={handleCustomWidthChange}
        onCustomHeight={handleCustomHeightChange}
        onReset={resetSettings}
      />
    </StudioFrame>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[10px] border border-line bg-white p-0.5">
      {children}
    </div>
  );
}

function ToolbarToggle({
  active,
  onClick,
  title,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex h-7 items-center gap-1 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors ${
        active ? "bg-ink text-white" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
