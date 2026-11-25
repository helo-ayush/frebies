"use client";

import { ChevronDown } from "lucide-react";
import { Field, Segmented } from "@/components/tool/kit";
import { PaidToggle } from "@/components/tool/paid/PaidControls";
import { RAIL_CARD_ACTIVE, RAIL_CARD_IDLE } from "@/components/tool/studio/RailSection";
import {
  STT_FORMATS,
  STT_LANGUAGES,
  STT_MODELS,
  type SttFormat,
  type SttLanguage,
  type SttSettings,
} from "./model";

const MODEL_OPTIONS = STT_MODELS.map((entry) => ({
  value: entry.value,
  label: entry.label,
  title: entry.hint,
}));

export function SttControls({
  settings,
  onPatch,
}: {
  settings: SttSettings;
  onPatch: (patch: Partial<SttSettings>) => void;
}) {
  const model = STT_MODELS.find((entry) => entry.value === settings.model);
  const subtitles = settings.format !== "txt";

  return (
    <div className="space-y-6">
      <Field label="Spoken language">
        <span className="relative block">
          <select
            aria-label="Spoken language"
            value={settings.language}
            onChange={(event) => onPatch({ language: event.target.value as SttLanguage })}
            className="h-10 w-full appearance-none rounded-[10px] border border-line bg-white pl-3 pr-9 text-[13px] text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
          >
            {STT_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden
          />
        </span>
      </Field>

      <Field label="Accuracy">
        <Segmented
          label="Accuracy"
          options={MODEL_OPTIONS}
          value={settings.model}
          onChange={(value) => onPatch({ model: value })}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-faint">{model?.hint}</p>
      </Field>

      <Field label="Output format">
        <div className="grid grid-cols-3 gap-1.5">
          {STT_FORMATS.map((format) => {
            const selected = settings.format === format.value;
            return (
              <button
                key={format.value}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onPatch({
                    format: format.value as SttFormat,
                    timestamps: format.value === "txt" ? settings.timestamps : true,
                  })
                }
                className={`rounded-[10px] border px-1.5 py-2.5 text-center transition-colors ${
                  selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                }`}
              >
                <span className="block text-[13px] font-medium text-ink">{format.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-faint">{format.hint}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Transcript">
        <div className="space-y-3.5">
          <PaidToggle
            title="Timestamps"
            description={
              subtitles
                ? `Always included with ${settings.format.toUpperCase()}.`
                : "Add inline timecodes to the text."
            }
            checked={subtitles ? true : settings.timestamps}
            disabled={subtitles}
            onChange={(timestamps) => onPatch({ timestamps })}
          />
          <PaidToggle
            title="Speaker labels"
            description="Split the transcript when voices change."
            checked={settings.speakers}
            onChange={(speakers) => onPatch({ speakers })}
          />
          <PaidToggle
            title="Punctuation"
            description="Add sentence punctuation and capitalisation."
            checked={settings.punctuation}
            onChange={(punctuation) => onPatch({ punctuation })}
          />
        </div>
      </Field>
    </div>
  );
}
