"use client";

import { Field, Segmented } from "@/components/tool/kit";
import { PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailCards, RailHint } from "@/components/tool/studio/RailControls";
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
    <div className="space-y-7">
      <Field label="Spoken language">
        <select
          aria-label="Spoken language"
          value={settings.language}
          onChange={(event) => onPatch({ language: event.target.value as SttLanguage })}
          className="fb-input cursor-pointer"
        >
          {STT_LANGUAGES.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Accuracy">
        <Segmented
          label="Accuracy"
          options={MODEL_OPTIONS}
          value={settings.model}
          onChange={(value) => onPatch({ model: value })}
        />
        <RailHint>{model?.hint}</RailHint>
      </Field>

      <Field label="Output format">
        <RailCards
          label="Output format"
          columns={3}
          value={settings.format}
          options={STT_FORMATS.map((format) => ({ value: format.value, label: format.label, note: format.hint }))}
          onChange={(value) =>
            onPatch({
              format: value as SttFormat,
              timestamps: value === "txt" ? settings.timestamps : true,
            })
          }
        />
      </Field>

      <Field label="Transcript">
        <div className="space-y-4">
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
