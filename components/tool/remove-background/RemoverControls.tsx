"use client";

import { Field, Segmented } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailCards, RailHint } from "@/components/tool/studio/RailControls";
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

export function RemoverControls({
  settings,
  onPatch,
}: {
  settings: RemoverSettings;
  onPatch: (patch: Partial<RemoverSettings>) => void;
}) {
  const format = REMOVER_FORMATS.find((entry) => entry.value === settings.format);

  return (
    <div className="space-y-7">
      <Field label="Subject">
        <RailCards
          label="Subject"
          value={settings.subject}
          options={SUBJECT_TYPES.map((entry) => ({
            value: entry.value,
            label: entry.label,
            note: SUBJECT_DETAIL[entry.value],
            title: entry.hint,
          }))}
          onChange={(subject) => onPatch({ subject })}
        />
      </Field>

      <Field label="Edges">
        <div className="space-y-4">
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
        <div role="group" aria-label="Background" className="grid grid-cols-2 gap-px border border-line-strong bg-line-strong">
          {REMOVER_BACKGROUNDS.map((entry) => {
            const selected = settings.background === entry.value;
            const cell = `relative flex h-11 items-center gap-2.5 px-3 text-left text-[13.5px] font-medium transition-colors ${
              selected ? "bg-ink text-white" : "bg-white hover:bg-hover"
            }`;
            const mark = selected ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null;
            if (entry.value === "color") {
              return (
                <label
                  key={entry.value}
                  className={`cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${cell}`}
                >
                  <input
                    type="color"
                    value={settings.color}
                    onClick={() => onPatch({ background: "color" })}
                    onChange={(event) => onPatch({ color: event.target.value, background: "color" })}
                    aria-label="Custom background color"
                    className="!absolute !inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className="h-[18px] w-[18px] shrink-0 border border-black/25" style={{ background: settings.color }} />
                  Custom
                  {mark}
                </label>
              );
            }
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ background: entry.value as RemoverBackground })}
                className={cell}
              >
                <span
                  className={`h-[18px] w-[18px] shrink-0 border border-black/25 ${
                    entry.value === "transparent"
                      ? "fb-checker !bg-[length:9px_9px]"
                      : entry.value === "black"
                        ? "bg-black"
                        : "bg-white"
                  }`}
                />
                {entry.label}
                {mark}
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-4">
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
        <Segmented
          label="Output format"
          options={REMOVER_FORMATS.map((entry) => ({ value: entry.value, label: entry.label }))}
          value={settings.format}
          onChange={(value) =>
            onPatch({
              format: value as RemoverFormat,
              ...(value === "jpg" && settings.background === "transparent"
                ? { background: "white" as RemoverBackground }
                : null),
            })
          }
        />
        <RailHint>{format?.hint}</RailHint>

        <div className="mt-4">
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
