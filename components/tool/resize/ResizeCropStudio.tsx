"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ImagePlus,
  Loader2,
  Scaling,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { canvasToBlob, downloadBlob, loadImageFile, outputFilename } from "@/lib/image/encode";
import { CropCanvas } from "./CropCanvas";
import { ResizeControls } from "./ResizeControls";
import { renderResize } from "./render";
import {
  CROP_RATIOS,
  DEFAULT_RESIZE_SETTINGS,
  computeResizeOutput,
  cropForRatio,
  cropPixels,
  cropRatioValue,
  estimateResizeBytes,
  formatBytes,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  reshapeCrop,
  type CropRect,
  type ResizeSettings,
} from "./model";

const MAX_FILES = 1;

type ExportResult = { blob: Blob; name: string; bytes: number; width: number; height: number };

export function ResizeCropStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
  } = useImageQueue({ maxFiles: MAX_FILES, maxSizeMB, noun: "image" });

  const [settings, setSettings] = useState<ResizeSettings>(DEFAULT_RESIZE_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeItem?.width || !activeItem.height) return;
    const width = activeItem.width;
    const height = activeItem.height;
    const key = `${activeItem.id}:${width}x${height}`;
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    setSettings((current) => ({
      ...current,
      width: String(width),
      height: String(height),
      linked: true,
      rotation: 0,
      flipX: false,
      flipY: false,
      crop: cropForRatio(width / height, cropRatioValue(current.cropRatio)),
    }));
    setNotice(null);
    setResult(null);
  }, [activeItem]);

  const originalWidth = activeItem?.width ?? 0;
  const originalHeight = activeItem?.height ?? 0;
  const output = computeResizeOutput(settings, originalWidth, originalHeight);
  const { sourceWidth, sourceHeight, width: outputWidth, height: outputHeight } = output;
  const activeCrop =
    settings.crop ??
    cropForRatio(
      originalWidth && originalHeight ? originalWidth / originalHeight : 1,
      cropRatioValue(settings.cropRatio),
    );
  const cropPixelSize =
    originalWidth && originalHeight
      ? cropPixels(activeCrop, originalWidth, originalHeight)
      : { width: 0, height: 0 };
  const lossy = isLossyFormat(settings.format);
  const formatName = formatLabel(settings.format);
  const estimate = activeItem
    ? estimateResizeBytes({
        originalBytes: activeItem.file.size,
        sourcePixels: sourceWidth * sourceHeight,
        outputPixels: outputWidth * outputHeight,
        format: settings.format,
        quality: settings.quality,
      })
    : 0;

  const chipLabel =
    settings.mode === "crop"
      ? settings.cropRatio === "free"
        ? "Free-form"
        : CROP_RATIOS.find((ratio) => ratio.id === settings.cropRatio)?.label ?? "Crop"
      : settings.mode === "percent"
        ? `${settings.percent}%`
        : settings.fit === "fill"
          ? "Crop to fill"
          : settings.fit === "fit"
            ? "Fit + pad"
            : "Stretch";

  const transforms: string[] = [];
  if (settings.rotation) transforms.push(`rotate(${settings.rotation}deg)`);
  if (settings.flipX) transforms.push("scaleX(-1)");
  if (settings.flipY) transforms.push("scaleY(-1)");
  const imageTransform = transforms.length > 0 ? transforms.join(" ") : undefined;

  function patch(next: Partial<ResizeSettings>) {
    setSettings((current) => {
      const merged = { ...current, ...next };
      const aspect = originalWidth && originalHeight ? originalWidth / originalHeight : 0;
      if (!aspect) return merged;
      const ratio = cropRatioValue(merged.cropRatio);

      if (next.cropRatio && next.cropRatio !== current.cropRatio) {
        merged.crop = ratio
          ? reshapeCrop(current.crop ?? cropForRatio(aspect, ratio), ratio, aspect)
          : current.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      }
      if (merged.mode === "crop" && !merged.crop) {
        merged.crop = cropForRatio(aspect, ratio);
      }
      return merged;
    });
    setNotice(null);
    setResult(null);
  }

  function handleCropChange(crop: CropRect) {
    setSettings((current) => ({ ...current, crop }));
    setNotice(null);
    setResult(null);
  }

  function resetCrop() {
    if (!originalWidth || !originalHeight) return;
    patch({
      crop: cropForRatio(
        originalWidth / originalHeight,
        cropRatioValue(settings.cropRatio),
      ),
    });
  }

  async function handleResize() {
    if (!activeItem || busy) return;
    setBusy(true);
    setNotice(null);
    setResult(null);

    try {
      const image = await loadImageFile(activeItem.file);
      const { canvas, format } = renderResize(image, activeItem.file, settings);
      const blob = await canvasToBlob(canvas, format, settings.quality / 100);
      const name = outputFilename(
        activeItem.file.name,
        format,
        `-${canvas.width}x${canvas.height}`,
      );
      downloadBlob(blob, name);
      setResult({ blob, name, bytes: blob.size, width: canvas.width, height: canvas.height });
      setNotice(
        `Saved ${name} · ${canvas.width} × ${canvas.height} px · ${formatBytes(
          blob.size,
        )}. Nothing left your device.`,
      );
    } catch (thrown) {
      setNotice(
        thrown instanceof Error
          ? thrown.message
          : "This image could not be saved. Try another file.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="resize"
      aria-label="Resize and crop studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/image/resize" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Resize studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Exact pixels, ratios and transforms.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
            <Scaling size={10} aria-hidden />
            {activeItem && outputWidth ? `${outputWidth} × ${outputHeight}` : "No canvas"}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#d9e3d5] bg-[#f4f8f2] px-2.5 py-1 text-[10px] font-medium text-[#4a6b47]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5f8a56]" aria-hidden />
            Ready · on device
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <StudioDropzone
              title="Drop an image to resize"
              description="Set exact pixels, scale by a percentage or drag a free-form crop. Rotate, flip and pad without uploading anything."
              buttonLabel="Choose an image"
              limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              minHeightClass="min-h-[360px]"
              chips={
                <>
                  <StudioChip icon={<Scaling size={10} aria-hidden />}>Exact pixels</StudioChip>
                  <StudioChip icon={<Check size={10} aria-hidden />}>Free-form crop</StudioChip>
                </>
              }
            />
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[300px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              <div
                className={`relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#f1efeb] ${
                  settings.mode === "crop" ? "p-0" : "p-4"
                }`}
              >
                <span className="absolute left-3 top-3 z-40 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                  {settings.mode === "crop" ? "Crop preview" : "Canvas preview"}
                </span>
                <span className="absolute right-3 top-3 z-40 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                  {outputWidth ? `${outputWidth} × ${outputHeight}` : "Reading image…"}
                </span>

                {settings.mode === "crop" ? (
                  <CropCanvas
                    src={activeItem.preview}
                    naturalWidth={originalWidth}
                    naturalHeight={originalHeight}
                    crop={activeCrop}
                    ratioId={settings.cropRatio}
                    onChange={handleCropChange}
                  />
                ) : (
                  <img
                    src={activeItem.preview}
                    alt={`Preview of ${activeItem.file.name}`}
                    className="rounded-[8px] object-contain shadow-[0_10px_30px_rgba(45,35,22,0.08)]"
                    style={{
                      transform: imageTransform,
                      maxHeight: settings.rotation % 180 !== 0 ? 240 : 384,
                      maxWidth: settings.rotation % 180 !== 0 ? 240 : "100%",
                    }}
                  />
                )}

                <span className="absolute bottom-3 right-3 z-40 inline-flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/90 px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm backdrop-blur">
                  <Scaling size={11} aria-hidden />
                  {formatName}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                  <ToolGlyph path="/image/resize" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-medium text-ink">{activeItem.file.name}</p>
                  <p className="mt-0.5 text-micro text-faint">
                    {formatBytes(activeItem.file.size)}
                    {originalWidth && originalHeight
                      ? ` · ${originalWidth} × ${originalHeight}px`
                      : ""}
                    {settings.rotation ? ` · rotated ${settings.rotation}°` : ""}
                    {settings.flipX || settings.flipY ? " · flipped" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPicker(activeItem.id)}
                  aria-label="Replace image"
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  <ImagePlus size={11} aria-hidden />
                  <span className="hidden sm:inline">Replace</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeItem(activeItem.id);
                    initializedRef.current = null;
                    setNotice(null);
                    setResult(null);
                  }}
                  aria-label={`Remove ${activeItem.file.name}`}
                  className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            aria-label="Choose an image"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <div className="mt-3 shrink-0 rounded-[13px] border border-line bg-white p-3.5">
            {activeItem ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                      Output size
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                        {outputWidth || "—"} × {outputHeight || "—"}
                      </span>
                      <span className="text-[10px] text-faint">px</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {chipLabel}
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {formatName}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line-soft pt-2.5">
                  <SummaryStat label="From" value={`${originalWidth || "—"} × ${originalHeight || "—"}`} />
                  <SummaryStat label="Scale" value={`${output.scale}%`} />
                  <SummaryStat
                    label={result ? "Saved" : "Estimated"}
                    value={result ? formatBytes(result.bytes) : `≈ ${formatBytes(estimate)}`}
                  />
                </div>

                {result && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[9px] border border-[#d9e3d5] bg-[#f4f8f2] px-2.5 py-2">
                    <Check size={12} className="shrink-0 text-[#4a6b47]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-[#4a6b47]">
                      {result.name} · {formatBytes(result.bytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadBlob(result.blob, result.name)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#cfdccb] bg-white px-2 py-1 text-[10px] font-medium text-[#3d5c3a] transition-colors hover:bg-[#eef4ec]"
                    >
                      <Download size={10} aria-hidden />
                      Download again
                    </button>
                  </div>
                )}

                {output.upscaling && (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#786344]">
                    <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden />
                    Upscaling interpolates pixels. Detail is estimated, not recovered.
                  </p>
                )}
                {!output.upscaling && outputWidth > 0 && (
                  <p className="mt-2.5 text-[10px] tabular-nums text-faint">
                    {ratioLabel(outputWidth, outputHeight)} · {lossy ? `${settings.quality}% quality` : "lossless"}
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-ink">No canvas yet</p>
                  <p className="mt-0.5 text-[10px] text-faint">
                    Add an image and the exact output dimensions appear here.
                  </p>
                </div>
                <Scaling size={16} className="shrink-0 text-[#c8c1b4]" aria-hidden />
              </div>
            )}
          </div>

          <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} aria-hidden />
              Free · no upload · no watermark
            </p>
            <button
              type="button"
              onClick={handleResize}
              disabled={!activeItem || busy}
              className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[140px]")}
            >
              {busy ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                  Working…
                </>
              ) : (
                <>
                  {settings.mode === "crop" ? "Crop image" : "Resize image"}
                  <ArrowRightGlyph size={13} />
                </>
              )}
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <StudioRail label="Resize settings">
          <ResizeControls
            settings={settings}
            onPatch={patch}
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
          />
        </StudioRail>
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-ink">{value}</p>
    </div>
  );
}
