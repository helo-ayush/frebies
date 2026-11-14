"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  Languages,
  Loader2,
  Lock,
  Mic2,
  Pause,
  Play,
  Sparkles,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type { SavedCustomVoice, VoiceId } from "@/components/tool/audio/tts/model";
import { VOICES } from "@/components/tool/audio/tts/model";
import { formatTime } from "@/components/tool/audio/format";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { PaidSection, PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
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
  settings: DubSettings;
  onChange: (patch: Partial<DubSettings>) => void;
  hasMedia: boolean;
  mediaKind: "video" | "audio";
  durationSec: number;
  segmentCount: number;
  translatedCount: number;
  estimatedCredits: number;
  speakerRef: ExtractedSpeakerRef | null;
  customUploadRef: ExtractedSpeakerRef | null;
  customUploadFileName: string | null;
  customUploadLoading: boolean;
  onUploadCustomVoiceFile: (file: File) => void;
  onClearCustomVoiceUpload: () => void;
  savedCustomVoices: SavedCustomVoice[];
  activeCustomVoiceId: string | null;
  onSelectCustomVoice: (voiceId: string | null) => void;
  onStartDub: () => void;
  submitting: boolean;
  extracting: boolean;
  transcribing: boolean;
  translating: boolean;
  isSignedIn: boolean;
  pool: PoolStatusSnapshot | null;
};

