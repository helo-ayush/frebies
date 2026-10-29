"use client";

import { ChevronDown } from "lucide-react";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import {
  PaidSection,
  PaidSlider,
  PaidToggle,
} from "@/components/tool/paid/PaidControls";
import {
  TTS_BITRATES,
  TTS_LANGUAGES,
  TTS_STYLES,
  VOICES,
  voiceMeta,
  type TtsFormat,
  type TtsLanguage,
  type TtsSettings,
  type TtsStyle,
  type VoiceId,
} from "./model";

export function TtsControls({
  settings,
  onPatch,
}: {
  settings: TtsSettings;
  onPatch: (patch: Partial<TtsSettings>) => void;
}) {
  const voice = voiceMeta(settings.voice);

  return (
    <div className="space-y-5">
      <PaidSection title="Voice" hint="AI voice">
        <div className="grid grid-cols-2 gap-1.5">
          {VOICES.map((entry) => {
            const selected = settings.voice === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ voice: entry.id as VoiceId })}
                className={`rounded-[10px] border p-2.5 text-left transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-medium text-ink">{entry.name}</span>
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                </span>
                <span className="mt-1.5 block">
                  <MiniWaveform bars={24} height={20} progress={0.45} seed={entry.seed} tone={entry.tone} />
                </span>
                <span className="mt-1.5 block text-[9px] text-faint">{entry.descriptor}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">
          {voice.hint}
        </p>
      </PaidSection>

      <PaidSection title="Read" hint="Language & style">
        <label className="block">
          <span className="block text-[10.5px] font-medium text-muted">Language</span>
          <span className="relative mt-1.5 block">
            <select
              value={settings.language}
              onChange={(event) => onPatch({ language: event.target.value as TtsLanguage })}
              className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-2.5 pr-8 text-[11.5px] text-ink outline-none hover:border-[#d5d1c8]"
            >
              {TTS_LANGUAGES.map((language) => (
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

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {TTS_STYLES.map((style) => {
            const selected = settings.style === style.value;
            return (
              <button
                key={style.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ style: style.value as TtsStyle })}
                className={`h-8 rounded-[7px] border text-[10.5px] font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                {style.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-3">
          <PaidSlider
            label="Speed"
            value={settings.speed}
            min={0.75}
            max={1.5}
            step={0.05}
            suffix="×"
            onChange={(speed) => onPatch({ speed })}
            left="Calm"
            right="Brisk"
          />
          <PaidSlider
            label="Pitch"
            value={settings.pitch}
            min={0.75}
            max={1.5}
            step={0.05}
            suffix="×"
            onChange={(pitch) => onPatch({ pitch })}
            left="Lower"
            right="Higher"
          />
        </div>
      </PaidSection>

      <PaidSection title="Output" hint="Voice file">
        <div className="grid grid-cols-2 gap-1.5">
          {(["mp3", "wav"] as const).map((format) => {
            const selected = settings.format === format;
            return (
              <button
                key={format}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ format: format as TtsFormat })}
                className={`rounded-[8px] border py-2 text-center text-[10.5px] font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                }`}
              >
                {format.toUpperCase()}
              </button>
            );
          })}
        </div>

        {settings.format === "mp3" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TTS_BITRATES.map((bitrate) => {
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

        <div className="mt-3">
          <PaidToggle
            title="Keep metadata"
            description="Carry the title and voice name into the file."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      </PaidSection>

      <details className="group overflow-hidden rounded-[11px] border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-[11.5px] font-medium text-ink">Advanced</span>
          <span className="flex items-center gap-1 text-[10px] text-faint">
            2 controls
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="space-y-3 border-t border-line-soft bg-[#fdfdfc] p-3">
          <PaidToggle
            title="Pause at paragraphs"
            description="Add a short breath between paragraphs."
            checked={settings.paragraphPauses}
            onChange={(paragraphPauses) => onPatch({ paragraphPauses })}
          />
          <PaidToggle
            title="Emphasize numbers"
            description="Read figures and dates more deliberately."
            checked={settings.emphasizeNumbers}
            onChange={(emphasizeNumbers) => onPatch({ emphasizeNumbers })}
          />
        </div>
      </details>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        Charged at 1 credit per 1,000 characters, minimum 1. Failed runs are refunded.
      </p>
    </div>
  );
}
