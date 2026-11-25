"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crop, Download, Image as ImageIcon, Pencil, Plus, Scaling } from "lucide-react";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  ActionRow,
  DownloadAction,
  FileRow,
  Note,
  PrimaryAction,
  ResultButton,
  ResultCard,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolText,
} from "@/components/tool/kit";
import { Filmstrip } from "@/components/tool/viewer/Filmstrip";
import { ImageViewer, Ruler, ViewTabs, type ViewMode } from "@/components/tool/viewer/ImageViewer";
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
  const [viewMode, setViewMode] = useState<ViewMode>("after");
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

  // Room for the picture inside the crop stage
  const availableW = Math.max(120, stageSize.width - 56);
  const availableH = Math.max(120, stageSize.height - 56);
  const cropScale =
    sourceWidth && sourceHeight ? Math.min(availableW / sourceWidth, availableH / sourceHeight) : 0;
  const cropLeft = (stageSize.width - sourceWidth * cropScale) / 2;
  const cropTop = (stageSize.height - sourceHeight * cropScale) / 2;

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
      <StudioStage flush>
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
            className="flex min-h-0 flex-1 flex-col"
          >
            <FileRow
              flush
              className="border-b border-line"
              icon={<ImageIcon size={17} aria-hidden />}
              name={activeItem.file.name}
              meta={
                originalWidth && originalHeight ? (
                  <span className="fb-num">
                    <span className="sr-only">Original size </span>
                    {originalWidth} × {originalHeight} →{" "}
                    <span className="font-semibold text-ink">
                      <span className="sr-only">Output size </span>
                      {outputWidth} × {outputHeight} px
                    </span>
                    {estimate > 0 ? ` · about ${formatBytes(estimate)}` : ""}
                  </span>
                ) : (
                  "Reading image…"
                )
              }
              onReplace={() => openPicker(activeItem.id)}
              onRemove={() => handleRemoveItem(activeItem.id)}
            >
              {items.length === 1 ? (
                <ToolText onClick={() => openPicker()} icon={<Plus size={14} aria-hidden />}>
                  <span>
                    Add<span className="max-sm:sr-only"> more</span>
                  </span>
                </ToolText>
              ) : (
                <ToolText onClick={handleClearAll}>Clear all</ToolText>
              )}
              {!isCrop && outputReady && activeResult ? (
                <ViewTabs mode={viewMode} onChange={setViewMode} afterLabel="Resized" />
              ) : null}
            </FileRow>

            {outputReady && firstResult ? (
              <ResultCard
                title={
                  readyResults.length === 1
                    ? `${firstResult.width} × ${firstResult.height}`
                    : `${readyResults.length} ready`
                }
                meta={
                  readyResults.length === 1
                    ? `${firstResult.name} · ${formatBytes(firstResult.bytes)}${
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
                  <ResultButton onClick={() => downloadBlob(activeResult.blob, activeResult.name)}>
                    This image
                  </ResultButton>
                ) : null}
                <ResultButton loud onClick={downloadOutput} icon={<Download size={16} aria-hidden />}>
                  {readyResults.length === 1 ? "Download" : "Download ZIP"}
                </ResultButton>
              </ResultCard>
            ) : null}

            {isCrop ? (
              <div className="grid min-h-[max(320px,50svh)] flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] sm:grid-cols-[22px_minmax(0,1fr)] sm:grid-rows-[22px_minmax(0,1fr)] lg:min-h-0">
                <span aria-hidden className="hidden border-b border-r border-line bg-panel sm:block" />
                <Ruler
                  axis="x"
                  length={stageSize.width}
                  origin={cropLeft}
                  scale={cropScale}
                  extent={sourceWidth}
                  from={activeCrop.x * sourceWidth}
                  to={(activeCrop.x + activeCrop.width) * sourceWidth}
                />
                <Ruler
                  axis="y"
                  length={stageSize.height}
                  origin={cropTop}
                  scale={cropScale}
                  extent={sourceHeight}
                  from={activeCrop.y * sourceHeight}
                  to={(activeCrop.y + activeCrop.height) * sourceHeight}
                />
                <div ref={setStageEl} className="relative min-h-0 min-w-0 overflow-hidden">
                  <div className="absolute inset-0">
                    <CropCanvas
                      key={activeItem.id}
                      src={currentPreview}
                      naturalWidth={sourceWidth}
                      naturalHeight={sourceHeight}
                      crop={activeCrop}
                      ratioId={settings.cropRatio}
                      stageWidth={availableW}
                      stageHeight={availableH}
                      onChange={handleCropChange}
                    />
                  </div>
                  {dragging ? (
                    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center border-[3px] border-accent bg-canvas/85">
                      <p className="fb-wide text-[clamp(22px,2.6vw,38px)]">Drop to add</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <ImageViewer
                title={activeItem.file.name}
                before={{
                  src: currentPreview,
                  width: sourceWidth || 1,
                  height: sourceHeight || 1,
                  label: "Original",
                  note: `${sourceWidth} × ${sourceHeight}`,
                  alt: `Original ${activeItem.file.name}`,
                }}
                after={
                  outputReady && activeResult
                    ? {
                        src: activeResult.previewUrl,
                        width: activeResult.width,
                        height: activeResult.height,
                        label: "Resized",
                        note: `${activeResult.width} × ${activeResult.height} · ${formatBytes(activeResult.bytes)}`,
                        alt: `Resized ${activeItem.file.name}`,
                      }
                    : outputWidth && outputHeight
                      ? {
                          src: currentPreview,
                          width: outputWidth,
                          height: outputHeight,
                          label: "New size",
                          note: `${outputWidth} × ${outputHeight}`,
                          alt: `Preview of ${activeItem.file.name}`,
                          objectFit:
                            settings.mode !== "dimensions" || settings.fit === "stretch"
                              ? "fill"
                              : settings.fit === "fill"
                                ? "cover"
                                : "contain",
                          backdrop:
                            settings.mode === "dimensions" && settings.fit === "fit"
                              ? backgroundValue(settings) || undefined
                              : undefined,
                        }
                      : null
                }
                mode={outputReady ? viewMode : "after"}
                onModeChange={outputReady ? setViewMode : undefined}
                busy={busy}
                busyLabel={progress && progress.total > 1 ? `${progress.current} of ${progress.total}` : "Resizing"}
                dragging={dragging}
              />
            )}

            {items.length > 1 ? (
              <Filmstrip
                label="Images in this batch"
                addLabel="Add more images"
                activeId={activeItem.id}
                onSelect={setActiveId}
                onRemove={handleRemoveItem}
                onAdd={() => openPicker()}
                items={items.map((item) => {
                  const made = results[item.id];
                  return {
                    id: item.id,
                    name: made
                      ? `${item.file.name}, exported at ${made.width} by ${made.height} pixels`
                      : item.file.name,
                    src: transformedMap[item.id] || item.preview,
                    done: Boolean(made),
                    badge: made ? `${made.width}×${made.height}` : undefined,
                    title: item.file.name,
                  };
                })}
              />
            ) : null}
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

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
        {noticeError ? <Note tone="error" className="m-3 shrink-0">{noticeError}</Note> : null}
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
