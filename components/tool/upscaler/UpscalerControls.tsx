"use client";

import { Cloud } from "lucide-react";
import { PaidSection, PaidToggle } from "@/components/tool/paid/PaidControls";
import {
  UPSCALE_FORMATS,
  UPSCALE_MODELS,
  upscaleTarget,
  type UpscaleFormat,
  type UpscaleModel,
  type UpscaleSettings,
} from "./model";

export function UpscalerControls({
  settings,
  onPatch,
  sourceWidth,
  sourceHeight,
  hasImage,
}: {
  settings: UpscaleSettings;
  onPatch: (patch: Partial<UpscaleSettings>) => void;
  sourceWidth: number;
  sourceHeight: number;
  hasImage: boolean;
}) {
  const target = upscaleTarget(sourceWidth, sourceHeight, settings.factor);
  const model = UPSCALE_MODELS.find((entry) => entry.value === settings.model);
  const format = UPSCALE_FORMATS.find((entry) => entry.value === settings.format);

  return (
    <div className="space-y-5">
      <PaidSection title="Upscale plan" hint={hasImage ? "One image" : "Add an image"}>
        <div className="grid grid-cols-2 gap-2">
          {([2, 4] as const).map((factor) => {
            const selected = settings.factor === factor;
            const size = upscaleTarget(sourceWidth, sourceHeight, factor);
            return (
              <button
                key={factor}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ factor })}
                className={`rounded-[11px] border p-3 text-left transition-colors ${
                  selected
                    ? "border-ink bg-white shadow-[0_2px_10px_rgba(15,15,16,0.05)]"
                    : "border-line bg-[#fbfaf7] hover:border-[#d5d1c8]"
                }`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">
                    {factor}×
                  </span>
                  {factor === 4 && (
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-accent">
                      Best
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-[9.5px] tabular-nums text-faint">
                  {hasImage ? `${size.width} × ${size.height}` : "Target size"}
                </span>
                <span className="mt-2 block h-1 rounded-full bg-line">
                  <span
                    className={`block h-full rounded-full ${selected ? "bg-ink" : "bg-[#cfc9bd]"}`}
                    style={{ width: factor === 2 ? "50%" : "100%" }}
                  />
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
          <span className="tabular-nums">
            {hasImage ? `${sourceWidth} × ${sourceHeight}` : "Source size appears here"}
          </span>
          <span className="tabular-nums">
            {hasImage ? `→ ${target.width} × ${target.height}` : "2× / 4×"}
          </span>
        </div>
      </PaidSection>

      <PaidSection title="Detail model" hint="AI model">
        <div className="grid grid-cols-3 gap-1">
          {UPSCALE_MODELS.map((entry) => {
            const selected = settings.model === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ model: entry.value as UpscaleModel })}
                className={`h-8 rounded-[7px] border text-[10.5px] font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">
          {model?.hint}
        </p>
      </PaidSection>

      <PaidSection title="Enhancements" hint="Applied on run">
        <div className="space-y-3">
          <PaidToggle
            title="Face restore"
            description="Rebuild eyes, skin and fine facial detail."
            checked={settings.face}
            onChange={(face) => onPatch({ face })}
          />
          <PaidToggle
            title="Denoise"
            description="Clean compression artefacts before enlarging."
            checked={settings.denoise}
            onChange={(denoise) => onPatch({ denoise })}
          />
          <PaidToggle
            title="Sharpen"
            description="Add controlled micro-contrast to the result."
            checked={settings.sharpen}
            onChange={(sharpen) => onPatch({ sharpen })}
          />
        </div>
      </PaidSection>

      <PaidSection title="Output" hint="Cloud file">
        <div
          role="radiogroup"
          aria-label="Output format"
          className="grid grid-cols-3 gap-1"
        >
          {UPSCALE_FORMATS.map((entry) => (
            <label key={entry.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="upscale-format"
                value={entry.value}
                checked={settings.format === entry.value}
                onChange={() =>
                  onPatch({
                    format: entry.value as UpscaleFormat,
                    ...(entry.value === "jpg" ? { transparency: false } : null),
                  })
                }
                className="peer sr-only"
              />
              <span className="block rounded-[8px] border border-line bg-white py-2 text-center text-[10.5px] font-medium text-muted transition-colors hover:border-[#d8d4cb] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {entry.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">
          {format?.hint}
        </p>

        <div className="mt-2 space-y-3">
          <PaidToggle
            title="Preserve transparency"
            description="Keep alpha channels on PNG and WebP."
            checked={settings.transparency}
            onChange={(transparency) => onPatch({ transparency })}
            disabled={settings.format === "jpg"}
          />
          <PaidToggle
            title="Keep metadata"
            description="Carry camera details into the upscaled file."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      </PaidSection>

      <div className="rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5">
        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-muted">
          <Cloud size={12} className="mt-px shrink-0 text-faint" aria-hidden />
          The file uploads only when the run starts and is deleted within 1 hour.
        </p>
      </div>
    </div>
  );
}
