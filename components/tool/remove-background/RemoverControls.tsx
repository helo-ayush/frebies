"use client";

import { Cloud, Droplets, Sparkles } from "lucide-react";
import {
  PaidSection,
  PaidSlider,
  PaidToggle,
} from "@/components/tool/paid/PaidControls";
import {
  REMOVER_BACKGROUNDS,
  REMOVER_FORMATS,
  SUBJECT_TYPES,
  type RemoverBackground,
  type RemoverFormat,
  type RemoverSettings,
  type SubjectType,
} from "./model";

export function RemoverControls({
  settings,
  onPatch,
  hasImage,
}: {
  settings: RemoverSettings;
  onPatch: (patch: Partial<RemoverSettings>) => void;
  hasImage: boolean;
}) {
  const subject = SUBJECT_TYPES.find((entry) => entry.value === settings.subject);
  const format = REMOVER_FORMATS.find((entry) => entry.value === settings.format);

  return (
    <div className="space-y-5">
      <PaidSection title="Subject" hint={hasImage ? "AI detection" : "Add an image"}>
        <div className="grid grid-cols-2 gap-1.5">
          {SUBJECT_TYPES.map((entry) => {
            const selected = settings.subject === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ subject: entry.value as SubjectType })}
                className={`rounded-[9px] border px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span className="block text-[11px] font-medium">{entry.label}</span>
                <span className="mt-0.5 block text-[9px] text-faint">
                  {entry.value === "auto" ? "Detect automatically" : entry.value === "person" ? "Hair & skin" : entry.value === "product" ? "Hard edges" : "Logos & icons"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">
          {subject?.hint}
        </p>

        <div className="mt-2 space-y-3">
          <PaidSlider
            label="Edge feather"
            value={settings.feather}
            min={0}
            max={12}
            suffix=" px"
            onChange={(feather) => onPatch({ feather })}
            left="Sharp"
            right="Soft"
          />
          <PaidToggle
            title="Hair & fine detail"
            description="Preserve strands, fuzz and thin edges."
            checked={settings.fineDetail}
            onChange={(fineDetail) => onPatch({ fineDetail })}
          />
          <PaidToggle
            title="Crop to subject"
            description="Trim the canvas to the cut-out bounds."
            checked={settings.cropToSubject}
            onChange={(cropToSubject) => onPatch({ cropToSubject })}
          />
        </div>
      </PaidSection>

      <PaidSection title="Background" hint="Output fill">
        <div className="grid grid-cols-2 gap-1.5">
          {REMOVER_BACKGROUNDS.map((entry) => {
            const selected = settings.background === entry.value;
            if (entry.value === "color") {
              return (
                <label
                  key={entry.value}
                  className={`relative flex cursor-pointer items-center gap-2 rounded-[9px] border px-2.5 py-2 text-[10.5px] font-medium transition-colors ${
                    selected
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  <input
                    type="color"
                    value={settings.color}
                    onClick={() => onPatch({ background: "color" })}
                    onChange={(event) =>
                      onPatch({ color: event.target.value, background: "color" })
                    }
                    aria-label="Custom background colour"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span
                    className="h-4 w-4 shrink-0 rounded-[4px] border border-[#d8d5cf]"
                    style={{ background: settings.color }}
                  />
                  Custom
                </label>
              );
            }
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ background: entry.value as RemoverBackground })}
                className={`flex items-center gap-2 rounded-[9px] border px-2.5 py-2 text-left text-[10.5px] font-medium transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span
                  className={`h-4 w-4 shrink-0 rounded-[4px] border ${
                    entry.value === "transparent"
                      ? "checkerboard border-line"
                      : entry.value === "black"
                        ? "border-ink bg-ink"
                        : "border-[#e5e1d8] bg-white"
                  }`}
                />
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">
          Transparent PNG keeps the alpha channel. Solid fills are baked into the export.
        </p>

        <div className="mt-2 space-y-3">
          <PaidToggle
            title="Drop shadow"
            description="Add a soft shadow around the cut-out."
            checked={settings.shadow}
            onChange={(shadow) => onPatch({ shadow })}
          />
          {settings.shadow && (
            <PaidSlider
              label="Shadow softness"
              value={settings.shadowSoftness}
              min={0}
              max={60}
              onChange={(shadowSoftness) => onPatch({ shadowSoftness })}
              left="Tight"
              right="Diffuse"
            />
          )}
        </div>
      </PaidSection>

      <PaidSection title="Output" hint="Cut-out file">
        <div
          role="radiogroup"
          aria-label="Output format"
          className="grid grid-cols-3 gap-1"
        >
          {REMOVER_FORMATS.map((entry) => (
            <label key={entry.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="remover-format"
                value={entry.value}
                checked={settings.format === entry.value}
                onChange={() =>
                  onPatch({
                    format: entry.value as RemoverFormat,
                    ...(entry.value === "jpg" && settings.background === "transparent"
                      ? { background: "white" as RemoverBackground }
                      : null),
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
            title="Keep metadata"
            description="Carry camera details into the cut-out file."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2">
          <Droplets size={13} className="shrink-0 text-faint" aria-hidden />
          <span className="text-[10px] leading-relaxed text-muted">
            {settings.background === "transparent" && settings.format !== "jpg"
              ? "Transparent alpha is preserved."
              : settings.background === "transparent" && settings.format === "jpg"
                ? "JPG fills transparency with white."
                : `Background filled with ${settings.background === "color" ? settings.color.toUpperCase() : settings.background}.`}
          </span>
        </div>
      </PaidSection>

      <div className="flex items-start gap-2 rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5">
        <Cloud size={12} className="mt-px shrink-0 text-faint" aria-hidden />
        <p className="text-[10px] leading-relaxed text-muted">
          The file uploads only when the run starts and is deleted within 1 hour.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-[10px] border border-line px-3 py-2.5">
        <Sparkles size={12} className="mt-px shrink-0 text-accent" aria-hidden />
        <p className="text-[10px] leading-relaxed text-muted">
          One credit covers a single image and is refunded if the AI run fails.
        </p>
      </div>
    </div>
  );
}
