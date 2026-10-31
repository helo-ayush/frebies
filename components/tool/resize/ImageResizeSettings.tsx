"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import {
  Check,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Link2,
  Percent,
  RotateCcw,
  RotateCw,
  Scaling,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Unlink2,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
  RAIL_FIELD_LABEL,
  RAIL_FIELD_META,
} from "@/components/tool/studio/RailSection";
import {
  CROP_RATIOS,
  RESIZE_FORMATS,
  formatBytes,
  formatLabel,
  isLossyFormat,
  ratioLabel,
  type Background,
  type CropRatioId,
  type FitMode,
  type ResizeFormat,
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
        {/* Mode */}
        <RailSection
          icon={Scaling}
          title="Mode"
          hint="Exact pixels, scale percent or crop"
          aside={
            settings.mode === "dimensions"
              ? `${outputWidth || settings.width} × ${outputHeight || settings.height}`
              : settings.mode === "percent"
                ? `${settings.percent}% scale`
                : "Crop box"
          }
        >
          <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-[#f8f6f2] p-1">
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

          {settings.mode === "crop" && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className={RAIL_FIELD_LABEL}>Crop aspect ratio</span>
                  <span className={RAIL_FIELD_META}>
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
                        aria-pressed={selected}
                        onClick={() => onPatch({ cropRatio: ratio.id })}
                        className={`flex min-h-[80px] flex-col items-center justify-center gap-1.5 rounded-[11px] border px-1 py-2.5 text-center transition-colors ${
                          selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                        }`}
                      >
                        <AspectRatioMiniature id={ratio.id} active={selected} />
                        <span className="text-[12.5px] font-medium text-ink">{ratio.label}</span>
                        <span className="text-[10px] leading-none text-faint">{ratio.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-[#fbfaf8] px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-line bg-white text-ink">
                    <Crop size={14} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
                      Active crop box
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">
                      {cropWidth && cropHeight ? `${cropWidth} × ${cropHeight} px` : "Select area on stage"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onResetCrop}
                  title="Reset crop box to the full image"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-line bg-white px-2.5 text-[11.5px] font-medium text-muted transition-colors hover:border-[#cfc9bd] hover:bg-white hover:text-ink"
                >
                  <RotateCcw size={11} aria-hidden />
                  Reset
                </button>
              </div>
            </div>
          )}

          {settings.mode === "dimensions" && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink">Width</span>
                    <span className="relative mt-1.5 block">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={settings.width}
                        onChange={(event) => changeWidth(event.target.value)}
                        placeholder="1920"
                        className="h-11 w-full rounded-[10px] border border-line bg-white pl-3 pr-9 text-[13px] font-semibold tabular-nums text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-[#b8b2a7]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-faint">
                        px
                      </span>
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => onPatch({ linked: !settings.linked })}
                    aria-pressed={settings.linked}
                    title={settings.linked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    className={`mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border transition-colors ${
                      settings.linked
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-faint hover:border-[#cfc9bd] hover:text-ink"
                    }`}
                  >
                    {settings.linked ? <Link2 size={16} aria-hidden /> : <Unlink2 size={16} aria-hidden />}
                  </button>

                  <label className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink">Height</span>
                    <span className="relative mt-1.5 block">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={settings.height}
                        onChange={(event) => changeHeight(event.target.value)}
                        placeholder="1080"
                        className="h-11 w-full rounded-[10px] border border-line bg-white pl-3 pr-9 text-[13px] font-semibold tabular-nums text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-[#b8b2a7]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-faint">
                        px
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-faint">
                  <span>
                    Aspect{" "}
                    <strong className="font-medium text-ink">
                      {ratioLabel(outputWidth, outputHeight)}
                    </strong>
                  </span>
                  <span>{settings.linked ? "Locked to the source" : "Unlocked"}</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className={RAIL_FIELD_LABEL}>Presets</span>
                  <button
                    type="button"
                    onClick={() => setShowAllPresets(!showAllPresets)}
                    className="inline-flex h-7 items-center rounded-[7px] px-2 text-[11.5px] font-medium text-muted transition-colors hover:bg-[#f6f4f0] hover:text-ink"
                  >
                    {showAllPresets ? "Show fewer" : "Show all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(showAllPresets ? POPULAR_PRESETS : POPULAR_PRESETS.slice(0, 4)).map((preset) => {
                    const isCurrent =
                      settings.width === String(preset.width) && settings.height === String(preset.height);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPreset(preset.width, preset.height)}
                        className={`flex min-h-[54px] flex-col items-start justify-center rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                          isCurrent ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                        }`}
                      >
                        <span className="text-[12px] font-medium text-ink">{preset.label}</span>
                        <span className="mt-0.5 text-[10.5px] tabular-nums text-faint">
                          {preset.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className={RAIL_FIELD_LABEL}>Fit behavior</span>
                <div className="mt-2 space-y-2">
                  {FIT_OPTIONS.map((opt) => {
                    const selected = settings.fit === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ fit: opt.value })}
                        className={`flex w-full items-start gap-3 rounded-[11px] border p-3 text-left transition-colors ${
                          selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors ${
                            selected ? "border-ink bg-ink text-white" : "border-[#ccc6ba] bg-white"
                          }`}
                        >
                          {selected && <Check size={10} strokeWidth={3} aria-hidden />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-ink">{opt.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                            {opt.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {settings.fit === "fit" && (
                <div className="rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-ink">Padding color</span>
                    <span className="text-[11px] capitalize text-faint">{settings.background}</span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-4 gap-2">
                    {BG_PRESETS.map((bg) => {
                      const selected = settings.background === bg.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onPatch({ background: bg.id })}
                          className={`flex min-h-[40px] items-center gap-2 rounded-[9px] border px-2 text-[11px] font-medium transition-colors ${
                            selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${bg.swatch}`} />
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
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        aria-label="Custom padding color"
                        className="h-9 w-10 cursor-pointer rounded-[8px] border border-line bg-white p-0.5"
                      />
                      <input
                        type="text"
                        value={settings.customBackground || "#ffffff"}
                        onChange={(event) => onPatch({ customBackground: event.target.value })}
                        placeholder="#ffffff"
                        className="h-9 flex-1 rounded-[8px] border border-line bg-white px-2.5 font-mono text-[11.5px] uppercase text-ink outline-none transition-colors focus:border-[#b8b2a7]"
                      />
                    </div>
                  )}
                </div>
              )}

              <RailSwitch
                label="Never upscale"
                description="Caps the output at the original size to prevent pixelation."
                checked={settings.neverUpscale}
                onChange={(checked) => onPatch({ neverUpscale: checked })}
              />
            </div>
          )}

          {settings.mode === "percent" && (
            <div className="mt-4 space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className={RAIL_FIELD_LABEL}>Scale factor</span>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Proportionally scales width and height
                  </p>
                </div>
                <span className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                  {settings.percent}%
                </span>
              </div>

              <div>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={settings.percent}
                  onChange={(event) => onPatch({ percent: Number(event.target.value) })}
                  aria-label="Scale percent"
                  style={rangeFill(settings.percent, 10, 200)}
                  className="range w-full"
                />
                <div className="mt-1.5 flex justify-between text-[10.5px] tabular-nums text-faint">
                  <span>10%</span>
                  <span>50%</span>
                  <span>100%</span>
                  <span>150%</span>
                  <span>200%</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {PERCENT_CHIPS.map((pct) => {
                  const selected = settings.percent === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ percent: pct })}
                      className={`h-9 rounded-[8px] border text-[11.5px] font-medium tabular-nums transition-colors ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>

              <RailSwitch
                label="Never upscale"
                description="Caps the output at 100% if the scale exceeds the original size."
                checked={settings.neverUpscale}
                onChange={(checked) => onPatch({ neverUpscale: checked })}
              />

              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-[#fbfaf8] px-3 py-2.5 text-[11.5px]">
                <span className="text-muted">Resulting size</span>
                <span className="font-semibold tabular-nums text-ink">
                  {outputWidth || "—"} × {outputHeight || "—"} px
                </span>
              </div>
            </div>
          )}
        </RailSection>

        {/* Rotate & flip */}
        <RailSection
          icon={RotateCw}
          title="Rotate & flip"
          hint="90° turns and mirroring"
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
              title="Rotate 90° counter-clockwise"
              className="group flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border border-line bg-white text-muted transition-colors hover:border-[#cfc9bd] hover:bg-[#fbfaf8] hover:text-ink active:bg-[#f4f1ea]"
            >
              <RotateCcw size={16} aria-hidden />
              <span className="text-[11.5px] font-medium">−90°</span>
            </button>
            <button
              type="button"
              onClick={() => rotate(90)}
              title="Rotate 90° clockwise"
              className="group flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border border-line bg-white text-muted transition-colors hover:border-[#cfc9bd] hover:bg-[#fbfaf8] hover:text-ink active:bg-[#f4f1ea]"
            >
              <RotateCw size={16} aria-hidden />
              <span className="text-[11.5px] font-medium">+90°</span>
            </button>
            <button
              type="button"
              onClick={() => onPatch({ flipX: !settings.flipX })}
              aria-pressed={settings.flipX}
              title="Flip horizontally"
              className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border transition-colors ${
                settings.flipX
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:bg-[#fbfaf8] hover:text-ink"
              }`}
            >
              <FlipHorizontal2 size={16} aria-hidden />
              <span className="text-[11.5px] font-medium">Flip H</span>
            </button>
            <button
              type="button"
              onClick={() => onPatch({ flipY: !settings.flipY })}
              aria-pressed={settings.flipY}
              title="Flip vertically"
              className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border transition-colors ${
                settings.flipY
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:bg-[#fbfaf8] hover:text-ink"
              }`}
            >
              <FlipVertical2 size={16} aria-hidden />
              <span className="text-[11.5px] font-medium">Flip V</span>
            </button>
          </div>

          {hasTransforms && (
            <div className="mt-2.5 flex items-center justify-between rounded-[10px] bg-[#fbfaf8] px-3 py-2 text-[11px]">
              <span className="text-faint">
                Angle <strong className="font-semibold text-ink">{settings.rotation}°</strong>
                {settings.flipX && <span className="ml-1 text-ink">· Flip H</span>}
                {settings.flipY && <span className="ml-1 text-ink">· Flip V</span>}
              </span>
              <button
                type="button"
                onClick={() => onPatch({ rotation: 0, flipX: false, flipY: false })}
                className="font-medium text-muted transition-colors hover:text-ink"
              >
                Reset transforms
              </button>
            </div>
          )}
        </RailSection>

        {/* Advanced */}
        <RailSection
          icon={SlidersHorizontal}
          title="Advanced"
          hint="Format, quality and output filters"
          defaultOpen={false}
          aside={`${formatLabel(settings.format)}${lossy ? ` · ${settings.quality}%` : " · Lossless"}`}
        >
          <div className="space-y-4">
            <div>
              <span className={RAIL_FIELD_LABEL}>Output format</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {RESIZE_FORMATS.map((fmt) => {
                  const selected = settings.format === fmt.value;
                  return (
                    <button
                      key={fmt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ format: fmt.value })}
                      className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[10px] border px-1.5 py-2 text-center transition-colors ${
                        selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                      }`}
                    >
                      <span className="text-[12.5px] font-medium text-ink">{fmt.label}</span>
                      <span className="text-[10px] text-faint">
                        {fmt.value === "auto" ? "Smart" : fmt.lossy ? "Lossy" : "Lossless"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {lossy && (
              <div className="rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="text-[12px] font-medium text-ink">Quality</span>
                    <p className="mt-0.5 text-[11px] text-faint">Preserves gradients and fine detail</p>
                  </div>
                  <span className="font-display text-[20px] font-semibold leading-none tabular-nums text-ink">
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
                  aria-label="Output quality"
                  style={rangeFill(settings.quality, 10, 100)}
                  className="range mt-2.5 w-full"
                />
                <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                  {QUALITY_PRESETS.map((preset) => {
                    const selected = settings.quality === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ quality: preset.value })}
                        className={`h-8 rounded-[8px] border text-[10.5px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className={RAIL_FIELD_LABEL}>Output options</span>
              <RailSwitch
                label="Subtle post-sharpening"
                description="Restores edge clarity and micro-contrast."
                checked={settings.sharpen}
                onChange={(checked) => onPatch({ sharpen: checked })}
              />
              <RailSwitch
                label="Grayscale"
                description="Drops color channels for clean monochrome."
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

            <div className="rounded-[12px] border border-[#e6e0d4] bg-[#fbf9f5] p-3.5">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2.5">
                <span className="text-[11.5px] font-semibold text-ink">Output summary</span>
                <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10.5px] font-medium text-muted">
                  {formatLabel(settings.format)}
                </span>
              </div>
              <div className="mt-2.5 space-y-2 text-[11.5px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-faint">Dimensions</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {outputWidth && outputHeight ? `${outputWidth} × ${outputHeight} px` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-faint">Aspect ratio</span>
                  <span className="font-medium text-ink">{ratioLabel(outputWidth, outputHeight)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-faint">Scale</span>
                  <span className="font-medium tabular-nums text-ink">
                    {scale ? `${Math.round(scale)}%` : "100%"}
                  </span>
                </div>
                {estimatedBytes > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-faint">Est. file size</span>
                    <span className="font-medium tabular-nums text-ink">
                      {formatBytes(estimatedBytes)}
                      {originalBytes > estimatedBytes && (
                        <span className="ml-1 text-[10.5px] font-semibold text-[#3b7c3f]">
                          (−{Math.round(((originalBytes - estimatedBytes) / originalBytes) * 100)}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {upscaling && (
                <div className="mt-3 flex items-start gap-1.5 rounded-[9px] border border-[#ecd9b8] bg-[#fdf8ee] p-2.5 text-[11px] leading-relaxed text-[#8a652d]">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Upscaling interpolates pixels. Turn on “Never upscale” to preserve native
                    sharpness.
                  </span>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-[10.5px] text-faint">
                <ShieldCheck size={12} className="text-[#5f8a56]" aria-hidden />
                <span>100% client-side · zero uploads</span>
              </div>
            </div>
          </div>
        </RailSection>
      </div>
    </StudioRail>
  );
}
