"use client";

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
  Scaling,
  Unlock,
  Wand2,
} from "lucide-react";
import { Segmented, ToolIcon } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailSlider } from "@/components/tool/studio/RailSlider";
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
} from "@/components/tool/studio/RailControls";
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
  const edgePresets = [
    ...[0.25, 0.5, 0.75]
      .map((fraction) => Math.max(16, Math.round(longestEdge * fraction)))
      .filter((value, index, list) => list.indexOf(value) === index && value < longestEdge),
    longestEdge,
  ];
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
      <RailSection icon={FileOutput} title="Convert to" aside={FORMAT_LABEL[settings.format]}>
        <Segmented label="Format group" options={CATEGORY_TABS} value={category} onChange={onCategory} />

        <RailCards
          className="mt-2.5"
          columns={3}
          label="Output format"
          value={settings.format}
          options={filteredFormats.map((option) => ({
            value: option,
            label: FORMAT_INFO[option].label,
            note: FORMAT_INFO[option].hint,
          }))}
          onChange={(format) => onPatch({ format })}
        />

        <RailHint>
          <span className="font-semibold text-ink">{formatInfo.fullName}</span>
          {` (.${formatInfo.ext}). ${formatInfo.description}`}
        </RailHint>

        {settings.format === "ico" && (
          <div className="mt-4">
            <RailLabel value="Always square">Icon size</RailLabel>
            <RailCards
              columns={3}
              label="Icon size"
              value={settings.icoSize}
              options={ICO_SIZES.map((size) => ({
                value: size.value,
                label: `${size.value} px`,
                note: size.usage,
              }))}
              onChange={(icoSize) => onPatch({ icoSize })}
            />
            <RailHint>Artwork is centered on a transparent square, never stretched.</RailHint>
          </div>
        )}
      </RailSection>

      <RailSection icon={Gauge} title="Quality" aside={isLossy ? `${settings.quality}%` : "Lossless"}>
        {formatInfo.supportsLosslessToggle ? (
          <RailSwitch
            label="Lossless"
            description="Keeps every pixel exactly. The file will be larger."
            checked={settings.losslessMode}
            onChange={(checked) => onPatch({ losslessMode: checked })}
          />
        ) : null}

        {isLossy ? (
          <div className={formatInfo.supportsLosslessToggle ? "mt-4" : ""}>
            <RailLabel value={`${settings.quality}%`}>{qualityBand(settings.quality)}</RailLabel>
            <RailSlider
              label="Quality"
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
        ) : !formatInfo.lossy ? (
          <p className="text-[13px] leading-[1.5] text-muted">
            {formatInfo.label} keeps every pixel exactly, so there is no quality to set. Resize the
            image to make the file smaller.
          </p>
        ) : null}
      </RailSection>

      {/* ICO output is always one of the square icon sizes above. */}
      {settings.format !== "ico" && (
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

          {hasImage && settings.resizeMode === "scale" ? (
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
          ) : null}

          {hasImage && settings.resizeMode === "maxEdge" ? (
            <div className="mt-4">
              <RailLabel value={`${edgeValue} of ${longestEdge} px`}>Longest edge</RailLabel>
              <RailSlider
                label="Longest edge in pixels"
                value={edgeValue}
                min={Math.min(16, longestEdge)}
                max={longestEdge}
                step={Math.max(1, Math.round(longestEdge / 100))}
                onValueChange={(maxEdgePx) => onPatch({ maxEdgePx })}
              />
              <RailPick
                className="mt-3"
                columns={edgePresets.length}
                label="Longest edge presets"
                value={edgeValue}
                options={edgePresets.map((value) => ({
                  value,
                  label: value === longestEdge ? "Full" : `${value} px`,
                  ariaLabel: `${value} pixels`,
                }))}
                onChange={(maxEdgePx) => onPatch({ maxEdgePx })}
              />
            </div>
          ) : null}

          {hasImage && settings.resizeMode === "custom" ? (
            <div className="mt-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                <RailNumber
                  label="Width"
                  min={16}
                  max={dimensions?.width ?? 1}
                  value={settings.customWidth || dimensions?.width || 1}
                  onChange={onCustomWidth}
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
                  max={dimensions?.height ?? 1}
                  value={settings.customHeight || dimensions?.height || 1}
                  onChange={onCustomHeight}
                />
              </div>
              <RailHint>
                Up to {dimensions?.width ?? 1} × {dimensions?.height ?? 1} px. This tool only makes
                images smaller.
              </RailHint>
            </div>
          ) : null}

          {dimensions && targetSize && dimensionsChanged ? (
            <p className="mt-3.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-faint">Output size</span>
              <span className="fb-num font-semibold">
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
          <RailSwitch
            label="Keep transparency"
            description={`Clear areas stay clear in the ${formatInfo.label} file.`}
            checked={settings.preserveAlpha}
            onChange={(checked) => onPatch({ preserveAlpha: checked })}
          />
        ) : (
          <p className="text-[13px] leading-[1.5] text-muted">
            {formatInfo.label} cannot store transparency, so clear areas are filled with this color.
          </p>
        )}

        {needsFill ? (
          <div className="mt-3.5">
            <RailColors
              presets={BG_COLOR_PRESETS}
              value={settings.backgroundColor}
              onChange={(value) => onPatch({ backgroundColor: value, customColor: value })}
            />
          </div>
        ) : null}
      </RailSection>

      <RailSection
        icon={Wand2}
        title="Adjustments"
        aside={adjustments.length > 0 ? adjustments.join(" · ") : undefined}
        defaultOpen={false}
      >
        <RailLabel value="Helps after resizing">Sharpen</RailLabel>
        <Segmented
          label="Sharpen"
          options={SHARPEN_OPTIONS.map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          value={String(settings.sharpenAmount)}
          onChange={(value) => onPatch({ sharpenAmount: Number(value) })}
        />

        <div className="mt-5">
          <RailSwitch
            label="Black and white"
            checked={settings.grayscale}
            onChange={(checked) => onPatch({ grayscale: checked })}
          />
        </div>
      </RailSection>

      <div className="pt-2">
        <RailReset onClick={onReset} />
      </div>
    </StudioRail>
  );
}
