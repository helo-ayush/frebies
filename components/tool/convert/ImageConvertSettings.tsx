"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileOutput,
  Frame,
  Gauge,
  Image as ImageIcon,
  Lock,
  Palette,
  Percent,
  RotateCcw,
  Scaling,
  Unlock,
  Wand2,
} from "lucide-react";
import { Segmented } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
  RAIL_FIELD_LABEL,
  RAIL_FIELD_META,
} from "@/components/tool/studio/RailSection";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { Switch } from "@/components/arc/switch/switch";
import {
  FORMAT_INFO,
  FORMAT_LABEL,
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

const ICO_SIZES = [
  { value: 256, usage: "HD desktop" },
  { value: 128, usage: "App icon" },
  { value: 64, usage: "Hi-DPI web" },
  { value: 48, usage: "Windows" },
  { value: 32, usage: "Retina favicon" },
  { value: 16, usage: "Browser tab" },
];

const CATEGORY_TABS: { value: "all" | FormatCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "web", label: "Web" },
  { value: "pro", label: "Print & pro" },
];

const RESIZE_MODES: { id: ResizeMode; label: string; icon: LucideIcon }[] = [
  { id: "original", label: "Keep original", icon: ImageIcon },
  { id: "scale", label: "Scale by %", icon: Percent },
  { id: "maxEdge", label: "Fit long edge", icon: Scaling },
  { id: "custom", label: "Exact size", icon: Frame },
];

const SHARPEN_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "Mild", value: 0.15 },
  { label: "Crisp", value: 0.3 },
];

const PILL_ACTIVE = "border-ink bg-ink text-white";
const PILL_IDLE = "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink";

function qualityBand(quality: number) {
  if (quality >= 95) return "Maximum detail";
  if (quality >= 85) return "High quality";
  if (quality >= 70) return "Balanced";
  if (quality >= 50) return "Smaller file";
  return "Smallest file";
}

