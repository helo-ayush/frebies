"use client";

import { Check, ChevronDown } from "lucide-react";
import { PaidSection, PaidToggle } from "@/components/tool/paid/PaidControls";
import {
  STT_FORMATS,
  STT_LANGUAGES,
  STT_MODELS,
  type SttFormat,
  type SttLanguage,
  type SttModel,
  type SttSettings,
} from "./model";

export function SttControls({
  settings,
  onPatch,
}: {
  settings: SttSettings;
  onPatch: (patch: Partial<SttSettings>) => void;
}) {
  const model = STT_MODELS.find((entry) => entry.value === settings.model);

  return (
    <div className="space-y-5">
      <PaidSection title="Transcription" hint="AI model">
        <label className="block">
          <span className="block text-[10.5px] font-medium text-muted">Language</span>
          <span className="relative mt-1.5 block">
            <select
              value={settings.language}
              onChange={(event) => onPatch({ language: event.target.value as SttLanguage })}
              className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-2.5 pr-8 text-[11.5px] text-ink outline-none hover:border-[#d5d1c8]"
            >
              {STT_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden
            />
          </span>
        </label>

        <div className="mt-3 grid grid-cols-3 gap-1">
          {STT_MODELS.map((entry) => {
            const selected = settings.model === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ model: entry.value as SttModel })}
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

        <div className="mt-2 space-y-3">
          {settings.format === "txt" ? (
            <PaidToggle
              title="Timestamps"
              description="Add inline timecodes to the text."
              checked={settings.timestamps}
              onChange={(timestamps) => onPatch({ timestamps })}
            />
          ) : (
            <div className="flex items-start justify-between gap-3 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2">
              <span>
                <span className="block text-[11.5px] font-medium text-ink">Timestamps</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
                  Included automatically with {settings.format.toUpperCase()}.
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#3f6b4f]">
                <Check size={10} aria-hidden />
                On
              </span>
            </div>
          )}
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
      </PaidSection>

      <PaidSection title="Output" hint="Transcript file">
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
                className={`rounded-[8px] border px-1 py-2 text-center transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span className="block text-[11px] font-medium">{format.label}</span>
                <span className="mt-0.5 block text-[8.5px] leading-tight text-faint">
                  {format.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
          SRT and VTT always carry timestamps. TXT is plain text.
        </p>
      </PaidSection>

      <div className="rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5">
        <p className="text-[10px] leading-relaxed text-muted">
          The file uploads only when the run starts and is deleted within 1 hour. Run
          history keeps the transcript, never the recording.
        </p>
      </div>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        Charged at 2 credits per started minute, minimum 2. Failed runs are refunded.
      </p>
    </div>
  );
}
