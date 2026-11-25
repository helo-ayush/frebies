"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  FlipHorizontal2,
  FlipVertical2,
  Link2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Unlink2,
} from "lucide-react";
import { Switch } from "@/components/arc/switch/switch";
import { Field, Note, Segmented } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
} from "@/components/tool/studio/RailSection";
import {
  CROP_RATIOS,
  RESIZE_FORMATS,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  type Background,
  type CropRatioId,
  type FitMode,
  type ResizeMode,
  type ResizeSettings,
} from "./model";

export type { ResizeSettings };

const MODE_OPTIONS: { value: ResizeMode; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "dimensions", label: "Exact size" },
  { value: "percent", label: "Percent" },
];

const FIT_OPTIONS: { value: FitMode; label: string; hint: string }[] = [
  {
    value: "fill",
    label: "Crop to fill",
    hint: "Fills the new size and trims whatever does not fit.",
  },
  {
    value: "fit",
    label: "Pad",
    hint: "Keeps the whole image and pads the empty space with a color.",
  },
  {
    value: "stretch",
    label: "Stretch",
    hint: "Forces the new size. The image will look squashed if the shape differs.",
  },
];

const POPULAR_PRESETS = [
  { label: "Full HD", detail: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2K QHD", detail: "2560 × 1440", width: 2560, height: 1440 },
  { label: "Social OG", detail: "1200 × 630", width: 1200, height: 630 },
  { label: "Square post", detail: "1080 × 1080", width: 1080, height: 1080 },
  { label: "Portrait", detail: "1080 × 1350", width: 1080, height: 1350 },
  { label: "Story / Reel", detail: "1080 × 1920", width: 1080, height: 1920 },
  { label: "Web banner", detail: "800 × 600", width: 800, height: 600 },
];

const PERCENT_CHIPS = [25, 50, 75, 100, 125, 150, 200];

const QUALITY_PRESETS = [
  { label: "Max", value: 100 },
  { label: "High", value: 90 },
  { label: "Good", value: 80 },
  { label: "Mid", value: 65 },
  { label: "Small", value: 40 },
];

const BG_PRESETS: { id: Background; label: string; swatch: string }[] = [
  { id: "transparent", label: "Transparent", swatch: "checkerboard border border-line" },
  { id: "white", label: "White", swatch: "border border-[#d8d5cf] bg-white" },
  { id: "black", label: "Black", swatch: "border border-ink bg-ink" },
  { id: "custom", label: "Custom", swatch: "border border-line bg-[#f0eee6]" },
];

const SUB_LABEL = "block text-[13px] font-medium text-ink";
const CHIP_ON = "border-ink bg-ink text-white";
const CHIP_OFF = "border-line bg-white text-ink hover:border-[#cfc9bd]";
const SIZE_INPUT =
  "h-11 w-full rounded-[10px] border border-line bg-white pl-3 pr-9 text-[14px] font-semibold tabular-nums text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-ink";
const TILE =
  "flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border text-[12.5px] font-medium transition-colors";

function AspectRatioMiniature({ id, active }: { id: CropRatioId; active: boolean }) {
  const stroke = active ? "stroke-ink" : "stroke-muted";
  const fill = active ? "fill-ink/10" : "fill-transparent";

  switch (id) {
    case "free":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="2" width="16" height="16" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.25" strokeDasharray="2.5 2" />
        </svg>
      );
    case "1:1":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="3" y="3" width="14" height="14" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "4:5":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="4" y="2" width="12" height="16" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "16:9":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="1" y="5" width="18" height="10" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "3:2":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="4" width="16" height="12" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    case "9:16":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="5" y="1" width="10" height="18" rx="2" className={`${stroke} ${fill}`} strokeWidth="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

/** Flat switch row: a label, an optional line of help, and the switch. */
function ToggleRow({
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
  return (
    <div className="flex items-start justify-between gap-3">
      <button type="button" onClick={() => onChange(!checked)} className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
        ) : null}
      </button>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5 shrink-0" />
    </div>
  );
}

export function ImageResizeSettings({
  settings,
  onPatch,
  onReset,
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  upscaling,
  capped,
  cropWidth,
  cropHeight,
  action,
}: {
  settings: ResizeSettings;
  onPatch: (patch: Partial<ResizeSettings>) => void;
  onReset: () => void;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  upscaling: boolean;
  capped: boolean;
  cropWidth: number;
  cropHeight: number;
  action?: ReactNode;
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
  const activeFit = FIT_OPTIONS.find((option) => option.value === settings.fit) ?? FIT_OPTIONS[0];
  const activeFormat = RESIZE_FORMATS.find((format) => format.value === settings.format);

  return (
    <StudioRail label="Resize & crop settings" action={action}>
      <div className="space-y-6">
        <Field
          label="Mode"
          hint={
            <button
              type="button"
              onClick={onReset}
              title="Reset the crop, size, rotation and output settings"
              className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden />
              Reset
            </button>
          }
        >
          <Segmented
            label="Resize mode"
            options={MODE_OPTIONS}
            value={settings.mode}
            onChange={(mode) => onPatch({ mode })}
          />
        </Field>

        {settings.mode === "crop" && (
          <Field
            label="Aspect ratio"
            hint={cropWidth && cropHeight ? `${cropWidth} × ${cropHeight} px` : undefined}
          >
            <div className="grid grid-cols-3 gap-2">
              {CROP_RATIOS.map((ratio) => {
                const selected = settings.cropRatio === ratio.id;
                return (
                  <button
                    key={ratio.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ cropRatio: ratio.id })}
                    className={`flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-[12px] border px-1 text-center transition-colors ${
                      selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                    }`}
                  >
                    <AspectRatioMiniature id={ratio.id} active={selected} />
                    <span className="text-[13px] font-medium leading-none text-ink">{ratio.label}</span>
                    <span className="text-[12px] leading-none text-faint">{ratio.hint}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {settings.mode === "dimensions" && (
          <>
            <Field
              label="Size"
              hint={`${ratioLabel(outputWidth, outputHeight)}${settings.linked ? " · ratio locked" : ""}`}
            >
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-muted">Width</span>
                  <span className="relative mt-1.5 block">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.width}
                      onChange={(event) => changeWidth(event.target.value)}
                      placeholder="1920"
                      className={SIZE_INPUT}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">
                      px
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => onPatch({ linked: !settings.linked })}
                  aria-pressed={settings.linked}
                  aria-label="Lock aspect ratio"
                  title={settings.linked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border transition-colors ${
                    settings.linked
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-faint hover:border-[#cfc9bd] hover:text-ink"
                  }`}
                >
                  {settings.linked ? <Link2 size={16} aria-hidden /> : <Unlink2 size={16} aria-hidden />}
                </button>

                <label className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-muted">Height</span>
                  <span className="relative mt-1.5 block">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.height}
                      onChange={(event) => changeHeight(event.target.value)}
                      placeholder="1080"
                      className={SIZE_INPUT}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">
                      px
                    </span>
                  </span>
                </label>
              </div>
            </Field>

            <Field
              label="Presets"
              hint={
                <button
                  type="button"
                  onClick={() => setShowAllPresets(!showAllPresets)}
                  aria-expanded={showAllPresets}
                  className="rounded-md text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                >
                  {showAllPresets ? "Show fewer" : "Show all"}
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2">
                {(showAllPresets ? POPULAR_PRESETS : POPULAR_PRESETS.slice(0, 4)).map((preset) => {
                  const isCurrent =
                    settings.width === String(preset.width) && settings.height === String(preset.height);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={isCurrent}
                      onClick={() => applyPreset(preset.width, preset.height)}
                      className={`flex h-[54px] flex-col items-start justify-center rounded-[11px] border px-3 text-left transition-colors ${
                        isCurrent ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span className="text-[13px] font-medium text-ink">{preset.label}</span>
                      <span className="mt-0.5 text-[12px] tabular-nums text-faint">{preset.detail}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="If the shape changes">
              <Segmented
                label="Fit behavior"
                options={FIT_OPTIONS}
                value={settings.fit}
                onChange={(fit) => onPatch({ fit })}
              />
              <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{activeFit.hint}</p>

              {settings.fit === "fit" && (
                <div className="mt-3">
                  <span className="block text-[12.5px] text-muted">Padding color</span>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {BG_PRESETS.map((bg) => {
                      const selected = settings.background === bg.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ background: bg.id })}
                          className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border text-[12px] font-medium text-ink transition-colors ${
                            selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                          }`}
                        >
                          <span className={`h-[18px] w-[18px] shrink-0 rounded-full ${bg.swatch}`} aria-hidden />
                          {bg.label}
                        </button>
                      );
                    })}
                  </div>
                  {settings.background === "custom" && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        aria-label="Custom padding color"
                        className="h-10 w-11 cursor-pointer rounded-[10px] border border-line bg-white p-0.5"
                      />
                      <input
                        type="text"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        placeholder="#ffffff"
                        aria-label="Custom padding color as hex"
                        className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 font-mono text-[13px] uppercase text-ink outline-none transition-colors focus:border-ink"
                      />
                    </div>
                  )}
                </div>
              )}
            </Field>
          </>
        )}

        {settings.mode === "percent" && (
          <Field
            label="Scale"
            hint={<span className="text-[13px] font-semibold text-ink">{settings.percent}%</span>}
          >
            <RailSlider
              label="Scale percent"
              value={settings.percent}
              min={10}
              max={200}
              step={5}
              onValueChange={(percent) => onPatch({ percent })}
              className=""
            />
            <div className="mt-3 grid grid-cols-7 gap-1">
              {PERCENT_CHIPS.map((pct) => {
                const selected = settings.percent === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ percent: pct })}
                    className={`h-9 rounded-[9px] border text-[12px] font-medium tabular-nums transition-colors ${
                      selected ? CHIP_ON : CHIP_OFF
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {settings.mode !== "crop" && (
          <div className="space-y-3">
            <ToggleRow
              label="Never upscale"
              description="Stops at the original size, so the result never gets blurry."
              checked={settings.neverUpscale}
              onChange={(checked) => onPatch({ neverUpscale: checked })}
            />
            {capped && (
              <Note>
                Held at {outputWidth} × {outputHeight} px, the largest size the original allows. Turn off
                “Never upscale” to go bigger.
              </Note>
            )}
            {upscaling && (
              <Note tone="warn">This is larger than the original, so it will look softer.</Note>
            )}
          </div>
        )}

        <div className="space-y-4 border-t border-line-soft pt-4">
          <RailSection
            icon={RotateCw}
            title="Rotate & flip"
            defaultOpen={false}
            aside={
              hasTransforms
                ? `${settings.rotation}°${settings.flipX ? " · H" : ""}${settings.flipY ? " · V" : ""}`
                : undefined
            }
          >
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => rotate(-90)}
                aria-label="Rotate 90° counter-clockwise"
                title="Rotate 90° counter-clockwise"
                className={`${TILE} border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink`}
              >
                <RotateCcw size={16} aria-hidden />
                <span>−90°</span>
              </button>
              <button
                type="button"
                onClick={() => rotate(90)}
                aria-label="Rotate 90° clockwise"
                title="Rotate 90° clockwise"
                className={`${TILE} border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink`}
              >
                <RotateCw size={16} aria-hidden />
                <span>+90°</span>
              </button>
              <button
                type="button"
                onClick={() => onPatch({ flipX: !settings.flipX })}
                aria-pressed={settings.flipX}
                aria-label="Flip horizontally"
                title="Flip horizontally"
                className={`${TILE} ${
                  settings.flipX ? CHIP_ON : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                }`}
              >
                <FlipHorizontal2 size={16} aria-hidden />
                <span>Flip H</span>
              </button>
              <button
                type="button"
                onClick={() => onPatch({ flipY: !settings.flipY })}
                aria-pressed={settings.flipY}
                aria-label="Flip vertically"
                title="Flip vertically"
                className={`${TILE} ${
                  settings.flipY ? CHIP_ON : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                }`}
              >
                <FlipVertical2 size={16} aria-hidden />
                <span>Flip V</span>
              </button>
            </div>
          </RailSection>

          <RailSection
            icon={SlidersHorizontal}
            title="Format & quality"
            defaultOpen={false}
            aside={`${formatLabel(settings.format)}${lossy ? ` · ${settings.quality}%` : " · Lossless"}`}
          >
            <div className="space-y-5">
              <div>
                <span className={SUB_LABEL}>Format</span>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {RESIZE_FORMATS.map((fmt) => {
                    const selected = settings.format === fmt.value;
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        aria-pressed={selected}
                        title={fmt.hint}
                        onClick={() => onPatch({ format: fmt.value })}
                        className={`h-9 rounded-[9px] border text-[12.5px] font-medium transition-colors ${
                          selected ? CHIP_ON : CHIP_OFF
                        }`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
                {activeFormat ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{activeFormat.hint}</p>
                ) : null}
              </div>

              {lossy && (
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={SUB_LABEL}>Quality</span>
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {settings.quality}%
                    </span>
                  </div>
                  <RailSlider
                    label="Output quality"
                    value={settings.quality}
                    min={10}
                    max={100}
                    step={2}
                    onValueChange={(quality) => onPatch({ quality })}
                    className="mt-2"
                  />
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {QUALITY_PRESETS.map((preset) => {
                      const selected = settings.quality === preset.value;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ quality: preset.value })}
                          className={`h-9 rounded-[9px] border text-[12.5px] font-medium transition-colors ${
                            selected ? CHIP_ON : CHIP_OFF
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3.5">
                <ToggleRow
                  label="Sharpen"
                  description="Brings back edge detail that shrinking softens."
                  checked={settings.sharpen}
                  onChange={(checked) => onPatch({ sharpen: checked })}
                />
                <ToggleRow
                  label="Grayscale"
                  checked={Boolean(settings.grayscale)}
                  onChange={(checked) => onPatch({ grayscale: checked })}
                />
                <ToggleRow
                  label="Strip metadata"
                  description="Removes camera model, GPS and timestamps."
                  checked={settings.removeMetadata}
                  onChange={(checked) => onPatch({ removeMetadata: checked })}
                />
              </div>
            </div>
          </RailSection>
        </div>
      </div>
    </StudioRail>
  );
}
