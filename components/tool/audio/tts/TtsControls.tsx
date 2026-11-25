"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Mic2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Field, Note, Segmented } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RAIL_CARD_ACTIVE, RAIL_CARD_IDLE } from "@/components/tool/studio/RailSection";
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

const TEXT_LINK =
  "inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-ink";

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
      className="grid grid-cols-3 gap-1 rounded-[12px] bg-card p-1"
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
            className={`h-9 rounded-[9px] px-2 text-[13px] font-medium transition-colors ${
              selected
                ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
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
      className="space-y-6"
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
      <span className="mr-1 text-[12.5px] font-medium text-muted">Add a cue</span>
      {DRAMA_EXPRESSION_TAGS.map((item) => (
        <button
          key={item.tag}
          type="button"
          title={`Insert ${item.tag} at the cursor`}
          onClick={() => onInsertTag(item.tag)}
          className="inline-flex h-7 items-center rounded-full border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent-deep"
        >
          {item.label}
        </button>
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
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
        playing
          ? "border-accent bg-accent text-white"
          : "border-line bg-white text-ink hover:border-[#cfc9bd] hover:bg-hover"
      }`}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : playing ? (
        <Square size={10} fill="currentColor" aria-hidden />
      ) : (
        <Play size={12} fill="currentColor" className="translate-x-[0.5px]" aria-hidden />
      )}
    </button>
  );
}

function SelectedMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${
        selected ? "border-ink bg-ink text-white" : "border-[#d7d2c8] bg-white text-transparent"
      }`}
    >
      <Check size={11} strokeWidth={3} />
    </span>
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
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, accent or tone"
                aria-label="Search voices"
                className="h-9 w-full rounded-[10px] border border-line bg-white pl-9 pr-8 text-[13px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear voice search"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink"
                >
                  <X size={13} aria-hidden />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter voices by type">
              {VOICE_CATEGORY_TABS.map((tab) => {
                const selected = category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(tab.id)}
                    className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
                      selected ? "bg-ink text-white" : "text-muted hover:bg-hover hover:text-ink"
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
          className="studio-main max-h-[236px] divide-y divide-line-soft overflow-y-auto rounded-[12px] border border-line bg-white"
          role="group"
          aria-label="Built-in voices"
        >
          {visibleVoices.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">
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
                  className={`relative flex items-center gap-1 pl-2 transition-colors ${
                    selected ? "bg-card" : "hover:bg-[#fbfaf8]"
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
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-1.5 pr-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{entry.name}</span>
                      <span className="block truncate text-[12px] text-faint">{entry.descriptor}</span>
                    </span>
                    <SelectedMark selected={selected} />
                  </button>

                  {isPlaying && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-accent transition-[width] duration-200"
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
          <ul className="mb-2.5 divide-y divide-line-soft overflow-hidden rounded-[12px] border border-line bg-white">
            {savedClones.map((entry) => {
              const selected = activeCloneId === entry.id;
              const cloneSampleKey = `clone:${entry.id}`;
              const isClonePlaying = playingKey === cloneSampleKey;

              return (
                <li
                  key={entry.id}
                  className={`flex items-center gap-1 pl-2 pr-1.5 transition-colors ${
                    selected ? "bg-card" : "hover:bg-[#fbfaf8]"
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
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-muted">
                      <Mic2 size={14} aria-hidden />
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPickClone(entry.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-1.5 pr-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{entry.name}</span>
                      <span className="block truncate text-[12px] text-faint">
                        Cloned{entry.durationLabel ? ` · ${entry.durationLabel} sample` : ""}
                      </span>
                    </span>
                    <SelectedMark selected={selected} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete cloned voice ${entry.name}`}
                    onClick={() => onDeleteClone(entry.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          aria-expanded={clonerOpen}
          onClick={onToggleCloner}
          className={buttonClasses("secondary", "md", "h-10 w-full rounded-[12px]")}
        >
          {clonerOpen ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {clonerOpen ? "Close voice cloner" : "Clone a voice"}
        </button>

        {cloner}
      </Field>

      <Field label="Language">
        <span className="relative block">
          <select
            value={settings.language}
            aria-label="Language"
            onChange={(e) => onPatch({ language: e.target.value as TtsLanguage })}
            className="h-10 w-full appearance-none rounded-[12px] border border-line bg-white px-3 pr-9 text-[13px] text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
          >
            {TTS_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden
          />
        </span>
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
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Speaking style">
          {TTS_STYLES.map((style) => {
            const selected = settings.style === style.value;
            return (
              <button
                key={style.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ style: style.value as TtsStyle })}
                className={`rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
                  selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                }`}
              >
                <span className="block text-[13px] font-medium text-ink">{style.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-faint">
                  {STYLE_HINTS[style.value]}
                </span>
              </button>
            );
          })}
        </div>
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

      <button
        type="button"
        onClick={() =>
          onPatch({
            speed: DEFAULT_TTS_SETTINGS.speed,
            pitch: DEFAULT_TTS_SETTINGS.pitch,
            style: DEFAULT_TTS_SETTINGS.style,
          })
        }
        className={TEXT_LINK}
      >
        <RotateCcw size={12} aria-hidden />
        Reset style, speed and pitch
      </button>
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
