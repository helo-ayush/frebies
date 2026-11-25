"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Crop,
  Download,
  Grid,
  Image as ImageIcon,
  Pencil,
  Plus,
  Scaling,
} from "lucide-react";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  ActionRow,
  Chip,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  ResultCard,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import {
  canvasToBlob,
  downloadAllAsZip,
  downloadBlob,
  loadImageFile,
  outputFilename,
  formatBytes,
  transformImage,
} from "@/lib/image/encode";
import { CropCanvas } from "./CropCanvas";
import { ImageResizeSettings } from "./ImageResizeSettings";
import { renderResize } from "./render";
import {
  DEFAULT_RESIZE_SETTINGS,
  backgroundValue,
  computeResizeOutput,
  cropForRatio,
  cropRatioValue,
  cropPixels,
  estimateResizeBytes,
  reshapeCrop,
  type CropRect,
  type CropRatioId,
  type ResizeSettings,
} from "./model";

const MAX_FILES = 10;

const TOOLBAR_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink";

type ResizeResult = {
  blob: Blob;
  previewUrl: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  originalBytes: number;
};

export function ResizeCropStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    items,
    activeItem,
    activeIndex,
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
    noun: "image",
  });

  type PerItemCustomSettings = {
    crop?: CropRect | null;
    cropRatio?: CropRatioId;
    width?: string;
    height?: string;
    linked?: boolean;
    percent?: number;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
  };

  const [settings, setSettings] = useState<ResizeSettings>(DEFAULT_RESIZE_SETTINGS);
  const [scaleToFit, setScaleToFit] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name?: string } | null>(null);
  const [results, setResults] = useState<Record<string, ResizeResult>>({});
  // True while the last export still matches the settings. Any edit clears it,
  // which swaps the download button back to the run button.
  const [done, setDone] = useState(false);

  // Per-item settings map to preserve crop/rotation/dimensions when switching between queue items
  const [perItemMap, setPerItemMap] = useState<Record<string, PerItemCustomSettings>>({});
  const perItemMapRef = useRef<Record<string, PerItemCustomSettings>>({});
  perItemMapRef.current = perItemMap;

  // Keyed transformed previews per item ID to prevent stale preview bleed-through
  const [transformedMap, setTransformedMap] = useState<Record<string, string>>({});
  const transformedUrlsRef = useRef<Record<string, string>>({});

  // The canvas only exists once an image is loaded, so it is tracked through a
  // callback ref rather than a mount-only effect.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 640, height: 480 });
  const resultsRef = useRef<Record<string, ResizeResult>>({});
  resultsRef.current = results;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(resultsRef.current).forEach((res) => {
        if (res.previewUrl && res.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(res.previewUrl);
        }
      });
      Object.values(transformedUrlsRef.current).forEach((url) => {
        if (url && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  const activeRotation = settings.rotation || 0;
  const activeFlipX = Boolean(settings.flipX);
  const activeFlipY = Boolean(settings.flipY);
  const isRotatedOrFlipped = activeRotation !== 0 || activeFlipX || activeFlipY;

  // Synchronous preview resolution:
  // If active item has no rotation/flip, use activeItem.preview directly.
  // Never show another item's transformed blob!
  const currentPreview = activeItem
    ? isRotatedOrFlipped
      ? transformedMap[activeItem.id] || activeItem.preview
      : activeItem.preview
    : "";

  // Update transformedPreview for current activeItem whenever its rotation or flip changes
  useEffect(() => {
    if (!activeItem) return;
    const itemId = activeItem.id;
    const previewSrc = activeItem.preview;

    if (!isRotatedOrFlipped) {
      if (transformedUrlsRef.current[itemId]) {
        URL.revokeObjectURL(transformedUrlsRef.current[itemId]);
        delete transformedUrlsRef.current[itemId];
        setTransformedMap((prev) => {
          if (!prev[itemId]) return prev;
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = previewSrc;
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = transformImage(img, {
          rotation: activeRotation,
          flipX: activeFlipX,
          flipY: activeFlipY,
        });
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return;
          const url = URL.createObjectURL(blob);
          if (transformedUrlsRef.current[itemId]) {
            URL.revokeObjectURL(transformedUrlsRef.current[itemId]);
          }
          transformedUrlsRef.current[itemId] = url;
          setTransformedMap((prev) => ({ ...prev, [itemId]: url }));
        }, "image/webp", 0.92);
      } catch (e) {
        console.warn("Transform preview error", e);
      }
    };

    return () => {
      cancelled = true;
    };
  }, [activeItem?.id, activeItem?.preview, activeRotation, activeFlipX, activeFlipY]);

  // Synchronize per-item settings when active item changes or dimensions load
  useEffect(() => {
    if (!activeItem) return;
    const itemId = activeItem.id;
    const itemW = activeItem.width;
    const itemH = activeItem.height;

    const existing = perItemMapRef.current[itemId];
    if (existing) {
      setSettings((current) => ({
        ...current,
        ...existing,
      }));
      return;
    }

    if (itemW && itemH) {
      const defaultCrop = cropForRatio(itemW / itemH, cropRatioValue(settings.cropRatio || "free"));
      const initialItemState: PerItemCustomSettings = {
        crop: defaultCrop,
        cropRatio: settings.cropRatio || "free",
        width: String(itemW),
        height: String(itemH),
        linked: true,
        percent: 100,
        rotation: 0,
        flipX: false,
        flipY: false,
      };

      setPerItemMap((prev) => ({
        ...prev,
        [itemId]: initialItemState,
      }));

      setSettings((current) => ({
        ...current,
        ...initialItemState,
      }));
    }
  }, [activeItem?.id, activeItem?.width, activeItem?.height]);

  // Measure the canvas so the image can use all the room it has
  useLayoutEffect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setStageSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  // Adding, replacing or removing an image makes the last export incomplete.
  const itemsKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    setDone(false);
  }, [itemsKey]);

  function patch(next: Partial<ResizeSettings>) {
    setSettings((current) => {
      const merged = { ...current, ...next };
      const currentRotated = (current.rotation === 90 || current.rotation === 270);
      const nextRotated = (merged.rotation === 90 || merged.rotation === 270);

      // Swap width & height if rotation changed between horizontal and vertical
      if (next.rotation !== undefined && nextRotated !== currentRotated) {
        if (current.width && current.height) {
          merged.width = current.height;
          merged.height = current.width;
        }
      }

      const curSourceW = nextRotated ? originalHeight : originalWidth;
      const curSourceH = nextRotated ? originalWidth : originalHeight;
      const aspect = curSourceW && curSourceH ? curSourceW / curSourceH : 0;
      if (aspect) {
        const ratio = cropRatioValue(merged.cropRatio);
        // If rotation or ratio changed, re-shape crop for the new orientation
        if (
          (next.rotation !== undefined && next.rotation !== current.rotation) ||
          (next.cropRatio && next.cropRatio !== current.cropRatio)
        ) {
          merged.crop = ratio
            ? reshapeCrop(current.crop ?? cropForRatio(aspect, ratio), ratio, aspect)
            : current.crop ?? cropForRatio(aspect, null);
        }
        if (merged.mode === "crop" && !merged.crop) {
          merged.crop = cropForRatio(aspect, ratio);
        }
      }

      if (activeItem) {
        setPerItemMap((prev) => ({
          ...prev,
          [activeItem.id]: {
            ...prev[activeItem.id],
            crop: merged.crop,
            cropRatio: merged.cropRatio,
            width: merged.width,
            height: merged.height,
            linked: merged.linked,
            percent: merged.percent,
            rotation: merged.rotation,
            flipX: merged.flipX,
            flipY: merged.flipY,
          },
        }));
      }

      return merged;
    });
    setNotice(null);
    setDone(false);
  }

  function handleReset() {
    setDone(false);
    if (!originalWidth || !originalHeight) {
      setSettings(DEFAULT_RESIZE_SETTINGS);
      return;
    }
    const freshItemState: PerItemCustomSettings = {
      width: String(originalWidth),
      height: String(originalHeight),
      crop: cropForRatio(originalWidth / originalHeight, cropRatioValue(DEFAULT_RESIZE_SETTINGS.cropRatio)),
      cropRatio: DEFAULT_RESIZE_SETTINGS.cropRatio,
      linked: true,
      percent: 100,
      rotation: 0,
      flipX: false,
      flipY: false,
    };
    if (activeItem) {
      setPerItemMap((prev) => ({
        ...prev,
        [activeItem.id]: freshItemState,
      }));
    }
    setSettings((current) => ({
      ...current,
      ...DEFAULT_RESIZE_SETTINGS,
      ...freshItemState,
    }));
    setNotice(null);
  }

  function handleCropChange(crop: CropRect) {
    patch({ crop });
  }

  function handleRemoveItem(id: string) {
    if (transformedUrlsRef.current[id]) {
      URL.revokeObjectURL(transformedUrlsRef.current[id]);
      delete transformedUrlsRef.current[id];
    }
    setTransformedMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPerItemMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    removeItem(id);
  }

  function handleClearAll() {
    Object.values(transformedUrlsRef.current).forEach((url) => {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    transformedUrlsRef.current = {};
    setTransformedMap({});
    setPerItemMap({});
    clearAll();
    setNotice(null);
  }

  const originalWidth = activeItem?.width ?? 0;
  const originalHeight = activeItem?.height ?? 0;
  const output = computeResizeOutput(settings, originalWidth, originalHeight);
  const { sourceWidth, sourceHeight, width: outputWidth, height: outputHeight } = output;

  const activeCrop =
    settings.crop ??
    cropForRatio(
      sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1,
      cropRatioValue(settings.cropRatio),
    );

  const cropPixelSize =
    sourceWidth && sourceHeight
      ? cropPixels(activeCrop, sourceWidth, sourceHeight)
      : { width: 0, height: 0 };

  const estimate = activeItem
    ? estimateResizeBytes({
        originalBytes: activeItem.file.size,
        sourcePixels: (sourceWidth || 1) * (sourceHeight || 1),
        outputPixels: (outputWidth || 1) * (outputHeight || 1),
        format: settings.format,
        quality: settings.quality,
      })
    : 0;

  // Viewport calculation for Fit vs 100%. The reserve covers the canvas padding.
  const paddingX = 40;
  const paddingY = 40;
  const availableW = Math.max(120, stageSize.width - paddingX);
  const availableH = Math.max(120, stageSize.height - paddingY);

  const displayW = (settings.mode === "crop" ? sourceWidth : outputWidth) || sourceWidth || 800;
  const displayH = (settings.mode === "crop" ? sourceHeight : outputHeight) || sourceHeight || 600;

  const scaleRatioW = availableW / Math.max(1, displayW);
  const scaleRatioH = availableH / Math.max(1, displayH);
  // Fit multiplier: scale image so it comfortably fits available stage width & height without shrinking
  const fitMultiplier = Math.max(0.01, Math.min(scaleRatioW, scaleRatioH));

  const fitW = Math.max(1, Math.round(displayW * fitMultiplier));
  const fitH = Math.max(1, Math.round(displayH * fitMultiplier));
  const renderedW = scaleToFit ? fitW : displayW;
  const renderedH = scaleToFit ? fitH : displayH;

  const activeResult = activeItem ? results[activeItem.id] : null;

  // Execute Resize / Crop Action
  async function handleExecute() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setDone(false);

    const isBatch = items.length > 1;
    const isCrop = settings.mode === "crop";
    const processedFiles: { blob: Blob; name: string }[] = [];
    const newResults: Record<string, ResizeResult> = { ...results };

    try {
      const targetItems = items;

      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        setProgress({ current: i + 1, total: targetItems.length, name: item.file.name });

        const image = await loadImageFile(item.file);

        // Merge tool-wide settings with per-item customization
        const itemSaved = perItemMapRef.current[item.id] || {};
        let itemSettings: ResizeSettings = {
          ...settings,
          ...itemSaved,
          mode: settings.mode,
          format: settings.format,
          quality: settings.quality,
          fit: settings.fit,
          background: settings.background,
          customBackground: settings.customBackground,
          sharpen: settings.sharpen,
          grayscale: settings.grayscale,
          neverUpscale: settings.neverUpscale,
          removeMetadata: settings.removeMetadata,
        };

        // For batch dimensions mode, maintain proportional scaling per image if aspect ratio locked
        if (isBatch && settings.mode === "dimensions" && settings.linked && item.width && item.height) {
          const targetW = Number(settings.width) || item.width;
          const ratio = item.height / item.width;
          itemSettings.width = String(targetW);
          itemSettings.height = String(Math.max(1, Math.round(targetW * ratio)));
        }

        const { canvas, format } = renderResize(image, item.file, itemSettings);
        const blob = await canvasToBlob(canvas, format, settings.quality / 100);
        const name = outputFilename(
          item.file.name,
          format,
          `-${canvas.width}x${canvas.height}`,
        );

        const previewUrl = URL.createObjectURL(blob);
        newResults[item.id] = {
          blob,
          previewUrl,
          name,
          bytes: blob.size,
          width: canvas.width,
          height: canvas.height,
          originalBytes: item.file.size,
        };

        processedFiles.push({ blob, name });
      }

      setResults(newResults);

      if (processedFiles.length === 1) {
        const single = processedFiles[0];
        downloadBlob(single.blob, single.name);
        setNoticeTone("success");
        setNotice(
          `Exported ${single.name} · ${newResults[targetItems[0].id].width} × ${
            newResults[targetItems[0].id].height
          } px · ${formatBytes(single.blob.size)}.`,
        );
      } else if (processedFiles.length > 1) {
        const zipName = isCrop ? "frebies-cropped.zip" : "frebies-resized.zip";
        await downloadAllAsZip(processedFiles, zipName);
        setNoticeTone("success");
        setNotice(`Exported all ${processedFiles.length} images bundled into ${zipName}.`);
      }
      setDone(true);
    } catch (thrown) {
      setNoticeTone("error");
      setNotice(
        thrown instanceof Error
          ? thrown.message
          : "An error occurred while processing the images. Please try again.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  // Finished output for the images currently in the queue
  const readyResults = items
    .map((item) => results[item.id])
    .filter((result): result is ResizeResult => Boolean(result));
  const outputReady = done && !busy && items.length > 0 && readyResults.length === items.length;
  const totalOutputBytes = readyResults.reduce((sum, result) => sum + result.bytes, 0);
  const firstResult = readyResults[0];

  /** Save the finished output again: the file itself, or a ZIP for a batch. */
  function downloadOutput() {
    if (readyResults.length === 0) return;
    if (readyResults.length === 1) {
      downloadBlob(readyResults[0].blob, readyResults[0].name);
      return;
    }
    void downloadAllAsZip(
      readyResults.map((result) => ({ blob: result.blob, name: result.name })),
      settings.mode === "crop" ? "frebies-cropped.zip" : "frebies-resized.zip",
    );
  }

  const isCrop = settings.mode === "crop";
  const verb = isCrop ? "Crop" : "Resize";
  const hasOutputSize = outputWidth > 0 && outputHeight > 0;
  const actionLabel =
    items.length === 0
      ? "Resize or crop"
      : items.length > 1
        ? `${verb} ${items.length} images`
        : hasOutputSize
          ? `${verb} to ${outputWidth} × ${outputHeight}`
          : `${verb} image`;
  const actionHint =
    items.length === 0
      ? "Add an image to get started"
      : items.length > 1
        ? "Downloads as one ZIP when it finishes"
        : estimate > 0
          ? `About ${formatBytes(estimate)} · downloads when it finishes`
          : "Downloads when it finishes";
  const noticeError = noticeTone === "error" ? notice : null;

  return (
    <StudioFrame id="resize" label="Image resize and crop studio">
      <StudioStage>
        {items.length === 0 || !activeItem ? (
          <StudioDropzone
            title="Drop an image to resize or crop"
            description="Set exact pixels, scale by percent, or crop to a ratio. Add several images to do them in one go."
            buttonLabel="Choose images"
            limits={`JPG, PNG, WebP, AVIF, HEIC, BMP · up to ${maxSizeMB} MB each · ${MAX_FILES} per batch`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <StudioChip>Exact pixels</StudioChip>
                <StudioChip>Ratio crop</StudioChip>
                <StudioChip>Batch to ZIP</StudioChip>
              </>
            }
          />
        ) : (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            {outputReady && firstResult ? (
              <ResultCard
                className="shrink-0"
                title={
                  readyResults.length === 1
                    ? `${firstResult.name} is ready`
                    : `${readyResults.length} images are ready`
                }
                meta={
                  readyResults.length === 1
                    ? `${firstResult.width} × ${firstResult.height} px · ${formatBytes(firstResult.bytes)}${
                        firstResult.originalBytes > firstResult.bytes
                          ? ` · ${Math.round(
                              ((firstResult.originalBytes - firstResult.bytes) / firstResult.originalBytes) * 100,
                            )}% smaller`
                          : ""
                      }`
                    : `${formatBytes(totalOutputBytes)} in total · was ${formatBytes(totalInputBytes)}`
                }
              >
                {readyResults.length > 1 && activeResult ? (
                  <button
                    type="button"
                    onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                    className="inline-flex h-10 items-center rounded-[12px] border border-[#cfe6d8] bg-white px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
                  >
                    This image
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={downloadOutput}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
                >
                  <Download size={15} aria-hidden />
                  {readyResults.length === 1 ? "Download" : "Download ZIP"}
                </button>
              </ResultCard>
            ) : null}

            {/* Toolbar: what goes in, what comes out, and how the canvas is shown */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {originalWidth && originalHeight ? (
                  <>
                    <Chip>
                      <span className="sr-only">Original size </span>
                      {originalWidth} × {originalHeight}
                    </Chip>
                    <ArrowRight size={14} className="shrink-0 text-faint" aria-hidden />
                    <Chip className="!border-ink/25 !font-semibold !text-ink">
                      <span className="sr-only">Output size </span>
                      {outputWidth} × {outputHeight} px
                    </Chip>
                    {estimate > 0 ? (
                      <span className="text-[12.5px] tabular-nums text-faint">
                        about {formatBytes(estimate)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Chip>Reading image…</Chip>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {!isCrop && (
                  <div
                    role="group"
                    aria-label="Preview zoom"
                    className="flex h-8 items-center rounded-[10px] bg-card p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setScaleToFit(true)}
                      aria-pressed={scaleToFit}
                      title={`Fit the canvas (${Math.round(fitMultiplier * 100)}%)`}
                      className={`h-7 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors ${
                        scaleToFit
                          ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      Fit
                    </button>
                    <button
                      type="button"
                      onClick={() => setScaleToFit(false)}
                      aria-pressed={!scaleToFit}
                      title="Show actual pixels"
                      className={`h-7 rounded-[8px] px-2.5 text-[12.5px] font-medium tabular-nums transition-colors ${
                        !scaleToFit
                          ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      100%
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  aria-pressed={showGrid}
                  title="Toggle checkerboard background"
                  aria-label="Toggle checkerboard background"
                  className={`grid h-8 w-8 place-items-center rounded-[10px] border transition-colors ${
                    showGrid
                      ? "border-ink bg-white text-ink"
                      : "border-line bg-white text-muted hover:text-ink"
                  }`}
                >
                  <Grid size={14} aria-hidden />
                </button>
              </div>
            </div>

            {/* The canvas */}
            <div
              ref={setStageEl}
              className={`relative min-h-[max(320px,52svh)] flex-1 overflow-hidden rounded-[16px] border transition-colors lg:min-h-0 ${
                dragging ? "border-accent" : "border-line"
              } ${
                showGrid
                  ? "bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] bg-[#fbfaf8]"
                  : "bg-[#f1efeb]"
              }`}
            >
              <div className="absolute inset-0 flex overflow-auto p-4">
                {isCrop ? (
                  <CropCanvas
                    key={activeItem.id}
                    src={currentPreview}
                    naturalWidth={sourceWidth}
                    naturalHeight={sourceHeight}
                    crop={activeCrop}
                    ratioId={settings.cropRatio}
                    stageWidth={availableW}
                    stageHeight={availableH - 48}
                    onChange={handleCropChange}
                  />
                ) : (
                  <img
                    src={currentPreview}
                    alt={`Preview of ${activeItem.file.name}`}
                    draggable={false}
                    className={`m-auto shrink-0 select-none rounded-[6px] border border-black/10 shadow-[0_10px_30px_-12px_rgba(15,15,16,0.35)] ${
                      settings.fit === "fill"
                        ? "object-cover"
                        : settings.fit === "stretch"
                          ? "object-fill"
                          : "object-contain"
                    }`}
                    style={{
                      width: `${renderedW}px`,
                      height: `${renderedH}px`,
                      maxWidth: scaleToFit ? "100%" : "none",
                      maxHeight: scaleToFit ? "100%" : "none",
                      backgroundColor:
                        settings.mode === "dimensions" && settings.fit === "fit"
                          ? backgroundValue(settings) || "transparent"
                          : undefined,
                    }}
                  />
                )}
              </div>
            </div>

            {/* The loaded image, or the batch */}
            {items.length === 1 ? (
              <div className="flex shrink-0 items-stretch gap-2">
                <FileRow
                  className="min-w-0 flex-1"
                  icon={<ImageIcon size={16} aria-hidden />}
                  name={activeItem.file.name}
                  meta={formatBytes(activeItem.file.size)}
                  onReplace={() => openPicker(activeItem.id)}
                  onRemove={() => handleRemoveItem(activeItem.id)}
                />
                <button
                  type="button"
                  onClick={() => openPicker()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border border-line bg-white px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
                >
                  <Plus size={14} aria-hidden />
                  Add<span className="max-sm:sr-only"> more</span>
                </button>
              </div>
            ) : (
              <div className="shrink-0">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <p className="min-w-0 truncate text-[12.5px] text-faint">
                    <span className="font-medium text-ink">{activeItem.file.name}</span>
                    <span className="tabular-nums">
                      {" "}
                      · {activeIndex + 1} of {items.length} · {formatBytes(totalInputBytes)} in total
                    </span>
                  </p>
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => openPicker(activeItem.id)} className={TOOLBAR_BUTTON}>
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(activeItem.id)}
                      data-slot="item-remove"
                      className={TOOLBAR_BUTTON}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      data-variant="destructive"
                      className={`${TOOLBAR_BUTTON} hover:!text-danger`}
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {items.map((item) => {
                    const isSelected = item.id === activeItem.id;
                    const itemRes = results[item.id];

                    return (
                      <li key={item.id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveId(item.id)}
                          data-slot="queue-item"
                          aria-pressed={isSelected}
                          aria-label={
                            itemRes
                              ? `${item.file.name}, exported at ${itemRes.width} by ${itemRes.height} pixels`
                              : item.file.name
                          }
                          title={item.file.name}
                          className={`relative block h-[68px] w-[68px] overflow-hidden rounded-[11px] border-2 bg-card transition-colors ${
                            isSelected ? "border-ink" : "border-line hover:border-[#cfc9bd]"
                          }`}
                        >
                          <img
                            src={transformedMap[item.id] || item.preview}
                            alt=""
                            className="h-full w-full select-none object-cover"
                          />
                          {itemRes ? (
                            <>
                              <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-success text-white">
                                <Check size={10} strokeWidth={3} aria-hidden />
                              </span>
                              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-0.5 py-0.5 text-center text-[11px] font-medium leading-tight tabular-nums text-white">
                                {itemRes.width}×{itemRes.height}
                              </span>
                            </>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                  <li className="shrink-0">
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      aria-label="Add more images to the batch"
                      className="grid h-[68px] w-[68px] place-items-center rounded-[11px] border-2 border-dashed border-[#d5d1c8] text-faint transition-colors hover:border-[#b5ae9f] hover:bg-white hover:text-ink"
                    >
                      <Plus size={18} aria-hidden />
                    </button>
                  </li>
                </ul>
              </div>
            )}
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

        {/* Drives the success / error sound cues */}
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
        {noticeError ? (
          <Note tone="error" className="mt-3 shrink-0">
            {noticeError}
          </Note>
        ) : null}
      </StudioStage>

      <ImageResizeSettings
        action={
          outputReady && firstResult ? (
            <>
              <DownloadAction
                label={
                  readyResults.length === 1
                    ? "Download image"
                    : `Download ${readyResults.length} images (ZIP)`
                }
                onClick={downloadOutput}
                hint={
                  readyResults.length === 1
                    ? `${firstResult.width} × ${firstResult.height} px · ${formatBytes(firstResult.bytes)}`
                    : `${formatBytes(totalOutputBytes)} in total`
                }
              />
              <ActionRow>
                <SecondaryAction onClick={() => setDone(false)} icon={<Pencil size={13} aria-hidden />}>
                  Keep editing
                </SecondaryAction>
                <StartOverAction
                  onClick={handleClearAll}
                  label={readyResults.length === 1 ? "New image" : "Start over"}
                />
              </ActionRow>
            </>
          ) : (
            <PrimaryAction
              label={actionLabel}
              busyLabel={
                progress && progress.total > 1
                  ? `Image ${progress.current} of ${progress.total}`
                  : isCrop
                    ? "Cropping…"
                    : "Resizing…"
              }
              icon={isCrop ? <Crop size={16} aria-hidden /> : <Scaling size={16} aria-hidden />}
              busy={busy}
              progress={
                progress && progress.total > 1 ? (progress.current - 1) / progress.total : undefined
              }
              disabled={items.length === 0}
              onClick={handleExecute}
              hint={actionHint}
            />
          )
        }
        settings={settings}
        onPatch={patch}
        onReset={handleReset}
        sourceWidth={sourceWidth}
        sourceHeight={sourceHeight}
        outputWidth={outputWidth}
        outputHeight={outputHeight}
        upscaling={output.upscaling}
        capped={output.capped}
        cropWidth={cropPixelSize.width}
        cropHeight={cropPixelSize.height}
      />
    </StudioFrame>
  );
}
