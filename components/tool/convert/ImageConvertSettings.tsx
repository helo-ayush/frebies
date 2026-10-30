"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  ArrowRight,
  Check,
  ChevronDown,
  FileOutput,
  Frame,
  Gauge,
  Image as ImageIcon,
  Info,
  Lock,
  Palette,
  Percent,
  RotateCcw,
  Scaling,
  SlidersHorizontal,
  Unlock,
  Wand2,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  FORMAT_INFO,
  FORMAT_LABEL,
  formatBytes,
  type EncodeFormat,
  type FormatCategory,
} from "@/lib/image/encode";

export type ResizeMode = "original" | "scale" | "maxEdge" | "custom";

export type ConvertSettings = {
  format: EncodeFormat;
  quality: number;
  losslessMode: boolean;
  icoSize: number;
  preserveAlpha: boolean;
  backgroundColor: string;
  customColor: string;
  resizeMode: ResizeMode;
  scalePercent: number;
  maxEdgePx: number;
  customWidth: number;
  customHeight: number;
  lockAspect: boolean;
  sharpenAmount: number;
  grayscale: boolean;
};

const QUALITY_PRESETS = [
  { label: "Max", value: 100 },
  { label: "High", value: 90 },
  { label: "Good", value: 80 },
  { label: "Mid", value: 65 },
  { label: "Compact", value: 40 },
  { label: "Low", value: 20 },
];

const BG_COLOR_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
  { label: "Grey", value: "#f4f4f4" },
];

const ICO_SIZES: {
  value: number;
  label: string;
  usage: string;
  badge?: string;
  iconSize: number;
}[] = [
  {
    value: 256,
    label: "256 × 256",
    usage: "Ultra HD Desktop",
    iconSize: 18,
  },
  {
    value: 128,
    label: "128 × 128",
    usage: "Large App Icon",
    iconSize: 15,
  },
  {
    value: 64,
    label: "64 × 64",
    usage: "Hi-DPI Web Icon",
    iconSize: 12,
  },
  {
    value: 48,
    label: "48 × 48",
    usage: "Windows Desktop",
    iconSize: 10,
  },
  {
    value: 32,
    label: "32 × 32",
    usage: "Retina Favicon",
    iconSize: 8,
  },
  {
    value: 16,
    label: "16 × 16",
    usage: "Standard Tab",
    iconSize: 6,
  },
];

const CATEGORY_TABS: { id: "all" | FormatCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "web", label: "Web" },
  { id: "pro", label: "Pro" },
];

const RESIZE_MODES: {
  id: ResizeMode;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { id: "original", label: "Keep original", hint: "Full resolution", icon: ImageIcon },
  { id: "scale", label: "Scale by %", hint: "Shrink proportionally", icon: Percent },
  { id: "maxEdge", label: "Fit long edge", hint: "Cap the longest side", icon: Scaling },
  { id: "custom", label: "Exact size", hint: "Set width × height", icon: Frame },
];

const SHARPEN_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "Mild", value: 0.15 },
  { label: "Crisp", value: 0.3 },
];

function qualityBand(quality: number) {
  if (quality >= 95) return { label: "Maximum detail", dot: "bg-[#6f9c63]" };
  if (quality >= 85) return { label: "High quality", dot: "bg-[#6f9c63]" };
  if (quality >= 70) return { label: "Balanced", dot: "bg-[#c49a4a]" };
  if (quality >= 50) return { label: "Smaller file", dot: "bg-[#c4814a]" };
  return { label: "Aggressive", dot: "bg-[#b35c4a]" };
}

