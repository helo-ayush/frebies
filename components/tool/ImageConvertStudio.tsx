"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Download,
  FileArchive,
  Grid,
  Images,
  ImagePlus,
  Loader2,
  Maximize2,
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
  ImageConvertSettings,
  type ConvertSettings,
  type ResizeMode,
} from "@/components/tool/convert/ImageConvertSettings";
import {
  ALL_ENCODE_FORMATS,
  FORMAT_INFO,
  FORMAT_LABEL,
  canvasToBlob,
  createIcoCanvas,
  downloadAllAsZip,
  downloadBlob,
  drawRegion,
  fitWithin,
  formatBytes,
  loadImageFile,
  outputFilename,
  roundSize,
  supportedFormats,
  type EncodeFormat,
  type FormatCategory,
  type Size,
} from "@/lib/image/encode";

const MAX_FILES = 20;

type ConvertedResult = {
  blob: Blob;
  name: string;
  bytes: number;
  originalBytes: number;
  width: number;
  height: number;
  previewUrl: string;
  format: EncodeFormat;
};

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

function ImageConvertStudioInner({
  path,
  maxSizeMB,
}: {
  path: string;
  maxSizeMB: number;
}) {
  const searchParams = useSearchParams();

  const {
    items,
    activeItem,
    activeIndex,
    error,
    dragging,
    setActiveId,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clearAll,
  } = useImageQueue({
    maxFiles: MAX_FILES,
    maxSizeMB,
    formatHint: "JPG, PNG, WebP, AVIF, HEIC, SVG, TIFF, BMP or ICO",
  });

  const [available, setAvailable] = useState<EncodeFormat[]>(ALL_ENCODE_FORMATS);
  const [format, setFormat] = useState<EncodeFormat>("webp");
  const [selectedCategory, setSelectedCategory] = useState<"all" | FormatCategory>("all");

  // Quality & Encoding settings
  const [quality, setQuality] = useState(90);
  const [losslessMode, setLosslessMode] = useState(false);
  const [icoSize, setIcoSize] = useState(256);

  // Background & Alpha controls
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [customColor, setCustomColor] = useState("#ffffff");

  // Resize & Enhancements (Downscale only)
  const [resizeMode, setResizeMode] = useState<ResizeMode>("original");
  const [scalePercent, setScalePercent] = useState(75);
  const [maxEdgePx, setMaxEdgePx] = useState(1920);
  const [customWidth, setCustomWidth] = useState(0);
  const [customHeight, setCustomHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [sharpenAmount, setSharpenAmount] = useState(0);
  const [grayscale, setGrayscale] = useState(false);

  // Preview stage state: Scale to Fit & Checkerboard grid
  const [scaleToFit, setScaleToFit] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<"converted" | "original" | "split">("converted");
  const [splitPos, setSplitPos] = useState(50);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name?: string } | null>(
    null,
  );
  const [results, setResults] = useState<Record<string, ConvertedResult>>({});

  // Active item dimensions
  const origWidth = activeItem?.width || 1;
  const origHeight = activeItem?.height || 1;
  const longestEdge = Math.max(origWidth, origHeight);

  // Auto-synchronize custom dimensions when activeItem changes
  useEffect(() => {
    if (activeItem?.width && activeItem.height) {
      setCustomWidth(activeItem.width);
      setCustomHeight(activeItem.height);
      setMaxEdgePx((curr) => {
        const longest = Math.max(activeItem.width!, activeItem.height!);
        return curr > longest ? longest : curr;
      });
    }
  }, [activeItem?.id, activeItem?.width, activeItem?.height]);

  // Clean up object URLs on unmount or file reset
  const resultsRef = useRef<Record<string, ConvertedResult>>({});
  resultsRef.current = results;

  useEffect(() => {
    return () => {
      Object.values(resultsRef.current).forEach((res) => URL.revokeObjectURL(res.previewUrl));
    };
  }, []);

  // Detect supported browser formats and handle URL preset parameters (?to=... or ?from=...)
  useEffect(() => {
    const list = supportedFormats();
    setAvailable(list);

    const toParam = searchParams.get("to")?.toLowerCase();
    if (toParam) {
      const match = list.find((fmt) => {
        if (toParam === "jpg" || toParam === "jpeg") return fmt === "jpeg";
        return fmt === toParam;
      });
      if (match) setFormat(match);
    } else {
      setFormat((curr) => (list.includes(curr) ? curr : list[0] ?? "jpeg"));
    }

    const fromParam = searchParams.get("from")?.toLowerCase();
    if (fromParam === "heic" || fromParam === "heif") {
      setNotice("Ready for HEIC photos. Images are decoded right in your browser.");
    }
  }, [searchParams]);

  const activeTargetFormat = format;

  const activeFormatInfo = FORMAT_INFO[activeTargetFormat] || FORMAT_INFO.jpeg;
  const isLossy = activeFormatInfo.lossy && !losslessMode;
  const dimensions =
    activeItem?.width && activeItem.height
      ? { width: activeItem.width, height: activeItem.height }
      : null;

  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const settledItems = items.filter((item) => results[item.id]);
  const allSettled = items.length > 0 && settledItems.length === items.length;
  const activeResult = activeItem ? results[activeItem.id] : null;

  // Filtered formats for the grid
  const filteredFormats = available.filter((fmt) => {
    if (selectedCategory === "all") return true;
    return FORMAT_INFO[fmt].category === selectedCategory;
  });

  // Calculate target dimensions (Strict Downscale-Only)
  function getTargetDimensions(origW: number, origH: number): Size {
    if (format === "ico") {
      const dim = icoSize || 256;
      return { width: dim, height: dim };
    }
    if (resizeMode === "scale") {
      // Scale factor capped strictly at 1.0 (100% max, down to 10%)
      const factor = Math.min(1.0, Math.max(0.05, scalePercent / 100));
      return {
        width: Math.min(origW, Math.max(1, roundSize(origW * factor))),
        height: Math.min(origH, Math.max(1, roundSize(origH * factor))),
      };
    }
    if (resizeMode === "maxEdge") {
      const longest = Math.max(origW, origH);
      // Max edge is clamped to longest (never scale up)
      const targetEdge = Math.min(longest, Math.max(1, maxEdgePx || longest));
      return fitWithin(origW, origH, targetEdge);
    }
    if (resizeMode === "custom") {
      const clampedW = Math.min(origW, Math.max(1, customWidth || origW));
      const clampedH = Math.min(origH, Math.max(1, customHeight || origH));
      return { width: clampedW, height: clampedH };
    }
    return { width: origW, height: origH };
  }

  // Reactive target resolution for active image
  const targetSize = useMemo(() => {
    if (!dimensions) return null;
    return getTargetDimensions(dimensions.width, dimensions.height);
  }, [dimensions, format, icoSize, resizeMode, scalePercent, maxEdgePx, customWidth, customHeight]);

  // Real-time live conversion for active item preview
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeItem) return;

    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }

    setPreviewBusy(true);

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const itemFormat = format;
        const itemInfo = FORMAT_INFO[itemFormat];

        const image = await loadImageFile(activeItem.file);
        const naturalW = image.naturalWidth || activeItem.width || 1;
        const naturalH = image.naturalHeight || activeItem.height || 1;

        const isIco = itemFormat === "ico";
        const icoDim = isIco ? (icoSize || 256) : 0;

        // When converting to ICO, the drawRegion intermediate keeps the aspect ratio
        // without squishing, then createIcoCanvas aspect-fits it inside the square icoDim.
        const outSize = isIco
          ? fitWithin(naturalW, naturalH, icoDim)
          : getTargetDimensions(naturalW, naturalH);

        let effectiveBg: string | null = null;
        if (!itemInfo.supportsTransparency || !preserveAlpha) {
          effectiveBg = backgroundColor;
        }

        const canvas = drawRegion(
          image,
          { x: 0, y: 0, width: naturalW, height: naturalH },
          outSize,
          {
            fit: "stretch",
            background: effectiveBg,
            sharpen: sharpenAmount > 0 ? sharpenAmount : undefined,
            grayscale,
          },
        );

        const blob = await canvasToBlob(canvas, itemFormat, quality / 100, {
          lossless: losslessMode,
          icoSize: isIco ? icoDim : undefined,
          backgroundColor: effectiveBg,
        });

        const name = outputFilename(activeItem.file.name, itemFormat);
        // Formats that browsers cannot decode natively inside <img> tags (TIFF, TGA, EPS)
        // are previewed using high-fidelity WebP canvas dataURL, while the downloaded blob
        // remains the authentic binary TIFF/TGA/EPS file.
        // For ICO, we generate a high-res square PNG preview from createIcoCanvas so browsers
        // render it without distortion, blurriness, or scaling quirks.
        const BROWSER_NATIVE_PREVIEW = new Set(["jpeg", "png", "webp", "avif", "svg", "bmp", "gif"]);
        const previewUrl = isIco
          ? createIcoCanvas(canvas, icoDim, effectiveBg).toDataURL("image/png")
          : BROWSER_NATIVE_PREVIEW.has(itemFormat)
            ? URL.createObjectURL(blob)
            : canvas.toDataURL("image/webp", 0.95);

        const resultWidth = isIco ? icoDim : canvas.width;
        const resultHeight = isIco ? icoDim : canvas.height;

        setResults((prev) => {
          if (prev[activeItem.id]?.previewUrl && prev[activeItem.id].previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(prev[activeItem.id].previewUrl);
          }
          return {
            ...prev,
            [activeItem.id]: {
              blob,
              name,
              bytes: blob.size,
              originalBytes: activeItem.file.size,
              width: resultWidth,
              height: resultHeight,
              previewUrl,
              format: itemFormat,
            },
          };
        });
      } catch (err) {
        console.error("Live preview generation failed:", err);
      } finally {
        setPreviewBusy(false);
      }
    }, 120);

    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [
    activeItem?.id,
    activeItem?.file,
    format,
    quality,
    losslessMode,
    icoSize,
    preserveAlpha,
    backgroundColor,
    resizeMode,
    scalePercent,
    maxEdgePx,
    customWidth,
    customHeight,
    sharpenAmount,
    grayscale,
  ]);

  // Handle batch conversion / download
  async function handleConvertAll() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setProgress({ current: 0, total: items.length });

    const newResults: Record<string, ConvertedResult> = { ...results };

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        setProgress({ current: i + 1, total: items.length, name: item.file.name });

        // If already rendered in results, reuse
        if (newResults[item.id]) continue;

        const itemFormat = format;
        const itemInfo = FORMAT_INFO[itemFormat];

        const image = await loadImageFile(item.file);
        const naturalW = image.naturalWidth || item.width || 1;
        const naturalH = image.naturalHeight || item.height || 1;
        const isIco = itemFormat === "ico";
        const icoDim = isIco ? (icoSize || 256) : 0;
        const outSize = isIco
          ? fitWithin(naturalW, naturalH, icoDim)
          : getTargetDimensions(naturalW, naturalH);

        let effectiveBg: string | null = null;
        if (!itemInfo.supportsTransparency || !preserveAlpha) {
          effectiveBg = backgroundColor;
        }

        const canvas = drawRegion(
          image,
          { x: 0, y: 0, width: naturalW, height: naturalH },
          outSize,
          {
            fit: "stretch",
            background: effectiveBg,
            sharpen: sharpenAmount > 0 ? sharpenAmount : undefined,
            grayscale,
          },
        );

        const blob = await canvasToBlob(canvas, itemFormat, quality / 100, {
          lossless: losslessMode,
          icoSize: isIco ? icoDim : undefined,
          backgroundColor: effectiveBg,
        });

        const name = outputFilename(item.file.name, itemFormat);
        const BROWSER_NATIVE_PREVIEW = new Set(["jpeg", "png", "webp", "avif", "svg", "bmp", "gif"]);
        const previewUrl = isIco
          ? createIcoCanvas(canvas, icoDim, effectiveBg).toDataURL("image/png")
          : BROWSER_NATIVE_PREVIEW.has(itemFormat)
            ? URL.createObjectURL(blob)
            : canvas.toDataURL("image/webp", 0.95);

        const resultWidth = isIco ? icoDim : canvas.width;
        const resultHeight = isIco ? icoDim : canvas.height;

        newResults[item.id] = {
          blob,
          name,
          bytes: blob.size,
          originalBytes: item.file.size,
          width: resultWidth,
          height: resultHeight,
          previewUrl,
          format: itemFormat,
        };

        setResults({ ...newResults });
      }

      if (items.length === 1 && activeItem && newResults[activeItem.id]) {
        downloadBlob(newResults[activeItem.id].blob, newResults[activeItem.id].name);
        setNotice(`Saved ${newResults[activeItem.id].name} (${formatBytes(newResults[activeItem.id].bytes)}).`);
      } else if (items.length > 1) {
        await handleDownloadZip();
      }
    } catch (thrown) {
      setNotice(
        thrown instanceof Error ? thrown.message : "An error occurred during conversion.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleDownloadZip() {
    const filesToZip = items
      .map((item) => results[item.id])
      .filter((res): res is ConvertedResult => Boolean(res))
      .map((res) => ({ blob: res.blob, name: res.name }));

    if (filesToZip.length === 0) return;
    await downloadAllAsZip(filesToZip, "frebies-converted.zip");
    setNotice(`Downloaded ${filesToZip.length} converted images in a single ZIP archive.`);
  }

  function handleCustomWidthChange(val: number) {
    const clamped = Math.min(origWidth, Math.max(1, val));
    setCustomWidth(clamped);
    if (lockAspect && origWidth > 0) {
      const ratio = origHeight / origWidth;
      setCustomHeight(Math.min(origHeight, Math.max(1, roundSize(clamped * ratio))));
    }
  }

  function handleCustomHeightChange(val: number) {
    const clamped = Math.min(origHeight, Math.max(1, val));
    setCustomHeight(clamped);
    if (lockAspect && origHeight > 0) {
      const ratio = origWidth / origHeight;
      setCustomWidth(Math.min(origWidth, Math.max(1, roundSize(clamped * ratio))));
    }
  }

  function chooseFormat(next: EncodeFormat) {
    setFormat(next);
    setNotice(null);
  }

  function patchSettings(patch: Partial<ConvertSettings>) {
    if (patch.format !== undefined) chooseFormat(patch.format);
    if (patch.quality !== undefined) setQuality(patch.quality);
    if (patch.losslessMode !== undefined) setLosslessMode(patch.losslessMode);
    if (patch.icoSize !== undefined) setIcoSize(patch.icoSize);
    if (patch.preserveAlpha !== undefined) setPreserveAlpha(patch.preserveAlpha);
    if (patch.backgroundColor !== undefined) setBackgroundColor(patch.backgroundColor);
    if (patch.customColor !== undefined) setCustomColor(patch.customColor);
    if (patch.resizeMode !== undefined) setResizeMode(patch.resizeMode);
    if (patch.scalePercent !== undefined) setScalePercent(patch.scalePercent);
    if (patch.maxEdgePx !== undefined) setMaxEdgePx(patch.maxEdgePx);
    if (patch.customWidth !== undefined) handleCustomWidthChange(patch.customWidth);
    if (patch.customHeight !== undefined) handleCustomHeightChange(patch.customHeight);
    if (patch.lockAspect !== undefined) setLockAspect(patch.lockAspect);
    if (patch.sharpenAmount !== undefined) setSharpenAmount(patch.sharpenAmount);
    if (patch.grayscale !== undefined) setGrayscale(patch.grayscale);
    setNotice(null);
  }

  function resetSettings() {
    const fallback: EncodeFormat = available.includes("webp") ? "webp" : available[0] ?? "jpeg";
    setFormat(fallback);
    setSelectedCategory("all");
    setQuality(90);
    setLosslessMode(false);
    setIcoSize(256);
    setPreserveAlpha(true);
    setBackgroundColor("#ffffff");
    setCustomColor("#ffffff");
    setResizeMode("original");
    setScalePercent(75);
    setMaxEdgePx(activeItem ? longestEdge : 1920);
    setCustomWidth(activeItem?.width ?? origWidth);
    setCustomHeight(activeItem?.height ?? origHeight);
    setLockAspect(true);
    setSharpenAmount(0);
    setGrayscale(false);
    setNotice(null);
  }

  const settings: ConvertSettings = {
    format: activeTargetFormat,
    quality,
    losslessMode,
    icoSize,
    preserveAlpha,
    backgroundColor,
    customColor,
    resizeMode,
    scalePercent,
    maxEdgePx,
    customWidth,
    customHeight,
    lockAspect,
    sharpenAmount,
    grayscale,
  };

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

  // Active preview dimensions (either converted output resolution or original source dimensions)
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

  // Dynamic available bounds inside the stage (accounting for top & bottom overlays + margins)
  const availableW = Math.max(120, stageSize.width - 48);
  const availableH = Math.max(120, stageSize.height - 120);

  // Fit multiplier: scale image so it comfortably fills available stage width & height
  const scaleX = availableW / Math.max(1, currentW);
  const scaleY = availableH / Math.max(1, currentH);
  const fitMultiplier = Math.max(0.01, Math.min(scaleX, scaleY));

  const fitW = Math.max(1, roundSize(currentW * fitMultiplier));
  const fitH = Math.max(1, roundSize(currentH * fitMultiplier));

  // In "Fit" mode: scaled up/down to fully fill stage. In "100%" mode: literal 1:1 screen pixels
  const renderedW = scaleToFit ? fitW : currentW;
  const renderedH = scaleToFit ? fitH : currentH;

  // When magnified above native size or low-res, use crisp pixelated rendering
  const isMagnified = renderedW > currentW || currentW < 256;

  return (
    <section
      id="converter"
      aria-label="Image conversion studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white shadow-sm"
    >
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink shadow-xs">
            <ToolGlyph path={path} size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Image Conversion Studio
            </h2>
            <p className="mt-0.5 text-[11.5px] text-faint">
              11 output formats · Live lossless / lossy preview · Local on-device engine
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-medium text-muted">
            <Images size={12} aria-hidden />
            {items.length > 1 ? `${items.length} in batch` : `Target: ${FORMAT_LABEL[activeTargetFormat]}`}
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
              description="Convert between JPG, PNG, WebP, AVIF, SVG, TIFF, BMP, ICO, TGA, GIF & EPS. Single file or batch up to 20 images."
              buttonLabel="Choose images"
              limits={`JPG, PNG, WebP, AVIF, HEIC, SVG, TIFF, BMP, ICO · up to ${maxSizeMB} MB each · ${MAX_FILES} per batch`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <StudioChip icon={<Images size={10} aria-hidden />}>11 output formats</StudioChip>
                  <StudioChip icon={<Sparkles size={10} aria-hidden />}>HEIC iPhone decoder</StudioChip>
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
              className={`flex min-h-[380px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              {/* Active Image Stage */}
              <div
                ref={stageRef}
                className={`relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line transition-colors ${
                  showGrid
                    ? "bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] bg-[#fbfaf8]"
                    : "bg-[#f1efeb]"
                }`}
              >
                {/* Stage Header: Format and Resolution Overlay */}
                <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 pointer-events-auto">
                  <span className="rounded-lg border border-line bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur-sm shadow-2xs">
                    {sourceFormat(activeItem?.file)}
                  </span>
                  <span className="flex items-center gap-1 rounded-lg border border-[#cbe4c7] bg-[#f4faf2]/95 px-2.5 py-1 text-[11px] font-semibold text-[#305e2b] backdrop-blur-sm shadow-2xs">
                    <span>→ {FORMAT_LABEL[activeTargetFormat]}</span>
                    {previewBusy && <Loader2 size={11} className="animate-spin ml-0.5" />}
                  </span>
                </div>

                {/* Top Right Controls: Scale-to-Fit, Transparency Grid & Dimensions */}
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
                      title="Show actual size (100%, one image pixel per screen pixel)"
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

                  {/* Resolution readout */}
                  {dimensions && (
                    <div className="rounded-[9px] border border-line bg-white/95 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted backdrop-blur-sm shadow-2xs">
                      {targetSize && (targetSize.width !== dimensions.width || targetSize.height !== dimensions.height) ? (
                        <span>
                          <span className="line-through text-faint mr-1">{dimensions.width}×{dimensions.height}</span>
                          <span className="font-bold text-ink">{targetSize.width}×{targetSize.height} px</span>
                        </span>
                      ) : (
                        <span>{dimensions.width} × {dimensions.height} px</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Center Image Viewport (scrollable in 100% mode if larger than stage) */}
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
                          {/* Small cards for Before and After */}
                          <span className="pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-xs backdrop-blur-xs">
                            Before (Original)
                          </span>
                          <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-md border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-xs backdrop-blur-xs">
                            After ({FORMAT_LABEL[format]})
                          </span>

                          {/* Base image: Converted / After (visible on the right side) */}
                          <img
                            src={activeResult.previewUrl}
                            alt="Converted"
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

                {/* Bottom Overlay: View mode toggles on left + quick save & format on right */}
                <div className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  {/* Left: View Mode Switch (Converted / Original / Split) */}
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
                          Converted
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

                  {/* Right: Quick Save & Format */}
                  <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
                    {activeResult && (
                      <button
                        type="button"
                        onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                        title={`Save ${activeResult.name} (${formatBytes(activeResult.bytes)})`}
                        className="inline-flex max-w-[260px] truncate items-center gap-1.5 rounded-[10px] border border-line bg-white/95 px-3 py-1.5 text-[11.5px] font-semibold text-ink shadow-sm backdrop-blur-sm transition-colors hover:border-ink hover:bg-white"
                      >
                        <Download size={13} className="shrink-0" aria-hidden />
                        <span className="truncate">
                          Save {truncateFilename(activeResult.name, 16)} ({formatBytes(activeResult.bytes)})
                        </span>
                      </button>
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-white/80 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-ink shadow-sm backdrop-blur-sm">
                      <ArrowRightGlyph size={11} aria-hidden />
                      <span>{FORMAT_LABEL[activeTargetFormat]}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Image Metadata Bar */}
              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-3 py-2 shadow-2xs">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                    <ToolGlyph path={path} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink" title={activeItem.file.name}>
                      {truncateFilename(activeItem.file.name, 36)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-faint">
                      <span>{formatBytes(activeItem.file.size)}</span>
                      {dimensions && <span>· {dimensions.width} × {dimensions.height}px</span>}
                      {activeResult && (
                        <>
                          <span>→</span>
                          <span className="font-semibold text-ink">{formatBytes(activeResult.bytes)}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              activeResult.bytes <= activeResult.originalBytes
                                ? "bg-[#eaf4e8] text-[#396336]"
                                : "bg-[#f5ecec] text-[#8c3b3b]"
                            }`}
                          >
                            {activeResult.bytes <= activeResult.originalBytes
                              ? `-${Math.round((1 - activeResult.bytes / activeResult.originalBytes) * 100)}%`
                              : `+${Math.round((activeResult.bytes / activeResult.originalBytes - 1) * 100)}%`}
                          </span>
                          {targetSize && (targetSize.width !== dimensions?.width || targetSize.height !== dimensions?.height) && (
                            <span className="rounded bg-[#f0f4ee] px-1.5 py-0.5 text-[10px] font-semibold text-[#32592a]">
                              {targetSize.width} × {targetSize.height}px
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openPicker()}
                    aria-label="Add more images"
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    <ImagePlus size={13} aria-hidden />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker(activeItem.id)}
                    className="hidden h-8 rounded-lg px-2 text-[11.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink sm:block"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(activeItem.id)}
                    aria-label={`Remove ${activeItem.file.name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.svg,.gif,.bmp,.ico,.heic,.heif,.tif,.tiff"
            multiple
            tabIndex={-1}
            aria-label="Choose image files"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {/* Batch Thumbnails Filmstrip */}
          {items.length > 1 && (
            <div className="mt-3">
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
                {items.map((item, index) => {
                  const isSelected = item.id === activeItem?.id;
                  const itemRes = results[item.id];

                  return (
                    <li key={item.id} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        className={`group relative flex w-[150px] flex-col rounded-[11px] border p-2 text-left transition-all ${
                          isSelected
                            ? "border-ink bg-white shadow-xs ring-1 ring-ink/20"
                            : "border-line bg-white/70 hover:border-[#d5d1c8] hover:bg-white"
                        }`}
                      >
                        <div className="relative aspect-4/3 w-full overflow-hidden rounded-[7px] bg-[#f2efe9]">
                          <img
                            src={itemRes ? itemRes.previewUrl : item.preview}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            {FORMAT_LABEL[format]}
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
              </ul>
            </div>
          )}

          {/* Bottom Execution Bar */}
          <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
              <ShieldCheck size={14} aria-hidden className="text-[#557550]" />
              Free · No upload · 11 output formats · Client-side engine
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
                onClick={handleConvertAll}
                disabled={!activeItem || busy}
                className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[170px]")}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    {progress ? `Converting ${progress.current}/${progress.total}…` : "Processing…"}
                  </>
                ) : (
                  <>
                    {items.length > 1 ? (
                      `Convert all (${items.length})`
                    ) : (
                      activeResult ? (
                        <>
                          <Download size={13} />
                          Download {FORMAT_LABEL[activeTargetFormat]}
                        </>
                      ) : (
                        <>
                          Convert image
                          <ArrowRightGlyph size={13} />
                        </>
                      )
                    )}
                  </>
                )}
              </button>
            </div>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3.5 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        {/* Right side: settings rail */}
        <ImageConvertSettings
          settings={settings}
          available={available}
          category={selectedCategory}
          dimensions={dimensions}
          targetSize={targetSize}
          longestEdge={longestEdge}
          result={
            activeResult
              ? {
                  bytes: activeResult.bytes,
                  originalBytes: activeResult.originalBytes,
                  width: activeResult.width,
                  height: activeResult.height,
                }
              : null
          }
          hasImage={Boolean(activeItem)}
          onCategory={setSelectedCategory}
          onPatch={patchSettings}
          onCustomWidth={handleCustomWidthChange}
          onCustomHeight={handleCustomHeightChange}
          onReset={resetSettings}
        />
      </div>
    </section>
  );
}

function ImageConvertStudioSkeleton() {
  return (
    <div className="h-[640px] rounded-[26px] border border-line bg-[#fdfdfc] p-6 animate-pulse flex items-center justify-center">
      <div className="text-center text-muted">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-ink" />
        <p className="text-ui font-medium">Loading Image Conversion Studio…</p>
      </div>
    </div>
  );
}

export function ImageConvertStudio({
  path,
  maxSizeMB,
}: {
  path: string;
  maxSizeMB: number;
}) {
  return (
    <Suspense fallback={<ImageConvertStudioSkeleton />}>
      <ImageConvertStudioInner path={path} maxSizeMB={maxSizeMB} />
    </Suspense>
  );
}

function sourceFormat(file?: File): string {
  if (!file) return "IMG";
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".heic") || lower.endsWith(".heif") || file.type.includes("heic")) return "HEIC";
  if (lower.endsWith(".svg") || file.type.includes("svg")) return "SVG";
  if (lower.endsWith(".webp") || file.type.includes("webp")) return "WEBP";
  if (lower.endsWith(".png") || file.type.includes("png")) return "PNG";
  if (lower.endsWith(".avif") || file.type.includes("avif")) return "AVIF";
  if (lower.endsWith(".gif") || file.type.includes("gif")) return "GIF";
  if (lower.endsWith(".bmp") || file.type.includes("bmp")) return "BMP";
  if (lower.endsWith(".ico") || file.type.includes("icon")) return "ICO";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif") || file.type.includes("tiff")) return "TIFF";
  if (lower.endsWith(".tga") || file.type.includes("tga")) return "TGA";
  if (lower.endsWith(".eps") || file.type.includes("postscript")) return "EPS";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || file.type.includes("jpeg")) return "JPG";
  return "IMG";
}
