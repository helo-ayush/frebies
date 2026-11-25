"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2, Mic2, Plus, Search, Trash2, X } from "lucide-react";
import { Field, Note, Segmented, ToolIcon, ToolText } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailCards, RailMark, RailReset } from "@/components/tool/studio/RailControls";
import { buttonClasses } from "@/components/ui/Button";
import {
  DEFAULT_TTS_SETTINGS,
  DRAMA_EXPRESSION_TAGS,
  TTS_BITRATES,
  TTS_LANGUAGES,
  TTS_STYLES,
  VOICES,
  type SavedCustomVoice,
  type TtsFormat,
  type TtsLanguage,
  type TtsSettings,
  type TtsStyle,
  type VoiceCategory,
  type VoiceId,
} from "./model";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export type SettingsTab = "voice" | "mood" | "output";

const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ */
/* Tab bar                                                             */
/* ------------------------------------------------------------------ */

const TAB_META: { id: SettingsTab; label: string }[] = [
  { id: "voice", label: "Voice" },
  { id: "mood", label: "Delivery" },
  { id: "output", label: "Output" },
];

export function SettingsTabs({
  value,
  onChange,
}: {
  value: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TAB_META.findIndex((tab) => tab.id === value);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TAB_META[(index + step + TAB_META.length) % TAB_META.length];
    onChange(next.id);
    document.getElementById(`tts-tab-${next.id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Voice settings"
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 border border-line-strong bg-white"
    >
      {TAB_META.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tts-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`tts-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative h-11 border-l border-line-strong px-2 text-[13.5px] font-semibold uppercase transition-colors first:border-l-0 ${
              selected ? "bg-ink text-white" : "hover:bg-hover"
            }`}
          >
            {tab.label}
            {selected ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tab,
  active,
  children,
}: {
  tab: SettingsTab;
  active: SettingsTab;
  children: ReactNode;
}) {
  if (tab !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`tts-panel-${tab}`}
      aria-labelledby={`tts-tab-${tab}`}
      className="space-y-7"
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Emotion cue bar (sits directly under the script)                     */
/* ------------------------------------------------------------------ */

export function CueBar({ onInsertTag }: { onInsertTag: (tag: string) => void }) {
  return (
    <div role="group" aria-label="Insert an emotion cue" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1.5 text-[13px] text-muted">Add a cue</span>
      {DRAMA_EXPRESSION_TAGS.map((item) => (
        <ToolText key={item.tag} title={`Insert ${item.tag} at the cursor`} onClick={() => onInsertTag(item.tag)} className="!h-8 !px-2.5 !normal-case">
          {item.label}
        </ToolText>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Voice tab                                                           */
/* ------------------------------------------------------------------ */

const VOICE_CATEGORY_TABS: { id: VoiceCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "narration", label: "Narration" },
  { id: "conversational", label: "Natural" },
  { id: "storytelling", label: "Stories" },
  { id: "documentary", label: "Deep" },
];

/** Round play / stop button for a voice sample. */
function SampleButton({
  name,
  playing,
  loading,
  onToggle,
}: {
  name: string;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-sound="none"
      aria-label={playing ? `Stop ${name} sample` : `Play ${name} sample`}
      aria-pressed={playing}
      title={playing ? "Stop sample" : `Hear ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      data-playing={playing || undefined}
      className="fb-play fb-play-sm h-8 w-8 shrink-0"
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : playing ? (
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1 1h8v8H1z" />
        </svg>
      ) : (
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 .8 11 6l-8 5.2z" />
        </svg>
      )}
    </button>
  );
}