export function ImageConvertSettings({
  settings,
  available,
  category,
  dimensions,
  targetSize,
  longestEdge,
  hasImage,
  onCategory,
  onPatch,
  onCustomWidth,
  onCustomHeight,
  onReset,
  action,
}: {
  settings: ConvertSettings;
  available: EncodeFormat[];
  category: "all" | FormatCategory;
  dimensions: { width: number; height: number } | null;
  targetSize: { width: number; height: number } | null;
  longestEdge: number;
  hasImage: boolean;
  onCategory: (category: "all" | FormatCategory) => void;
  onPatch: (patch: Partial<ConvertSettings>) => void;
  onCustomWidth: (value: number) => void;
  onCustomHeight: (value: number) => void;
  onReset: () => void;
  action?: ReactNode;
}) {
  const formatInfo = FORMAT_INFO[settings.format];
  const isLossy = formatInfo.lossy && !settings.losslessMode;
  const filteredFormats = available.filter((option) =>
    category === "all" ? true : FORMAT_INFO[option].category === category,
  );
  const dimensionsChanged =
    Boolean(dimensions && targetSize) &&
    (targetSize!.width !== dimensions!.width || targetSize!.height !== dimensions!.height);

  const needsFill = !settings.preserveAlpha || !formatInfo.supportsTransparency;
  const fillName =
    BG_COLOR_PRESETS.find(
      (preset) => preset.value.toLowerCase() === settings.backgroundColor.toLowerCase(),
    )?.label ?? settings.backgroundColor.toUpperCase();

  const edgeValue = Math.min(longestEdge, settings.maxEdgePx);
  const resizeSummary = !hasImage
    ? undefined
    : settings.resizeMode === "scale"
      ? `${settings.scalePercent}%`
      : settings.resizeMode === "maxEdge"
        ? `${edgeValue} px`
        : settings.resizeMode === "custom"
          ? `${settings.customWidth} × ${settings.customHeight}`
          : "Original";

  const adjustments = [
    settings.sharpenAmount > 0 ? "Sharpen" : null,
    settings.grayscale ? "B&W" : null,
  ].filter(Boolean);

  return (
    <StudioRail label="Conversion settings" action={action}>
      <div className="space-y-4">
        <RailSection icon={FileOutput} title="Convert to" aside={FORMAT_LABEL[settings.format]}>
          <Segmented
            label="Format group"
            options={CATEGORY_TABS}
            value={category}
            onChange={onCategory}
          />

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {filteredFormats.map((option) => {
              const meta = FORMAT_INFO[option];
              const selected = settings.format === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ format: option })}
                  className={`min-w-0 rounded-[11px] border px-2.5 py-2 text-left transition-colors ${
                    selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                  }`}
                >
                  <span className="block text-[13.5px] font-semibold text-ink">{meta.label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-faint">{meta.hint}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">{formatInfo.fullName}</span>
            {` (.${formatInfo.ext}). ${formatInfo.description}`}
          </p>

          {settings.format === "ico" && (
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={RAIL_FIELD_LABEL}>Icon size</span>
                <span className={RAIL_FIELD_META}>Always square</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {ICO_SIZES.map((size) => {
                  const selected = settings.icoSize === size.value;
                  return (
                    <button
                      key={size.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ icoSize: size.value })}
                      className={`min-w-0 rounded-[11px] border px-2.5 py-2 text-left transition-colors ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span className="block text-[13px] font-semibold tabular-nums text-ink">
                        {size.value} px
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-faint">
                        {size.usage}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-faint">
                Artwork is centred on a transparent square, never stretched.
              </p>
            </div>
          )}
        </RailSection>

        <RailSection
          icon={Gauge}
          title="Quality"
          aside={isLossy ? `${settings.quality}%` : "Lossless"}
        >
          {formatInfo.supportsLosslessToggle ? (
            <SwitchRow
              label="Lossless"
              description="Keeps every pixel exactly. The file will be larger."
              checked={settings.losslessMode}
              onChange={(checked) => onPatch({ losslessMode: checked })}
            />
          ) : null}

          {isLossy ? (
            <div className={formatInfo.supportsLosslessToggle ? "mt-4" : ""}>
              <span className={RAIL_FIELD_LABEL}>{qualityBand(settings.quality)}</span>
              <RailSlider
                label="Quality"
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
          ) : !formatInfo.lossy ? (
            <p className="text-[13px] leading-relaxed text-muted">
              {formatInfo.label} keeps every pixel exactly, so there is no quality to set. Resize
              the image to make the file smaller.
            </p>
          ) : null}
        </RailSection>

        {/* ICO output is always one of the square icon sizes above. */}
        {settings.format !== "ico" && (
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

            {hasImage && settings.resizeMode === "scale" ? (
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
            ) : null}

            {hasImage && settings.resizeMode === "maxEdge" ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={RAIL_FIELD_LABEL}>Longest edge</span>
                  <span className={RAIL_FIELD_META}>
                    {edgeValue} of {longestEdge} px
                  </span>
                </div>
                <RailSlider
                  label="Longest edge in pixels"
                  value={edgeValue}
                  min={Math.min(16, longestEdge)}
                  max={longestEdge}
                  step={Math.max(1, Math.round(longestEdge / 100))}
                  onValueChange={(maxEdgePx) => onPatch({ maxEdgePx })}
                  className="mt-2.5"
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[0.75, 0.5, 0.25]
                    .map((fraction) => Math.max(16, Math.round(longestEdge * fraction)))
                    .filter(
                      (value, index, list) => list.indexOf(value) === index && value < longestEdge,
                    )
                    .map((value) => {
                      const selected = settings.maxEdgePx === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ maxEdgePx: value })}
                          className={`h-8 rounded-[8px] border px-2.5 text-[12px] font-medium tabular-nums transition-colors ${
                            selected ? PILL_ACTIVE : PILL_IDLE
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
                    className={`h-8 rounded-[8px] border px-2.5 text-[12px] font-medium tabular-nums transition-colors ${
                      settings.maxEdgePx >= longestEdge ? PILL_ACTIVE : PILL_IDLE
                    }`}
                  >
                    {longestEdge} px (full)
                  </button>
                </div>
              </div>
            ) : null}

            {hasImage && settings.resizeMode === "custom" ? (
              <div className="mt-4">
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
                    className={`grid h-10 w-10 place-items-center rounded-[10px] border transition-colors ${
                      settings.lockAspect
                        ? "border-ink bg-card text-ink"
                        : "border-line bg-white text-faint hover:text-ink"
                    }`}
                    title={settings.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    aria-label={settings.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                    aria-pressed={settings.lockAspect}
                  >
                    {settings.lockAspect ? (
                      <Lock size={14} aria-hidden />
                    ) : (
                      <Unlock size={14} aria-hidden />
                    )}
                  </button>
                  <DimensionField
                    label="Height"
                    max={dimensions?.height ?? 1}
                    value={settings.customHeight || dimensions?.height || 1}
                    onChange={onCustomHeight}
                  />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-faint">
                  Up to {dimensions?.width ?? 1} × {dimensions?.height ?? 1} px. This tool only
                  makes images smaller.
                </p>
              </div>
            ) : null}

            {dimensions && targetSize && dimensionsChanged ? (
              <p className="mt-3.5 flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-faint">Output size</span>
                <span className="font-semibold tabular-nums text-ink">
                  <span className="font-normal text-faint line-through">
                    {dimensions.width} × {dimensions.height}
                  </span>{" "}
                  → {targetSize.width} × {targetSize.height} px
                </span>
              </p>
            ) : null}
          </RailSection>
        )}

        <RailSection
          icon={Palette}
          title="Background"
          aside={needsFill ? fillName : "Transparent"}
          defaultOpen={false}
        >
          {formatInfo.supportsTransparency ? (
            <SwitchRow
              label="Keep transparency"
              description={`Clear areas stay clear in the ${formatInfo.label} file.`}
              checked={settings.preserveAlpha}
              onChange={(checked) => onPatch({ preserveAlpha: checked })}
            />
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              {formatInfo.label} cannot store transparency, so clear areas are filled with this
              colour.
            </p>
          )}

          {needsFill ? (
            <div className="mt-3.5">
              <div className="grid grid-cols-3 gap-1.5">
                {BG_COLOR_PRESETS.map((preset) => {
                  const selected =
                    settings.backgroundColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        onPatch({ backgroundColor: preset.value, customColor: preset.value })
                      }
                      className={`flex h-10 items-center gap-2 rounded-[10px] border px-2.5 text-[13px] font-medium text-ink transition-colors ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                        style={{ backgroundColor: preset.value }}
                        aria-hidden
                      />
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <label className="mt-1.5 flex h-10 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-2.5 transition-colors focus-within:border-ink hover:border-[#cfc9bd]">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: settings.customColor }}
                    aria-hidden
                  />
                  <span className="text-[13px] font-medium text-ink">Custom colour</span>
                </span>
                <span className="font-mono text-[12px] uppercase text-faint">
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

        <RailSection
          icon={Wand2}
          title="Adjustments"
          aside={adjustments.length > 0 ? adjustments.join(" · ") : undefined}
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
            value={String(settings.sharpenAmount)}
            onChange={(value) => onPatch({ sharpenAmount: Number(value) })}
          />

          <div className="mt-4">
            <SwitchRow
              label="Black and white"
              checked={settings.grayscale}
              onChange={(checked) => onPatch({ grayscale: checked })}
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
