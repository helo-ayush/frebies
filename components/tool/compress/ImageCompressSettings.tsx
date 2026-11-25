"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileOutput,
  Frame,
  Image as ImageIcon,
  Lock,
  Percent,
  Scaling,
  Target,
  Unlock,
  Wand2,
} from "lucide-react";
import { Segmented, ToolIcon } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import {
  RailCards,
  RailColors,
  RailEnds,
  RailHint,
  RailLabel,
  RailNumber,
  RailPick,
  RailReset,
  RailStepper,
} from "@/components/tool/studio/RailControls";
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
      <RailSection icon={Target} title="Compress by" aside={goalSummary}>
        <Segmented
          label="Compression goal"
          options={GOAL_OPTIONS}
          value={settings.goal}
          onChange={(goal) => onPatch({ goal })}
        />

        {settings.goal === "target" && (
          <div className="mt-4">
            <RailLabel
              value={
                originalBytes && targetEstimatedDelta !== null
                  ? targetEstimatedDelta > 0
                    ? `about ${targetEstimatedDelta}% smaller`
                    : "already under this size"
                  : undefined
              }
            >
              Maximum file size
            </RailLabel>

            <RailStepper
              label={`Target file size in ${settings.targetUnit}`}
              min={1}
              max={settings.targetUnit === "MB" ? 100 : 100000}
              step={settings.targetUnit === "MB" ? 0.1 : 1}
              value={settings.targetValue}
              placeholder="100"
              onChange={(targetValue) => onPatch({ targetValue })}
              onStep={(direction) => adjustTarget(direction * (settings.targetUnit === "MB" ? 0.5 : 10))}
            >
              <Segmented
                label="Size unit"
                options={UNIT_OPTIONS}
                value={settings.targetUnit}
                onChange={(targetUnit) => onPatch({ targetUnit })}
                className="w-[104px] [&>button]:h-[46px]"
              />
            </RailStepper>

            <RailPick
              className="mt-2.5"
              label="Common sizes"
              value={`${settings.targetValue}${settings.targetUnit}`}
              options={TARGET_PRESETS.map((preset) => ({
                value: `${preset.value}${preset.unit}`,
                label: preset.label,
              }))}
              onChange={(key) => {
                const preset = TARGET_PRESETS.find((item) => `${item.value}${item.unit}` === key);
                if (preset) onPatch({ targetValue: preset.value, targetUnit: preset.unit });
              }}
            />

            <RailHint>
              Keeps the best quality that fits under this size. If that is still too big, the image is
              scaled down a little.
            </RailHint>
          </div>
        )}

        {settings.goal === "quality" && (
          <div className="mt-4">
            <RailLabel value={`${settings.quality}%`}>{qualityBand(settings.quality)}</RailLabel>
            <RailSlider
              label="Quality percent"
              value={settings.quality}
              min={10}
              max={100}
              onValueChange={(quality) => onPatch({ quality })}
            />
            <RailEnds left="Smaller file" right="Best detail" />
            <RailPick
              className="mt-3"
              label="Quality presets"
              value={settings.quality}
              options={QUALITY_PRESETS.map((preset) => ({
                value: preset.value,
                label: preset.label,
                note: `${preset.value}%`,
              }))}
              onChange={(quality) => onPatch({ quality })}
            />
          </div>
        )}

        {settings.goal === "percent" && (
          <div className="mt-4">
            <RailLabel value={`${settings.percent}%`}>Cut off every image</RailLabel>
            <RailSlider
              label="Percentage reduction"
              value={settings.percent}
              min={10}
              max={95}
              onValueChange={(percent) => onPatch({ percent })}
            />
            <RailEnds left="Light trim" right="Heavy squeeze" />
            <RailPick
              className="mt-3"
              columns={6}
              label="Reduction presets"
              value={settings.percent}
              options={PERCENT_PRESETS.map((value) => ({
                value,
                label: `${value}%`,
                ariaLabel: `Reduce by ${value} percent`,
              }))}
              onChange={(percent) => onPatch({ percent })}
            />
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
        <RailHint>{activeFormatMeta.description}</RailHint>

        {(settings.format === "jpg" || !settings.preserveAlpha) && (
          <div className="mt-4">
            <RailLabel value={<span className="uppercase">{settings.backgroundColor}</span>}>Background color</RailLabel>
            <RailColors
              presets={BG_COLOR_PRESETS}
              value={settings.backgroundColor}
              onChange={(backgroundColor) => onPatch({ backgroundColor })}
            />
          </div>
        )}
      </RailSection>

      <RailSection icon={Scaling} title="Resize" aside={resizeSummary} defaultOpen={false}>
        <RailCards
          label="Resize mode"
          value={settings.resizeMode}
          disabled={!hasImage}
          options={RESIZE_MODES.map(({ id, label, icon: Icon }) => ({
            value: id,
            label,
            icon: <Icon size={15} strokeWidth={1.8} aria-hidden />,
          }))}
          onChange={(resizeMode) => onPatch({ resizeMode })}
        />

        {!hasImage ? <RailHint>Add an image to set its size.</RailHint> : null}

        {hasImage && settings.resizeMode === "scale" && (
          <div className="mt-4">
            <RailLabel value={`${settings.scalePercent}% of original`}>Scale</RailLabel>
            <RailSlider
              label="Scale percent"
              value={settings.scalePercent}
              min={10}
              max={100}
              onValueChange={(scalePercent) => onPatch({ scalePercent })}
            />
            <RailPick
              className="mt-3"
              columns={6}
              label="Scale presets"
              value={settings.scalePercent}
              options={[100, 75, 50, 33, 25, 10].map((value) => ({
                value,
                label: `${value}%`,
                ariaLabel: `${value} percent`,
              }))}
              onChange={(scalePercent) => onPatch({ scalePercent })}
            />
          </div>
        )}

        {hasImage && settings.resizeMode === "maxEdge" && (
          <div className="mt-4">
            <RailLabel>Longest edge</RailLabel>
            <RailPick
              label="Longest edge"
              value={settings.maxEdgePx}
              options={[2048, 1600, 1200, 800, 600, 400].map((value) => ({ value, label: `${value} px` }))}
              onChange={(maxEdgePx) => onPatch({ maxEdgePx })}
            />
          </div>
        )}

        {hasImage && settings.resizeMode === "custom" && dimensions && (
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <RailNumber
              label="Width"
              min={16}
              max={dimensions.width * 2}
              value={settings.customWidth}
              onChange={(value) => onCustomWidth?.(value)}
            />
            <ToolIcon
              label={settings.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              active={settings.lockAspect}
              onClick={() => onPatch({ lockAspect: !settings.lockAspect })}
              className="!h-11 !w-11"
            >
              {settings.lockAspect ? <Lock size={15} aria-hidden /> : <Unlock size={15} aria-hidden />}
            </ToolIcon>
            <RailNumber
              label="Height"
              min={16}
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
        <RailLabel value="Helps after resizing">Sharpen</RailLabel>
        <Segmented
          label="Sharpen"
          options={SHARPEN_OPTIONS.map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          value={String(settings.sharpenAmount ?? 0)}
          onChange={(value) => onPatch({ sharpenAmount: Number(value), sharpen: Number(value) > 0 })}
        />

        <div className="mt-5 space-y-4">
          <RailSwitch
            label="Keep original if larger"
            description="Never save a result bigger than the file you started with."
            checked={settings.keepSmaller}
            onChange={(checked) => onPatch({ keepSmaller: checked })}
          />
          <RailSwitch
            label="Black and white"
            description="Drops color for a smaller file."
            checked={Boolean(settings.grayscale)}
            onChange={(checked) => onPatch({ grayscale: checked })}
          />
          <RailSwitch
            label="Keep transparency"
            description="Clear areas stay clear in PNG and WebP files."
            checked={settings.preserveAlpha}
            onChange={(checked) => onPatch({ preserveAlpha: checked })}
          />
        </div>
      </RailSection>

      <div className="pt-2">
        <RailReset onClick={onReset} />
      </div>
    </StudioRail>
  );
}