export function VoicePanel({
  settings,
  activeCloneId,
  savedClones,
  clonerOpen,
  cloner,
  onPickPreset,
  onPickClone,
  onDeleteClone,
  onToggleCloner,
  onPatch,
}: {
  settings: TtsSettings;
  activeCloneId: string | null;
  savedClones: SavedCustomVoice[];
  clonerOpen: boolean;
  cloner: ReactNode;
  onPickPreset: (id: VoiceId) => void;
  onPickClone: (id: string) => void;
  onDeleteClone: (id: string) => void;
  onToggleCloner: () => void;
  onPatch: (patch: Partial<TtsSettings>) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [category, setCategory] = useState<VoiceCategory>("all");
  const [query, setQuery] = useState("");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [sampleProgress, setSampleProgress] = useState(0);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const stopPreview = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingKey(null);
    setLoadingKey(null);
    setSampleProgress(0);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const toggleSample = (key: string, src: string) => {
    setSampleError(null);
    if (playingKey === key || loadingKey === key) {
      stopPreview();
      return;
    }

    stopPreview();
    setLoadingKey(key);

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;

    audio.onplaying = () => {
      setLoadingKey((cur) => (cur === key ? null : cur));
      setPlayingKey(key);
    };
    audio.ontimeupdate = () => {
      if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) {
        setSampleProgress(Math.min(1, audio.currentTime / audio.duration));
      }
    };
    audio.onended = () => {
      setPlayingKey(null);
      setLoadingKey(null);
      setSampleProgress(0);
    };
    audio.onerror = () => {
      setPlayingKey(null);
      setLoadingKey(null);
      setSampleProgress(0);
      setSampleError("Could not play voice sample.");
    };

    audio.src = src;
    audio.load();
    void audio.play().catch(() => {
      setPlayingKey(null);
      setLoadingKey(null);
      setSampleProgress(0);
      setSampleError("Could not play voice sample.");
    });
  };

  const visibleVoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOICES.filter((entry) => {
      if (VOICES.length > 6 && category !== "all" && entry.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.descriptor.toLowerCase().includes(q) ||
        entry.hint.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  return (
    <>
      <Field label="Voice" hint={`${VOICES.length} voices`}>
        {VOICES.length > 6 && (
          <div className="mb-2.5 space-y-2">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, accent or tone"
                aria-label="Search voices"
                className="fb-input !pl-10 !pr-11"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear voice search"
                  onClick={() => setQuery("")}
                  className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted transition-colors hover:text-accent-deep"
                >
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>

            <div className="flex overflow-x-auto" role="group" aria-label="Filter voices by type">
              {VOICE_CATEGORY_TABS.map((tab) => {
                const selected = category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(tab.id)}
                    className={`-ml-px h-9 flex-1 border px-2 text-[12.5px] font-medium transition-colors first:ml-0 ${
                      selected ? "relative z-[1] border-ink bg-ink text-white" : "border-line-strong bg-white hover:bg-hover"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          className="studio-main max-h-[clamp(236px,38vh,400px)] overflow-y-auto border border-line-strong bg-white"
          role="group"
          aria-label="Built-in voices"
        >
          {visibleVoices.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-muted">
              No voices match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            visibleVoices.map((entry) => {
              const selected = !activeCloneId && settings.voice === entry.id;
              const sampleKey = `preset:${entry.id}`;
              const isPlaying = playingKey === sampleKey;
              const isLoading = loadingKey === sampleKey;

              return (
                <div
                  key={entry.id}
                  className={`relative flex items-center border-b border-line pl-3 transition-colors last:border-b-0 ${
                    selected ? "bg-ink text-white" : "hover:bg-hover"
                  }`}
                >
                  <SampleButton
                    name={entry.name}
                    playing={isPlaying}
                    loading={isLoading}
                    onToggle={() =>
                      toggleSample(sampleKey, `/api/audio/tts/voices/${encodeURIComponent(entry.id)}/sample`)
                    }
                  />

                  <button
                    type="button"
                    aria-pressed={selected}
                    title={entry.hint}
                    onClick={() => onPickPreset(entry.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{entry.name}</span>
                      <span className={`block truncate text-[13px] ${selected ? "text-white/60" : "text-muted"}`}>
                        {entry.descriptor}
                      </span>
                    </span>
                    <RailMark on={selected} />
                  </button>

                  {isPlaying && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.max(4, sampleProgress * 100)}%` }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {sampleError && (
          <Note tone="error" className="mt-2">
            {sampleError}
          </Note>
        )}
      </Field>

      <Field label="Your own voice" hint={savedClones.length ? `${savedClones.length} of 4 saved` : undefined}>
        {savedClones.length > 0 && (
          <ul className="mb-2.5 border border-line-strong bg-white">
            {savedClones.map((entry) => {
              const selected = activeCloneId === entry.id;
              const cloneSampleKey = `clone:${entry.id}`;
              const isClonePlaying = playingKey === cloneSampleKey;

              return (
                <li
                  key={entry.id}
                  className={`flex items-center border-b border-line pl-3 pr-2 transition-colors last:border-b-0 ${
                    selected ? "bg-ink text-white" : "hover:bg-hover"
                  }`}
                >
                  {entry.audioBase64 ? (
                    <SampleButton
                      name={entry.name}
                      playing={isClonePlaying}
                      loading={loadingKey === cloneSampleKey}
                      onToggle={() => toggleSample(cloneSampleKey, entry.audioBase64)}
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center bg-canvas text-ink">
                      <Mic2 size={15} aria-hidden />
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPickClone(entry.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{entry.name}</span>
                      <span className={`block truncate text-[13px] ${selected ? "text-white/60" : "text-muted"}`}>
                        Cloned{entry.durationLabel ? ` · ${entry.durationLabel} sample` : ""}
                      </span>
                    </span>
                    <RailMark on={selected} />
                  </button>
                  <ToolIcon
                    label={`Delete cloned voice ${entry.name}`}
                    slot="clone-remove"
                    onClick={() => onDeleteClone(entry.id)}
                  >
                    <Trash2 size={15} aria-hidden />
                  </ToolIcon>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          aria-expanded={clonerOpen}
          onClick={onToggleCloner}
          className={buttonClasses("secondary", "md", "!h-11 w-full !text-[13px]")}
        >
          {clonerOpen ? <X size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          {clonerOpen ? "Close voice cloner" : "Clone a voice"}
        </button>

        {cloner}
      </Field>

      <Field label="Language">
        <select
          value={settings.language}
          aria-label="Language"
          onChange={(e) => onPatch({ language: e.target.value as TtsLanguage })}
          className="fb-input cursor-pointer"
        >
          {TTS_LANGUAGES.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Delivery tab                                                        */
/* ------------------------------------------------------------------ */

const STYLE_HINTS: Record<TtsStyle, string> = {
  neutral: "Even and clear",
  conversational: "Like chatting to a friend",
  narration: "Measured storytelling",
  cheerful: "Upbeat and warm",
};

export function MoodPanel({
  settings,
  onPatch,
}: {
  settings: TtsSettings;
  onPatch: (patch: Partial<TtsSettings>) => void;
}) {
  return (
    <>
      <Field label="Speaking style">
        <RailCards
          label="Speaking style"
          value={settings.style}
          options={TTS_STYLES.map((style) => ({
            value: style.value as TtsStyle,
            label: style.label,
            note: STYLE_HINTS[style.value as TtsStyle],
          }))}
          onChange={(style) => onPatch({ style })}
        />
      </Field>

      <PaidSlider
        label="Speed"
        value={settings.speed}
        min={0.75}
        max={1.5}
        step={0.05}
        suffix="×"
        onChange={(speed) => onPatch({ speed: round2(speed) })}
        left="Slower"
        right="Faster"
      />

      <PaidSlider
        label="Pitch"
        value={settings.pitch}
        min={0.75}
        max={1.5}
        step={0.05}
        suffix="×"
        onChange={(pitch) => onPatch({ pitch: round2(pitch) })}
        left="Deeper"
        right="Brighter"
      />

      <RailReset
        label="Reset style, speed and pitch"
        onClick={() =>
          onPatch({
            speed: DEFAULT_TTS_SETTINGS.speed,
            pitch: DEFAULT_TTS_SETTINGS.pitch,
            style: DEFAULT_TTS_SETTINGS.style,
          })
        }
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Output tab                                                          */
/* ------------------------------------------------------------------ */

const FORMAT_OPTIONS: { value: TtsFormat; label: string }[] = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
];

export function OutputPanel({
  settings,
  onPatch,
}: {
  settings: TtsSettings;
  onPatch: (patch: Partial<TtsSettings>) => void;
}) {
  return (
    <>
      <Field label="File format" hint={settings.format === "mp3" ? "Smaller files" : "Lossless, larger files"}>
        <Segmented
          label="File format"
          options={FORMAT_OPTIONS}
          value={settings.format}
          onChange={(format) => onPatch({ format })}
        />
      </Field>

      {settings.format === "mp3" && (
        <Field label="MP3 quality">
          <Segmented
            label="MP3 quality"
            options={TTS_BITRATES.map((bitrate) => ({
              value: String(bitrate),
              label: `${bitrate} kbps`,
            }))}
            value={String(settings.bitrate)}
            onChange={(bitrate) => onPatch({ bitrate: Number(bitrate) })}
          />
        </Field>
      )}

      <div className="space-y-4">
        <PaidToggle
          title="Pause between paragraphs"
          description="Adds a natural breath when a paragraph ends."
          checked={settings.paragraphPauses}
          onChange={(paragraphPauses) => onPatch({ paragraphPauses })}
        />
        <PaidToggle
          title="Read numbers and dates clearly"
          description="Expands percentages, currency and dates."
          checked={settings.emphasizeNumbers}
          onChange={(emphasizeNumbers) => onPatch({ emphasizeNumbers })}
        />
        <PaidToggle
          title="Embed file info"
          description="Stores the voice name and script title in the file."
          checked={settings.metadata}
          onChange={(metadata) => onPatch({ metadata })}
        />
      </div>
    </>
  );
}
