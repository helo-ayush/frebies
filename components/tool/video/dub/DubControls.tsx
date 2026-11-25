"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2, Pause, Play, SlidersHorizontal, Upload, X } from "lucide-react";
import { EngineRow } from "@/components/tool/paid/EngineRow";
import { RailCards, RailHint, RailMark } from "@/components/tool/studio/RailControls";
import type { SavedCustomVoice, VoiceId } from "@/components/tool/audio/tts/model";
import { VOICES } from "@/components/tool/audio/tts/model";
import { formatTime } from "@/components/tool/audio/format";
import { Field, OptionCard, Segmented, ToolIcon, ToolText } from "@/components/tool/kit";
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

      <div className="space-y-7 pb-7">
        <Field label="Language" hint={targetMeta?.nativeName}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div>
              <label htmlFor="dub-source-lang" className="block text-[13px] text-muted">
                Spoken in
              </label>
              <select
                id="dub-source-lang"
                value={settings.sourceLanguage}
                onChange={(e) => onChange({ sourceLanguage: e.target.value as DubLanguageCode })}
                className="fb-input mt-1.5 cursor-pointer !pl-3"
              >
                {DUB_SOURCE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={17} className="mb-[14px] text-accent-deep" aria-hidden />

            <div>
              <label htmlFor="dub-target-lang" className="block text-[13px] text-muted">
                Dub into
              </label>
              <select
                id="dub-target-lang"
                value={settings.targetLanguage}
                onChange={(e) => onChange({ targetLanguage: e.target.value as DubTargetLanguageCode })}
                className="fb-input mt-1.5 cursor-pointer !pl-3"
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
          <div className="space-y-2">
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
                    <p className="flex items-center gap-2 text-[14px] text-muted" role="status">
                      <Loader2 size={15} className="animate-spin text-accent-deep" aria-hidden />
                      Preparing your voice sample…
                    </p>
                  ) : customUploadRef ? (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold">{customUploadFileName || "Voice sample"}</p>
                          <p className="fb-num mt-0.5 text-[13px] text-muted">
                            {customUploadRef.durationSeconds}s of clear speech
                          </p>
                        </div>
                        <div className="flex shrink-0 [&>*]:-ml-px">
                          <ToolText
                            onClick={() => toggleAudioPreview("custom-upload-ref", customUploadRef.previewUrl)}
                            icon={
                              previewPlaying === "custom-upload-ref" ? (
                                <Pause size={13} aria-hidden />
                              ) : (
                                <Play size={13} aria-hidden />
                              )
                            }
                          >
                            {previewPlaying === "custom-upload-ref" ? "Stop" : "Listen"}
                          </ToolText>
                          <ToolIcon label="Remove voice sample" slot="sample-remove" onClick={onClearCustomVoiceUpload}>
                            <X size={15} aria-hidden />
                          </ToolIcon>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="mt-2 text-[13.5px] font-semibold text-accent-deep hover:underline"
                      >
                        Replace sample
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="fb-hatch inline-flex h-12 w-full items-center justify-center gap-2.5 border border-dashed border-line-strong text-[13px] font-semibold uppercase transition-colors hover:border-ink hover:bg-ink hover:text-white"
                      >
                        <Upload size={14} aria-hidden />
                        Choose a voice sample
                      </button>
                      <RailHint>5 to 60 seconds of clear speech. WAV, MP3 or M4A.</RailHint>
                    </div>
                  )
                ) : speakerRef ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="fb-num min-w-0 text-[14px] font-semibold">
                        {formatTime(speakerRef.startSec, true)} – {formatTime(speakerRef.endSec, true)}
                        <span className="ml-1.5 font-normal text-muted">{speakerRef.durationSeconds}s sample</span>
                      </p>
                      <ToolText
                        onClick={() => toggleAudioPreview("clone-ref", speakerRef.previewUrl)}
                        icon={
                          previewPlaying === "clone-ref" ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />
                        }
                      >
                        {previewPlaying === "clone-ref" ? "Stop" : "Listen"}
                      </ToolText>
                    </div>
                    {speakerRef.text && (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted">
                        “{speakerRef.text}”
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] leading-snug text-muted">
                    About 20 seconds of the clearest speech in your file becomes the voice sample.
                  </p>
                )}
              </div>
            </div>
          )}

          {settings.voiceMode === "preset" && !activeCustomVoiceId && (
            <div className="studio-main mt-3 max-h-[clamp(212px,34vh,360px)] overflow-y-auto border border-line-strong bg-white">
              {VOICES.map((v) => {
                const selected = settings.voiceId === v.id;
                const previewKey = `preset-${v.id}`;
                const hearing = previewPlaying === previewKey;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center border-b border-line pl-3 transition-colors last:border-b-0 ${
                      selected ? "bg-ink text-white" : "hover:bg-hover"
                    }`}
                  >
                    <button
                      type="button"
                      data-sound="none"
                      aria-label={hearing ? `Stop ${v.name}` : `Preview ${v.name}`}
                      data-playing={hearing || undefined}
                      onClick={() => toggleAudioPreview(previewKey, `/api/audio/tts/voices/${v.id}/sample`)}
                      className="fb-play fb-play-sm h-8 w-8 shrink-0"
                    >
                      {hearing ? (
                        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                          <path d="M1 1h8v8H1z" />
                        </svg>
                      ) : (
                        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M3 .8 11 6l-8 5.2z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange({ voiceId: v.id as VoiceId })}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5 pr-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{v.name}</span>
                        <span className={`block truncate text-[13px] ${selected ? "text-white/60" : "text-muted"}`}>
                          {v.descriptor}
                        </span>
                      </span>
                      <RailMark on={selected} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {savedCustomVoices.length > 0 && (
            <div className="mt-3">
              <p className="text-[13px] text-muted">Your saved voices</p>
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
                      className={`h-9 border px-3 text-[13px] font-medium transition-colors ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line-strong bg-white hover:border-ink"
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
          <RailCards
            label="Delivery"
            value={settings.tone}
            options={DUB_TONES.map((tone) => ({ value: tone.value as DubTone, label: tone.label, note: tone.hint }))}
            onChange={(tone) => onChange({ tone })}
          />
        </Field>

      </div>

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
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

      <EngineRow
        state={readyStudios > 0 ? "ready" : bootingStudios > 0 ? "booting" : "asleep"}
        label={
          readyStudios > 0
            ? "Voice server ready"
            : bootingStudios > 0
              ? "Voice server starting"
              : "Voice server starts when you dub"
        }
      />
    </StudioRail>
  );
}
