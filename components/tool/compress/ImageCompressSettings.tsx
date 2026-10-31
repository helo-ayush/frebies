"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  FileOutput,
  Frame,
  Gauge,
  Image as ImageIcon,
  Info,
  Lock,
  Minus,
  Percent,
  Plus,
  RotateCcw,
  Scaling,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Unlock,
  Wand2,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
  RAIL_FIELD_LABEL,
} from "@/components/tool/studio/RailSection";
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
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
          Settings
        </span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink"
        >
          <RotateCcw size={11} aria-hidden />
          Reset
        </button>
      </div>

      <div className="space-y-3.5">
        {/* Compression goal */}
        <RailSection
          icon={Target}
          title="Compression goal"
          hint="Target size, quality or percentage"
          aside={
            settings.goal === "target"
              ? `${settings.targetValue} ${settings.targetUnit}`
              : settings.goal === "quality"
                ? `${settings.quality}% quality`
                : `−${settings.percent}%`
          }
        >
          <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-[#f8f6f2] p-1">
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
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-[7px] text-[12.5px] font-medium transition-colors ${
                    selected ? "bg-white text-ink shadow-2xs" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={13} strokeWidth={2} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {settings.goal === "target" && (
            <div className="mt-4 space-y-3.5">
              <div className="rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink">Size ceiling</span>
                  <span className="text-[11px] text-faint">Guaranteed maximum</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustTarget(settings.targetUnit === "MB" ? -0.5 : -10)}
                    aria-label="Decrease target size"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-white text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink"
                  >
                    <Minus size={14} />
                  </button>

                  <div className="relative min-w-0 flex-1">
                    <input
                      type="number"
                      min={1}
                      max={settings.targetUnit === "MB" ? 100 : 100000}
                      step={settings.targetUnit === "MB" ? 0.1 : 1}
                      value={settings.targetValue}
                      onChange={(event) => onPatch({ targetValue: event.target.value })}
                      aria-label="Target file size"
                      className="h-10 w-full rounded-[10px] border border-line bg-white pl-3 pr-11 text-center font-display text-[15px] font-semibold tabular-nums text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-[#b8b2a7]"
                      placeholder="100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-faint">
                      {settings.targetUnit}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => adjustTarget(settings.targetUnit === "MB" ? 0.5 : 10)}
                    aria-label="Increase target size"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-white text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(["KB", "MB"] as TargetUnit[]).map((unit) => {
                    const selected = settings.targetUnit === unit;
                    return (
                      <button
                        key={unit}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ targetUnit: unit })}
                        className={`h-9 rounded-[8px] border text-[11.5px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                        }`}
                      >
                        {unit}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className={RAIL_FIELD_LABEL}>Quick targets</span>
                  {originalBytes && targetEstimatedDelta !== null && (
                    <span className="text-[11px] font-medium text-[#305e2b]">
                      ≈ {targetEstimatedDelta}% smaller
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_PRESET_CHIPS.map((chip) => {
                    const selected =
                      settings.targetValue === chip.value && settings.targetUnit === chip.unit;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ targetValue: chip.value, targetUnit: chip.unit })}
                        className={`flex min-h-[46px] flex-col items-start justify-center rounded-[10px] border px-2.5 py-1.5 transition-colors ${
                          selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                        }`}
                      >
                        <span className="text-[12px] font-semibold tabular-nums text-ink">
                          {chip.label}
                        </span>
                        {chip.badge ? (
                          <span className="text-[10px] leading-tight text-faint">{chip.badge}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="flex items-start gap-2 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <span>
                  A multi-step search finds the highest quality under your ceiling. If even the
                  minimum quality is too large, the image is gently downscaled.
                </span>
              </p>
            </div>
          )}

          {settings.goal === "quality" && (
            <div className="mt-4 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-[12px] font-medium text-ink">Visual quality</span>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${band.dot}`} aria-hidden />
                    {band.label}
                  </p>
                </div>
                <span className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                  {settings.quality}
                  <span className="ml-0.5 text-[14px] font-medium text-muted">%</span>
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={settings.quality}
                onChange={(event) => onPatch({ quality: Number(event.target.value) })}
                aria-label="Quality percent"
                style={rangeFill(settings.quality, 10, 100)}
                className="range mt-3 w-full"
              />
              <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
                <span>Maximum compression</span>
                <span>Near-lossless</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-line-soft pt-3">
                {QUALITY_PRESETS.map((preset) => {
                  const selected = settings.quality === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ quality: preset.value })}
                      className={`flex h-9 items-center justify-center gap-1 rounded-[8px] border text-[11.5px] font-medium transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {preset.label}
                      <span
                        className={`text-[10px] tabular-nums ${
                          selected ? "text-white/60" : "text-faint"
                        }`}
                      >
                        {preset.value}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {settings.goal === "percent" && (
            <div className="mt-4 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-[12px] font-medium text-ink">Fixed reduction</span>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Shave a guaranteed slice off the original
                  </p>
                </div>
                <span className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[#305e2b]">
                  −{settings.percent}%
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={95}
                step={1}
                value={settings.percent}
                onChange={(event) => onPatch({ percent: Number(event.target.value) })}
                aria-label="Percentage reduction"
                style={rangeFill(settings.percent, 10, 95)}
                className="range mt-3 w-full"
              />
              <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
                <span>Light trim</span>
                <span>Aggressive squeeze</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-line-soft pt-3">
                {PERCENT_PRESETS.map((value) => {
                  const selected = settings.percent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ percent: value })}
                      className={`h-9 rounded-[8px] border text-[11.5px] font-semibold tabular-nums transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      −{value}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </RailSection>

        {/* Output format */}
        <RailSection
          icon={FileOutput}
          title="Output format"
          hint="Auto-selection or a specific format"
          aside={activeFormatMeta.label}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map((format) => {
              const selected = settings.format === format.value;
              return (
                <button
                  key={format.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ format: format.value })}
                  className={`flex min-h-[64px] flex-col justify-center gap-0.5 rounded-[10px] border p-2.5 text-left transition-colors ${
                    selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                  }`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-[12.5px] font-semibold text-ink">{format.label}</span>
                    {selected ? (
                      <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-white">
                        <Check size={10} strokeWidth={3} aria-hidden />
                      </span>
                    ) : format.badge ? (
                      <span className="rounded-[4px] bg-[#f0f4ee] px-1.5 py-0.5 text-[9px] font-medium leading-none text-[#32592a]">
                        {format.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[10.5px] leading-tight text-faint">{format.hint}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-line bg-[#fbfaf8] px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-ink">{activeFormatMeta.label}</span>
              <span className="mx-1 text-faint">·</span>
              {activeFormatMeta.description}
            </span>
          </p>

          {(settings.format === "jpg" || !settings.preserveAlpha) && (
            <div className="mt-3 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-ink">Background color</span>
                <span className="font-mono text-[11px] text-faint">{settings.backgroundColor}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                {BG_COLOR_PRESETS.map((color) => {
                  const selected =
                    settings.backgroundColor.toLowerCase() === color.value.toLowerCase();
                  return (
                    <button
                      key={color.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ backgroundColor: color.value })}
                      className={`flex h-8 items-center gap-1.5 rounded-[8px] border px-2 text-[11px] font-medium transition-colors ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-black/15"
                        style={{ backgroundColor: color.value }}
                      />
                      {color.label}
                    </button>
                  );
                })}
                <input
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(event) => onPatch({ backgroundColor: event.target.value })}
                  aria-label="Custom background color"
                  className="h-8 w-9 cursor-pointer rounded-[8px] border border-line bg-white p-0.5"
                />
              </div>
            </div>
          )}
        </RailSection>

        {/* Advanced */}
        <RailSection
          icon={SlidersHorizontal}
          title="Advanced"
          hint="Resolution, sharpening and safeguards"
          defaultOpen={false}
          aside={hasCustomAdvanced ? "Customized" : undefined}
        >
          <div className="space-y-4">
            <div>
              <span className={RAIL_FIELD_LABEL}>Resolution</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
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
                      className={`flex min-h-[56px] flex-col justify-center gap-0.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <Icon size={12} strokeWidth={1.8} className="text-muted" aria-hidden />
                        {mode.label}
                      </span>
                      <span className="pl-[18px] text-[10.5px] leading-tight text-faint">
                        {mode.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {hasImage && settings.resizeMode === "scale" && (
                <div className="mt-2.5 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <span className="text-[12px] font-medium text-ink">Scale factor</span>
                      <p className="mt-0.5 text-[11px] text-faint">10% to 100% of the original</p>
                    </div>
                    <span className="font-display text-[20px] font-semibold leading-none tabular-nums text-ink">
                      {settings.scalePercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={1}
                    value={settings.scalePercent}
                    onChange={(event) => onPatch({ scalePercent: Number(event.target.value) })}
                    aria-label="Scale percent"
                    style={rangeFill(settings.scalePercent, 10, 100)}
                    className="range mt-2.5 w-full"
                  />
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    {[100, 75, 50, 33, 25, 10].map((value) => {
                      const selected = settings.scalePercent === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ scalePercent: value })}
                          className={`h-9 rounded-[8px] border text-[11px] font-medium tabular-nums transition-colors ${
                            selected
                              ? "border-ink bg-ink text-white"
                              : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                          }`}
                        >
                          {value}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasImage && settings.resizeMode === "maxEdge" && (
                <div className="mt-2.5 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-ink">Longest edge</span>
                    <span className="text-[11px] font-semibold tabular-nums text-ink">
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
                          aria-pressed={selected}
                          onClick={() => onPatch({ maxEdgePx: px })}
                          className={`h-9 rounded-[8px] border text-[11px] font-medium tabular-nums transition-colors ${
                            selected
                              ? "border-ink bg-ink text-white"
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
                <div className="mt-2.5 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">Exact pixel bounds</span>
                    <button
                      type="button"
                      onClick={() => onPatch({ lockAspect: !settings.lockAspect })}
                      aria-pressed={settings.lockAspect}
                      className={`inline-flex h-7 items-center gap-1 rounded-[7px] border px-2 text-[10.5px] font-medium transition-colors ${
                        settings.lockAspect
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {settings.lockAspect ? <Lock size={10} /> : <Unlock size={10} />}
                      {settings.lockAspect ? "Locked" : "Free"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-faint">Width (px)</span>
                      <input
                        type="number"
                        min={16}
                        max={dimensions.width * 2}
                        value={settings.customWidth}
                        onChange={(event) => onCustomWidth?.(Number(event.target.value))}
                        className="h-9 w-full rounded-[8px] border border-line bg-white px-2.5 text-[12px] font-semibold tabular-nums text-ink outline-none transition-colors focus:border-[#b8b2a7]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-faint">Height (px)</span>
                      <input
                        type="number"
                        min={16}
                        max={dimensions.height * 2}
                        value={settings.customHeight}
                        onChange={(event) => onCustomHeight?.(Number(event.target.value))}
                        className="h-9 w-full rounded-[8px] border border-line bg-white px-2.5 text-[12px] font-semibold tabular-nums text-ink outline-none transition-colors focus:border-[#b8b2a7]"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-line-soft pt-4">
              <span className={RAIL_FIELD_LABEL}>Sharpening</span>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {SHARPEN_OPTIONS.map((option) => {
                  const selected =
                    (settings.sharpenAmount ?? 0) === option.value ||
                    (option.value === 0 &&
                      !settings.sharpen &&
                      (!settings.sharpenAmount || settings.sharpenAmount === 0));
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        onPatch({ sharpenAmount: option.value, sharpen: option.value > 0 })
                      }
                      className={`h-9 rounded-[8px] border text-[11px] font-medium transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-line-soft pt-4">
              <span className={RAIL_FIELD_LABEL}>Safeguards</span>
              <RailSwitch
                label="Keep original if larger"
                description="Never save a re-encode that ends up bigger than the source."
                checked={settings.keepSmaller}
                onChange={(checked) => onPatch({ keepSmaller: checked })}
              />
              <RailSwitch
                label="Grayscale"
                description="Black and white output for extreme byte reduction."
                checked={Boolean(settings.grayscale)}
                onChange={(checked) => onPatch({ grayscale: checked })}
              />
              <RailSwitch
                label="Preserve transparency"
                description="Keep the alpha channel on PNG and WebP outputs."
                checked={settings.preserveAlpha}
                onChange={(checked) => onPatch({ preserveAlpha: checked })}
              />
            </div>
          </div>
        </RailSection>

        {/* Live output */}
        <div className="rounded-[16px] border border-line bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
              Live output
            </span>
            <span className="rounded-full border border-line bg-[#faf9f6] px-2.5 py-0.5 text-[10.5px] font-medium text-muted">
              {result ? result.format.toUpperCase() : activeFormatMeta.label}
            </span>
          </div>

          {result && resultDelta !== null ? (
            <>
              <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                  {formatBytes(result.bytes)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
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
              <p className="mt-1 text-[11.5px] tabular-nums text-muted">
                {result.width} × {result.height} px · {result.format.toUpperCase()}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-2.5 text-[11px]">
                <span className="text-faint">Original {formatBytes(result.originalBytes)}</span>
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
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
              Add an image and the compressed size will update here in real time.
            </p>
          )}
        </div>
      </div>
    </StudioRail>
  );
}
