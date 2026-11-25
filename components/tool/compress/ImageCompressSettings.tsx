"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileOutput,
  Frame,
  Image as ImageIcon,
  Lock,
  Minus,
  Percent,
  Plus,
  RotateCcw,
  Scaling,
  Target,
  Unlock,
  Wand2,
} from "lucide-react";
import { Segmented } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
  RAIL_FIELD_LABEL,
  RAIL_FIELD_META,
} from "@/components/tool/studio/RailSection";
import { Switch } from "@/components/arc/switch/switch";
import type {
  CompressGoal,
  CompressSettings,
  OutputFormat,
  ResizeMode,
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


const GOAL_OPTIONS: { value: CompressGoal; label: string; title: string }[] = [
  { value: "target", label: "File size", title: "Stay under an exact KB or MB size" },
  { value: "quality", label: "Quality", title: "Pick a quality level" },
  { value: "percent", label: "Percent", title: "Cut a fixed share off every image" },
];

const UNIT_OPTIONS: { value: TargetUnit; label: string }[] = [
  { value: "KB", label: "KB" },
  { value: "MB", label: "MB" },
];

const TARGET_PRESETS: { value: string; unit: TargetUnit; label: string }[] = [
  { value: "50", unit: "KB", label: "50 KB" },
  { value: "100", unit: "KB", label: "100 KB" },
  { value: "200", unit: "KB", label: "200 KB" },
  { value: "500", unit: "KB", label: "500 KB" },
  { value: "1", unit: "MB", label: "1 MB" },
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

const FORMAT_OPTIONS: { value: OutputFormat; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Picks the smallest format your browser can write, usually WebP, and keeps transparency.",
  },
  {
    value: "webp",
    label: "WebP",
    description:
      "Much smaller than JPG at the same quality, with transparency. Opens in every modern browser.",
  },
  {
    value: "jpg",
    label: "JPG",
    description: "Opens everywhere. Transparent areas are filled with a solid color.",
  },
  {
    value: "png",
    label: "PNG",
    description: "Lossless and keeps transparency, but rarely shrinks photos much.",
  },
  {
    value: "avif",
    label: "AVIF",
    description: "Usually the smallest file. Slower to make, and older apps may not open it.",
  },
];

const RESIZE_MODES: { id: ResizeMode; label: string; icon: LucideIcon }[] = [
  { id: "original", label: "Keep original", icon: ImageIcon },
  { id: "scale", label: "Scale by %", icon: Percent },
  { id: "maxEdge", label: "Fit long edge", icon: Scaling },
  { id: "custom", label: "Exact size", icon: Frame },
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

const PILL_ACTIVE = "border-ink bg-ink text-white";
const PILL_IDLE = "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink";
const STEP_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-line bg-white text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink";

function qualityBand(quality: number) {
  if (quality >= 95) return "Maximum detail";
  if (quality >= 85) return "High quality";
  if (quality >= 70) return "Balanced";
  if (quality >= 50) return "Smaller file";
  return "Smallest file";
}

export function ImageCompressSettings({
  settings,
  dimensions,
  originalBytes,
  hasImage,
  onPatch,
  onCustomWidth,
  onCustomHeight,
  onReset,
  action,
}: {
  settings: CompressSettings;
  dimensions: { width: number; height: number } | null;
  originalBytes: number | null;
  hasImage: boolean;
  onPatch: (patch: Partial<CompressSettings>) => void;
  onCustomWidth?: (width: number) => void;
  onCustomHeight?: (height: number) => void;
  onReset: () => void;
  action?: ReactNode;
}) {
  const activeFormatMeta =
    FORMAT_OPTIONS.find((f) => f.value === settings.format) ?? FORMAT_OPTIONS[0];

  const hasCustomOptions =
    !settings.keepSmaller ||
    settings.sharpenAmount > 0 ||
    settings.sharpen ||
    settings.grayscale ||
    !settings.preserveAlpha;

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

  const goalSummary =
    settings.goal === "target"
      ? `${settings.targetValue} ${settings.targetUnit}`
      : settings.goal === "quality"
        ? `${settings.quality}%`
        : `−${settings.percent}%`;

  const resizeSummary = !hasImage
    ? undefined
    : settings.resizeMode === "scale"
      ? `${settings.scalePercent}%`
      : settings.resizeMode === "maxEdge"
        ? `${settings.maxEdgePx} px`
        : settings.resizeMode === "custom"
          ? `${settings.customWidth} × ${settings.customHeight}`
          : "Original";

  return (
    <StudioRail label="Compression settings" action={action}>
      <div className="space-y-4">
        <RailSection icon={Target} title="Compress by" aside={goalSummary}>
          <Segmented
            label="Compression goal"
            options={GOAL_OPTIONS}
            value={settings.goal}
            onChange={(goal) => onPatch({ goal })}
          />

          {settings.goal === "target" && (
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={RAIL_FIELD_LABEL}>Maximum file size</span>
                {originalBytes && targetEstimatedDelta !== null ? (
                  <span className={RAIL_FIELD_META}>
                    {targetEstimatedDelta > 0
                      ? `about ${targetEstimatedDelta}% smaller`
                      : "already under this size"}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustTarget(settings.targetUnit === "MB" ? -0.5 : -10)}
                  aria-label="Decrease target size"
                  className={STEP_BUTTON}
                >
                  <Minus size={15} aria-hidden />
                </button>
                <input
                  type="number"
                  min={1}
                  max={settings.targetUnit === "MB" ? 100 : 100000}
                  step={settings.targetUnit === "MB" ? 0.1 : 1}
                  value={settings.targetValue}
                  onChange={(event) => onPatch({ targetValue: event.target.value })}
                  aria-label={`Target file size in ${settings.targetUnit}`}
                  className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-2 text-center font-display text-[16px] font-semibold tabular-nums text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
                  placeholder="100"
                />
                <button
                  type="button"
                  onClick={() => adjustTarget(settings.targetUnit === "MB" ? 0.5 : 10)}
                  aria-label="Increase target size"
                  className={STEP_BUTTON}
                >
                  <Plus size={15} aria-hidden />
                </button>
                <Segmented
                  label="Size unit"
                  options={UNIT_OPTIONS}
                  value={settings.targetUnit}
                  onChange={(targetUnit) => onPatch({ targetUnit })}
                  className="w-[100px] shrink-0"
                />
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {TARGET_PRESETS.map((preset) => {
                  const selected =
                    settings.targetValue === preset.value && settings.targetUnit === preset.unit;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ targetValue: preset.value, targetUnit: preset.unit })}
                      className={`h-9 rounded-[9px] border text-[12.5px] font-medium tabular-nums transition-colors ${
                        selected ? PILL_ACTIVE : PILL_IDLE
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-faint">
                Keeps the best quality that fits under this size. If that is still too big, the
                image is scaled down a little.
              </p>
            </div>
          )}

          {settings.goal === "quality" && (
            <div className="mt-4">
              <span className={RAIL_FIELD_LABEL}>{qualityBand(settings.quality)}</span>
              <RailSlider
                label="Quality percent"
                value={settings.quality}
                min={10}
                max={100}
                onValueChange={(quality) => onPatch({ quality })}
                className="mt-2.5"
              />
              <div className="mt-1 flex justify-between text-[12px] text-faint">
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
                      className={`flex h-9 items-center justify-center gap-1.5 rounded-[9px] border text-[12.5px] font-medium transition-colors ${
                        selected ? PILL_ACTIVE : PILL_IDLE
                      }`}
                    >
                      {preset.label}
                      <span className={`tabular-nums ${selected ? "text-white/65" : "text-faint"}`}>
                        {preset.value}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {settings.goal === "percent" && (
            <div className="mt-4">
              <span className={RAIL_FIELD_LABEL}>
                Cut {settings.percent}% off every image
              </span>
              <RailSlider
                label="Percentage reduction"
                value={settings.percent}
                min={10}
                max={95}
                onValueChange={(percent) => onPatch({ percent })}
                className="mt-2.5"
              />
              <div className="mt-1 flex justify-between text-[12px] text-faint">
                <span>Light trim</span>
                <span>Heavy squeeze</span>
              </div>

              <div className="mt-3 grid grid-cols-6 gap-1">
                {PERCENT_PRESETS.map((value) => {
                  const selected = settings.percent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Reduce by ${value} percent`}
                      onClick={() => onPatch({ percent: value })}
                      className={`h-8 rounded-[8px] border text-[12px] font-medium tabular-nums transition-colors ${
                        selected ? PILL_ACTIVE : PILL_IDLE
                      }`}
                    >
                      {value}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </RailSection>

        <RailSection icon={FileOutput} title="Output format" aside={activeFormatMeta.label}>
          <Segmented
            label="Output format"
            options={FORMAT_OPTIONS}
            value={settings.format}
            onChange={(format) => onPatch({ format })}
          />
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
            {activeFormatMeta.description}
          </p>

          {(settings.format === "jpg" || !settings.preserveAlpha) && (
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={RAIL_FIELD_LABEL}>Background color</span>
                <span className={`${RAIL_FIELD_META} font-mono uppercase`}>
                  {settings.backgroundColor}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {BG_COLOR_PRESETS.map((color) => {
                  const selected =
                    settings.backgroundColor.toLowerCase() === color.value.toLowerCase();
                  return (
                    <button
                      key={color.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ backgroundColor: color.value })}
                      className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-2 text-[13px] font-medium text-ink transition-colors ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                        style={{ backgroundColor: color.value }}
                        aria-hidden
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
                  title="Custom color"
                  className="h-10 w-11 shrink-0 cursor-pointer rounded-[10px] border border-line bg-white p-1"
                />
              </div>
            </div>
          )}
        </RailSection>

        <RailSection icon={Scaling} title="Resize" aside={resizeSummary} defaultOpen={false}>
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
                  className={`flex h-10 min-w-0 items-center gap-2 rounded-[10px] border px-2.5 text-left text-[13px] font-medium text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                  }`}
                >
                  <Icon size={14} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{mode.label}</span>
                </button>
              );
            })}
          </div>

          {!hasImage ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-faint">
              Add an image to set its size.
            </p>
          ) : null}

          {hasImage && settings.resizeMode === "scale" && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className={RAIL_FIELD_LABEL}>Scale</span>
                <span className={RAIL_FIELD_META}>{settings.scalePercent}% of original</span>
              </div>
              <RailSlider
                label="Scale percent"
                value={settings.scalePercent}
                min={10}
                max={100}
                onValueChange={(scalePercent) => onPatch({ scalePercent })}
                className="mt-2.5"
              />
              <div className="mt-3 grid grid-cols-6 gap-1">
                {[100, 75, 50, 33, 25, 10].map((value) => {
                  const selected = settings.scalePercent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${value} percent`}
                      onClick={() => onPatch({ scalePercent: value })}
                      className={`h-8 rounded-[8px] border text-[12px] font-medium tabular-nums transition-colors ${
                        selected ? PILL_ACTIVE : PILL_IDLE
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
            <div className="mt-4">
              <span className={RAIL_FIELD_LABEL}>Longest edge</span>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[2048, 1600, 1200, 800, 600, 400].map((px) => {
                  const selected = settings.maxEdgePx === px;
                  return (
                    <button
                      key={px}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ maxEdgePx: px })}
                      className={`h-9 rounded-[9px] border text-[12.5px] font-medium tabular-nums transition-colors ${
                        selected ? PILL_ACTIVE : PILL_IDLE
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
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <DimensionField
                label="Width"
                max={dimensions.width * 2}
                value={settings.customWidth}
                onChange={(value) => onCustomWidth?.(value)}
              />
              <button
                type="button"
                onClick={() => onPatch({ lockAspect: !settings.lockAspect })}
                className={`grid h-10 w-10 place-items-center rounded-[10px] border transition-colors ${
                  settings.lockAspect
                    ? "border-ink bg-card text-ink"
                    : "border-line bg-white text-faint hover:text-ink"
                }`}
                title={settings.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                aria-label={settings.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                aria-pressed={settings.lockAspect}
              >
                {settings.lockAspect ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
              </button>
              <DimensionField
                label="Height"
                max={dimensions.height * 2}
                value={settings.customHeight}
                onChange={(value) => onCustomHeight?.(value)}
              />
            </div>
          )}
        </RailSection>

        <RailSection
          icon={Wand2}
          title="More options"
          aside={hasCustomOptions ? "Customized" : undefined}
          defaultOpen={false}
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className={RAIL_FIELD_LABEL}>Sharpen</span>
            <span className={RAIL_FIELD_META}>Helps after resizing</span>
          </div>
          <Segmented
            label="Sharpen"
            options={SHARPEN_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={String(settings.sharpenAmount ?? 0)}
            onChange={(value) =>
              onPatch({ sharpenAmount: Number(value), sharpen: Number(value) > 0 })
            }
          />

          <div className="mt-4 space-y-3.5">
            <SwitchRow
              label="Keep original if larger"
              description="Never save a result bigger than the file you started with."
              checked={settings.keepSmaller}
              onChange={(checked) => onPatch({ keepSmaller: checked })}
            />
            <SwitchRow
              label="Black and white"
              description="Drops color for a smaller file."
              checked={Boolean(settings.grayscale)}
              onChange={(checked) => onPatch({ grayscale: checked })}
            />
            <SwitchRow
              label="Keep transparency"
              description="Clear areas stay clear in PNG and WebP files."
              checked={settings.preserveAlpha}
              onChange={(checked) => onPatch({ preserveAlpha: checked })}
            />
          </div>
        </RailSection>

        <button
          type="button"
          onClick={onReset}
          className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <RotateCcw size={13} aria-hidden />
          Reset settings
        </button>
      </div>
    </StudioRail>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
        ) : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
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
      <span className="block text-[12.5px] font-medium text-muted">{label}</span>
      <span className="relative mt-1 block">
        <input
          type="number"
          min={16}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-10 w-full rounded-[10px] border border-line bg-white pl-2.5 pr-8 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-faint">
          px
        </span>
      </span>
    </label>
  );
}
