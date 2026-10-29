"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Check,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  Link2,
  RotateCcw,
  RotateCw,
  Scaling,
  TriangleAlert,
  Unlink2,
} from "lucide-react";
import {
  CROP_RATIOS,
  CROP_ZOOM_MAX,
  CROP_ZOOM_MIN,
  DIMENSION_PRESETS,
  FOCUS_POINTS,
  RESIZE_FORMATS,
  RESIZE_MODES,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  type Background,
  type CropRatioId,
  type FitMode,
  type ResizeSettings,
} from "./model";

const BACKGROUNDS: { id: Background; label: string; swatch: string }[] = [
  { id: "white", label: "White", swatch: "border border-[#d8d5cf] bg-white" },
  { id: "black", label: "Black", swatch: "border border-ink bg-ink" },
  { id: "transparent", label: "Transparent", swatch: "checkerboard border border-line" },
];

const PERCENT_CHIPS = [25, 50, 75, 150, 200];

export function ResizeControls({
  settings,
  onPatch,
  originalWidth,
  originalHeight,
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  scale,
  upscaling,
  capped,
}: {
  settings: ResizeSettings;
  onPatch: (patch: Partial<ResizeSettings>) => void;
  originalWidth: number;
  originalHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  upscaling: boolean;
  capped: boolean;
}) {
  const lossy = isLossyFormat(settings.format);
  const sourceRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1;

  function changeWidth(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, "").slice(0, 5);
    const patch: Partial<ResizeSettings> = { width: cleaned };
    if (settings.linked && sourceWidth && sourceHeight) {
      const value = Number(cleaned);
      if (value > 0) {
        patch.height = String(Math.max(1, Math.round(value / sourceRatio)));
      }
    }
    onPatch(patch);
  }

  function changeHeight(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, "").slice(0, 5);
    const patch: Partial<ResizeSettings> = { height: cleaned };
    if (settings.linked && sourceWidth && sourceHeight) {
      const value = Number(cleaned);
      if (value > 0) {
        patch.width = String(Math.max(1, Math.round(value * sourceRatio)));
      }
    }
    onPatch(patch);
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="resize-size">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="resize-size" className="text-ui font-semibold text-ink">
            Size
          </h3>
          <span className="text-[10px] text-faint">One image</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Resize mode"
          className="mt-2 grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-[#f4f2ed] p-1"
        >
          {RESIZE_MODES.map((mode) => (
            <label key={mode.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="resize-mode"
                value={mode.value}
                checked={settings.mode === mode.value}
                onChange={() => onPatch({ mode: mode.value })}
                className="peer sr-only"
              />
              <span className="block rounded-[7px] py-1.5 text-center text-[11.5px] font-medium text-muted transition-colors peer-checked:bg-white peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgba(15,15,16,0.08)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {mode.label}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3.5">
          {settings.mode === "dimensions" && (
            <div>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-medium text-muted">Width</span>
                  <span className="relative mt-1 block">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.width}
                      onChange={(event) => changeWidth(event.target.value)}
                      placeholder="1200"
                      className="h-10 w-full rounded-[9px] border border-line bg-white pl-2.5 pr-8 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors focus:border-[#c3beb4]"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">
                      px
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => onPatch({ linked: !settings.linked })}
                  aria-pressed={settings.linked}
                  aria-label={settings.linked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                  title={settings.linked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                  className={`mb-0.5 grid h-10 w-9 shrink-0 place-items-center rounded-[9px] border transition-colors ${
                    settings.linked
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-faint hover:text-ink"
                  }`}
                >
                  {settings.linked ? <Link2 size={14} aria-hidden /> : <Unlink2 size={14} aria-hidden />}
                </button>

                <label className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-medium text-muted">Height</span>
                  <span className="relative mt-1 block">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.height}
                      onChange={(event) => changeHeight(event.target.value)}
                      placeholder="800"
                      className="h-10 w-full rounded-[9px] border border-line bg-white pl-2.5 pr-8 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors focus:border-[#c3beb4]"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">
                      px
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIMENSION_PRESETS.map((preset) => {
                  const selected =
                    settings.width === String(preset.width) &&
                    settings.height === String(preset.height);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onPatch({
                          width: String(preset.width),
                          height: String(preset.height),
                          linked: true,
                          mode: "dimensions",
                        })
                      }
                      aria-pressed={selected}
                      title={preset.detail}
                      className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-faint">
                <span className="tabular-nums">
                  Original {originalWidth || "—"} × {originalHeight || "—"}
                </span>
                <button
                  type="button"
                  disabled={!originalWidth || !originalHeight}
                  onClick={() =>
                    onPatch({
                      width: String(originalWidth),
                      height: String(originalHeight),
                      linked: true,
                    })
                  }
                  className="font-medium transition-colors hover:text-ink disabled:opacity-40"
                >
                  Reset
                </button>
              </div>

              <label className="mt-3 block">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[10.5px] font-medium text-muted">If the ratio differs</span>
                  <span className="text-[10px] text-faint">{ratioLabel(outputWidth, outputHeight)}</span>
                </span>
                <span className="relative mt-1.5 block">
                  <select
                    value={settings.fit}
                    onChange={(event) => onPatch({ fit: event.target.value as FitMode })}
                    className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white pl-2.5 pr-8 text-[11.5px] text-ink outline-none hover:border-[#d5d1c8]"
                  >
                    <option value="fill">Crop to fill</option>
                    <option value="fit">Fit with padding</option>
                    <option value="stretch">Stretch to fill</option>
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
                    aria-hidden
                  />
                </span>
              </label>

              {capped && (
                <p className="mt-2 flex items-start gap-1.5 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                  <Check size={11} className="mt-px shrink-0 text-ink" aria-hidden />
                  Capped at the original size. Turn off “Never upscale” to enlarge.
                </p>
              )}
            </div>
          )}

          {settings.mode === "percent" && (
            <div>
              <div className="flex items-end justify-between gap-3">
                <label htmlFor="resize-percent" className="text-ui font-medium text-ink">
                  Scale
                </label>
                <span className="font-display text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
                  {settings.percent}%
                </span>
              </div>
              <input
                id="resize-percent"
                type="range"
                min={10}
                max={200}
                step={5}
                value={settings.percent}
                onChange={(event) => onPatch({ percent: Number(event.target.value) })}
                aria-valuetext={`${settings.percent} percent scale`}
                style={rangeFill(settings.percent, 10, 200)}
                className="range mt-3"
              />
              <div className="mt-1 flex justify-between text-[10px] text-faint">
                <span>10%</span>
                <span>100%</span>
                <span>200%</span>
              </div>

              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {PERCENT_CHIPS.map((value) => {
                  const selected = settings.percent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onPatch({ percent: value })}
                      aria-pressed={selected}
                      className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      }`}
                    >
                      {value}%
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10.5px]">
                <span className="text-muted">New size</span>
                <span className="font-medium tabular-nums text-ink">
                  {outputWidth || "—"} × {outputHeight || "—"}
                </span>
              </div>

              {settings.neverUpscale && settings.percent > 100 && (
                <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <TriangleAlert size={11} className="mt-px shrink-0 text-[#c48c4a]" aria-hidden />
                  Upscaling is off, so 100% is used. Turn it off in Advanced to enlarge.
                </p>
              )}
            </div>
          )}

          {settings.mode === "crop" && (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10.5px] font-medium text-muted">Aspect ratio</span>
                <span className="text-[10px] tabular-nums text-faint">
                  {outputWidth || "—"} × {outputHeight || "—"}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {CROP_RATIOS.map((ratio) => {
                  const selected = settings.cropRatio === ratio.id;
                  return (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => onPatch({ cropRatio: ratio.id as CropRatioId })}
                      aria-pressed={selected}
                      className={`rounded-[8px] border px-1 py-2 text-center transition-colors ${
                        selected
                          ? "border-ink bg-rail text-ink"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      }`}
                    >
                      <span className="block text-[11.5px] font-medium tabular-nums">
                        {ratio.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] text-faint">{ratio.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <span className="block text-[10.5px] font-medium text-muted">Crop focus</span>
                  <span className="mt-0.5 block text-[10px] text-faint">
                    {FOCUS_POINTS.find((point) => point.id === settings.focus)?.label}
                  </span>
                </div>
                <div role="group" aria-label="Crop focus" className="grid grid-cols-3 gap-1">
                  {FOCUS_POINTS.map((point) => {
                    const selected = settings.focus === point.id;
                    return (
                      <button
                        key={point.id}
                        type="button"
                        onClick={() => onPatch({ focus: point.id })}
                        aria-pressed={selected}
                        aria-label={point.label}
                        title={point.label}
                        className={`grid h-7 w-7 place-items-center rounded-[5px] border transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-transparent hover:border-[#cbc5b9] hover:text-faint"
                        }`}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="crop-zoom" className="text-[10.5px] font-medium text-muted">
                    Crop zoom
                  </label>
                  <span className="text-[10px] tabular-nums text-faint">
                    {Math.round(settings.cropZoom * 100)}%
                  </span>
                </div>
                <input
                  id="crop-zoom"
                  type="range"
                  min={CROP_ZOOM_MIN}
                  max={CROP_ZOOM_MAX}
                  step={0.05}
                  value={settings.cropZoom}
                  onChange={(event) => onPatch({ cropZoom: Number(event.target.value) })}
                  aria-valuetext={`${Math.round(settings.cropZoom * 100)} percent crop zoom`}
                  disabled={!outputWidth}
                  style={rangeFill(
                    ((settings.cropZoom - CROP_ZOOM_MIN) / (CROP_ZOOM_MAX - CROP_ZOOM_MIN)) * 100,
                    0,
                    100,
                  )}
                  className="range mt-2"
                />
                <div className="mt-1 flex justify-between text-[10px] text-faint">
                  <span>Whole frame</span>
                  <span>Tight crop</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] leading-relaxed text-faint">
                    Drag the preview to reframe.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({
                        cropZoom: CROP_ZOOM_MIN,
                        cropCenterX: 0.5,
                        cropCenterY: 0.5,
                        focus: "center",
                      })
                    }
                    className="shrink-0 text-[10px] font-medium text-faint transition-colors hover:text-ink"
                  >
                    Reset crop
                  </button>
                </div>
              </div>

              <p className="mt-3 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10px] leading-relaxed text-faint">
                {settings.cropRatio === "free"
                  ? "Free keeps the full frame until you zoom in. Drag the image to choose what stays."
                  : "Drag inside the frame to reframe, or zoom in for a tighter crop. The saved file matches the preview exactly."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="resize-transform" className="border-t border-line-soft pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="resize-transform" className="text-ui font-semibold text-ink">
            Rotate &amp; flip
          </h3>
          <span className="text-[10px] tabular-nums text-faint">{settings.rotation}°</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <TransformButton
            label="Rotate left"
            onClick={() => onPatch({ rotation: (settings.rotation + 270) % 360 })}
          >
            <RotateCcw size={14} aria-hidden />
          </TransformButton>
          <TransformButton
            label="Rotate right"
            onClick={() => onPatch({ rotation: (settings.rotation + 90) % 360 })}
          >
            <RotateCw size={14} aria-hidden />
          </TransformButton>
          <TransformButton
            label="Flip horizontal"
            active={settings.flipX}
            onClick={() => onPatch({ flipX: !settings.flipX })}
          >
            <FlipHorizontal2 size={14} aria-hidden />
          </TransformButton>
          <TransformButton
            label="Flip vertical"
            active={settings.flipY}
            onClick={() => onPatch({ flipY: !settings.flipY })}
          >
            <FlipVertical2 size={14} aria-hidden />
          </TransformButton>
        </div>
        {(settings.rotation !== 0 || settings.flipX || settings.flipY) && (
          <button
            type="button"
            onClick={() => onPatch({ rotation: 0, flipX: false, flipY: false })}
            className="mt-2 text-[10px] font-medium text-faint transition-colors hover:text-ink"
          >
            Reset transforms
          </button>
        )}
      </section>

      <section aria-labelledby="resize-output" className="border-t border-line-soft pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="resize-output" className="text-ui font-semibold text-ink">
            Output
          </h3>
          <span className="text-[10px] text-faint">{formatLabel(settings.format)}</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Output format"
          className="mt-2 grid grid-cols-5 gap-1"
        >
          {RESIZE_FORMATS.map((format) => (
            <label key={format.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="resize-format"
                value={format.value}
                checked={settings.format === format.value}
                onChange={() => onPatch({ format: format.value })}
                className="peer sr-only"
              />
              <span className="block rounded-[8px] border border-line bg-white py-2 text-center text-[10.5px] font-medium text-muted transition-colors hover:border-[#d8d4cb] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {format.label}
              </span>
            </label>
          ))}
        </div>

        <p className="mt-2 min-h-[26px] text-[10px] leading-relaxed text-faint">
          {RESIZE_FORMATS.find((format) => format.value === settings.format)?.hint}
        </p>

        <div className="mt-1">
          <div className="flex items-center justify-between text-ui">
            <span className="font-medium text-ink">Quality</span>
            <span className="text-micro tabular-nums text-faint">
              {lossy ? `${settings.quality}%` : "Lossless"}
            </span>
          </div>
          <input
            type="range"
            min={40}
            max={100}
            value={lossy ? settings.quality : 100}
            disabled={!lossy}
            onChange={(event) => onPatch({ quality: Number(event.target.value) })}
            aria-label="Output quality"
            aria-valuetext={lossy ? `${settings.quality} percent quality` : "Lossless output"}
            style={rangeFill(settings.quality, 40, 100)}
            className="range mt-2"
          />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10.5px] font-medium text-muted">Padding background</span>
            <span className="text-[10px] text-faint">For fit mode</span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {BACKGROUNDS.map((background) => {
              const selected = settings.background === background.id;
              return (
                <button
                  key={background.id}
                  type="button"
                  onClick={() => onPatch({ background: background.id })}
                  aria-pressed={selected}
                  className={`flex items-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    selected
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  <span className={`h-4 w-4 shrink-0 rounded-[4px] ${background.swatch}`} />
                  {background.label}
                </button>
              );
            })}
          </div>
          {settings.background === "transparent" && settings.format === "jpg" && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#786344]">
              <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden />
              JPG cannot keep transparency. A white background will be used instead.
            </p>
          )}
        </div>
      </section>

      <details className="group overflow-hidden rounded-[11px] border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
            <Scaling size={12} className="text-muted" aria-hidden />
            Advanced
          </span>
          <span className="flex items-center gap-1 text-[10px] text-faint">
            4 controls
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="space-y-3 border-t border-line-soft bg-[#fdfdfc] p-3">
          <ToggleRow
            label="Never upscale"
            description="Cap the output at the source dimensions."
            checked={settings.neverUpscale}
            onChange={(checked) => onPatch({ neverUpscale: checked })}
          />
          <ToggleRow
            label="Remove metadata"
            description="Drop camera and location data from the output."
            checked={settings.removeMetadata}
            onChange={(checked) => onPatch({ removeMetadata: checked })}
          />
          <ToggleRow
            label="Sharpen after resizing"
            description="Recover a little crispness after downscaling."
            checked={settings.sharpen}
            onChange={(checked) => onPatch({ sharpen: checked })}
          />
          <ToggleRow
            label="Progressive encoding"
            description="Load gradually where the format supports it."
            checked={settings.progressive}
            onChange={(checked) => onPatch({ progressive: checked })}
          />
        </div>
      </details>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        {upscaling
          ? "Upscaling interpolates pixels; detail is estimated, not recovered."
          : "Sizes are estimated before export, and the saved file reports its exact size."}
      </p>
    </div>
  );
}

function TransformButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`grid h-9 place-items-center rounded-[8px] border transition-colors ${
        active
          ? "border-ink bg-rail text-ink"
          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
