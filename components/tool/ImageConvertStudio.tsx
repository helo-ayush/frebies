"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRightLeft, Download, Image as ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import {
  ActionRow,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  QuickPick,
  ResultButton,
  ResultCard,
  STUDIO_HEIGHT,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolText,
} from "@/components/tool/kit";
import { Filmstrip } from "@/components/tool/viewer/Filmstrip";
import { ImageViewer, ViewTabs, type ViewMode } from "@/components/tool/viewer/ImageViewer";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import type { StudioImage } from "@/components/tool/studio/types";
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
  /** The settings this file was made with. See `settingsKey` in the studio. */
  settingsKey: string;
};

function revokePreview(result: { previewUrl: string }) {
  if (result.previewUrl.startsWith("blob:")) URL.revokeObjectURL(result.previewUrl);
}

function ImageConvertStudioInner({ maxSizeMB }: { maxSizeMB: number }) {
  const searchParams = useSearchParams();

  const {
    items,
    activeItem,
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

  const [viewMode, setViewMode] = useState<ViewMode>("after");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
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

  // Auto-synchronize custom dimensions when activeItem changes. An exact size the
  // user typed for a batch stays put while they look through its images.
  const keepCustomSize = resizeMode === "custom" && items.length > 1;
  const keepCustomSizeRef = useRef(keepCustomSize);
  keepCustomSizeRef.current = keepCustomSize;
  useEffect(() => {
    if (activeItem?.width && activeItem.height) {
      if (!keepCustomSizeRef.current) {
        setCustomWidth(activeItem.width);
        setCustomHeight(activeItem.height);
      }
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
      setNotice("HEIC photos from an iPhone work here. Drop them in and pick a format.");
    }
  }, [searchParams]);

  const activeTargetFormat = format;

  const dimensions =
    activeItem?.width && activeItem.height
      ? { width: activeItem.width, height: activeItem.height }
      : null;

  // Everything that changes the bytes of an output file, reduced to the parts
  // that are actually in effect. A stored result only counts while the key it
  // was made with still matches, so nothing made with older settings can be
  // shown as ready or end up in a download.
  const settingsKey = [
    format,
    quality,
    losslessMode,
    format === "ico"
      ? `ico:${icoSize || 256}`
      : resizeMode === "scale"
        ? `scale:${scalePercent}`
        : resizeMode === "maxEdge"
          ? `edge:${maxEdgePx}`
          : resizeMode === "custom"
            ? `custom:${customWidth}x${customHeight}`
            : "original",
    !FORMAT_INFO[format].supportsTransparency || !preserveAlpha ? backgroundColor : "alpha",
    sharpenAmount > 0 ? sharpenAmount : 0,
    grayscale,
  ].join("|");
  const settingsKeyRef = useRef(settingsKey);
  settingsKeyRef.current = settingsKey;

  function currentResult(id: string): ConvertedResult | null {
    const res = results[id];
    return res && res.settingsKey === settingsKey ? res : null;
  }

  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const settledItems = items.filter((item) => currentResult(item.id));
  const allSettled = items.length > 0 && settledItems.length === items.length;
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

  /** Converts one image with the current settings. Every result is made here. */
  async function convertItem(item: StudioImage): Promise<ConvertedResult> {
    const itemFormat = format;
    const itemInfo = FORMAT_INFO[itemFormat];

    const image = await loadImageFile(item.file);
    const naturalW = image.naturalWidth || item.width || 1;
    const naturalH = image.naturalHeight || item.height || 1;

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

    const name = outputFilename(item.file.name, itemFormat);
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

    return {
      blob,
      name,
      bytes: blob.size,
      originalBytes: item.file.size,
      width: isIco ? icoDim : canvas.width,
      height: isIco ? icoDim : canvas.height,
      previewUrl,
      format: itemFormat,
      settingsKey,
    };
  }

  /** Stores results from a batch run, unless the settings moved on while they were being made. */
  function storeResults(runKey: string, fresh: Record<string, ConvertedResult>) {
    if (Object.keys(fresh).length === 0) return;
    if (settingsKeyRef.current !== runKey) {
      Object.values(fresh).forEach(revokePreview);
      return;
    }
    setResults((prev) => {
      for (const [id, entry] of Object.entries(fresh)) {
        const old = prev[id];
        if (old && old !== entry) revokePreview(old);
      }
      return { ...prev, ...fresh };
    });
  }

  // Real-time live conversion for active item preview
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
        const entry = await convertItem(activeItem);
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
        console.error("Live preview generation failed:", err);
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
    }, 120);

    return () => {
      cancelled = true;
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [activeItem?.id, activeItem?.file, settingsKey]);

  // Handle batch conversion / download
  async function handleConvertAll() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setProgress({ current: 0, total: items.length });

    // A stored result is reused only if it was made with the settings this run
    // starts with; everything else is converted again.
    const runKey = settingsKey;
    const fresh: Record<string, ConvertedResult> = {};
    let stored = false;
    const processedFiles: { blob: Blob; name: string }[] = [];

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        setProgress({ current: i + 1, total: items.length, name: item.file.name });

        const existing: ConvertedResult | undefined = resultsRef.current[item.id];
        let entry = existing && existing.settingsKey === runKey ? existing : null;
        if (!entry) {
          entry = await convertItem(item);
          fresh[item.id] = entry;
        }

        processedFiles.push({ blob: entry.blob, name: entry.name });
      }

      storeResults(runKey, fresh);
      stored = true;

      if (processedFiles.length === 1) {
        downloadBlob(processedFiles[0].blob, processedFiles[0].name);
        setNoticeTone("success");
        setNotice(`Saved ${processedFiles[0].name} (${formatBytes(processedFiles[0].blob.size)}).`);
      } else if (processedFiles.length > 1) {
        await downloadAllAsZip(processedFiles, "frebies-converted.zip");
        setNoticeTone("success");
        setNotice(`Downloaded all ${processedFiles.length} converted images in frebies-converted.zip.`);
      }
    } catch (thrown) {
      if (!stored) Object.values(fresh).forEach(revokePreview);
      setNoticeTone("error");
      setNotice(
        thrown instanceof Error ? thrown.message : "An error occurred during conversion.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleDownloadZip() {
    const current = items
      .map((item): ConvertedResult | undefined => resultsRef.current[item.id])
      .filter((res): res is ConvertedResult => res !== undefined && res.settingsKey === settingsKey);

    // Something is missing or was made with other settings: convert first
    // rather than zip a partial or outdated set.
    if (current.length !== items.length) {
      await handleConvertAll();
      return;
    }

    const filesToZip = current.map((res) => ({ blob: res.blob, name: res.name }));
    if (filesToZip.length === 0) return;
    await downloadAllAsZip(filesToZip, "frebies-converted.zip");
    setNoticeTone("success");
    setNotice(`Downloaded ${filesToZip.length} converted images in frebies-converted.zip.`);
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

  const count = items.length;
  const isBatch = count > 1;
  const formatLabel = FORMAT_LABEL[activeTargetFormat];
  const totalOutputBytes = settledItems.reduce((sum, item) => sum + results[item.id].bytes, 0);
  /** Every image in the queue has a converted file waiting. */
  const ready = allSettled && Boolean(activeResult);
  const resized = Boolean(
    shownResult &&
      dimensions &&
      (shownResult.width !== dimensions.width || shownResult.height !== dimensions.height),
  );

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

  const quickFormats = available.slice(0, 6);
  const quick = (
    <QuickPick
      label="Convert to"
      value={format}
      options={(quickFormats.includes(format) ? quickFormats : [format, ...quickFormats]).map((value) => ({
        value,
        label: FORMAT_LABEL[value],
      }))}
      onChange={chooseFormat}
    />
  );

  const action =
    ready && activeResult && !busy ? (
      <>
        {quick}
        <DownloadAction
          label={
            isBatch
              ? `Download ${count} images (ZIP)`
              : `Download ${FORMAT_LABEL[activeResult.format]} · ${formatBytes(activeResult.bytes)}`
          }
          onClick={isBatch ? handleDownloadZip : handleConvertAll}
          hint={isBatch ? `One ZIP · ${formatBytes(totalOutputBytes)}` : undefined}
        />
        {fileActions}
      </>
    ) : (
      <>
        {quick}
        <PrimaryAction
          label={isBatch ? `Convert ${count} images to ${formatLabel}` : `Convert to ${formatLabel}`}
          busyLabel={
            busy && progress
              ? `Converting ${progress.current} of ${progress.total}…`
              : `Converting to ${formatLabel}…`
          }
          icon={<ArrowRightLeft size={16} aria-hidden />}
          busy={busy || (count === 1 && previewBusy)}
          progress={
            busy && progress ? Math.max(0, (progress.current - 0.5) / progress.total) : undefined
          }
          disabled={count === 0}
          onClick={handleConvertAll}
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
    <StudioFrame id="converter" label="Image conversion studio">
      <StudioStage flush>
        {count === 0 || !activeItem ? (
          <StudioDropzone
            title="Drop images to convert"
            description={`Turn JPG, PNG, HEIC, WebP and more into any of ${available.length} formats. One image or a batch of ${MAX_FILES}.`}
            buttonLabel="Choose images"
            limits={`JPG, PNG, WebP, AVIF, HEIC, SVG, TIFF, BMP, ICO · up to ${maxSizeMB} MB each`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <StudioChip>{available.length} output formats</StudioChip>
                <StudioChip>iPhone HEIC</StudioChip>
                <StudioChip>Batch to ZIP</StudioChip>
              </>
            }
          />
        ) : (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <FileRow
              flush
              className="border-b border-line"
              icon={<ImageIcon size={17} aria-hidden />}
              name={activeItem.file.name}
              meta={
                <>
                  {formatBytes(activeItem.file.size)}
                  {dimensions ? ` · ${dimensions.width} × ${dimensions.height} px` : ""}
                  {shownResult && resized ? ` → ${shownResult.width} × ${shownResult.height} px` : ""}
                </>
              }
              onReplace={() => openPicker(activeItem.id)}
              onRemove={() => removeItem(activeItem.id)}
            >
              {shownResult ? (
                <ViewTabs mode={viewMode} onChange={setViewMode} afterLabel="Converted" />
              ) : null}
              {isBatch && activeResult ? (
                <ToolText
                  onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                  title={`Download ${activeResult.name} (${formatBytes(activeResult.bytes)})`}
                  icon={<Download size={14} aria-hidden />}
                  compact
                >
                  Save this one
                </ToolText>
              ) : null}
            </FileRow>

            {(ready && activeResult) || (!isBatch && shownResult) ? (
              <ResultCard
                busy={!activeResult || previewBusy}
                title={
                  !activeResult
                    ? `Converting to ${formatLabel}`
                    : isBatch
                      ? `${count} images converted`
                      : `Converted to ${FORMAT_LABEL[activeResult.format]}`
                }
                meta={
                  !activeResult
                    ? "Applying your settings"
                    : isBatch
                      ? `${formatBytes(totalInputBytes)} → ${formatBytes(totalOutputBytes)}`
                      : `${formatBytes(activeResult.originalBytes)} → ${formatBytes(activeResult.bytes)} · ${sizeChange(activeResult.originalBytes, activeResult.bytes)}`
                }
              >
                <ResultButton
                  loud
                  onClick={isBatch ? handleDownloadZip : handleConvertAll}
                  disabled={!activeResult || busy}
                  icon={<Download size={16} aria-hidden />}
                >
                  {isBatch ? "Download ZIP" : "Download"}
                </ResultButton>
              </ResultCard>
            ) : null}

            <ImageViewer
              title={activeItem.file.name}
              before={{
                src: activeItem.preview,
                width: dimensions?.width ?? shownResult?.width ?? 1,
                height: dimensions?.height ?? shownResult?.height ?? 1,
                label: sourceFormat(activeItem.file),
                note: formatBytes(activeItem.file.size),
                alt: `Original ${activeItem.file.name}`,
              }}
              after={
                shownResult
                  ? {
                      src: shownResult.previewUrl,
                      width: shownResult.width,
                      height: shownResult.height,
                      label: FORMAT_LABEL[shownResult.format],
                      note: formatBytes(shownResult.bytes),
                      alt: `Converted ${activeItem.file.name}`,
                    }
                  : null
              }
              mode={viewMode}
              onModeChange={setViewMode}
              busy={previewBusy || busy}
              busyLabel={busy && progress ? `${progress.current} of ${progress.total}` : "Converting"}
              dragging={dragging}
            />

            {isBatch ? (
              <Filmstrip
                label="Images in this batch"
                addLabel="Add more images"
                activeId={activeItem.id}
                onSelect={setActiveId}
                onRemove={removeItem}
                onAdd={() => openPicker()}
                items={items.map((item) => {
                  const made = currentResult(item.id);
                  return {
                    id: item.id,
                    name: item.file.name,
                    src: made ? made.previewUrl : item.preview,
                    done: Boolean(made),
                    badge: made ? FORMAT_LABEL[made.format] : sourceFormat(item.file),
                    title: `${item.file.name} · ${formatBytes(item.file.size)}${made ? ` → ${formatBytes(made.bytes)}` : ""}`,
                  };
                })}
              />
            ) : null}

            <div className="flex shrink-0 gap-2 border-t border-line bg-panel p-3 lg:hidden [&>*]:flex-1">{fileButtons}</div>
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

        <span
          aria-hidden
          className="hidden"
          data-success={noticeTone === "success" ? notice : undefined}
          data-error={error ?? (noticeTone === "error" ? notice : undefined)}
        />

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
        {notice && (noticeTone === "error" || count === 0) ? (
          <Note tone={noticeTone === "error" ? "error" : "info"} className="m-3 shrink-0">
            {notice}
          </Note>
        ) : null}
        <p role="status" className="sr-only">
          {noticeTone === "success" && count > 0 ? notice : ""}
        </p>
      </StudioStage>

      <ImageConvertSettings
        action={action}
        settings={settings}
        available={available}
        category={selectedCategory}
        dimensions={dimensions}
        targetSize={targetSize}
        longestEdge={longestEdge}
        hasImage={Boolean(activeItem)}
        onCategory={setSelectedCategory}
        onPatch={patchSettings}
        onCustomWidth={handleCustomWidthChange}
        onCustomHeight={handleCustomHeightChange}
        onReset={resetSettings}
      />
    </StudioFrame>
  );
}

function sizeChange(original: number, output: number): string {
  if (original <= 0) return "same size";
  const percent = Math.round((1 - output / original) * 100);
  if (percent > 0) return `${percent}% smaller`;
  if (percent < 0) return `${Math.abs(percent)}% larger`;
  return "same size";
}

function ImageConvertStudioSkeleton() {
  return (
    <div
      role="status"
      className={`fb-stage grid h-[520px] place-items-center ${STUDIO_HEIGHT}`}
    >
      <span className="flex items-center gap-2 text-[13px] text-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        Loading the converter…
      </span>
    </div>
  );
}

export function ImageConvertStudio({
  maxSizeMB,
}: {
  /** Kept for the page that renders this studio; the studio no longer draws its own header. */
  path?: string;
  maxSizeMB: number;
}) {
  return (
    <Suspense fallback={<ImageConvertStudioSkeleton />}>
      <ImageConvertStudioInner maxSizeMB={maxSizeMB} />
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
