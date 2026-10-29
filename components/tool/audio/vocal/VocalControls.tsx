"use client";

import { PaidSection, PaidToggle } from "@/components/tool/paid/PaidControls";
import {
  STEM_BITRATES,
  STEM_FORMATS,
  STEM_MODELS,
  type StemFormat,
  type StemModel,
  type VocalSettings,
} from "./model";

export function VocalControls({
  settings,
  onPatch,
}: {
  settings: VocalSettings;
  onPatch: (patch: Partial<VocalSettings>) => void;
}) {
  const model = STEM_MODELS.find((entry) => entry.value === settings.model);

  return (
    <div className="space-y-5">
      <PaidSection title="Stems" hint="Separation">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "two", label: "2 stems", hint: "Vocals + instrumental" },
              { value: "four", label: "4 stems", hint: "Drums, bass and other" },
            ] as const
          ).map((mode) => {
            const selected = settings.mode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ mode: mode.value })}
                className={`rounded-[9px] border px-2.5 py-2.5 text-left transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span className="block text-[12px] font-medium">{mode.label}</span>
                <span className="mt-0.5 block text-[9px] text-faint">{mode.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
          {settings.mode === "two"
            ? "A clean karaoke or acapella pair, ready to sing over or sample."
            : "Four separate lanes for remixing, practice or production."}
        </p>
      </PaidSection>

      <PaidSection title="Model" hint="Quality">
        <div className="grid grid-cols-3 gap-1">
          {STEM_MODELS.map((entry) => {
            const selected = settings.model === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ model: entry.value as StemModel })}
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

      <PaidSection title="Output" hint="Stem files">
        <div className="grid grid-cols-2 gap-1.5">
          {STEM_FORMATS.map((format) => {
            const selected = settings.format === format.value;
            return (
              <button
                key={format.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ format: format.value as StemFormat })}
                className={`rounded-[8px] border px-2 py-2 text-center transition-colors ${
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span className="block text-[11px] font-medium">{format.label}</span>
                <span className="mt-0.5 block text-[8.5px] text-faint">
                  {format.value === "wav" ? "Lossless" : "Compressed"}
                </span>
              </button>
            );
          })}
        </div>

        {settings.format === "mp3" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STEM_BITRATES.map((bitrate) => {
              const selected = settings.bitrate === bitrate;
              return (
                <button
                  key={bitrate}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ bitrate })}
                  className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  {bitrate}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 space-y-3">
          <PaidToggle
            title="Keep backing vocals"
            description="Include harmonies in the vocal stem."
            checked={settings.backingVocals}
            onChange={(backingVocals) => onPatch({ backingVocals })}
          />
          <PaidToggle
            title="Normalize stems"
            description="Match levels across the separated files."
            checked={settings.normalize}
            onChange={(normalize) => onPatch({ normalize })}
          />
          <PaidToggle
            title="Keep metadata"
            description="Carry the track title into each stem."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      </PaidSection>

      <div className="rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5">
        <p className="text-[10px] leading-relaxed text-muted">
          The file uploads only when the run starts and is deleted within 1 hour. Stems
          remain available for 1 hour after processing.
        </p>
      </div>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        Charged at 4 credits per started minute, minimum 4. Failed runs are refunded.
      </p>
    </div>
  );
}
