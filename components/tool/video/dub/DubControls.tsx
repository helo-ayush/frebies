"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2, Pause, Play, SlidersHorizontal, Upload, X } from "lucide-react";
import type { SavedCustomVoice, VoiceId } from "@/components/tool/audio/tts/model";
import { VOICES } from "@/components/tool/audio/tts/model";
import { formatTime } from "@/components/tool/audio/format";
import { Field, OptionCard, Segmented } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailSection } from "@/components/tool/studio/RailSection";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import type { PoolStatusSnapshot } from "@/lib/audio/tts-manager";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TARGET_LANGUAGES,
  DUB_TONES,
  type DubLanguageCode,
  type DubSettings,
  type DubTargetLanguageCode,
  type DubTone,
} from "@/lib/video/dub-types";
import type { ExtractedSpeakerRef } from "./video-audio-utils";

export type DubControlsProps = {
  /** The primary action (run / download). Docked at the top of the rail. */
  action: ReactNode;
  settings: DubSettings;
  onChange: (patch: Partial<DubSettings>) => void;
  speakerRef: ExtractedSpeakerRef | null;
  customUploadRef: ExtractedSpeakerRef | null;
  customUploadFileName: string | null;
  customUploadLoading: boolean;
  onUploadCustomVoiceFile: (file: File) => void;
  onClearCustomVoiceUpload: () => void;
  savedCustomVoices: SavedCustomVoice[];
  activeCustomVoiceId: string | null;
  onSelectCustomVoice: (voiceId: string | null) => void;
  pool: PoolStatusSnapshot | null;
};

const SELECT_CLASS =
  "mt-1 h-10 w-full rounded-[10px] border border-line bg-white px-2.5 text-[13px] font-medium text-ink outline-none transition-colors focus:border-ink focus-visible:ring-2 focus-visible:ring-accent/30";
const TILE_BASE =
  "rounded-[10px] border bg-white text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
const TILE_ON = "border-ink shadow-[inset_0_0_0_1px_#0f0f10]";
const TILE_OFF = "border-line hover:border-[#cfc9bd]";
const HEAR_BUTTON =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const CLONE_SOURCES = [
  { value: "file", label: "From this file" },
  { value: "upload", label: "Upload a sample" },
] as const;