export function DubControls({
  settings,
  onChange,
  hasMedia,
  mediaKind,
  durationSec,
  segmentCount,
  translatedCount,
  estimatedCredits,
  speakerRef,
  customUploadRef,
  customUploadFileName,
  customUploadLoading,
  onUploadCustomVoiceFile,
  onClearCustomVoiceUpload,
  savedCustomVoices,
  activeCustomVoiceId,
  onSelectCustomVoice,
  onStartDub,
  submitting,
  extracting,
  transcribing,
  translating,
  isSignedIn,
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

  const canRun = hasMedia && !submitting && !extracting && !transcribing && !translating && !customUploadLoading;

  const ctaLabel = extracting
    ? "Preparing audio in browser..."
    : transcribing
      ? "Transcribing via Deepgram..."
      : translating
        ? "Translating via OpenRouter..."
        : submitting
          ? "Starting dubbing job..."
          : segmentCount === 0
            ? `Generate Dub (${targetMeta?.label ?? "Target"})`
            : translatedCount < segmentCount
              ? `Translate & Dub (${targetMeta?.label ?? "Target"})`
              : `Generate Dubbed Audio`;

  const actionCard = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Run cost</p>
          <p className="mt-0.5 font-display text-[20px] font-semibold leading-none tracking-[-0.03em] text-ink">
            {hasMedia ? `${estimatedCredits} credits` : "5 credits / min"}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${
            readyStudios > 0
              ? "border-[#cfe3d4] bg-[#f4faf5] text-[#2c6b3f]"
              : bootingStudios > 0
                ? "border-[#ecd9be] bg-[#fdf7ee] text-[#8a5d22]"
                : "border-line bg-white text-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              readyStudios > 0
                ? "bg-[#2e8547]"
                : bootingStudios > 0
                  ? "animate-pulse bg-[#c98836]"
                  : "bg-[#9d9d98]"
            }`}
          />
          {readyStudios > 0
            ? `${readyStudios} voice GPU ready`
            : bootingStudios > 0
              ? "Warming GPU"
              : "On-demand GPU"}
        </span>
      </div>

      {hasMedia && (
        <div className="flex items-center justify-between rounded-[10px] border border-line bg-white px-3 py-2 text-[11px] text-muted">
          <span>
            {formatTime(durationSec, false)} · {mediaKind === "video" ? "Video → Audio only" : "Audio"}
          </span>
          <span>{segmentCount > 0 ? `${segmentCount} semantic chunks` : "One-click ready"}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onStartDub}
        disabled={!canRun}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-ink px-4 text-[13px] font-medium text-white transition-all hover:bg-[#232325] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting || extracting || transcribing || translating ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : !isSignedIn ? (
          <Lock size={14} aria-hidden />
        ) : (
          <Sparkles size={15} aria-hidden />
        )}
        <span>{ctaLabel}</span>
      </button>

      {!isSignedIn && hasMedia && (
        <p className="text-center text-[10.5px] leading-relaxed text-faint">
          Sign in to run Deepgram ASR, OpenRouter expression translation &amp; Drama 3 dubbing.
        </p>
      )}
    </div>
  );

  return (
    <PaidRail action={actionCard} label="Dubbing settings">
      <input
        ref={customAudioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onUploadCustomVoiceFile(f);
        }}
        className="hidden"
      />

      <div className="space-y-5">
        {/* Languages */}
        <PaidSection title="Languages" hint="12 target languages">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div>
              <label htmlFor="dub-source-lang" className="block text-[10.5px] font-medium text-faint">
                Spoken audio
              </label>
              <select
                id="dub-source-lang"
                value={settings.sourceLanguage}
                onChange={(e) => onChange({ sourceLanguage: e.target.value as DubLanguageCode })}
                className="mt-1 h-9 w-full rounded-[9px] border border-line bg-white px-2.5 text-[12px] font-medium text-ink outline-none focus:border-ink"
              >
                {DUB_SOURCE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={14} className="mt-5 text-faint" aria-hidden />

            <div>
              <label htmlFor="dub-target-lang" className="block text-[10.5px] font-medium text-faint">
                Dub into
              </label>
              <select
                id="dub-target-lang"
                value={settings.targetLanguage}
                onChange={(e) => onChange({ targetLanguage: e.target.value as DubTargetLanguageCode })}
                className="mt-1 h-9 w-full rounded-[9px] border border-line bg-white px-2.5 text-[12px] font-medium text-ink outline-none focus:border-ink"
              >
                {DUB_TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {targetMeta && (
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted">
              <Languages size={11} className="text-accent" aria-hidden />
              Semantic pause chunking + Drama 3 tags into {targetMeta.label} ({targetMeta.nativeName})
            </p>
          )}
        </PaidSection>

        {/* Speaker voice */}
        <PaidSection
          title="Dubbing voice"
          hint={settings.voiceMode === "clone" ? "Speaker clone" : "Studio voice"}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectCustomVoice(null);
                onChange({ voiceMode: "clone", cloneSource: customUploadRef ? "custom_upload" : "auto_vad" });
              }}
              className={`rounded-[11px] border p-2.5 text-left transition-colors ${
                settings.voiceMode === "clone"
                  ? "border-ink bg-white shadow-[0_1px_4px_rgba(15,15,16,0.06)]"
                  : "border-line bg-rail/60 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <Mic2 size={13} className="text-accent" aria-hidden />
                {settings.voiceMode === "clone" && <Check size={12} className="text-ink" aria-hidden />}
              </div>
              <p className="mt-1.5 text-[11.5px] font-semibold text-ink">Clone voice</p>
              <p className="mt-0.5 text-[10px] leading-snug text-faint">20s VAD or custom clip</p>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectCustomVoice(null);
                onChange({ voiceMode: "preset" });
              }}
              className={`rounded-[11px] border p-2.5 text-left transition-colors ${
                settings.voiceMode === "preset"
                  ? "border-ink bg-white shadow-[0_1px_4px_rgba(15,15,16,0.06)]"
                  : "border-line bg-rail/60 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <AudioLines size={13} className="text-ink" aria-hidden />
                {settings.voiceMode === "preset" && <Check size={12} className="text-ink" aria-hidden />}
              </div>
              <p className="mt-1.5 text-[11.5px] font-semibold text-ink">Studio preset</p>
              <p className="mt-0.5 text-[10px] leading-snug text-faint">{VOICES.length} curated voices</p>
            </button>
          </div>

          {settings.voiceMode === "clone" && !activeCustomVoiceId && (
            <div className="mt-2.5 space-y-2">
              {/* Auto VAD 20s speaker extraction vs Custom Reference Upload selector */}
              <div className="grid grid-cols-2 gap-1.5 rounded-[10px] border border-line bg-rail/70 p-1">
                <button
                  type="button"
                  onClick={() => onChange({ cloneSource: "auto_vad" })}
                  className={`rounded-[7px] px-2 py-1.5 text-[10.5px] font-medium transition-colors ${
                    settings.cloneSource !== "custom_upload"
                      ? "bg-white text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Auto ~20s VAD sample
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ cloneSource: "custom_upload" })}
                  className={`rounded-[7px] px-2 py-1.5 text-[10.5px] font-medium transition-colors ${
                    settings.cloneSource === "custom_upload"
                      ? "bg-white text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Upload custom voice
                </button>
              </div>

              {settings.cloneSource === "custom_upload" ? (
                <div className="rounded-[11px] border border-line bg-white p-3">
                  {customUploadLoading ? (
                    <div className="flex items-center gap-2 text-[11px] text-ink">
                      <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
                      <span>Extracting clean ~20s speech from uploaded audio...</span>
                    </div>
                  ) : customUploadRef ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-ink">
                            {customUploadFileName || "Custom voice reference"}
                          </p>
                          <p className="text-[10px] text-faint">
                            {customUploadRef.durationSeconds}s clean VAD clip ready
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleAudioPreview("custom-upload-ref", customUploadRef.previewUrl)}
                            className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-rail px-2.5 text-[10.5px] font-medium text-ink hover:bg-white"
                          >
                            {previewPlaying === "custom-upload-ref" ? (
                              <Pause size={10} aria-hidden />
                            ) : (
                              <Play size={10} aria-hidden />
                            )}
                            {previewPlaying === "custom-upload-ref" ? "Stop" : "Hear"}
                          </button>
                          <button
                            type="button"
                            onClick={onClearCustomVoiceUpload}
                            aria-label="Remove custom voice upload"
                            className="grid h-7 w-7 place-items-center rounded-full border border-line text-faint hover:text-ink"
                          >
                            <X size={11} aria-hidden />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="text-[10.5px] font-medium text-accent hover:underline"
                      >
                        Replace voice reference file
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10.5px] leading-relaxed text-muted">
                        Upload any clean speech clip (5s–60s WAV/MP3/M4A) to keep speaker voice identity 100% consistent.
                      </p>
                      <button
                        type="button"
                        onClick={() => customAudioInputRef.current?.click()}
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-ink/30 bg-rail/60 text-[11px] font-medium text-ink hover:border-ink hover:bg-white"
                      >
                        <Upload size={12} className="text-accent" aria-hidden />
                        Choose voice reference audio
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[11px] border border-line bg-white p-3">
                  {speakerRef ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-ink">
                          VAD {speakerRef.durationSeconds}s ({formatTime(speakerRef.startSec, true)} – {formatTime(speakerRef.endSec, true)})
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleAudioPreview("clone-ref", speakerRef.previewUrl)}
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-rail px-2.5 text-[10.5px] font-medium text-ink hover:bg-white"
                        >
                          {previewPlaying === "clone-ref" ? (
                            <Pause size={10} aria-hidden />
                          ) : (
                            <Play size={10} aria-hidden />
                          )}
                          {previewPlaying === "clone-ref" ? "Stop" : "Hear 20s"}
                        </button>
                      </div>
                      {speakerRef.text && (
                        <p className="line-clamp-2 text-[10.5px] leading-relaxed text-faint">
                          “{speakerRef.text}”
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10.5px] leading-relaxed text-muted">
                      VAD scans Deepgram word timestamps + RMS speech energy to extract a clean ~20s speaking chunk (never blindly from 0:00).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {settings.voiceMode === "preset" && !activeCustomVoiceId && (
            <div className="mt-2.5 grid max-h-[196px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
              {VOICES.map((v) => {
                const selected = settings.voiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onChange({ voiceId: v.id as VoiceId })}
                    className={`flex items-center justify-between gap-1.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors ${
                      selected ? "border-ink bg-white" : "border-line bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-ink">{v.name}</p>
                      <p className="truncate text-[9.5px] text-faint">{v.descriptor}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Preview ${v.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAudioPreview(`preset-${v.id}`, `/api/audio/tts/voices/${v.id}/sample`);
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-rail text-ink hover:bg-ink hover:text-white"
                    >
                      {previewPlaying === `preset-${v.id}` ? (
                        <Pause size={9} aria-hidden />
                      ) : (
                        <Play size={9} aria-hidden />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {savedCustomVoices.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
                Your saved cloned voices
              </p>
              <div className="flex flex-wrap gap-1.5">
                {savedCustomVoices.map((cv) => {
                  const active = activeCustomVoiceId === cv.id;
                  return (
                    <button
                      key={cv.id}
                      type="button"
                      onClick={() => {
                        if (active) {
                          onSelectCustomVoice(null);
                          onChange({ cloneSource: "auto_vad" });
                        } else {
                          onSelectCustomVoice(cv.id);
                          onChange({ voiceMode: "clone", cloneSource: "saved_voice" });
                        }
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:text-ink"
                      }`}
                    >
                      {cv.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </PaidSection>

        {/* Delivery style */}
        <PaidSection title="Delivery tone" hint="Auto Drama 3 cues">
          <div className="grid grid-cols-2 gap-1.5">
            {DUB_TONES.map((tone) => {
              const active = settings.tone === tone.value;
              return (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => onChange({ tone: tone.value as DubTone })}
                  className={`rounded-[9px] border px-2.5 py-2 text-left transition-colors ${
                    active ? "border-ink bg-white" : "border-line bg-white/70 hover:bg-white"
                  }`}
                >
                  <p className="text-[11px] font-medium text-ink">{tone.label}</p>
                  <p className="mt-0.5 truncate text-[9.5px] text-faint">{tone.hint}</p>
                </button>
              );
            })}
          </div>
        </PaidSection>

        {/* Background mix & timing */}
        <PaidSection title="Audio mix & sync">
          <div className="space-y-3.5">
            <PaidToggle
              title="Duck ambience into MP3 output"
              description="Keep music and room tone alive beneath dubbed voiceover in downloaded audio."
              checked={settings.keepBackground}
              onChange={(checked) => onChange({ keepBackground: checked })}
            />

            {settings.keepBackground && (
              <PaidSlider
                label="Background level during speech"
                value={Math.round(settings.backgroundLevel * 100)}
                min={5}
                max={45}
                step={1}
                suffix="%"
                left="Subtle"
                right="Audible"
                onChange={(v) => onChange({ backgroundLevel: v / 100 })}
              />
            )}

            <PaidToggle
              title="Match scene timing"
              description="Time-fit longer translated phrases softly inside their timestamp slots."
              checked={settings.syncToTimeline}
              onChange={(checked) => onChange({ syncToTimeline: checked })}
            />
          </div>
        </PaidSection>

        <div className="rounded-[11px] border border-line bg-white p-3 text-[10.5px] leading-relaxed text-muted">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <Volume2 size={12} className="text-accent" aria-hidden />
            Zero video cloud storage
          </p>
          <p className="mt-1 text-faint">
            Only extracted audio goes to the server. Later, click Bind to Video to merge dual audio &amp; subtitles directly in your browser.
          </p>
        </div>
      </div>
    </PaidRail>
  );
}
