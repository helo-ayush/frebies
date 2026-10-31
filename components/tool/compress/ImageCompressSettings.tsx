"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileOutput,
  Frame,
  Gauge,
  Image as ImageIcon,
  Info,
  Lock,
  Minus,
  Palette,
  Percent,
  Plus,
  RotateCcw,
  Scaling,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Unlock,
  Wand2,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { formatBytes } from "@/lib/image/encode";
import type {
  CompressGoal,
  CompressSettings,
  OutputFormat,
  ResizeMode,
  ResizeOption,
  TargetUnit,
} from "./model";

export type { CompressSettings };

export const DEFAULT_COMPRESS_SETTINGS: CompressSettings = {
  goal: "target",
  quality: 80,
  targetValue: "100",
  targetUnit: "KB",
  percent: 60,
  format: "auto",
  resize: "original",
  resizeMode: "original",
  scalePercent: 75,
  maxEdgePx: 1600,
  customWidth: 1920,
  customHeight: 1080,
  lockAspect: true,
  keepSmaller: true,
  stripMetadata: true,
  progressive: true,
  sharpen: false,
  sharpenAmount: 0,
  grayscale: false,
  backgroundColor: "#ffffff",
  customColor: "#ffffff",
  preserveAlpha: true,
  subsampling: "Auto",
  colorProfile: "Keep original",
};

const TARGET_PRESET_CHIPS: { value: string; unit: TargetUnit; label: string; badge?: string }[] = [
  { value: "50", unit: "KB", label: "50 KB", badge: "Tiny" },
  { value: "100", unit: "KB", label: "100 KB", badge: "Web" },
  { value: "200", unit: "KB", label: "200 KB", badge: "Email" },
  { value: "500", unit: "KB", label: "500 KB" },
  { value: "1", unit: "MB", label: "1 MB", badge: "Market" },
  { value: "2", unit: "MB", label: "2 MB" },
];

const QUALITY_PRESETS = [
  { label: "Max", value: 100 },
  { label: "High", value: 90 },
  { label: "Good", value: 80 },
  { label: "Mid", value: 65 },
  { label: "Compact", value: 40 },
  { label: "Low", value: 20 },
];

const PERCENT_PRESETS = [25, 40, 50, 65, 75, 85];

const FORMAT_OPTIONS: {
  value: OutputFormat;
  label: string;
  hint: string;
  badge?: string;
  supportsAlpha: boolean;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "Smallest modern format",
    badge: "Recommended",
    supportsAlpha: true,
    description: "Keeps transparency and chooses the smallest codec (WebP/AVIF/PNG) for maximum savings.",
  },
  {
    value: "webp",
    label: "WebP",
    hint: "30–50% smaller than JPG",
    badge: "Modern",
    supportsAlpha: true,
    description: "Google's modern web standard. High visual fidelity at small byte sizes with transparency.",
  },
  {
    value: "jpg",
    label: "JPG",
    hint: "Universal compatibility",
    badge: "Universal",
    supportsAlpha: false,
    description: "Supported on every computer, device, and browser. Flattens transparency onto a solid color.",
  },
  {
    value: "png",
    label: "PNG",
    hint: "Lossless with transparency",
    badge: "Lossless",
    supportsAlpha: true,
    description: "Preserves pixel-crisp vector lines, text and alpha transparency without compression blur.",
  },
  {
    value: "avif",
    label: "AVIF",
    hint: "Next-gen AV1 codec",
    badge: "Next-gen",
    supportsAlpha: true,
    description: "Next-generation video-derived codec. Delivers superior compression efficiency at tiny file sizes.",
  },
];

const RESIZE_MODES: {
  id: ResizeMode;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { id: "original", label: "Keep original", hint: "Full resolution", icon: ImageIcon },
  { id: "scale", label: "Scale by %", hint: "Shrink proportionally", icon: Percent },
  { id: "maxEdge", label: "Fit long edge", hint: "Cap longest side", icon: Scaling },
  { id: "custom", label: "Exact size", hint: "Set width × height", icon: Frame },
];

const BG_COLOR_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
  { label: "Grey", value: "#f4f4f4" },
];

const SHARPEN_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "Mild", value: 0.15 },
  { label: "Crisp", value: 0.3 },
  { label: "Heavy", value: 0.45 },
];

