"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ImagePlus,
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
import { ResizeControls } from "./ResizeControls";
import {
  CROP_RATIOS,
  DEFAULT_RESIZE_SETTINGS,
  FOCUS_POINTS,
  computeResizeOutput,
  cropRatioValue,
  estimateResizeBytes,
  formatBytes,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  type ResizeSettings,
} from "./model";

const MAX_FILES = 1;

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
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeItem?.width || !activeItem.height) return;
    const key = `${activeItem.id}:${activeItem.width}x${activeItem.height}`;
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    setSettings((current) => ({
      ...current,
      width: String(activeItem.width),
      height: String(activeItem.height),
      linked: true,
      rotation: 0,
      flipX: false,
      flipY: false,
    }));
    setNotice(null);
  }, [activeItem]);

  const originalWidth = activeItem?.width ?? 0;
  const originalHeight = activeItem?.height ?? 0;
  const output = computeResizeOutput(settings, originalWidth, originalHeight);
  const { sourceWidth, sourceHeight, width: outputWidth, height: outputHeight } = output;
  const cropRatio =
    cropRatioValue(settings.cropRatio) ??
    (sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1);
  const focus = FOCUS_POINTS.find((point) => point.id === settings.focus) ?? FOCUS_POINTS[4];
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
        ? "Full frame"
        : CROP_RATIOS.find((ratio) => ratio.id === settings.cropRatio)?.label ?? "Crop"
      : settings.mode === "percent"
        ? `${settings.percent}%`
        : settings.fit === "fill"
          ? "Crop to fill"
          : settings.fit === "fit"
            ? "Fit + pad"
            : "Stretch";

  const stageStyle: CSSProperties =
    cropRatio >= 1
      ? { width: "min(58%, 300px)", aspectRatio: cropRatio }
      : { height: "min(86%, 360px)", aspectRatio: cropRatio };

  const transforms: string[] = [];
  if (settings.rotation) transforms.push(`rotate(${settings.rotation}deg)`);
  if (settings.flipX) transforms.push("scaleX(-1)");
  if (settings.flipY) transforms.push("scaleY(-1)");
  if (settings.mode === "crop" && settings.rotation % 180 !== 0) transforms.push("scale(1.35)");
  const imageTransform = transforms.length > 0 ? transforms.join(" ") : undefined;

  function patch(next: Partial<ResizeSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    setNotice(null);
  }

  function handleResize() {
    setNotice(
      settings.mode === "crop"
        ? "The crop is ready to export. The resize engine is connected in the next build step — nothing leaves this device."
        : "The resize is ready to export. The resize engine is connected in the next build step — nothing leaves this device.",
    );
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
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[700px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <StudioDropzone
              title="Drop an image to resize"
              description="Set exact pixels, scale by a percentage or crop to a ratio. Rotate, flip and pad without uploading anything."
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
                  <StudioChip icon={<Check size={10} aria-hidden />}>Aspect presets</StudioChip>
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
              <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#f1efeb] p-4">
                <span className="absolute left-3 top-3 z-10 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                  {settings.mode === "crop" ? "Crop preview" : "Canvas preview"}
                </span>
                <span className="absolute right-3 top-3 z-10 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                  {outputWidth ? `${outputWidth} × ${outputHeight}` : "Reading image…"}
                </span>

                {settings.mode === "crop" ? (
                  <div className="relative" style={stageStyle}>
                    <div className="absolute inset-0 overflow-hidden rounded-[6px] border border-white/80 bg-[#e9e5dd]">
                      <img
                        src={activeItem.preview}
                        alt={`Crop preview of ${activeItem.file.name}`}
                        className="h-full w-full object-cover"
                        style={{ objectPosition: focus.position, transform: imageTransform }}
                      />
                      <ThirdsGrid />
                    </div>
                    <span className="absolute -left-[3px] -top-[3px] h-2.5 w-2.5 rounded-[2px] border border-ink bg-white" />
                    <span className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-[2px] border border-ink bg-white" />
                    <span className="absolute -bottom-[3px] -left-[3px] h-2.5 w-2.5 rounded-[2px] border border-ink bg-white" />
                    <span className="absolute -bottom-[3px] -right-[3px] h-2.5 w-2.5 rounded-[2px] border border-ink bg-white" />
                  </div>
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

                <span className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/90 px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm backdrop-blur">
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
                  <SummaryStat label="Estimated" value={`≈ ${formatBytes(estimate)}`} />
                </div>

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
              disabled={!activeItem}
              className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[140px]")}
            >
              {settings.mode === "crop" ? "Crop image" : "Resize image"}
              <ArrowRightGlyph size={13} />
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

function ThirdsGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
      <span className="absolute inset-y-0 right-1/3 w-px bg-white/40" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
      <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/40" />
    </div>
  );
}