export function ImageConvertSettings({
  settings,
  available,
  category,
  dimensions,
  targetSize,
  longestEdge,
  result,
  hasImage,
  onCategory,
  onPatch,
  onCustomWidth,
  onCustomHeight,
  onReset,
}: {
  settings: ConvertSettings;
  available: EncodeFormat[];
  category: "all" | FormatCategory;
  dimensions: { width: number; height: number } | null;
  targetSize: { width: number; height: number } | null;
  longestEdge: number;
  result: { bytes: number; originalBytes: number; width: number; height: number } | null;
  hasImage: boolean;
  onCategory: (category: "all" | FormatCategory) => void;
  onPatch: (patch: Partial<ConvertSettings>) => void;
  onCustomWidth: (value: number) => void;
  onCustomHeight: (value: number) => void;
  onReset: () => void;
}) {
  const formatInfo = FORMAT_INFO[settings.format];
  const isLossy = formatInfo.lossy && !settings.losslessMode;
  const band = qualityBand(settings.quality);
  const filteredFormats = available.filter((option) =>
    category === "all" ? true : FORMAT_INFO[option].category === category,
  );
  const dimensionsChanged =
    Boolean(dimensions && targetSize) &&
    (targetSize!.width !== dimensions!.width || targetSize!.height !== dimensions!.height);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const hasCustomAdvanced =
    (settings.format !== "ico" && settings.resizeMode !== "original") ||
    (isLossy && settings.quality !== 90) ||
    settings.losslessMode ||
    !settings.preserveAlpha ||
    settings.backgroundColor.toLowerCase() !== "#ffffff" ||
    settings.sharpenAmount > 0 ||
    settings.grayscale;

  const resultDelta = result
    ? Math.round((1 - result.bytes / Math.max(1, result.originalBytes)) * 100)
    : null;

  return (
    <StudioRail label="Conversion settings">
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
        <RailSection
          icon={FileOutput}
          title="Target format"
          hint={`${available.length} formats · fully on-device`}
          aside={
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
              {FORMAT_LABEL[settings.format]}
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-1 rounded-[11px] border border-line bg-[#f3f0e9] p-1">
            {CATEGORY_TABS.map((tab) => {
              const selected = category === tab.id;
              const count = available.filter(
                (option) => tab.id === "all" || FORMAT_INFO[option].category === tab.id,
              ).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onCategory(tab.id)}
                  className={`h-8 rounded-[8px] text-[11.5px] font-medium transition-colors ${
                    selected
                      ? "bg-white text-ink shadow-[0_1px_3px_rgba(15,15,16,0.08)]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-1 text-[9.5px] tabular-nums ${
                      selected ? "text-faint" : "text-faint/80"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {filteredFormats.map((option) => {
              const meta = FORMAT_INFO[option];
              const selected = settings.format === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ format: option })}
                  className={`relative rounded-[11px] border px-2.5 py-2 text-left transition-all duration-150 ${
                    selected
                      ? "border-ink bg-ink text-white shadow-[0_4px_14px_rgba(15,15,16,0.16)]"
                      : "border-line bg-white text-ink hover:border-[#cfc9bd] hover:shadow-[0_2px_8px_rgba(15,15,16,0.05)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-semibold tracking-[-0.01em]">
                      {meta.label}
                    </span>
                    {selected ? (
                      <Check size={12} strokeWidth={2.6} aria-hidden />
                    ) : meta.supportsTransparency ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#7ba36d]"
                        title="Supports transparency"
                      />
                    ) : null}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[10.5px] ${
                      selected ? "text-white/55" : "text-faint"
                    }`}
                  >
                    {meta.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-start gap-2 rounded-[11px] border border-line bg-[#f7f4ed] px-3 py-2 text-[11px] text-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0">
              <span className="font-semibold text-ink">{formatInfo.fullName}</span>
              <span className="ml-1 font-mono text-[10px] text-faint">.{formatInfo.ext}</span>
              <span className="mx-1 text-faint">·</span>
              <span>{formatInfo.description}</span>
            </div>
          </div>

          {settings.format === "ico" && (
            <div className="mt-3.5 rounded-[14px] border border-line bg-[#faf8f5] p-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-line-soft">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-[7px] border border-line bg-white text-ink shadow-2xs">
                    <AppWindow size={13} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-ink leading-tight">Icon resolution</p>
                    <p className="text-[10px] text-faint">Standard square favicon & desktop sizes</p>
                  </div>
                </div>
                <span className="rounded-full border border-ink/15 bg-white px-2.5 py-0.5 font-mono text-[11px] font-bold text-ink shadow-2xs">
                  {settings.icoSize} × {settings.icoSize}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {ICO_SIZES.map((size) => {
                  const selected = settings.icoSize === size.value;
                  return (
                    <button
                      key={size.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ icoSize: size.value })}
                      className={`group relative flex flex-col justify-between rounded-[12px] border p-2.5 text-left transition-all duration-150 ${
                        selected
                          ? "border-ink bg-ink text-white shadow-[0_4px_14px_rgba(15,15,16,0.16)]"
                          : "border-line bg-white text-ink hover:border-[#cfc9bd] hover:bg-[#faf9f6] hover:shadow-[0_2px_8px_rgba(15,15,16,0.05)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid place-items-center rounded-[5px] border transition-colors ${
                              selected
                                ? "border-white/30 bg-white/15 text-white"
                                : "border-line bg-[#f6f4f0] text-muted group-hover:border-[#cfc9bd]"
                            }`}
                            style={{ width: "22px", height: "22px" }}
                            aria-hidden
                          >
                            <span
                              className={`rounded-[2px] ${
                                selected ? "bg-white" : "bg-ink/75"
                              }`}
                              style={{ width: `${size.iconSize}px`, height: `${size.iconSize}px` }}
                            />
                          </span>
                          <span className="text-[12px] font-bold tracking-tight tabular-nums">
                            {size.label}
                          </span>
                        </div>
                        {selected ? (
                          <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-ink shadow-2xs">
                            <Check size={10} strokeWidth={3} aria-hidden />
                          </span>
                        ) : size.badge ? (
                          <span className="rounded-full bg-[#eef5eb] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#305e2b]">
                            {size.badge}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between pl-0.5">
                        <span
                          className={`text-[10px] font-medium truncate ${
                            selected ? "text-white/70" : "text-faint"
                          }`}
                        >
                          {size.usage}
                        </span>
                        <span
                          className={`font-mono text-[9px] ${
                            selected ? "text-white/50" : "text-faint/80"
                          }`}
                        >
                          {size.value}px
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-start gap-1.5 rounded-[9px] border border-line-soft bg-white/80 px-2.5 py-1.5 text-[10.5px] text-muted">
                <Info size={12} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                <span className="leading-tight">
                  Source images are automatically aspect-fitted with transparent padding to keep artwork unwarped.
                </span>
              </div>
            </div>
          )}
        </RailSection>

        <RailDivider />

        {/* Collapsible Advanced Options Toggle */}
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
                    ? "Resize, quality, background & adjustments"
                    : hasCustomAdvanced
                      ? "Custom resolution or quality applied"
                      : "Resize, quality, alpha & color options"}
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
              {/* Resize Section (omitted for ICO since ICO resolution is strictly managed by icon presets) */}
              {settings.format !== "ico" && (
                <>
                  <RailSection
                    icon={Scaling}
                    title="Resize"
                    hint="Downscale only · aspect aware"
                    aside={
                      <span className="rounded-full bg-[#f0ede6] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                        No upscale
                      </span>
                    }
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

                {!hasImage ? (
                  <p className="mt-2.5 text-[10.5px] leading-relaxed text-faint">
                    Add an image to unlock resize controls.
                  </p>
                ) : null}

                {hasImage && settings.resizeMode === "scale" ? (
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
                      onChange={(event) => onPatch({ scalePercent: Number(event.target.value) })}
                      aria-label="Scale percent"
                      style={rangeFill(settings.scalePercent, 10, 100)}
                      className="range mt-2.5"
                    />
                    <div className="mt-1 flex justify-between text-[10.5px] text-faint">
                      <span>10%</span>
                      <span>100%</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      {[100, 75, 50, 33, 25, 10].map((value) => {
                        const selected = settings.scalePercent === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onPatch({ scalePercent: value })}
                            className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                              selected
                                ? "border-ink bg-ink text-white"
                                : "border-line bg-white text-muted hover:border-[#d5d0c5] hover:text-ink"
                            }`}
                          >
                            {value}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {hasImage && settings.resizeMode === "maxEdge" ? (
                  <div className="mt-2.5 rounded-[11px] border border-line bg-white p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11.5px] font-medium text-muted">Longest edge</p>
                        <p className="mt-0.5 text-[10.5px] text-faint">
                          Original is {longestEdge} px
                        </p>
                      </div>
                      <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
                        {Math.min(longestEdge, settings.maxEdgePx)}
                        <span className="ml-0.5 text-[12px] font-medium text-muted">px</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(16, longestEdge)}
                      max={longestEdge}
                      step={Math.max(1, Math.round(longestEdge / 100))}
                      value={Math.min(longestEdge, settings.maxEdgePx)}
                      onChange={(event) => onPatch({ maxEdgePx: Number(event.target.value) })}
                      aria-label="Longest edge in pixels"
                      style={rangeFill(Math.min(longestEdge, settings.maxEdgePx), 16, longestEdge)}
                      className="range mt-2.5"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {[0.75, 0.5, 0.25]
                        .map((fraction) => Math.max(16, Math.round(longestEdge * fraction)))
                        .filter((value, index, list) => list.indexOf(value) === index && value < longestEdge)
                        .map((value) => {
                          const selected = settings.maxEdgePx === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => onPatch({ maxEdgePx: value })}
                              className={`h-7 rounded-[7px] border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                                selected
                                ? "border-ink bg-ink text-white"
                                : "border-line bg-white text-muted hover:border-[#d5d0c5] hover:text-ink"
                              }`}
                            >
                              {value} px
                            </button>
                          );
                        })}
                      <button
                        type="button"
                        aria-pressed={settings.maxEdgePx >= longestEdge}
                        onClick={() => onPatch({ maxEdgePx: longestEdge })}
                        className={`h-7 rounded-[7px] border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                          settings.maxEdgePx >= longestEdge
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#d5d0c5] hover:text-ink"
                        }`}
                      >
                        {longestEdge} px · 100%
                      </button>
                    </div>
                  </div>
                ) : null}

                {hasImage && settings.resizeMode === "custom" ? (
                  <div className="mt-2.5 rounded-[11px] border border-line bg-white p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                      <DimensionField
                        label="Width"
                        max={dimensions?.width ?? 1}
                        value={settings.customWidth || dimensions?.width || 1}
                        onChange={onCustomWidth}
                      />
                      <button
                        type="button"
                        onClick={() => onPatch({ lockAspect: !settings.lockAspect })}
                        className={`mb-0 grid h-10 w-10 place-items-center rounded-[9px] border transition-colors ${
                          settings.lockAspect
                            ? "border-ink bg-rail text-ink"
                            : "border-line bg-white text-faint hover:text-ink"
                        }`}
                        title={settings.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                        aria-label={settings.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                        aria-pressed={settings.lockAspect}
                      >
                        {settings.lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                      <DimensionField
                        label="Height"
                        max={dimensions?.height ?? 1}
                        value={settings.customHeight || dimensions?.height || 1}
                        onChange={onCustomHeight}
                      />
                    </div>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                      Maximum {dimensions?.width ?? 1} × {dimensions?.height ?? 1} px. Larger values
                      are clamped to the original.
                    </p>
                  </div>
                ) : null}

                {dimensions && targetSize ? (
                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[9px] border border-line bg-white px-2.5 py-2">
                    <span className="text-[10.5px] font-medium text-faint">Output size</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-ink">
                      {dimensionsChanged ? (
                        <>
                          <span className="font-normal text-faint line-through">
                            {dimensions.width}×{dimensions.height}
                          </span>
                          <ArrowRight size={10} className="text-faint" aria-hidden />
                          <span>
                            {targetSize.width}×{targetSize.height}
                          </span>
                        </>
                      ) : (
                        <span>
                          {targetSize.width}×{targetSize.height} px
                        </span>
                      )}
                    </span>
                  </div>
                ) : null}
              </RailSection>

              <RailDivider />
            </>
          )}

              {/* Quality & Compression Section */}
              <RailSection
                icon={Gauge}
                title="Quality & compression"
                hint="Balance detail against file size"
                aside={
                  <span className="rounded-full bg-[#f0ede6] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {isLossy ? "Lossy" : "Lossless"}
                  </span>
                }
              >
                {formatInfo.supportsLosslessToggle ? (
                  <div className="mb-3.5 rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <SwitchRow
                      label="Lossless mode"
                      description="Pixel-perfect output with no compression artifacts."
                      checked={settings.losslessMode}
                      onChange={(checked) => onPatch({ losslessMode: checked })}
                    />
                  </div>
                ) : null}

                {isLossy ? (
                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11.5px] font-medium text-muted">Compression quality</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
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
                      onChange={(event) => onPatch({ quality: Number(event.target.value) })}
                      aria-label="Compression quality"
                      aria-valuetext={`${settings.quality} percent quality, ${band.label}`}
                      style={rangeFill(settings.quality, 10, 100)}
                      className="range mt-3"
                    />
                    <div className="mt-1 flex justify-between text-[10.5px] text-faint">
                      <span>Smaller file</span>
                      <span>Best detail</span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5">
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
                                ? "border-ink bg-ink text-white"
                                : "border-line bg-white text-muted hover:border-[#d5d0c5] hover:text-ink"
                            }`}
                          >
                            {preset.label}
                            <span
                              className={`text-[9.5px] tabular-nums ${
                                selected ? "text-white/55" : "text-faint"
                              }`}
                            >
                              {preset.value}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : !formatInfo.lossy ? (
                  <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                      <Check size={13} strokeWidth={2.4} aria-hidden />
                      Lossless encoding
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-faint">
                      Every pixel is preserved exactly. Use resize and background options to
                      control the file size.
                    </p>
                  </div>
                ) : null}
              </RailSection>

              <RailDivider />

              {/* Background & Alpha Section */}
              <RailSection
                icon={Palette}
                title="Background & alpha"
                hint={`Transparency for ${formatInfo.label}`}
              >
                {formatInfo.supportsTransparency ? (
                  <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                    <SwitchRow
                      label="Preserve transparency"
                      description={`Keep the alpha channel in ${formatInfo.label} files.`}
                      checked={settings.preserveAlpha}
                      onChange={(checked) => onPatch({ preserveAlpha: checked })}
                    />
                  </div>
                ) : (
                  <p className="flex items-start gap-2 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                    <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                    {formatInfo.label} has no alpha channel, so transparent areas are filled with a
                    solid colour.
                  </p>
                )}

                {(!settings.preserveAlpha || !formatInfo.supportsTransparency) ? (
                  <div className="mt-3.5 border-t border-line-soft pt-3.5">
                    <p className="text-[11.5px] font-medium text-ink">Fill colour</p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {BG_COLOR_PRESETS.map((preset) => {
                        const selected =
                          settings.backgroundColor.toLowerCase() === preset.value.toLowerCase();
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              onPatch({
                                backgroundColor: preset.value,
                                customColor: preset.value,
                              })
                            }
                            className={`flex h-9 items-center gap-1.5 rounded-[9px] border px-2 text-[11px] font-medium transition-colors ${
                              selected
                                ? "border-ink bg-white text-ink shadow-[0_1px_3px_rgba(15,15,16,0.06)] ring-1 ring-ink/10"
                                : "border-line bg-white text-muted hover:border-[#d5d0c5] hover:text-ink"
                            }`}
                          >
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 shadow-inner"
                              style={{ backgroundColor: preset.value }}
                              aria-hidden
                            />
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <label className="mt-2 flex h-10 cursor-pointer items-center justify-between gap-3 rounded-[9px] border border-line bg-white px-2.5 transition-colors hover:border-[#cfc9bd] focus-within:border-[#c3beb4]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-5 w-5 shrink-0 rounded-[6px] border border-black/10 shadow-inner"
                          style={{ backgroundColor: settings.customColor }}
                          aria-hidden
                        />
                        <span className="text-[11.5px] font-medium text-ink">Custom colour</span>
                      </span>
                      <span className="font-mono text-[10.5px] uppercase text-faint">
                        {settings.customColor}
                      </span>
                      <input
                        type="color"
                        value={settings.customColor}
                        onChange={(event) =>
                          onPatch({
                            customColor: event.target.value,
                            backgroundColor: event.target.value,
                          })
                        }
                        aria-label="Custom background colour"
                        className="sr-only"
                      />
                    </label>
                  </div>
                ) : null}
              </RailSection>

              <RailDivider />

              {/* Adjustments Section */}
              <RailSection
                icon={Wand2}
                title="Adjustments"
                hint="Fine-tune the encoded output"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11.5px] font-medium text-ink">Edge sharpening</p>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      Recover crispness after downscaling.
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-[#f3f0e9] p-1">
                  {SHARPEN_OPTIONS.map((option) => {
                    const selected = settings.sharpenAmount === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ sharpenAmount: option.value })}
                        className={`h-8 rounded-[7px] text-[11px] font-medium transition-colors ${
                          selected
                            ? "bg-white text-ink shadow-[0_1px_3px_rgba(15,15,16,0.08)]"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="my-3.5 h-px bg-line-soft" />

                <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
                  <SwitchRow
                    label="Grayscale"
                    description="Convert to black and white luminance."
                    checked={settings.grayscale}
                    onChange={(checked) => onPatch({ grayscale: checked })}
                  />
                </div>
              </RailSection>
            </div>
          )}
        </div>

        <RailDivider />

        <div className="rounded-[14px] border border-[#e6e0d4] bg-[#f8f5ee] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              Live output
            </span>
            <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10.5px] font-semibold text-ink">
              {FORMAT_LABEL[settings.format]}
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
              <p className="mt-1 text-[11px] text-muted">
                {result.width} × {result.height} px · {formatInfo.fullName}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-[#e6e0d4] pt-2.5 text-[10.5px]">
                <span className="text-faint">
                  Original {formatBytes(result.originalBytes)}
                </span>
                <span className="font-medium text-ink">
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
              Add an image and the encoded size will appear here in real time.
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
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-faint">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-[#ddd9d1] transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

function DimensionField({
  label,
  max,
  value,
  onChange,
}: {
  label: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block truncate text-[10px] font-medium text-muted">
        {label} · max {max}
      </span>
      <span className="relative mt-1 block">
        <input
          type="number"
          min={16}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-10 w-full rounded-[9px] border border-line bg-white pl-2.5 pr-7 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-[#c3beb4]"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">
          px
        </span>
      </span>
    </label>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / Math.max(1, max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
