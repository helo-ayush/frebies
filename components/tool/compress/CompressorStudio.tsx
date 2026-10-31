"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Check,
  Download,
  FileArchive,
  Grid,
  Images,
  ImagePlus,
  Loader2,
  Maximize2,
  Percent,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  ImageCompressSettings,
  DEFAULT_COMPRESS_SETTINGS,
  type CompressSettings,
} from "./ImageCompressSettings";
import { compressFile, type CompressOutcome } from "@/lib/image/compress";
import {
  fitWithin,
  downloadAllAsZip,
  downloadBlob,
  formatBytes,
  outputFilename,
  roundSize,
  type EncodeFormat,
} from "@/lib/image/encode";
import { maxEdgeOf, reductionPercent, resolveOutputFormat, targetBytes } from "./model";

const MAX_FILES = 20;

function truncateFilename(name: string, maxLen = 22): string {
  if (!name || name.length <= maxLen) return name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = name.slice(dotIndex);
    const base = name.slice(0, dotIndex);
    const avail = Math.max(3, maxLen - ext.length - 3);
    return `${base.slice(0, avail)}…${ext}`;
  }
  return `${name.slice(0, maxLen - 1)}…`;
}

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
};

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

  const activeResult = activeItem ? results[activeItem.id] : null;

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

  const targetSize = useMemo(() => {
    if (!dimensions) return null;
    const { width, height } = dimensions;
    if (settings.resizeMode === "scale") {
      const scale = Math.max(0.05, Math.min(1, settings.scalePercent / 100));
      return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)) };
    }
    if (settings.resizeMode === "maxEdge") {
      return fitWithin(width, height, settings.maxEdgePx);
    }
    if (settings.resizeMode === "custom") {
      return { width: settings.customWidth, height: settings.customHeight };
    }
    if (settings.resize !== "original") {
      const edge = Number(settings.resize);
      if (Number.isFinite(edge) && edge > 0) return fitWithin(width, height, edge);
    }
    return { width, height };
  }, [
    dimensions,
    settings.resizeMode,
    settings.scalePercent,
    settings.maxEdgePx,
    settings.customWidth,
    settings.customHeight,
    settings.resize,
  ]);

  // Real-time live compression for active item
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeItem) return;

    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }

    setPreviewBusy(true);

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const targetFormat = resolveOutputFormat(settings, activeItem.file);
        const outcome = await compressFile(activeItem.file, {
          goal: settings.goal,
          quality: settings.quality,
          targetBytes: targetBytes(settings),
          percent: settings.percent,
          format: targetFormat,
          maxEdge: settings.resizeMode === "maxEdge" ? settings.maxEdgePx : maxEdgeOf(settings),
          scalePercent: settings.resizeMode === "scale" ? settings.scalePercent : undefined,
          customWidth: settings.resizeMode === "custom" ? settings.customWidth : undefined,
          customHeight: settings.resizeMode === "custom" ? settings.customHeight : undefined,
          backgroundColor: !settings.preserveAlpha || targetFormat === "jpeg" ? settings.backgroundColor : null,
          keepOriginalIfLarger: settings.keepSmaller,
          sharpen: settings.sharpenAmount > 0 ? settings.sharpenAmount : (settings.sharpen ? 0.3 : 0),
          grayscale: settings.grayscale,
        });

        const previewUrl = URL.createObjectURL(outcome.blob);
        const name = outputFilename(
          activeItem.file.name,
          outcome.format,
          outcome.keptOriginal ? "-original" : "-compressed",
        );

        setResults((prev) => {
          if (prev[activeItem.id]?.previewUrl && prev[activeItem.id].previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(prev[activeItem.id].previewUrl);
          }
          return {
            ...prev,
            [activeItem.id]: {
              ...outcome,
              previewUrl,
              name,
            },
          };
        });
      } catch (err) {
        console.error("Live compression preview failed:", err);
      } finally {
        setPreviewBusy(false);
      }
    }, 140);

    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [
    activeItem?.id,
    activeItem?.file,
    settings.goal,
    settings.quality,
    settings.targetValue,
    settings.targetUnit,
    settings.percent,
    settings.format,
    settings.resize,
    settings.keepSmaller,
    settings.sharpen,
    settings.grayscale,
  ]);

  // Handle batch compression / download
  async function handleCompressAll() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setProgress({ current: 0, total: items.length });

    const newResults: Record<string, CompressorStudioResult> = { ...results };

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        setProgress({ current: i + 1, total: items.length, name: item.file.name });

        if (!newResults[item.id]) {
          const targetFormat = resolveOutputFormat(settings, item.file);
          const outcome = await compressFile(item.file, {
            goal: settings.goal,
            quality: settings.quality,
            targetBytes: targetBytes(settings),
            percent: settings.percent,
            format: targetFormat,
            maxEdge: maxEdgeOf(settings),
            keepOriginalIfLarger: settings.keepSmaller,
            sharpen: settings.sharpen ? 0.45 : 0,
            grayscale: settings.grayscale,
          });

          const previewUrl = URL.createObjectURL(outcome.blob);
          const name = outputFilename(
            item.file.name,
            outcome.format,
            outcome.keptOriginal ? "-original" : "-compressed",
          );

          newResults[item.id] = {
            ...outcome,
            previewUrl,
            name,
          };
        }
      }

      setResults({ ...newResults });

      if (items.length === 1 && activeItem && newResults[activeItem.id]) {
        downloadBlob(newResults[activeItem.id].blob, newResults[activeItem.id].name);
        setNotice(
          `Saved ${newResults[activeItem.id].name} (${formatBytes(newResults[activeItem.id].bytes)}).`,
        );
      } else if (items.length > 1) {
        await handleDownloadZip();
      }
    } catch (thrown) {
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
      const filesToZip: { blob: Blob; name: string }[] = [];

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        let outcome = results[item.id];
        if (!outcome) {
          const targetFormat = resolveOutputFormat(settings, item.file);
          const res = await compressFile(item.file, {
            goal: settings.goal,
            quality: settings.quality,
            targetBytes: targetBytes(settings),
            percent: settings.percent,
            format: targetFormat,
            maxEdge: maxEdgeOf(settings),
            keepOriginalIfLarger: settings.keepSmaller,
            sharpen: settings.sharpen ? 0.45 : 0,
            grayscale: settings.grayscale,
          });
          const name = outputFilename(
            item.file.name,
            res.format,
            res.keptOriginal ? "-original" : "-compressed",
          );
          outcome = { ...res, previewUrl: URL.createObjectURL(res.blob), name };
          setResults((prev) => ({ ...prev, [item.id]: outcome }));
        }
        filesToZip.push({ blob: outcome.blob, name: outcome.name });
      }

      await downloadAllAsZip(filesToZip, "frebies-compressed.zip");
      setNotice(`Saved ZIP with ${filesToZip.length} compressed files.`);
    } catch (err) {
      setNotice("Could not generate ZIP archive. Please download files individually.");
    } finally {
      setBusy(false);
    }
  }

  // Dynamic stage measurement for true full-container "Fit" scaling
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 760,
    height: 480,
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setStageSize({ width: Math.round(width), height: Math.round(height) });
          }
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const currentW =
    viewMode === "original"
      ? (dimensions?.width || 1)
      : activeResult
        ? activeResult.width
        : (dimensions?.width || 1);
  const currentH =
    viewMode === "original"
      ? (dimensions?.height || 1)
      : activeResult
        ? activeResult.height
        : (dimensions?.height || 1);

  const availableW = Math.max(120, stageSize.width - 48);
  const availableH = Math.max(120, stageSize.height - 120);

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
    return sum + (results[item.id]?.bytes ?? item.file.size);
  }, 0);
  const totalSavings = totalInputBytes > 0 ? reductionPercent(totalInputBytes, totalOutputBytes) : 0;

  return (
    <section
      id="compressor"
      aria-label="Image compression studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white shadow-sm"
    >
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink shadow-xs">
            <ToolGlyph path="/image/compress" size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Image Compression Studio
            </h2>
            <p className="mt-0.5 text-[11.5px] text-faint">
              Target file size · Visual quality slider · Percentage cut · 100% on-device
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-medium text-muted">
            <Images size={12} aria-hidden />
            {items.length > 1
              ? `${items.length} in batch · −${totalSavings}% total`
              : settings.goal === "target"
                ? `Target: ${settings.targetValue} ${settings.targetUnit}`
                : settings.goal === "quality"
                  ? `${settings.quality}% quality`
                  : `−${settings.percent}% cut`}
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
        {/* Left Side: Dropzone, Image Canvas & Batch Filmstrip */}
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <StudioDropzone
              title="Drop your images here"
              description="Compress JPG, PNG, WebP, AVIF, HEIC or BMP. Hit an exact KB size or tune quality. Single file or batch up to 20 images."
              buttonLabel="Choose images"
              limits={`JPG, PNG, WebP, AVIF, HEIC, BMP · up to ${maxSizeMB} MB each · ${MAX_FILES} per batch`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <StudioChip icon={<Target size={10} aria-hidden />}>Target file size (KB/MB)</StudioChip>
                  <StudioChip icon={<Percent size={10} aria-hidden />}>Quality slider</StudioChip>
                  <StudioChip icon={<FileArchive size={10} aria-hidden />}>ZIP download</StudioChip>
                  <StudioChip icon={<Check size={10} aria-hidden />}>Batch up to {MAX_FILES}</StudioChip>
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
              {/* Active Image Stage */}
              <div
                ref={stageRef}
                className={`relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line transition-colors ${
                  showGrid
                    ? "bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] bg-[#fbfaf8]"
                    : "bg-[#f1efeb]"
                }`}
              >
                {/* Stage Header: Format and Outcome Tag */}
                <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 pointer-events-auto">
                  <span className="rounded-lg border border-line bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur-sm shadow-2xs">
                    {sourceFormat(activeItem?.file)}
                  </span>
                  <span className="flex items-center gap-1 rounded-lg border border-[#cbe4c7] bg-[#f4faf2]/95 px-2.5 py-1 text-[11px] font-semibold text-[#305e2b] backdrop-blur-sm shadow-2xs">
                    <span>
                      → {activeResult ? `${formatBytes(activeResult.bytes)}` : "Compressing…"}
                    </span>
                    {previewBusy && <Loader2 size={11} className="animate-spin ml-0.5" />}
                  </span>
                </div>

                {/* Top Right Controls: Scale-to-Fit, Transparency Grid & Size Readout */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 pointer-events-auto">
                  {/* Scale to Fit toggle */}
                  <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-2xs backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => setScaleToFit(true)}
                      className={`flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors ${
                        scaleToFit ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"
                      }`}
                      title={`Fit to stage (${Math.round(fitMultiplier * 100)}%)`}
                    >
                      <Maximize2 size={11} aria-hidden />
                      <span>
                        {scaleToFit
                          ? `Fit (${Math.round(fitMultiplier * 100)}%)`
                          : "Fit"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScaleToFit(false)}
                      className={`flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors ${
                        !scaleToFit ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"
                      }`}
                      title="Show actual size (100%, 1:1 screen pixels)"
                      aria-label="Show actual size"
                    >
                      <span>100%</span>
                    </button>
                  </div>

                  {/* Checkerboard toggle */}
                  <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className={`grid h-8 w-8 place-items-center rounded-[9px] border transition-colors ${
                      showGrid
                        ? "border-ink bg-rail text-ink shadow-2xs"
                        : "border-line bg-white/95 text-muted hover:text-ink"
                    }`}
                    title="Toggle transparency grid"
                    aria-label="Toggle transparency grid"
                  >
                    <Grid size={12} aria-hidden />
                  </button>

                  {/* Resolution & Size readout */}
                  {activeItem && (
                    <div className="rounded-[9px] border border-line bg-white/95 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted backdrop-blur-sm shadow-2xs">
                      {targetSize && dimensions && (targetSize.width !== dimensions.width || targetSize.height !== dimensions.height) ? (
                        <span>
                          <span className="line-through text-faint mr-1">{dimensions.width}×{dimensions.height}</span>
                          <span className="font-bold text-ink">{targetSize.width}×{targetSize.height} px</span>
                        </span>
                      ) : activeResult ? (
                        <span>
                          <span className="line-through text-faint mr-1">
                            {formatBytes(activeResult.originalBytes)}
                          </span>
                          <span className="font-bold text-[#305e2b]">
                            {formatBytes(activeResult.bytes)}
                          </span>
                          <span className="ml-1 text-[10px] text-faint font-normal">
                            ({reductionPercent(activeResult.originalBytes, activeResult.bytes) > 0 ? `−${reductionPercent(activeResult.originalBytes, activeResult.bytes)}%` : "0%"})
                          </span>
                        </span>
                      ) : (
                        <span>{formatBytes(activeItem.file.size)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Center Image Viewport */}
                {activeItem && (
                  <div className="absolute inset-0 flex items-center justify-center overflow-auto p-4 pt-14 pb-16">
                    <div className="relative flex items-center justify-center shrink-0">
                      {activeResult && viewMode === "split" ? (
                        <div
                          className="relative overflow-hidden rounded-[8px] shadow-md select-none border border-black/10 shrink-0"
                          style={{
                            width: `${renderedW}px`,
                            height: `${renderedH}px`,
                            maxWidth: scaleToFit ? "100%" : "none",
                            maxHeight: scaleToFit ? "100%" : "none",
                            aspectRatio: `${currentW} / ${currentH}`,
                          }}
                        >
                          {/* Corner Badges */}
                          <span className="pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-xs backdrop-blur-xs">
                            Before ({formatBytes(activeItem.file.size)})
                          </span>
                          <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-xs backdrop-blur-xs">
                            After ({formatBytes(activeResult.bytes)})
                          </span>

                          {/* Base image: Compressed / After (visible on the right side) */}
                          <img
                            src={activeResult.previewUrl}
                            alt="Compressed"
                            className="w-full h-full object-contain select-none"
                            style={{
                              imageRendering: isMagnified ? "pixelated" : "auto",
                            }}
                          />
                          {/* Clipped foreground: Original / Before (visible on the left side) */}
                          <div
                            className="absolute inset-y-0 left-0 overflow-hidden"
                            style={{ width: `${splitPos}%` }}
                          >
                            <img
                              src={activeItem.preview}
                              alt="Original"
                              className="w-full h-full object-contain max-w-none select-none"
                              style={{
                                width: `${renderedW}px`,
                                height: `${renderedH}px`,
                                imageRendering: isMagnified ? "pixelated" : "auto",
                              }}
                            />
                          </div>
                          {/* Split line handle */}
                          <div
                            className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] cursor-ew-resize z-10"
                            style={{ left: `${splitPos}%` }}
                          >
                            <div className="absolute top-1/2 -left-3 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white text-[9px] shadow-lg">
                              ↔
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={splitPos}
                            onChange={(e) => setSplitPos(Number(e.target.value))}
                            aria-label="Before after split slider"
                            className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-20"
                          />
                        </div>
                      ) : (
                        <img
                          src={activeResult && viewMode === "converted" ? activeResult.previewUrl : activeItem.preview}
                          alt={`Preview of ${activeItem.file.name}`}
                          className="rounded-[8px] object-contain shadow-md border border-black/10 transition-all select-none shrink-0"
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

                {/* Bottom Overlay: View mode tabs on left + quick save on right */}
                <div className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  {/* Left: View Mode Switch */}
                  <div className="pointer-events-auto">
                    {activeResult && (
                      <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-xs backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => setViewMode("converted")}
                          className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            viewMode === "converted"
                              ? "bg-ink font-semibold text-white"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          Compressed
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("original")}
                          className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            viewMode === "original"
                              ? "bg-ink font-semibold text-white"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("split")}
                          className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            viewMode === "split"
                              ? "bg-ink font-semibold text-white"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          Split compare
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: Quick Save Action for Active Image */}
                  <div className="pointer-events-auto flex items-center gap-1.5">
                    {activeResult && (
                      <button
                        type="button"
                        onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-ink shadow-xs backdrop-blur-sm transition-colors hover:bg-hover"
                      >
                        <Download size={12} aria-hidden />
                        <span>Save {truncateFilename(activeResult.name, 18)}</span>
                        <span className="font-mono text-[10px] text-faint">
                          ({formatBytes(activeResult.bytes)})
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Item Details Bar */}
              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-white px-3 py-2 shadow-2xs">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-ink">
                      <ToolGlyph path="/image/compress" size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-ink">
                        {activeItem.file.name}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-faint tabular-nums">
                        {formatBytes(activeItem.file.size)}
                        {dimensions ? ` · ${dimensions.width} × ${dimensions.height} px` : ""}
                        {activeResult && (
                          <span className="ml-1.5 font-semibold text-[#305e2b]">
                            → {formatBytes(activeResult.bytes)} (−
                            {reductionPercent(activeResult.originalBytes, activeResult.bytes)}%)
                          </span>
                        )}
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
                      onClick={() => removeItem(activeItem.id)}
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

          {/* Batch Thumbnails Filmstrip */}
          {items.length > 1 && (
            <div className="mt-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
                  Batch queue ({items.length}) · {formatBytes(totalInputBytes)}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[11.5px] text-faint transition-colors hover:text-ink"
                  >
                    Clear queue
                  </button>
                </div>
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
                            src={itemRes ? itemRes.previewUrl : item.preview}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            {itemRes ? itemRes.format.toUpperCase() : sourceFormat(item.file)}
                          </span>
                          {itemRes && (
                            <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#557550] text-[9px] text-white">
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 min-w-0">
                          <p className="truncate text-[11.5px] font-medium text-ink" title={item.file.name}>
                            {truncateFilename(item.file.name, 18)}
                          </p>
                          <p className="text-[10.5px] text-faint">
                            {formatBytes(item.file.size)}
                            {itemRes && (
                              <span className="text-ink font-semibold ml-1">
                                → {formatBytes(itemRes.bytes)}
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
                    className="flex h-full min-h-[140px] w-[90px] flex-col items-center justify-center rounded-[11px] border border-dashed border-[#d5d1c8] bg-white/40 text-faint transition-colors hover:border-[#b5ae9f] hover:bg-white hover:text-ink"
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
                ? "Free · No upload · Exact target sizes · Client-side engine"
                : "Free · No upload · 100% on-device compression engine"}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openPicker()}
                disabled={busy || items.length >= MAX_FILES}
                className={buttonClasses("secondary", "md", "w-full sm:w-auto")}
              >
                <ImagePlus size={14} aria-hidden />
                <span>Add more</span>
              </button>

              <button
                type="button"
                onClick={handleCompressAll}
                disabled={!activeItem || busy}
                className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[170px]")}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    <span>Compressing {progress ? `(${progress.current}/${progress.total})` : "…"}</span>
                  </>
                ) : items.length > 1 ? (
                  <>
                    <FileArchive size={13} aria-hidden />
                    <span>Compress all ({items.length})</span>
                  </>
                ) : activeResult ? (
                  <>
                    <Download size={13} aria-hidden />
                    <span>Download compressed</span>
                  </>
                ) : (
                  <>
                    <span>Compress image</span>
                    <ArrowRightGlyph size={13} />
                  </>
                )}
              </button>
            </div>
          </div>


        </div>

        {/* Right Side Settings Rail */}
        <ImageCompressSettings
          settings={settings}
          dimensions={dimensions}
          targetSize={targetSize}
          originalBytes={activeItem ? activeItem.file.size : null}
          result={
            activeResult
              ? {
                  bytes: activeResult.bytes,
                  originalBytes: activeResult.originalBytes,
                  width: activeResult.width,
                  height: activeResult.height,
                  format: activeResult.format,
                }
              : null
          }
          hasImage={Boolean(activeItem)}
          onPatch={patchSettings}
          onCustomWidth={handleCustomWidthChange}
          onCustomHeight={handleCustomHeightChange}
          onReset={resetSettings}
        />
      </div>
    </section>
  );
}