export function DubControls({
  action,
  settings,
  onChange,
  speakerRef,
  customUploadRef,
  customUploadFileName,
  customUploadLoading,
  onUploadCustomVoiceFile,
  onClearCustomVoiceUpload,
  savedCustomVoices,
  activeCustomVoiceId,
  onSelectCustomVoice,
  pool,
}: DubControlsProps) {
  const customAudioInputRef = useRef<HTMLInputElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  function toggleAudioPreview(key: string, url: string) {
    if (previewPlaying === key && audioEl) {
      audioEl.pause();
      setPreviewPlaying(null);
      return;
    }
    if (audioEl) {
      audioEl.pause();
    }
    const next = new Audio(url);
    next.onended = () => setPreviewPlaying(null);
    next.onerror = () => setPreviewPlaying(null);
    void next.play().catch(() => setPreviewPlaying(null));
    setAudioEl(next);
    setPreviewPlaying(key);
  }

  const targetMeta = DUB_TARGET_LANGUAGES.find((l) => l.code === settings.targetLanguage);
  const readyStudios = pool?.readyCount ?? 0;
  const bootingStudios = pool?.bootingCount ?? 0;
  const usingUpload = settings.cloneSource === "custom_upload";

  return (
    <StudioRail
      sticky
      label="Dubbing settings"
      className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
      action={action}
    >
      <input
        ref={customAudioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
        tabIndex={-1}
        aria-label="Choose a voice sample"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onUploadCustomVoiceFile(f);
        }}
        className="sr-only"
      />

      <div className="space-y-6">
        <Field label="Language" hint={targetMeta?.nativeName}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div>
              <label htmlFor="dub-source-lang" className="block text-[12.5px] text-muted">
                Spoken in
              </label>
              <select
                id="dub-source-lang"
                value={settings.sourceLanguage}
                onChange={(e) => onChange({ sourceLanguage: e.target.value as DubLanguageCode })}
                className={SELECT_CLASS}
              >
                {DUB_SOURCE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={15} className="mb-3 text-faint" aria-hidden />

            <div>
              <label htmlFor="dub-target-lang" className="block text-[12.5px] text-muted">
                Dub into
              </label>
              <select
                id="dub-target-lang"
                value={settings.targetLanguage}
                onChange={(e) => onChange({ targetLanguage: e.target.value as DubTargetLanguageCode })}
                className={SELECT_CLASS}
              >
                {DUB_TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Field>

        <Field label="Voice">
          <div className="space-y-1.5">
            <OptionCard
              active={settings.voiceMode === "clone"}
              title="Match original speaker"
              detail="Clones the voice from your file or a sample."
              onClick={() => {
                onSelectCustomVoice(null);
                onChange({ voiceMode: "clone", cloneSource: customUploadRef ? "custom_upload" : "auto_vad" });
              }}
            />
            <OptionCard
              active={settings.voiceMode === "preset"}
              title="Studio voice"
              detail={`Pick one of ${VOICES.length} ready-made voices.`}
              onClick={() => {
                onSelectCustomVoice(null);
                onChange({ voiceMode: "preset" });
              }}
            />
          </div>

          {settings.voiceMode === "clone" && !activeCustomVoiceId && (
            <div className="mt-3">
              <Segmented
                label="Voice sample source"
                options={CLONE_SOURCES}
                value={usingUpload ? "upload" : "file"}
                onChange={(value) =>
                  onChange({ cloneSource: value === "upload" ? "custom_upload" : "auto_vad" })
                }
              />

              <div className="mt-3">
                {usingUpload ? (
                  customUploadLoading ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted" role="status">
                      <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                      Preparing your voice sample…
                    </p>
                  ) : customUploadRef ? (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">
                            {customUploadFileName || "Voice sample"}
                          </p>
                          <p className="mt-0.5 text-[12px] text-faint">
                            {customUploadRef.durationSeconds}s of clear speech
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleAudioPreview("custom-upload-ref", customUploadRef.previewUrl)}
                            className={HEAR_BUTTON}
                          >
                            {previewPlaying === "custom-upload-ref" ? (
                              <Pause size={12} aria-hidden />
                            ) : (
                              <Play size={12} aria-hidden />
                            )}
                            {previewPlaying === "custom-upload-ref" ? "Stop" : "Listen"}
                          </button>
                          <button
                            type="button"
                            onClick={onClearCustomVoiceUpload}
                            aria-label="Remove voice sample"
                            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                          >
                            <X size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="mt-1.5 text-[12.5px] font-medium text-accent-deep hover:underline"
                      >
                        Replace sample
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#cfc9bd] bg-white text-[13px] font-medium text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <Upload size={14} aria-hidden />
                        Choose a voice sample
                      </button>
                      <p className="mt-2 text-[12px] leading-snug text-faint">
                        5 to 60 seconds of clear speech. WAV, MP3 or M4A.
                      </p>
                    </div>
                  )
                ) : speakerRef ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-[13px] font-medium tabular-nums text-ink">
                        {formatTime(speakerRef.startSec, true)} – {formatTime(speakerRef.endSec, true)}
                        <span className="ml-1.5 font-normal text-faint">
                          {speakerRef.durationSeconds}s sample
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleAudioPreview("clone-ref", speakerRef.previewUrl)}
                        className={HEAR_BUTTON}
                      >
                        {previewPlaying === "clone-ref" ? (
                          <Pause size={12} aria-hidden />
                        ) : (
                          <Play size={12} aria-hidden />
                        )}
                        {previewPlaying === "clone-ref" ? "Stop" : "Listen"}
                      </button>
                    </div>
                    {speakerRef.text && (
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-faint">
                        “{speakerRef.text}”
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] leading-snug text-faint">
                    About 20 seconds of the clearest speech in your file becomes the voice sample.
                  </p>
                )}
              </div>
            </div>
          )}

          {settings.voiceMode === "preset" && !activeCustomVoiceId && (
            <div className="studio-rail mt-3 grid max-h-[212px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
              {VOICES.map((v) => {
                const selected = settings.voiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange({ voiceId: v.id as VoiceId })}
                    className={`flex items-center justify-between gap-1.5 px-2.5 py-2 ${TILE_BASE} ${
                      selected ? TILE_ON : TILE_OFF
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{v.name}</span>
                      <span className="block truncate text-[12px] text-faint">{v.descriptor}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Preview ${v.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAudioPreview(`preset-${v.id}`, `/api/audio/tts/voices/${v.id}/sample`);
                      }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-ink transition-colors hover:bg-ink hover:text-white"
                    >
                      {previewPlaying === `preset-${v.id}` ? (
                        <Pause size={11} aria-hidden />
                      ) : (
                        <Play size={11} aria-hidden />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {savedCustomVoices.length > 0 && (
            <div className="mt-3">
              <p className="text-[12.5px] text-muted">Your saved voices</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {savedCustomVoices.map((cv) => {
                  const active = activeCustomVoiceId === cv.id;
                  return (
                    <button
                      key={cv.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (active) {
                          onSelectCustomVoice(null);
                          onChange({ cloneSource: "auto_vad" });
                        } else {
                          onSelectCustomVoice(cv.id);
                          onChange({ voiceMode: "clone", cloneSource: "saved_voice" });
                        }
                      }}
                      className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                      }`}
                    >
                      {cv.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Field>

        <Field label="Delivery">
          <div className="grid grid-cols-2 gap-1.5">
            {DUB_TONES.map((tone) => {
              const active = settings.tone === tone.value;
              return (
                <button
                  key={tone.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ tone: tone.value as DubTone })}
                  className={`px-2.5 py-2 ${TILE_BASE} ${active ? TILE_ON : TILE_OFF}`}
                >
                  <span className="block text-[13px] font-medium text-ink">{tone.label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-faint">{tone.hint}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="border-t border-line-soft pt-4">
          <RailSection
            icon={SlidersHorizontal}
            title="Sound mix and timing"
            aside={settings.keepBackground ? "Background on" : "Voice only"}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <PaidToggle
                title="Keep background sound"
                description="Music and room tone stay under the new voice."
                checked={settings.keepBackground}
                onChange={(checked) => onChange({ keepBackground: checked })}
              />

              {settings.keepBackground && (
                <PaidSlider
                  label="Background level"
                  value={Math.round(settings.backgroundLevel * 100)}
                  min={5}
                  max={85}
                  step={1}
                  suffix="%"
                  left="Subtle"
                  right="Audible"
                  onChange={(v) => onChange({ backgroundLevel: v / 100 })}
                />
              )}

              <PaidToggle
                title="Match original timing"
                description="Longer translated lines are fitted into their original time slots."
                checked={settings.syncToTimeline}
                onChange={(checked) => onChange({ syncToTimeline: checked })}
              />
            </div>
          </RailSection>
        </div>

        <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted">
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${
              readyStudios > 0
                ? "bg-success"
                : bootingStudios > 0
                  ? "animate-pulse bg-promo"
                  : "bg-[#b9b4a8]"
            }`}
          />
          {readyStudios > 0
            ? "Voice server ready"
            : bootingStudios > 0
              ? "Voice server starting"
              : "Voice server starts when you dub"}
        </p>
      </div>
    </StudioRail>
  );
}
