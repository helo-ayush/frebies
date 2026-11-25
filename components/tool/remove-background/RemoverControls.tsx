"use client";

import { Field } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RAIL_CARD_ACTIVE, RAIL_CARD_IDLE } from "@/components/tool/studio/RailSection";
import {
  REMOVER_BACKGROUNDS,
  REMOVER_FORMATS,
  SUBJECT_TYPES,
  type RemoverBackground,
  type RemoverFormat,
  type RemoverSettings,
  type SubjectType,
} from "./model";

const SUBJECT_DETAIL: Record<SubjectType, string> = {
  auto: "Detect automatically",
  person: "Hair and skin",
  product: "Hard edges",
  graphic: "Logos and icons",
};

const SWATCH = "h-[18px] w-[18px] shrink-0 rounded-[5px] border";

export function RemoverControls({
  settings,
  onPatch,
}: {
  settings: RemoverSettings;
  onPatch: (patch: Partial<RemoverSettings>) => void;
}) {
  const format = REMOVER_FORMATS.find((entry) => entry.value === settings.format);

  return (
    <div className="space-y-6">
      <Field label="Subject">
        <div className="grid grid-cols-2 gap-1.5">
          {SUBJECT_TYPES.map((entry) => {
            const selected = settings.subject === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                title={entry.hint}
                onClick={() => onPatch({ subject: entry.value as SubjectType })}
                className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                }`}
              >
                <span className="block text-[13px] font-medium text-ink">{entry.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-faint">
                  {SUBJECT_DETAIL[entry.value]}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Edges">
        <div className="space-y-3.5">
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
            title="Hair and fine detail"
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
      </Field>

      <Field label="Background">
        <div className="grid grid-cols-2 gap-1.5">
          {REMOVER_BACKGROUNDS.map((entry) => {
            const selected = settings.background === entry.value;
            const card = `flex h-10 items-center gap-2 rounded-[10px] border px-3 text-left text-[13px] font-medium text-ink transition-colors ${
              selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
            }`;
            if (entry.value === "color") {
              return (
                <label
                  key={entry.value}
                  className={`relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${card}`}
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
                    className={`${SWATCH} border-[#d8d5cf]`}
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
                className={card}
              >
                <span
                  className={`${SWATCH} ${
                    entry.value === "transparent"
                      ? "checkerboard border-line"
                      : entry.value === "black"
                        ? "border-ink bg-ink"
                        : "border-[#d8d5cf] bg-white"
                  }`}
                />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3.5 space-y-3.5">
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
      </Field>

      <Field label="Output format">
        <div
          role="radiogroup"
          aria-label="Output format"
          className="grid grid-cols-3 gap-1 rounded-[12px] bg-card p-1"
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
              <span className="grid h-9 place-items-center rounded-[9px] text-[13px] font-medium text-muted transition-colors hover:text-ink peer-checked:bg-white peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgba(15,15,16,0.12)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {entry.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-faint">{format?.hint}</p>

        <div className="mt-3.5">
          <PaidToggle
            title="Keep metadata"
            description="Carry camera details into the cut-out file."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      </Field>
    </div>
  );
}
