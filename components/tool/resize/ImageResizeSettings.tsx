"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Gauge,
  Image as ImageIcon,
  Info,
  Link2,
  Lock,
  Palette,
  Percent,
  RotateCcw,
  RotateCw,
  Scaling,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Unlink2,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  CROP_RATIOS,
  DIMENSION_PRESETS,
  RESIZE_FORMATS,
  RESIZE_MODES,
  formatBytes,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  type Background,
  type CropRatioId,
  type FitMode,
  type ResizeFormat,
  type ResizeMode,
  type ResizeSettings,
} from "./model";

export type { ResizeSettings };

const FIT_OPTIONS: {
  value: FitMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "fill",
    label: "Crop to fill",
    hint: "Fills the target dimensions by cropping edges if aspect ratios differ.",
  },
  {
    value: "fit",
    label: "Fit with padding",
    hint: "Keeps the entire image visible and adds background padding around it.",
  },
  {
    value: "stretch",
    label: "Stretch",
    hint: "Forces exact dimensions by stretching pixels without cropping or padding.",
  },
];

const POPULAR_PRESETS = [
  { label: "Full HD", detail: "1920 × 1080", width: 1920, height: 1080, ratio: "16:9" },
  { label: "2K QHD", detail: "2560 × 1440", width: 2560, height: 1440, ratio: "16:9" },
  { label: "Social OG", detail: "1200 × 630", width: 1200, height: 630, ratio: "1.91:1" },
  { label: "Square Post", detail: "1080 × 1080", width: 1080, height: 1080, ratio: "1:1" },
  { label: "Portrait", detail: "1080 × 1350", width: 1080, height: 1350, ratio: "4:5" },
  { label: "Story / Reel", detail: "1080 × 1920", width: 1080, height: 1920, ratio: "9:16" },
  { label: "Web Banner", detail: "800 × 600", width: 800, height: 600, ratio: "4:3" },
];

const PERCENT_CHIPS = [25, 50, 75, 100, 125, 150, 200];

const QUALITY_PRESETS = [
  { label: "Max", value: 100 },
  { label: "High", value: 90 },
  { label: "Good", value: 80 },
  { label: "Mid", value: 65 },
  { label: "Compact", value: 40 },
];

const BG_PRESETS: { id: Background; label: string; swatch: string }[] = [
  { id: "transparent", label: "Transparent", swatch: "checkerboard border border-line" },
  { id: "white", label: "White", swatch: "border border-[#d8d5cf] bg-white" },
  { id: "black", label: "Black", swatch: "border border-ink bg-ink" },
  { id: "custom", label: "Custom", swatch: "border border-line bg-[#f0eee6]" },
];

function rangeFill(value: number, min = 0, max = 100): CSSProperties {
  const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return { "--fill": `${percent}%` } as CSSProperties;
}


