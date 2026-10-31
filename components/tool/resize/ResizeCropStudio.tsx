"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Crop,
  Percent,
  Download,
  FileArchive,
  Grid,
  ImagePlus,
  Loader2,
  Maximize2,
  Plus,
  RotateCw,
  Scaling,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
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
  CROP_RATIOS,
  DEFAULT_RESIZE_SETTINGS,
  backgroundValue,
  computeResizeOutput,
  cropForRatio,
  cropPixels,
  cropRatioValue,
  estimateResizeBytes,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  reshapeCrop,
  type CropRect,
  type CropRatioId,
  type ResizeSettings,
} from "./model";

const MAX_FILES = 10;

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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name?: string } | null>(null);
  const [results, setResults] = useState<Record<string, ResizeResult>>({});

  // Per-item settings map to preserve crop/rotation/dimensions when switching between queue items
  const [perItemMap, setPerItemMap] = useState<Record<string, PerItemCustomSettings>>({});
  const perItemMapRef = useRef<Record<string, PerItemCustomSettings>>({});
  perItemMapRef.current = perItemMap;

  // Keyed transformed previews per item ID to prevent stale preview bleed-through
  const [transformedMap, setTransformedMap] = useState<Record<string, string>>({});
  const transformedUrlsRef = useRef<Record<string, string>>({});

  const stageRef = useRef<HTMLDivElement>(null);
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

  // Measure stage size for scaleToFit
  useLayoutEffect(() => {
    if (!stageRef.current) return;
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
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

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
  }

  function handleReset() {
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

  function resetCrop() {
    if (!sourceWidth || !sourceHeight) return;
    patch({
      crop: cropForRatio(
        sourceWidth / sourceHeight,
        cropRatioValue(settings.cropRatio),
      ),
    });
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

  // Viewport calculation for Fit vs 100%
  const paddingX = 48;
  const paddingY = 88;
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
        setNotice(
          `Exported ${single.name} · ${newResults[targetItems[0].id].width} × ${
            newResults[targetItems[0].id].height
          } px · ${formatBytes(single.blob.size)}. 100% on-device.`,
        );
      } else if (processedFiles.length > 1) {
        const zipName = isCrop ? "frebies-cropped.zip" : "frebies-resized.zip";
        await downloadAllAsZip(processedFiles, zipName);
        setNotice(`Exported all ${processedFiles.length} images bundled into ${zipName}.`);
      }
    } catch (thrown) {
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

  return (
    <section
      id="resize"
      aria-label="Image resize and crop studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white shadow-xs"
    >
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink shadow-xs">
            <ToolGlyph path="/image/resize" size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Resize &amp; Crop Studio
            </h2>
            <p className="mt-0.5 text-[11.5px] text-faint">
              Pixel precision · Percentage scaling · Interactive ratio crop · 100% on-device
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-medium text-muted">
            <Scaling size={12} aria-hidden />
            {activeItem && outputWidth ? `${outputWidth} × ${outputHeight} px` : "Ready"}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#d9e3d5] bg-[#f4f8f2] px-3 py-1.5 text-[11.5px] font-medium text-[#4a6b47]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5f8a56]" aria-hidden />
            100% On-device
          </span>
          <span className="hidden items-center gap-1.5 text-[11.5px] text-faint sm:flex">
            <LockGlyph size={12} />
            No upload · Private
          </span>
        </div>
      </div>

      {/* Main Studio Grid: Workspace + Settings Rail */}
      <div className="grid lg:h-[820px] lg:grid-cols-[minmax(0,1fr)_380px] xl:h-[860px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left Side: Dropzone, Canvas & Filmstrip */}
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <StudioDropzone
              title="Drop your images here to resize or crop"
              description="Set exact pixel dimensions, scale by percentage, or crop with live ratio presets. Supports single file or batch up to 10 images."
              buttonLabel="Choose image"
              limits={`JPG, PNG, WebP, AVIF, HEIC, BMP · up to ${maxSizeMB} MB each · ${MAX_FILES} per batch`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <StudioChip icon={<Scaling size={10} aria-hidden />}>Exact pixel dimensions</StudioChip>
                  <StudioChip icon={<Scaling size={10} aria-hidden />}>Aspect ratio lock</StudioChip>
                  <StudioChip icon={<Check size={10} aria-hidden />}>Free &amp; ratio crop</StudioChip>
                  <StudioChip icon={<FileArchive size={10} aria-hidden />}>Batch ZIP export</StudioChip>
                </>
              }
            />
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-0 flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              {/* Active Image Stage Viewport */}
              <div
                ref={stageRef}
                className={`relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line transition-colors ${
                  showGrid
                    ? "bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] bg-[#fbfaf8]"
                    : "bg-[#f1efeb]"
                }`}
              >
                {/* Stage Header Controls: Quick Mode Switcher & Output Dimension */}
                <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
                  <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-2xs backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => patch({ mode: "crop" })}
                      className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        settings.mode === "crop"
                          ? "bg-ink font-semibold text-white shadow-2xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <Crop size={12} aria-hidden />
                      <span>Crop Box</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ mode: "dimensions" })}
                      className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        settings.mode === "dimensions"
                          ? "bg-ink font-semibold text-white shadow-2xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <Scaling size={12} aria-hidden />
                      <span>Dimensions</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ mode: "percent" })}
                      className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        settings.mode === "percent"
                          ? "bg-ink font-semibold text-white shadow-2xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <Percent size={12} aria-hidden />
                      <span>Scale %</span>
                    </button>
                  </div>

                  <span className="flex items-center gap-1 rounded-lg border border-[#cbe4c7] bg-[#f4faf2]/95 px-2.5 py-1 text-[11px] font-semibold text-[#305e2b] shadow-2xs backdrop-blur-sm">
                    <span>→ {outputWidth} × {outputHeight} px</span>
                    {busy && <Loader2 size={11} className="ml-0.5 animate-spin" />}
                  </span>
                </div>

                {/* Top Right Stage Controls: Fit/100%, Grid, and Quick Save */}
                <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 pointer-events-auto">
                  {/* Scale to Fit toggle */}
                  {settings.mode !== "crop" && (
                    <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-2xs backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => setScaleToFit(true)}
                        className={`flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors ${
                          scaleToFit ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"
                        }`}
                        title={`Fit stage (${Math.round(fitMultiplier * 100)}%)`}
                      >
                        <Maximize2 size={11} aria-hidden />
                        <span>Fit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScaleToFit(false)}
                        className={`flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors ${
                          !scaleToFit ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"
                        }`}
                        title="Show actual 100% pixels"
                      >
                        <span>100%</span>
                      </button>
                    </div>
                  )}

                  {/* Checkerboard Grid toggle */}
                  <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className={`grid h-8 w-8 place-items-center rounded-[9px] border transition-colors ${
                      showGrid
                        ? "border-ink bg-rail text-ink shadow-2xs"
                        : "border-line bg-white/95 text-muted hover:text-ink"
                    }`}
                    title="Toggle checkerboard background"
                    aria-label="Toggle checkerboard background"
                  >
                    <Grid size={12} aria-hidden />
                  </button>

                  {/* Quick Save of Active Result */}
                  {activeResult && (
                    <button
                      type="button"
                      onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                      className="inline-flex h-8 items-center gap-1 rounded-[9px] border border-line bg-white/95 px-2.5 text-[11px] font-medium text-ink shadow-2xs backdrop-blur-sm hover:bg-hover"
                      title="Download this file"
                    >
                      <Download size={12} aria-hidden />
                      <span className="hidden sm:inline">Save</span>
                    </button>
                  )}
                </div>

                {/* Center Canvas Stage Content */}
                {activeItem && (
                  <div className="absolute inset-0 flex items-center justify-center overflow-auto px-4 pt-11 pb-7">
                    {settings.mode === "crop" ? (
                      <div className="relative flex h-full w-full items-center justify-center">
                        <CropCanvas
                          key={activeItem.id}
                          src={currentPreview}
                          naturalWidth={sourceWidth}
                          naturalHeight={sourceHeight}
                          crop={activeCrop}
                          ratioId={settings.cropRatio}
                          stageWidth={availableW}
                          stageHeight={availableH - 40}
                          onChange={handleCropChange}
                          onRatioChange={(r) => patch({ cropRatio: r })}
                          onReset={resetCrop}
                        />
                      </div>
                    ) : (
                      <div className="relative flex items-center justify-center shrink-0">
                        <img
                          src={currentPreview}
                          alt={`Preview of ${activeItem.file.name}`}
                          className={`rounded-[8px] shadow-md border border-black/10 select-none shrink-0 ${
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
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active Image Specs and Actions Bar */}
              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-white px-3 py-2 shadow-2xs">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-ink">
                      <ToolGlyph path="/image/resize" size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-ink" title={activeItem.file.name}>
                        {activeItem.file.name}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-faint tabular-nums">
                        {formatBytes(activeItem.file.size)} · {originalWidth} × {originalHeight} px
                        <span className="ml-1.5 font-semibold text-[#305e2b]">
                          → {outputWidth} × {outputHeight} px
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <ImagePlus size={11} aria-hidden />
                      <span>Add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openPicker(activeItem.id)}
                      className="inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(activeItem.id)}
                      aria-label="Remove image"
                      className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                    >
                      <X size={12} />
                    </button>
                  </div>
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

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {notice && (
            <p role="status" className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-[#3d6b4a]">
              <Check size={13} className="mt-0.5 shrink-0" aria-hidden />
              {notice}
            </p>
          )}

          {/* Batch Thumbnails Filmstrip Queue */}
          {items.length > 1 && (
            <div className="mt-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
                  Batch queue ({items.length}) · {formatBytes(totalInputBytes)}
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11.5px] text-faint transition-colors hover:text-ink"
                >
                  Clear queue
                </button>
              </div>

              <ul className="mt-2 flex gap-2 overflow-x-auto pb-1.5 pt-0.5">
                {items.map((item) => {
                  const isSelected = item.id === activeItem?.id;
                  const itemRes = results[item.id];

                  return (
                    <li key={item.id} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        className={`group relative flex h-[126px] w-[140px] flex-col rounded-[11px] border p-2 text-left transition-all ${
                          isSelected
                            ? "border-ink bg-white shadow-xs ring-1 ring-ink/20"
                            : "border-line bg-white/70 hover:border-[#d5d1c8] hover:bg-white"
                        }`}
                      >
                        <div className="relative h-[78px] w-full overflow-hidden rounded-[7px] bg-[#f2efe9]">
                          <img
                            src={transformedMap[item.id] || item.preview}
                            alt=""
                            className="h-full w-full object-contain select-none"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            {itemRes ? itemRes.name.split(".").pop() : "IMG"}
                          </span>
                          {itemRes && (
                            <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#557550] text-[9px] text-white">
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 min-w-0">
                          <p className="truncate text-[11.5px] font-medium text-ink" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-faint tabular-nums">
                            {item.width && item.height ? `${item.width}×${item.height}` : formatBytes(item.file.size)}
                            {itemRes && (
                              <span className="text-ink font-semibold ml-1">
                                → {itemRes.width}×{itemRes.height}
                              </span>
                            )}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
                <li className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => openPicker()}
                    aria-label="Add more images to batch"
                    className="flex h-[126px] w-[76px] flex-col items-center justify-center rounded-[11px] border border-dashed border-[#d5d1c8] bg-white/40 text-faint transition-colors hover:border-[#b5ae9f] hover:bg-white hover:text-ink"
                  >
                    <Plus size={18} aria-hidden />
                    <span className="mt-1 text-[11px] font-medium">Add</span>
                  </button>
                </li>
              </ul>
            </div>
          )}

          {/* Bottom Execution Bar */}
          <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
              <ShieldCheck size={14} aria-hidden className="text-[#557550]" />
              {items.length === 0
                ? "Free · No upload · Pixel precision · 100% on-device canvas engine"
                : "Free · No upload · 100% on-device canvas engine"}
            </p>

            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => openPicker()}
                  className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[12px] font-medium text-ink shadow-xs transition-colors hover:bg-hover sm:inline-flex"
                >
                  <ImagePlus size={13} aria-hidden />
                  <span>Add more</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExecute}
                disabled={items.length === 0 || busy}
                className={buttonClasses(
                  "primary",
                  "md",
                  "w-full min-w-0 sm:w-auto sm:min-w-[170px] shadow-sm",
                )}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    <span>
                      {progress
                        ? `Processing (${progress.current}/${progress.total})…`
                        : "Processing…"}
                    </span>
                  </>
                ) : (
                  <>
                    {items.length > 1 && <FileArchive size={13} aria-hidden />}
                    <span>
                      {items.length > 1
                        ? settings.mode === "crop"
                          ? `Crop all (${items.length})`
                          : `Resize all (${items.length})`
                        : settings.mode === "crop"
                          ? "Crop & Download"
                          : "Resize & Download"}
                    </span>
                    {items.length === 1 && <ArrowRightGlyph size={13} />}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Elevated Settings Rail */}
        <ImageResizeSettings
          settings={settings}
          onPatch={patch}
          onReset={handleReset}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          outputWidth={outputWidth}
          outputHeight={outputHeight}
          scale={output.scale}
          upscaling={output.upscaling}
          capped={output.capped}
          cropWidth={cropPixelSize.width}
          cropHeight={cropPixelSize.height}
          onResetCrop={resetCrop}
          originalBytes={activeItem?.file.size ?? 0}
          estimatedBytes={estimate}
        />
      </div>
    </section>
  );
}