function qualityBand(quality: number) {
  if (quality >= 95) return { label: "Maximum detail", dot: "bg-[#6f9c63]" };
  if (quality >= 85) return { label: "High quality", dot: "bg-[#6f9c63]" };
  if (quality >= 70) return { label: "Balanced", dot: "bg-[#c49a4a]" };
  if (quality >= 50) return { label: "Smaller file", dot: "bg-[#c4814a]" };
  return { label: "Aggressive", dot: "bg-[#b35c4a]" };
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = Math.min(100, Math.max(0, ((value - min) / Math.max(1, max - min)) * 100));
  return {
    background: `linear-gradient(to right, var(--color-ink) 0%, var(--color-ink) ${percent}%, var(--color-line-soft) ${percent}%, var(--color-line-soft) 100%)`,
  };
}

export function ImageCompressSettings({
  settings,
  dimensions,
  targetSize,
  originalBytes,
  result,
  hasImage,
  onPatch,
  onCustomWidth,
  onCustomHeight,
  onReset,
}: {
  settings: CompressSettings;
  dimensions: { width: number; height: number } | null;
  targetSize?: { width: number; height: number } | null;
  originalBytes: number | null;
  result: { bytes: number; originalBytes: number; width: number; height: number; format: string } | null;
  hasImage: boolean;
  onPatch: (patch: Partial<CompressSettings>) => void;
  onCustomWidth?: (width: number) => void;
  onCustomHeight?: (height: number) => void;
  onReset: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const band = qualityBand(settings.quality);

  const activeFormatMeta =
    FORMAT_OPTIONS.find((f) => f.value === settings.format) ?? FORMAT_OPTIONS[0];

  const resultDelta = result
    ? Math.round((1 - result.bytes / Math.max(1, result.originalBytes)) * 100)
    : null;

  const hasCustomAdvanced =
    settings.resizeMode !== "original" ||
    !settings.keepSmaller ||
    settings.sharpenAmount > 0 ||
    settings.sharpen ||
    settings.grayscale ||
    !settings.preserveAlpha ||
    settings.backgroundColor.toLowerCase() !== "#ffffff";

  // Target size calculation in bytes
  const targetValNum = Number.parseFloat(settings.targetValue.replace(",", ".")) || 100;
  const targetBytes = targetValNum * (settings.targetUnit === "MB" ? 1024 * 1024 : 1024);
  const targetEstimatedDelta =
    originalBytes && originalBytes > 0
      ? Math.max(0, Math.round((1 - Math.min(targetBytes, originalBytes) / originalBytes) * 100))
      : null;

  function adjustTarget(delta: number) {
    const cur = Number.parseFloat(settings.targetValue) || 100;
    const next = Math.max(1, cur + delta);
    onPatch({ targetValue: next.toString() });
  }

  return (
    <StudioRail label="Compression settings">
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
        {/* Section 1: Compression Goal / Mode */}
        <RailSection
          icon={Target}
          title="Compression goal"
          hint="Target size, visual quality or percentage"
          aside={
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
              {settings.goal === "target"
                ? `${settings.targetValue} ${settings.targetUnit}`
                : settings.goal === "quality"
                  ? `${settings.quality}% quality`
                  : `−${settings.percent}%`}
            </span>
          }
        >
          {/* Goal Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-[11px] border border-line bg-[#f3f0e9] p-1">
            {[
              { id: "target" as const, label: "Target size", icon: Target },
              { id: "quality" as const, label: "Quality %", icon: Gauge },
              { id: "percent" as const, label: "Reduce %", icon: Percent },
            ].map((tab) => {
              const selected = settings.goal === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ goal: tab.id })}
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

          {/* Goal 1: Target File Size */}
          {settings.goal === "target" && (
            <div className="mt-3 space-y-3">
              {/* Stepper Card */}
              <div className="rounded-[14px] border border-line bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[12px] font-semibold text-ink">Strict size ceiling</span>
                    <p className="text-[10px] text-faint">Guaranteed output at or under this limit</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustTarget(settings.targetUnit === "MB" ? -0.5 : -10)}
                      aria-label="Decrease target"
                      className="grid h-8 w-8 place-items-center rounded-[7px] border border-line bg-[#faf8f5] text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <Minus size={13} />
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={settings.targetUnit === "MB" ? 100 : 100000}
                      step={settings.targetUnit === "MB" ? 0.1 : 1}
                      value={settings.targetValue}
                      onChange={(e) => onPatch({ targetValue: e.target.value })}
                      className="h-8 w-20 rounded-[7px] border border-line bg-[#faf8f5] px-2 text-center font-display text-[16px] font-bold text-ink outline-none transition-colors focus:border-ink"
                      placeholder="100"
                    />

                    <button
                      type="button"
                      onClick={() => adjustTarget(settings.targetUnit === "MB" ? 0.5 : 10)}
                      aria-label="Increase target"
                      className="grid h-8 w-8 place-items-center rounded-[7px] border border-line bg-[#faf8f5] text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <Plus size={13} />
                    </button>

                    <div className="flex rounded-[7px] border border-line bg-[#f3f0e9] p-0.5 ml-1">
                      {(["KB", "MB"] as TargetUnit[]).map((unit) => {
                        const selected = settings.targetUnit === unit;
                        return (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => onPatch({ targetUnit: unit })}
                            className={`h-7 rounded-[5px] px-2.5 text-[11px] font-bold transition-colors ${
                              selected ? "bg-white text-ink shadow-2xs" : "text-muted hover:text-ink"
                            }`}
                          >
                            {unit}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Popular Size Preset Chips */}
                <div className="mt-3 pt-3 border-t border-line-soft">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                      Quick targets
                    </p>
                    {originalBytes && targetEstimatedDelta !== null && (
                      <span className="text-[10.5px] font-semibold text-[#305e2b]">
                        Est. savings: ~{targetEstimatedDelta}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TARGET_PRESET_CHIPS.map((chip) => {
                      const selected =
                        settings.targetValue === chip.value && settings.targetUnit === chip.unit;
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ targetValue: chip.value, targetUnit: chip.unit })}
                          className={`flex h-8 items-center justify-between rounded-[8px] border px-2.5 text-[11px] font-semibold tabular-nums transition-all ${
                            selected
                              ? "border-ink bg-ink text-white shadow-2xs"
                              : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                          }`}
                        >
                          <span>{chip.label}</span>
                          {chip.badge && (
                            <span
                              className={`text-[8.5px] font-normal ${
                                selected ? "text-white/70" : "text-faint"
                              }`}
                            >
                              {chip.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-[11px] border border-line bg-[#f7f4ed] px-3 py-2 text-[11px] text-muted">
                <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <span>
                  Multi-step binary search iteratively finds the highest quality matching your ceiling. If minimum quality still exceeds it, canvas is gently downscaled to strictly meet the size.
                </span>
              </div>
            </div>
          )}

          {/* Goal 2: Visual Quality Slider */}
          {settings.goal === "quality" && (
            <div className="mt-3 rounded-[14px] border border-line bg-white p-3.5 shadow-2xs">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-ink">Visual quality slider</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${band.dot}`} aria-hidden />
                    {band.label}
                  </p>
                </div>
                <span className="font-display text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                  {settings.quality}
                  <span className="ml-0.5 text-[15px] font-medium text-muted">%</span>
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={settings.quality}
                onChange={(e) => onPatch({ quality: Number(e.target.value) })}
                aria-label="Quality percent"
                style={rangeFill(settings.quality, 10, 100)}
                className="range mt-3"
              />
              <div className="mt-1 flex justify-between text-[10px] text-faint">
                <span>Maximum compression (10%)</span>
                <span>Near-lossless (100%)</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 pt-3 border-t border-line-soft">
                {QUALITY_PRESETS.map((preset) => {
                  const selected = settings.quality === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ quality: preset.value })}
                      className={`flex h-8 items-center justify-center gap-1 rounded-[8px] border text-[11px] font-medium transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white font-semibold shadow-2xs"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {preset.label}
                      <span className={`text-[9.5px] tabular-nums ${selected ? "text-white/60" : "text-faint"}`}>
                        {preset.value}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goal 3: Percentage Cut */}
          {settings.goal === "percent" && (
            <div className="mt-3 rounded-[14px] border border-line bg-white p-3.5 shadow-2xs">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-ink">Fixed byte reduction</p>
                  <p className="mt-0.5 text-[11px] text-faint">Shave a guaranteed slice off original file</p>
                </div>
                <span className="font-display text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[#305e2b]">
                  −{settings.percent}%
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={95}
                step={1}
                value={settings.percent}
                onChange={(e) => onPatch({ percent: Number(e.target.value) })}
                aria-label="Percentage reduction"
                style={rangeFill(settings.percent, 10, 95)}
                className="range mt-3"
              />
              <div className="mt-1 flex justify-between text-[10px] text-faint">
                <span>Light trim (−10%)</span>
                <span>Aggressive squeeze (−95%)</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 pt-3 border-t border-line-soft">
                {PERCENT_PRESETS.map((val) => {
                  const selected = settings.percent === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ percent: val })}
                      className={`h-8 rounded-[8px] border text-[11px] font-semibold tabular-nums transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white shadow-2xs"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      −{val}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </RailSection>

        <RailDivider />

        {/* Section 2: Output Format Selection */}
        <RailSection
          icon={FileOutput}
          title="Output format"
          hint="Smart auto-selection or specific format"
          aside={
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-2xs">
              {activeFormatMeta.label}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map((fmt) => {
              const selected = settings.format === fmt.value;
              return (
                <button
                  key={fmt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ format: fmt.value })}
                  className={`group relative flex flex-col justify-between rounded-[11px] border p-2.5 text-left transition-all duration-150 ${
                    selected
                      ? "border-ink bg-ink text-white shadow-[0_4px_14px_rgba(15,15,16,0.16)]"
                      : "border-line bg-white text-ink hover:border-[#cfc9bd] hover:shadow-[0_2px_8px_rgba(15,15,16,0.05)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-bold tracking-tight">
                      {fmt.label}
                    </span>
                    {selected ? (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-ink shadow-2xs">
                        <Check size={10} strokeWidth={3} aria-hidden />
                      </span>
                    ) : fmt.badge ? (
                      <span className="rounded-[4px] bg-[#f0f4ee] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#32592a] leading-tight">
                        {fmt.badge}
                      </span>
                    ) : fmt.supportsAlpha ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7ba36d]" title="Supports transparency" />
                    ) : null}
                  </div>
                  <span
                    className={`mt-1 block truncate text-[10px] ${
                      selected ? "text-white/65" : "text-faint"
                    }`}
                  >
                    {fmt.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-start gap-2 rounded-[11px] border border-line bg-[#f7f4ed] px-3 py-2 text-[11px] text-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0">
              <span className="font-semibold text-ink">{activeFormatMeta.label}</span>
              <span className="mx-1 text-faint">·</span>
              <span>{activeFormatMeta.description}</span>
            </div>
          </div>

          {/* Background Flattening for JPG or when Alpha is Stripped */}
          {(settings.format === "jpg" || !settings.preserveAlpha) && (
            <div className="mt-3 rounded-[12px] border border-line bg-[#faf8f5] p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11.5px] font-semibold text-ink">Background color</span>
                <span className="font-mono text-[10.5px] text-faint">{settings.backgroundColor}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {BG_COLOR_PRESETS.map((color) => {
                  const selected = settings.backgroundColor.toLowerCase() === color.value.toLowerCase();
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => onPatch({ backgroundColor: color.value })}
                      className={`flex h-7 items-center gap-1.5 rounded-[7px] border px-2 text-[10.5px] font-medium transition-colors ${
                        selected
                          ? "border-ink bg-white font-semibold text-ink shadow-2xs"
                          : "border-line bg-white/70 text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-black/15"
                        style={{ backgroundColor: color.value }}
                      />
                      <span>{color.label}</span>
                    </button>
                  );
                })}
                <input
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(e) => onPatch({ backgroundColor: e.target.value })}
                  aria-label="Custom background color"
                  className="h-7 w-8 cursor-pointer rounded-[7px] border border-line bg-white p-0.5"
                />
              </div>
            </div>
          )}
        </RailSection>

        <RailDivider />

        {/* Section 3: Collapsible Advanced Options */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-line bg-white p-3 text-left transition-all hover:border-[#cfc9bd] hover:bg-[#faf9f6]"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#f4f1ea] text-ink">
                <SlidersHorizontal size={13} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-ink">
                    Advanced options
                  </span>
                  {hasCustomAdvanced && (
                    <span className="rounded-full bg-[#f0f4ee] px-2 py-0.5 text-[9.5px] font-semibold text-[#32592a]">
                      Customized
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] text-faint">
                  {advancedOpen
                    ? "Resolution downscaling, sharpening & color filters"
                    : hasCustomAdvanced
                      ? "Custom resolution limits or filters applied"
                      : "Downscale limit, sharpen & color options"}
                </span>
              </span>
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-faint transition-transform duration-200 ${
                advancedOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>

          {/* Expanded Advanced Controls */}
          {advancedOpen && (
            <div className="mt-5 space-y-6">
              {/* Resize / Downscale Section */}
              <RailSection
                icon={Scaling}
                title="Resolution downscaling"
                hint="Reduce image pixel dimensions to cut size"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {RESIZE_MODES.map((mode) => {
                    const selected = settings.resizeMode === mode.id;
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        disabled={!hasImage}
                        aria-pressed={selected}
                        onClick={() => onPatch({ resizeMode: mode.id })}
                        className={`rounded-[10px] border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          selected
                            ? "border-ink bg-white shadow-[0_1px_3px_rgba(15,15,16,0.06)] ring-1 ring-ink/10"
                            : "border-line bg-white/60 hover:border-[#d5d0c5] hover:bg-white"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Icon
                              size={12}
                              strokeWidth={1.8}
                              className={selected ? "text-ink" : "text-faint"}
                              aria-hidden
                            />
                            <span className="truncate text-[11.5px] font-semibold text-ink">
                              {mode.label}
                            </span>
                          </span>
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              selected ? "bg-ink" : "bg-transparent"
                            }`}
                            aria-hidden
                          />
                        </span>
                        <span className="mt-0.5 block pl-[18px] text-[10px] text-faint">
                          {mode.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Mode Sub-controls */}
                {hasImage && settings.resizeMode === "scale" && (
                  <div className="mt-2.5 rounded-[11px] border border-line bg-white p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11.5px] font-medium text-muted">Scale factor</p>
                        <p className="mt-0.5 text-[10.5px] text-faint">10% to 100% of original</p>
                      </div>
                      <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
                        {settings.scalePercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={settings.scalePercent}
                      onChange={(e) => onPatch({ scalePercent: Number(e.target.value) })}
                      aria-label="Scale percent"
                      style={rangeFill(settings.scalePercent, 10, 100)}
                      className="range mt-2.5"
                    />
                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      {[100, 75, 50, 33, 25, 10].map((val) => {
                        const selected = settings.scalePercent === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => onPatch({ scalePercent: val })}
                            className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                              selected
                                ? "border-ink bg-ink text-white font-semibold"
                                : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                            }`}
                          >
                            {val}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasImage && settings.resizeMode === "maxEdge" && (
                  <div className="mt-2.5 rounded-[11px] border border-line bg-white p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[11.5px] font-medium text-muted">Longest edge limit</span>
                      <span className="font-mono text-[12px] font-bold text-ink">
                        {settings.maxEdgePx} px
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[2048, 1600, 1200, 800, 600, 400].map((px) => {
                        const selected = settings.maxEdgePx === px;
                        return (
                          <button
                            key={px}
                            type="button"
                            onClick={() => onPatch({ maxEdgePx: px })}
                            className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                              selected
                                ? "border-ink bg-ink text-white font-semibold"
                                : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                            }`}
                          >
                            {px} px
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasImage && settings.resizeMode === "custom" && dimensions && (
                  <div className="mt-2.5 rounded-[11px] border border-line bg-white p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11.5px] font-medium text-muted">Exact pixel bounds</span>
                      <button
                        type="button"
                        onClick={() => onPatch({ lockAspect: !settings.lockAspect })}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                          settings.lockAspect
                            ? "bg-[#edf4ea] text-[#305e2b]"
                            : "bg-[#f3f0e9] text-muted hover:text-ink"
                        }`}
                      >
                        {settings.lockAspect ? <Lock size={10} /> : <Unlock size={10} />}
                        <span>{settings.lockAspect ? "Aspect locked" : "Aspect free"}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-faint block mb-1">Width (px)</label>
                        <input
                          type="number"
                          min={16}
                          max={dimensions.width * 2}
                          value={settings.customWidth}
                          onChange={(e) => onCustomWidth?.(Number(e.target.value))}
                          className="h-8 w-full rounded-[7px] border border-line bg-[#faf8f5] px-2 font-mono text-[12px] font-bold text-ink outline-none focus:border-ink"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-faint block mb-1">Height (px)</label>
                        <input
                          type="number"
                          min={16}
                          max={dimensions.height * 2}
                          value={settings.customHeight}
                          onChange={(e) => onCustomHeight?.(Number(e.target.value))}
                          className="h-8 w-full rounded-[7px] border border-line bg-[#faf8f5] px-2 font-mono text-[12px] font-bold text-ink outline-none focus:border-ink"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </RailSection>

              <RailDivider />

              {/* Sharpening Filter */}
              <RailSection
                icon={Wand2}
                title="Post-compression sharpen"
                hint="Recover crispness on aggressive compression"
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {SHARPEN_OPTIONS.map((opt) => {
                    const selected =
                      (settings.sharpenAmount ?? 0) === opt.value ||
                      (opt.value === 0 && !settings.sharpen && (!settings.sharpenAmount || settings.sharpenAmount === 0));
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          onPatch({
                            sharpenAmount: opt.value,
                            sharpen: opt.value > 0,
                          })
                        }
                        className={`h-8 rounded-[8px] border text-[11px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white font-semibold"
                            : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </RailSection>

              <RailDivider />

              {/* Switches */}
              <RailSection
                icon={ShieldCheck}
                title="Safeguards & filters"
                hint="Byte limits and color treatments"
              >
                <div className="space-y-2">
                  <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <SwitchRow
                      label="Keep original if larger"
                      description="Never save a re-encoded image that ends up bigger than source."
                      checked={settings.keepSmaller}
                      onChange={(checked) => onPatch({ keepSmaller: checked })}
                    />
                  </div>

                  <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <SwitchRow
                      label="Grayscale mode"
                      description="Converts to black & white for extreme byte reduction."
                      checked={Boolean(settings.grayscale)}
                      onChange={(checked) => onPatch({ grayscale: checked })}
                    />
                  </div>

                  <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <SwitchRow
                      label="Preserve transparency"
                      description="Retain transparent PNG/WebP alpha channel when supported."
                      checked={settings.preserveAlpha}
                      onChange={(checked) => onPatch({ preserveAlpha: checked })}
                    />
                  </div>
                </div>
              </RailSection>
            </div>
          )}
        </div>

        <RailDivider />

        {/* Live Output Card */}
        <div className="rounded-[14px] border border-[#e6e0d4] bg-[#f8f5ee] p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              Live output
            </span>
            <span className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[10.5px] font-semibold text-ink">
              {result ? result.format.toUpperCase() : activeFormatMeta.label}
            </span>
          </div>

          {result && resultDelta !== null ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                  {formatBytes(result.bytes)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    resultDelta > 0
                      ? "bg-[#eaf4e8] text-[#396336]"
                      : resultDelta < 0
                        ? "bg-[#f5ecec] text-[#8c3b3b]"
                        : "bg-[#f0eee9] text-muted"
                  }`}
                >
                  {resultDelta > 0
                    ? `−${resultDelta}%`
                    : resultDelta < 0
                      ? `+${Math.abs(resultDelta)}%`
                      : "Same size"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted tabular-nums">
                {result.width} × {result.height} px · {result.format.toUpperCase()}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-[#e6e0d4] pt-2.5 text-[10.5px]">
                <span className="text-faint">
                  Original {formatBytes(result.originalBytes)}
                </span>
                <span className="font-semibold text-ink">
                  {resultDelta > 0
                    ? `${formatBytes(result.originalBytes - result.bytes)} saved`
                    : resultDelta < 0
                      ? `${formatBytes(result.bytes - result.originalBytes)} larger`
                      : "No size change"}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Add an image and the compressed size will update here in real time.
            </p>
          )}
        </div>
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
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-line bg-white text-muted shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
            <Icon size={13} strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            {hint ? <p className="mt-0.5 truncate text-[11px] text-faint">{hint}</p> : null}
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RailDivider() {
  return <div aria-hidden className="h-px bg-line-soft" />;
}

function SwitchRow({
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
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium leading-tight text-ink">{label}</p>
        <p className="mt-0.5 text-[10.5px] leading-normal text-faint">{description}</p>
      </div>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-within:ring-2 focus-within:ring-accent">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-[#dfdad0] transition-colors peer-checked:bg-ink" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