function AspectRatioMiniature({ id, active }: { id: CropRatioId; active: boolean }) {
  const stroke = active ? "stroke-ink" : "stroke-muted";
  const fill = active ? "fill-ink/10" : "fill-transparent";

  switch (id) {
    case "free":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="2" y="2" width="16" height="16" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.25" strokeDasharray="2.5 2" />
        </svg>
      );
    case "1:1":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="3" y="3" width="14" height="14" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "4:5":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="4" y="2" width="12" height="16" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "16:9":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="1" y="5" width="18" height="10" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "3:2":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="2" y="4" width="16" height="12" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "9:16":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className="transition-colors">
          <rect x="5" y="1" width="10" height="18" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function ImageResizeSettings({
  settings,
  onPatch,
  onReset,
  originalWidth,
  originalHeight,
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  scale,
  upscaling,
  capped,
  cropWidth,
  cropHeight,
  onResetCrop,
  originalBytes = 0,
  estimatedBytes = 0,
}: {
  settings: ResizeSettings;
  onPatch: (patch: Partial<ResizeSettings>) => void;
  onReset: () => void;
  originalWidth: number;
  originalHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  upscaling: boolean;
  capped: boolean;
  cropWidth: number;
  cropHeight: number;
  onResetCrop: () => void;
  originalBytes?: number;
  estimatedBytes?: number;
}) {
  const [showAllPresets, setShowAllPresets] = useState(false);
  const lossy = isLossyFormat(settings.format);
  const sourceRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1;

  function changeWidth(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    if (!settings.linked || !sourceRatio) {
      onPatch({ width: cleaned });
      return;
    }
    const num = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(num) || num <= 0) {
      onPatch({ width: cleaned });
      return;
    }
    const proportional = Math.max(1, Math.round(num / sourceRatio));
    onPatch({ width: cleaned, height: String(proportional) });
  }

  function changeHeight(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    if (!settings.linked || !sourceRatio) {
      onPatch({ height: cleaned });
      return;
    }
    const num = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(num) || num <= 0) {
      onPatch({ height: cleaned });
      return;
    }
    const proportional = Math.max(1, Math.round(num * sourceRatio));
    onPatch({ height: cleaned, width: String(proportional) });
  }

  function applyPreset(width: number, height: number) {
    onPatch({
      mode: "dimensions",
      width: String(width),
      height: String(height),
      linked: false,
    });
  }

  function rotate(delta: number) {
    const next = (((settings.rotation + delta) % 360) + 360) % 360;
    onPatch({ rotation: next });
  }

  const hasTransforms = settings.rotation !== 0 || settings.flipX || settings.flipY;

  return (
    <StudioRail label="Resize & crop settings">
      {/* Sticky Settings Header */}
      <div className="-mx-4 -mt-4 flex items-center justify-between gap-3 bg-[#fdfdfc]/95 px-4 pb-4 pt-4 backdrop-blur-sm sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5 lg:sticky lg:-top-5 lg:z-10">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          <SlidersHorizontal size={13} aria-hidden />
          Settings
        </span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <RotateCcw size={11} aria-hidden />
          Reset
        </button>
      </div>

      <div className="space-y-6">
        {/* Section 1: Resize & Crop Mode */}
        <RailSection
          icon={Scaling}
          title="Mode"
          hint="Exact pixels, scale percent, or interactive crop"
          aside={
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
              {settings.mode === "dimensions"
                ? `${outputWidth || settings.width} × ${outputHeight || settings.height} px`
                : settings.mode === "percent"
                  ? `${settings.percent}% scale`
                  : "Crop box"}
            </span>
          }
        >
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-[11px] border border-line bg-[#f3f0e9] p-1">
            {[
              { id: "crop" as const, label: "Crop", icon: Crop },
              { id: "dimensions" as const, label: "Dimensions", icon: Frame },
              { id: "percent" as const, label: "Scale %", icon: Percent },
            ].map((tab) => {
              const selected = settings.mode === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ mode: tab.id })}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[11.5px] font-medium transition-colors ${
                    selected
                      ? "bg-white text-ink shadow-[0_1px_3px_rgba(15,15,16,0.08)]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={12} strokeWidth={2} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sub-Panel: Crop Mode */}
          {settings.mode === "crop" && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[11px] font-semibold text-ink">Crop aspect ratio</span>
                  <span className="text-[10.5px] text-faint font-medium">
                    {settings.cropRatio === "free" ? "Drag handles freely" : "Ratio locked"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CROP_RATIOS.map((ratio) => {
                    const selected = settings.cropRatio === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => onPatch({ cropRatio: ratio.id })}
                        className={`group relative flex flex-col items-center justify-center rounded-[11px] border p-2.5 text-center transition-all ${
                          selected
                            ? "border-ink bg-white shadow-xs ring-1 ring-ink/20 font-semibold"
                            : "border-line bg-white/70 hover:border-[#c8c2b7] hover:bg-white text-muted hover:text-ink"
                        }`}
                      >
                        <div className="mb-1.5 flex h-6 w-6 items-center justify-center">
                          <AspectRatioMiniature id={ratio.id} active={selected} />
                        </div>
                        <span className="text-[12px] font-bold text-ink">{ratio.label}</span>
                        <span className="mt-0.5 text-[9.5px] text-faint">{ratio.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Crop Box Live Info & Reset */}
              <div className="flex items-center justify-between rounded-[12px] border border-line bg-[#fbfaf7] p-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-white text-ink shadow-2xs">
                    <Crop size={14} aria-hidden />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Active crop box</p>
                    <p className="mt-0.5 text-[12.5px] font-bold tabular-nums text-ink">
                      {cropWidth && cropHeight ? `${cropWidth} × ${cropHeight} px` : "Select area on stage"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onResetCrop}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-line bg-white px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-[#c8c2b7] hover:text-ink hover:bg-hover"
                  title="Reset crop box to full image"
                >
                  <RotateCcw size={11} aria-hidden />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          )}

          {/* Sub-Panel: Dimensions Mode */}
          {settings.mode === "dimensions" && (
            <div className="mt-4 space-y-4">
              {/* Dual Width / Height Numeric Inputs */}
              <div>
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-muted">Width</span>
                    <span className="relative mt-1 block">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={settings.width}
                        onChange={(event) => changeWidth(event.target.value)}
                        placeholder="1920"
                        className="h-10 w-full rounded-[10px] border border-line bg-white pl-3 pr-8 text-[13px] font-semibold tabular-nums text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)] outline-none transition-colors focus:border-ink"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-medium text-faint">
                        px
                      </span>
                    </span>
                  </label>

                  {/* Aspect Lock Toggle */}
                  <button
                    type="button"
                    onClick={() => onPatch({ linked: !settings.linked })}
                    aria-pressed={settings.linked}
                    title={settings.linked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    className={`mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border transition-colors ${
                      settings.linked
                        ? "border-ink bg-ink text-white shadow-xs"
                        : "border-line bg-white text-faint hover:border-[#c8c2b7] hover:text-ink"
                    }`}
                  >
                    {settings.linked ? <Link2 size={15} aria-hidden /> : <Unlink2 size={15} aria-hidden />}
                  </button>

                  <label className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-muted">Height</span>
                    <span className="relative mt-1 block">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={settings.height}
                        onChange={(event) => changeHeight(event.target.value)}
                        placeholder="1080"
                        className="h-10 w-full rounded-[10px] border border-line bg-white pl-3 pr-8 text-[13px] font-semibold tabular-nums text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)] outline-none transition-colors focus:border-ink"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-medium text-faint">
                        px
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10.5px] text-faint">
                  <span>
                    Aspect: <strong className="font-medium text-ink">{ratioLabel(outputWidth, outputHeight)}</strong>
                  </span>
                  <span>{settings.linked ? "Locked to original aspect" : "Unlocked (custom)"}</span>
                </div>
              </div>

              {/* Popular Dimensions Presets */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted">Presets</span>
                  <button
                    type="button"
                    onClick={() => setShowAllPresets(!showAllPresets)}
                    className="text-[10.5px] font-medium text-accent hover:underline"
                  >
                    {showAllPresets ? "Fewer" : "More"}
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(showAllPresets ? POPULAR_PRESETS : POPULAR_PRESETS.slice(0, 4)).map((preset) => {
                    const isCurrent =
                      settings.width === String(preset.width) && settings.height === String(preset.height);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPreset(preset.width, preset.height)}
                        className={`flex flex-col items-start rounded-[9px] border p-2 text-left transition-all ${
                          isCurrent
                            ? "border-ink bg-white shadow-xs"
                            : "border-line bg-white/70 hover:border-[#c8c2b7] hover:bg-white"
                        }`}
                      >
                        <span className="text-[11px] font-medium text-ink">{preset.label}</span>
                        <span className="mt-0.5 text-[9.5px] tabular-nums text-faint">
                          {preset.detail} ({preset.ratio})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fit Mode */}
              <div>
                <span className="block text-[11px] font-medium text-muted">Fit behavior</span>
                <p className="mt-0.5 text-[10px] text-faint">
                  Determines how the image fits if the new ratio differs from the source.
                </p>
                <div className="mt-2 space-y-1.5">
                  {FIT_OPTIONS.map((opt) => {
                    const selected = settings.fit === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onPatch({ fit: opt.value })}
                        className={`flex w-full items-start gap-2.5 rounded-[10px] border p-2.5 text-left transition-all ${
                          selected
                            ? "border-ink bg-white shadow-xs"
                            : "border-line bg-white/60 hover:border-[#c8c2b7] hover:bg-white"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${
                            selected ? "border-ink bg-ink text-white" : "border-[#ccc6ba] bg-white"
                          }`}
                        >
                          {selected && <Check size={9} strokeWidth={3} aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-medium text-ink">{opt.label}</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{opt.hint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background Color selector for Fit with Padding */}
              {settings.fit === "fit" && (
                <div className="rounded-[12px] border border-line bg-[#faf8f4] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-ink">Padding color</span>
                    <span className="text-[10px] text-faint capitalize">{settings.background}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {BG_PRESETS.map((bg) => {
                      const selected = settings.background === bg.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => onPatch({ background: bg.id })}
                          className={`flex items-center gap-1.5 rounded-[8px] border p-1.5 text-[10.5px] font-medium transition-colors ${
                            selected
                              ? "border-ink bg-white text-ink shadow-xs"
                              : "border-line bg-white/60 text-muted hover:border-[#c8c2b7] hover:text-ink"
                          }`}
                        >
                          <span className={`h-3 w-3 shrink-0 rounded-full ${bg.swatch}`} />
                          <span className="truncate">{bg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {settings.background === "custom" && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(e) => onPatch({ customBackground: e.target.value })}
                        className="h-8 w-9 cursor-pointer rounded-[6px] border border-line bg-white p-0.5"
                      />
                      <input
                        type="text"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(e) => onPatch({ customBackground: e.target.value })}
                        placeholder="#ffffff"
                        className="h-8 flex-1 rounded-[7px] border border-line bg-white px-2.5 text-[11px] font-mono uppercase text-ink outline-none focus:border-ink"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Never upscale toggle right in Dimensions section */}
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-line bg-white p-2.5 transition-colors hover:border-[#c8c2b7]">
                <div>
                  <p className="text-[11.5px] font-medium text-ink">Never upscale</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    Caps output at original size to prevent pixelation when enlarging.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.neverUpscale}
                  onChange={(event) => onPatch({ neverUpscale: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-line text-ink accent-ink"
                />
              </label>
            </div>
          )}

          {/* Sub-Panel: Scale % Mode */}
          {settings.mode === "percent" && (
            <div className="mt-4 space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-medium text-muted">Scale factor</span>
                  <p className="mt-0.5 text-[10px] text-faint">Proportionately scales width and height</p>
                </div>
                <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
                  {settings.percent}%
                </span>
              </div>

              {/* Styled Range Slider */}
              <div>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={settings.percent}
                  onChange={(event) => onPatch({ percent: Number(event.target.value) })}
                  style={rangeFill(settings.percent, 10, 200)}
                  className="range w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-faint">
                  <span>10%</span>
                  <span>50%</span>
                  <span>100% (Original)</span>
                  <span>150%</span>
                  <span>200%</span>
                </div>
              </div>

              {/* Quick Percent Chips */}
              <div className="grid grid-cols-7 gap-1">
                {PERCENT_CHIPS.map((pct) => {
                  const selected = settings.percent === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onPatch({ percent: pct })}
                      className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white shadow-xs"
                          : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:text-ink"
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>

              {/* Never upscale toggle in Scale % mode */}
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-line bg-white p-2.5 transition-colors hover:border-[#c8c2b7]">
                <div>
                  <p className="text-[11.5px] font-medium text-ink">Never upscale</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    Caps output at 100% original size if scale exceeds 100%.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.neverUpscale}
                  onChange={(event) => onPatch({ neverUpscale: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-line text-ink accent-ink"
                />
              </label>

              {/* Live Scaled Size Preview */}
              <div className="flex items-center justify-between rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2 text-[11px]">
                <span className="text-muted">Resulting size</span>
                <span className="font-medium tabular-nums text-ink">
                  {outputWidth || "—"} × {outputHeight || "—"} px
                </span>
              </div>
            </div>
          )}
        </RailSection>

        {/* Section 2: Rotate & Flip */}
        <RailSection
          icon={RotateCw}
          title="Rotate & Flip"
          hint="Lossless 90° turns and horizontal/vertical mirroring"
          defaultOpen={true}
          aside={
            hasTransforms ? (
              <span className="rounded-full border border-ink/20 bg-ink/5 px-2.5 py-1 text-[10.5px] font-semibold text-ink">
                {settings.rotation}°{settings.flipX ? " · Flip H" : ""}{settings.flipY ? " · Flip V" : ""}
              </span>
            ) : undefined
          }
        >
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => rotate(-90)}
              title="Rotate 90° counter-clockwise"
              className="group flex h-12 flex-col items-center justify-center gap-1 rounded-[11px] border border-line bg-white text-muted shadow-2xs transition-all hover:border-[#c8c2b7] hover:bg-hover hover:text-ink active:scale-95"
            >
              <RotateCcw size={15} className="transition-transform group-hover:-rotate-12" aria-hidden />
              <span className="text-[10px] font-semibold">−90°</span>
            </button>
            <button
              type="button"
              onClick={() => rotate(90)}
              title="Rotate 90° clockwise"
              className="group flex h-12 flex-col items-center justify-center gap-1 rounded-[11px] border border-line bg-white text-muted shadow-2xs transition-all hover:border-[#c8c2b7] hover:bg-hover hover:text-ink active:scale-95"
            >
              <RotateCw size={15} className="transition-transform group-hover:rotate-12" aria-hidden />
              <span className="text-[10px] font-semibold">+90°</span>
            </button>
            <button
              type="button"
              onClick={() => onPatch({ flipX: !settings.flipX })}
              title="Flip horizontally"
              className={`flex h-12 flex-col items-center justify-center gap-1 rounded-[11px] border shadow-2xs transition-all active:scale-95 ${
                settings.flipX
                  ? "border-ink bg-ink text-white shadow-xs"
                  : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:bg-hover hover:text-ink"
              }`}
            >
              <FlipHorizontal2 size={15} aria-hidden />
              <span className="text-[10px] font-semibold">Flip H</span>
            </button>
            <button
              type="button"
              onClick={() => onPatch({ flipY: !settings.flipY })}
              title="Flip vertically"
              className={`flex h-12 flex-col items-center justify-center gap-1 rounded-[11px] border shadow-2xs transition-all active:scale-95 ${
                settings.flipY
                  ? "border-ink bg-ink text-white shadow-xs"
                  : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:bg-hover hover:text-ink"
              }`}
            >
              <FlipVertical2 size={15} aria-hidden />
              <span className="text-[10px] font-semibold">Flip V</span>
            </button>
          </div>

          {hasTransforms && (
            <div className="mt-2.5 flex items-center justify-between rounded-[9px] border border-line/60 bg-[#fbfaf8] px-2.5 py-1.5 text-[11px]">
              <span className="text-faint">
                Angle: <strong className="font-semibold text-ink">{settings.rotation}°</strong>
                {settings.flipX && <span className="ml-1 text-ink">· Flip H</span>}
                {settings.flipY && <span className="ml-1 text-ink">· Flip V</span>}
              </span>
              <button
                type="button"
                onClick={() => onPatch({ rotation: 0, flipX: false, flipY: false })}
                className="font-medium text-muted hover:text-ink hover:underline"
              >
                Reset transforms
              </button>
            </div>
          )}
        </RailSection>

        {/* Section 3: Advanced Options Accordion (Hidden / Collapsed by default) */}
        <RailSection
          icon={SlidersHorizontal}
          title="Advanced options"
          hint="Output format, visual quality & output filters"
          defaultOpen={false}
          aside={
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
              {formatLabel(settings.format)}{lossy ? ` · ${settings.quality}%` : " · Lossless"}
            </span>
          }
        >
          <div className="space-y-4">
            {/* Format Selection Cards */}
            <div>
              <span className="block text-[11px] font-semibold text-ink mb-2">Output format</span>
              <div className="grid grid-cols-5 gap-1.5">
                {RESIZE_FORMATS.map((fmt) => {
                  const selected = settings.format === fmt.value;
                  return (
                    <button
                      key={fmt.value}
                      type="button"
                      onClick={() => onPatch({ format: fmt.value })}
                      className={`flex flex-col items-center justify-center rounded-[10px] border py-2 px-1 text-center transition-all ${
                        selected
                          ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                          : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                      }`}
                    >
                      <span className="text-[12px] font-bold">{fmt.label}</span>
                      <span className="mt-0.5 text-[9px] text-faint">
                        {fmt.value === "auto" ? "Smart" : fmt.lossy ? "Lossy" : "Lossless"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quality Slider (for lossy formats) */}
            {lossy && (
              <div className="space-y-2.5 rounded-[12px] border border-line bg-[#fbfaf8] p-3 shadow-2xs">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-ink">Quality level</span>
                    <p className="mt-0.5 text-[10px] text-faint">Higher preserves subtle gradient & sharpness</p>
                  </div>
                  <span className="font-display text-[18px] font-bold leading-none tabular-nums text-ink">
                    {settings.quality}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={2}
                  value={settings.quality}
                  onChange={(event) => onPatch({ quality: Number(event.target.value) })}
                  style={rangeFill(settings.quality, 10, 100)}
                  className="range w-full"
                />
                <div className="grid grid-cols-5 gap-1">
                  {QUALITY_PRESETS.map((preset) => {
                    const selected = settings.quality === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => onPatch({ quality: preset.value })}
                        className={`h-6 rounded-[6px] border text-[10px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white shadow-2xs font-semibold"
                            : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:text-ink"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Integrated Filters & Metadata */}
            <div className="space-y-2 border-t border-line-soft pt-3">
              <span className="block text-[11px] font-semibold text-ink">Output filters & options</span>
              <div className="space-y-1.5">
                {/* Subtle Post-sharpening toggle */}
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 transition-colors hover:border-[#c8c2b7]">
                  <div>
                    <p className="text-[11.5px] font-medium text-ink">Subtle post-sharpening</p>
                    <p className="text-[9.5px] text-faint">Restores edge clarity and micro-contrast</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.sharpen}
                    onChange={(event) => onPatch({ sharpen: event.target.checked })}
                    className="h-4 w-4 rounded border-line text-ink accent-ink"
                  />
                </label>

                {/* Grayscale Mode toggle */}
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 transition-colors hover:border-[#c8c2b7]">
                  <div>
                    <p className="text-[11.5px] font-medium text-ink">Grayscale (B&amp;W)</p>
                    <p className="text-[9.5px] text-faint">Removes chroma channels for clean monochrome</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.grayscale)}
                    onChange={(event) => onPatch({ grayscale: event.target.checked })}
                    className="h-4 w-4 rounded border-line text-ink accent-ink"
                  />
                </label>

                {/* Strip Metadata toggle */}
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 transition-colors hover:border-[#c8c2b7]">
                  <div>
                    <p className="text-[11.5px] font-medium text-ink">Strip metadata (EXIF)</p>
                    <p className="text-[9.5px] text-faint">Removes camera model, GPS coordinates and timestamps</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.removeMetadata}
                    onChange={(event) => onPatch({ removeMetadata: event.target.checked })}
                    className="h-4 w-4 rounded border-line text-ink accent-ink"
                  />
                </label>
              </div>
            </div>

            {/* Live Output Specs Summary Card */}
            <div className="rounded-[14px] border border-[#e5dfd3] bg-[#fbf9f5] p-3.5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-line-soft pb-2.5 text-[11px]">
                <span className="font-semibold text-ink">Live Output Specs</span>
                <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-muted">
                  {formatLabel(settings.format)}
                </span>
              </div>

              <div className="mt-2.5 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-faint">Dimensions</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {outputWidth && outputHeight ? `${outputWidth} × ${outputHeight} px` : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-faint">Aspect ratio</span>
                  <span className="font-medium text-ink">{ratioLabel(outputWidth, outputHeight)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-faint">Scale</span>
                  <span className="font-medium tabular-nums text-ink">
                    {scale ? `${Math.round(scale * 100)}%` : "100%"}
                  </span>
                </div>

                {estimatedBytes > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-faint">Est. file size</span>
                    <span className="font-medium tabular-nums text-ink">
                      {formatBytes(estimatedBytes)}
                      {originalBytes > estimatedBytes && (
                        <span className="ml-1 text-[10px] font-semibold text-[#3b7c3f]">
                          (−{Math.round(((originalBytes - estimatedBytes) / originalBytes) * 100)}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {upscaling && (
                <div className="mt-3 flex items-start gap-1.5 rounded-[8px] border border-[#ecd9b8] bg-[#fdf8ee] p-2 text-[10.5px] leading-relaxed text-[#8a652d]">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
                  <span>Upscaling interpolates pixels. Turn on “Never upscale” to preserve native sharpness.</span>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-[10px] text-faint">
                <ShieldCheck size={12} className="text-[#5f8a56]" aria-hidden />
                <span>100% client-side canvas engine · Zero uploads</span>
              </div>
            </div>
          </div>
        </RailSection>
      </div>
    </StudioRail>
  );
}

function RailSection({
  icon: Icon,
  title,
  hint,
  aside,
  children,
  defaultOpen = true,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[16px] border border-line bg-white/80 p-3.5 shadow-xs transition-colors hover:border-[#d9d3c7]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border border-line bg-[#fbfaf7] text-ink">
            <Icon size={13} aria-hidden />
          </span>
          <div>
            <h3 className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <p className="mt-0.5 text-[10.5px] leading-snug text-faint">{hint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <ChevronDown
            size={14}
            className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      {open && <div className="mt-3.5 border-t border-line-soft pt-3.5">{children}</div>}
    </div>
  );
}
