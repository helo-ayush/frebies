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
import { Field, Note, Segmented, ToolIcon } from "@/components/tool/kit";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import { RailCards, RailHint, RailLabel, RailPick, RailReset } from "@/components/tool/studio/RailControls";
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
  { id: "transparent", label: "None", swatch: "fb-checker !bg-[length:9px_9px]" },
  { id: "white", label: "White", swatch: "bg-white" },
  { id: "black", label: "Black", swatch: "bg-black" },
  { id: "custom", label: "Custom", swatch: "bg-[conic-gradient(#f2552c,#f5c542,#3aa76d,#3a7bd5,#8a4fd3,#f2552c)]" },
];

const SIZE_INPUT = "fb-wide h-12 w-full pl-3 pr-9 !text-[18px] tabular-nums";

const RATIO_BOXES: Record<CropRatioId, [number, number]> = {
  free: [16, 16],
  "1:1": [15, 15],
  "4:5": [13, 16],
  "16:9": [19, 11],
  "3:2": [18, 12],
  "9:16": [10, 18],
};

/** The crop's own shape, drawn in the cell's colour. */
function RatioShape({ id }: { id: CropRatioId }) {
  const [w, h] = RATIO_BOXES[id];
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x={(22 - w) / 2} y={(22 - h) / 2} width={w} height={h} strokeDasharray={id === "free" ? "3 2.4" : undefined} />
    </svg>
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
      <div className="space-y-7 pb-7">
        <Field label="Mode">
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
            <RailCards
              label="Aspect ratio"
              columns={3}
              value={settings.cropRatio}
              options={CROP_RATIOS.map((ratio) => ({
                value: ratio.id,
                label: ratio.label,
                note: ratio.hint,
                icon: <RatioShape id={ratio.id} />,
              }))}
              onChange={(cropRatio) => onPatch({ cropRatio })}
            />
            <RailHint>Drag the corners to resize, or inside the box to move it.</RailHint>
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
                  <span className="block text-[13px] text-muted">Width</span>
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

                <ToolIcon
                  label="Lock aspect ratio"
                  active={settings.linked}
                  onClick={() => onPatch({ linked: !settings.linked })}
                  className="!h-12 !w-12"
                >
                  {settings.linked ? <Link2 size={17} aria-hidden /> : <Unlink2 size={17} aria-hidden />}
                </ToolIcon>

                <label className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted">Height</span>
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
                  className="text-[13px] font-medium uppercase text-muted transition-colors hover:text-accent-deep"
                >
                  {showAllPresets ? "Show fewer" : "Show all"}
                </button>
              }
            >
              <RailCards
                label="Size presets"
                value={`${settings.width}x${settings.height}`}
                options={(showAllPresets ? POPULAR_PRESETS : POPULAR_PRESETS.slice(0, 4)).map((preset) => ({
                  value: `${preset.width}x${preset.height}`,
                  label: preset.label,
                  note: preset.detail,
                }))}
                onChange={(key) => {
                  const [width, height] = key.split("x").map(Number);
                  applyPreset(width, height);
                }}
              />
            </Field>

            <Field label="If the shape changes">
              <Segmented
                label="Fit behavior"
                options={FIT_OPTIONS}
                value={settings.fit}
                onChange={(fit) => onPatch({ fit })}
              />
              <RailHint>{activeFit.hint}</RailHint>

              {settings.fit === "fit" && (
                <div className="mt-4">
                  <RailLabel>Padding color</RailLabel>
                  <RailPick
                    label="Padding color"
                    columns={4}
                    value={settings.background}
                    options={BG_PRESETS.map((bg) => ({
                      value: bg.id,
                      label: (
                        <>
                          <span aria-hidden className={`h-4 w-4 shrink-0 border border-black/25 ${bg.swatch}`} />
                          {bg.label}
                        </>
                      ),
                    }))}
                    onChange={(background) => onPatch({ background })}
                  />
                  {settings.background === "custom" && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        aria-label="Custom padding color"
                        className="h-11 w-14 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        placeholder="#ffffff"
                        aria-label="Custom padding color as hex"
                        className="h-11 min-w-0 flex-1 px-3 text-[15px] uppercase"
                      />
                    </div>
                  )}
                </div>
              )}
            </Field>
          </>
        )}

        {settings.mode === "percent" && (
          <Field label="Scale" hint={`${settings.percent}%`}>
            <RailSlider
              label="Scale percent"
              value={settings.percent}
              min={10}
              max={200}
              step={5}
              onValueChange={(percent) => onPatch({ percent })}
              className=""
            />
            <RailPick
              className="mt-3"
              columns={7}
              label="Scale presets"
              value={settings.percent}
              options={PERCENT_CHIPS.map((pct) => ({ value: pct, label: `${pct}%` }))}
              onChange={(percent) => onPatch({ percent })}
            />
          </Field>
        )}

        {settings.mode !== "crop" && (
          <div className="space-y-3">
            <RailSwitch
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
      </div>

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
        <RailSection
          icon={RotateCw}
          title="Rotate & flip"
          defaultOpen
          aside={
            hasTransforms
              ? `${settings.rotation}°${settings.flipX ? " · H" : ""}${settings.flipY ? " · V" : ""}`
              : undefined
          }
        >
          <div className="grid grid-cols-4 gap-px border border-line-strong bg-line-strong">
            <TurnKey label="Rotate 90° counter-clockwise" caption="−90°" onClick={() => rotate(-90)}>
              <RotateCcw size={17} aria-hidden />
            </TurnKey>
            <TurnKey label="Rotate 90° clockwise" caption="+90°" onClick={() => rotate(90)}>
              <RotateCw size={17} aria-hidden />
            </TurnKey>
            <TurnKey
              label="Flip horizontally"
              caption="Flip H"
              pressed={settings.flipX}
              onClick={() => onPatch({ flipX: !settings.flipX })}
            >
              <FlipHorizontal2 size={17} aria-hidden />
            </TurnKey>
            <TurnKey
              label="Flip vertically"
              caption="Flip V"
              pressed={settings.flipY}
              onClick={() => onPatch({ flipY: !settings.flipY })}
            >
              <FlipVertical2 size={17} aria-hidden />
            </TurnKey>
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
              <RailLabel>Format</RailLabel>
              <RailPick
                label="Format"
                columns={5}
                value={settings.format}
                options={RESIZE_FORMATS.map((fmt) => ({ value: fmt.value, label: fmt.label, title: fmt.hint }))}
                onChange={(format) => onPatch({ format })}
              />
              {activeFormat ? <RailHint>{activeFormat.hint}</RailHint> : null}
            </div>

            {lossy && (
              <div>
                <RailLabel className="!mb-1" value={`${settings.quality}%`}>
                  Quality
                </RailLabel>
                <RailSlider
                  label="Output quality"
                  value={settings.quality}
                  min={10}
                  max={100}
                  step={2}
                  onValueChange={(quality) => onPatch({ quality })}
                  className=""
                />
                <RailPick
                  className="mt-3"
                  columns={5}
                  label="Quality presets"
                  value={settings.quality}
                  options={QUALITY_PRESETS}
                  onChange={(quality) => onPatch({ quality })}
                />
              </div>
            )}

            <div className="space-y-4">
              <RailSwitch
                label="Sharpen"
                description="Brings back edge detail that shrinking softens."
                checked={settings.sharpen}
                onChange={(checked) => onPatch({ sharpen: checked })}
              />
              <RailSwitch
                label="Grayscale"
                checked={Boolean(settings.grayscale)}
                onChange={(checked) => onPatch({ grayscale: checked })}
              />
              <RailSwitch
                label="Strip metadata"
                description="Removes camera model, GPS and timestamps."
                checked={settings.removeMetadata}
                onChange={(checked) => onPatch({ removeMetadata: checked })}
              />
            </div>
          </div>
        </RailSection>
      </div>

      <div className="pt-2">
        <RailReset onClick={onReset} />
      </div>
    </StudioRail>
  );
}

function TurnKey({
  label,
  caption,
  pressed,
  onClick,
  children,
}: {
  label: string;
  caption: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`relative flex h-[60px] flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium transition-colors ${
        pressed ? "bg-ink text-white" : "bg-white hover:bg-hover"
      }`}
    >
      {children}
      <span>{caption}</span>
      {pressed ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
    </button>
  );
}
