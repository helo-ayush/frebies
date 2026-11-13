"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Mic2,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
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

function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {children}
      </span>
      {aside ? <span className="text-[11px] text-faint">{aside}</span> : null}
    </div>
  );
}

function chipClass(selected: boolean) {
  return selected
    ? "border-ink bg-ink text-white shadow-sm"
    : "border-line bg-white text-ink hover:border-ink/30 hover:bg-rail";
}

/* ------------------------------------------------------------------ */
/* Tab bar                                                             */
/* ------------------------------------------------------------------ */

const TAB_META: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "voice", label: "Voice", icon: <Volume2 size={13} aria-hidden /> },
  { id: "mood", label: "Mood", icon: <Smile size={13} aria-hidden /> },
  { id: "output", label: "Output", icon: <SlidersHorizontal size={13} aria-hidden /> },
];

export function SettingsTabs({
  value,
  onChange,
}: {
  value: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Voice settings"
      className="grid grid-cols-3 gap-1 rounded-xl bg-[#f3f3f1] p-1"
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
            onClick={() => onChange(tab.id)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-all ${
              selected
                ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.08)]"
                : "text-muted hover:text-ink"
            }`}
          >
            <span className={selected ? "text-accent" : ""}>{tab.icon}</span>
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
      className="space-y-5"
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted">
        <Sparkles size={12} className="text-accent" aria-hidden />
        Add emotion
      </span>
      {DRAMA_EXPRESSION_TAGS.map((item) => (
        <button
          key={item.tag}
          type="button"
          title={`Insert ${item.tag} at the cursor`}
          onClick={() => onInsertTag(item.tag)}
          className="inline-flex items-center rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink transition hover:border-accent/50 hover:bg-accent/[0.06] hover:text-[#a8432c]"
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
      <div>
        <SectionLabel aside={`${VOICES.length} voices`}>Voices</SectionLabel>

        <div className="overflow-hidden rounded-2xl border border-line bg-[#f7f7f5]">
          {VOICES.length > 6 && (
            <div className="space-y-2 border-b border-line/80 bg-white/85 p-2.5">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                  aria-hidden
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search voices, accents, or tone..."
                  aria-label="Search voices"
                  className="h-8 w-full rounded-lg border border-line bg-[#fafaf8] pl-8 pr-7 text-[12px] text-ink placeholder:text-faint/80 focus:border-ink/40 focus:bg-white focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear voice search"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-faint hover:bg-rail hover:text-ink"
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {VOICE_CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategory(tab.id)}
                    className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors ${chipClass(
                      category === tab.id,
                    )}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className="max-h-[240px] space-y-1.5 overflow-y-auto p-2"
            role="group"
            aria-label="Built-in voices"
          >
            {visibleVoices.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-faint">
                No voices matching &ldquo;{query.trim()}&rdquo;.
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
                    className={`group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all ${
                      selected
                        ? "border-ink bg-white ring-1 ring-inset ring-ink/15"
                        : isPlaying
                          ? "border-accent/60 bg-white ring-1 ring-inset ring-accent/15"
                          : "border-line/80 bg-white hover:border-ink/30"
                    }`}
                  >
                    <button
                      type="button"
                      data-sound="none"
                      aria-label={isPlaying ? `Stop ${entry.name} sample` : `Play ${entry.name} sample`}
                      aria-pressed={isPlaying}
                      title={isPlaying ? "Stop sample" : `Preview ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSample(sampleKey, `/api/audio/tts/voices/${encodeURIComponent(entry.id)}/sample`);
                      }}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors ${
                        isPlaying
                          ? "border-accent bg-accent text-white shadow-sm"
                          : "border-line bg-[#f7f7f5] text-ink hover:border-ink/40 hover:bg-rail"
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : isPlaying ? (
                        <Square size={10} fill="currentColor" aria-hidden />
                      ) : (
                        <Play size={11} fill="currentColor" className="translate-x-[0.5px]" aria-hidden />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPickPreset(entry.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-ink">
                            {entry.name}
                          </span>
                          <span className="shrink-0 rounded-md bg-[#f3f3f0] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            {entry.descriptor}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] leading-snug text-faint">
                          {entry.hint}
                        </span>
                      </span>

                      <span className="hidden shrink-0 sm:block" aria-hidden>
                        <MiniWaveform
                          bars={8}
                          height={16}
                          progress={isPlaying ? Math.max(0.15, sampleProgress) : selected ? 0.72 : 0.35}
                          seed={entry.seed}
                          tone={isPlaying ? "coral" : entry.tone}
                        />
                      </span>

                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line/90 text-transparent group-hover:border-ink/25"
                        }`}
                        aria-hidden
                      >
                        <Check size={10} strokeWidth={3} />
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {sampleError && (
          <p className="mt-1.5 text-[11px] text-rose-600" role="status">
            {sampleError}
          </p>
        )}
      </div>

      <div>
        <SectionLabel aside={savedClones.length ? `${savedClones.length}/4 saved` : "Your own voice"}>
          Cloned voices
        </SectionLabel>

        {savedClones.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {savedClones.map((entry) => {
              const selected = activeCloneId === entry.id;
              const cloneSampleKey = `clone:${entry.id}`;
              const isClonePlaying = playingKey === cloneSampleKey;

              return (
                <li
                  key={entry.id}
                  className={`flex items-center gap-1 rounded-xl border pr-1.5 transition-colors ${
                    selected
                      ? "border-ink bg-white ring-1 ring-inset ring-ink/15"
                      : "border-line bg-white hover:border-ink/30"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPickClone(entry.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        selected ? "bg-ink text-white" : "bg-accent/[0.1] text-accent"
                      }`}
                    >
                      <Mic2 size={13} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">
                        {entry.name}
                      </span>
                      <span className="block text-[10.5px] text-faint">
                        Cloned{entry.durationLabel ? ` · ${entry.durationLabel} sample` : ""}
                      </span>
                    </span>
                    {selected && (
                      <Check size={14} className="ml-auto shrink-0 text-ink" aria-hidden />
                    )}
                  </button>
                  {entry.audioBase64 && (
                    <button
                      type="button"
                      data-sound="none"
                      aria-label={isClonePlaying ? `Stop ${entry.name} sample` : `Play ${entry.name} sample`}
                      aria-pressed={isClonePlaying}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSample(cloneSampleKey, entry.audioBase64);
                      }}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition ${
                        isClonePlaying
                          ? "bg-accent text-white"
                          : "text-faint hover:bg-rail hover:text-ink"
                      }`}
                    >
                      {isClonePlaying ? (
                        <Square size={11} fill="currentColor" aria-hidden />
                      ) : (
                        <Play size={12} fill="currentColor" aria-hidden />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete cloned voice ${entry.name}`}
                    onClick={() => onDeleteClone(entry.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={13} aria-hidden />
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
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-[12px] font-medium transition-colors ${
            clonerOpen
              ? "border-accent bg-accent/[0.06] text-[#a8432c]"
              : "border-[#d6d4cc] bg-white text-ink hover:border-ink/40 hover:bg-rail"
          }`}
        >
          <Plus size={13} aria-hidden />
          {clonerOpen ? "Close voice cloner" : "Clone a new voice"}
        </button>

        {cloner}
      </div>

      <div>
        <SectionLabel>Language</SectionLabel>
        <span className="relative block">
          <select
            value={settings.language}
            onChange={(e) => onPatch({ language: e.target.value as TtsLanguage })}
            className="h-10 w-full appearance-none rounded-xl border border-line bg-white px-3 pr-9 text-[12.5px] text-ink outline-none transition hover:border-ink/30 focus:border-ink"
          >
            {TTS_LANGUAGES.map((language) => (
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
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mood tab                                                            */
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
      <div>
        <SectionLabel>Speaking mood</SectionLabel>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Speaking mood">
          {TTS_STYLES.map((style) => {
            const selected = settings.style === style.value;
            return (
              <button
                key={style.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ style: style.value as TtsStyle })}
                className={`rounded-xl border p-3 text-left transition-all ${
                  selected
                    ? "border-ink bg-white ring-1 ring-inset ring-ink/15"
                    : "border-line bg-white hover:border-ink/30 hover:shadow-sm"
                }`}
              >
                <span className="block text-[12.5px] font-semibold text-ink">{style.label}</span>
                <span className="mt-0.5 block text-[10.5px] leading-snug text-faint">
                  {STYLE_HINTS[style.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-white p-3.5">
        <PaidSlider
          label="Speaking speed"
          value={settings.speed}
          min={0.75}
          max={1.5}
          step={0.05}
          suffix="×"
          onChange={(speed) => onPatch({ speed: round2(speed) })}
          left="Slower"
          right="Faster"
        />
        <div className="border-t border-line-soft pt-4">
          <PaidSlider
            label="Voice pitch"
            value={settings.pitch}
            min={0.75}
            max={1.5}
            step={0.05}
            suffix="×"
            onChange={(pitch) => onPatch({ pitch: round2(pitch) })}
            left="Deeper"
            right="Brighter"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onPatch({
            speed: DEFAULT_TTS_SETTINGS.speed,
            pitch: DEFAULT_TTS_SETTINGS.pitch,
            style: DEFAULT_TTS_SETTINGS.style,
          })
        }
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink"
      >
        <RotateCcw size={11} aria-hidden />
        Reset mood &amp; pace
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Output tab                                                          */
/* ------------------------------------------------------------------ */

export function OutputPanel({
  settings,
  onPatch,
}: {
  settings: TtsSettings;
  onPatch: (patch: Partial<TtsSettings>) => void;
}) {
  return (
    <>
      <div>
        <SectionLabel>File format</SectionLabel>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="File format">
          {(["mp3", "wav"] as const).map((format) => {
            const selected = settings.format === format;
            return (
              <button
                key={format}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ format: format as TtsFormat })}
                className={`rounded-xl border p-3 text-left transition-all ${
                  selected
                    ? "border-ink bg-white ring-1 ring-inset ring-ink/15"
                    : "border-line bg-white hover:border-ink/30 hover:shadow-sm"
                }`}
              >
                <span className="block text-[12.5px] font-semibold uppercase text-ink">
                  {format}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-faint">
                  {format === "mp3" ? "Smaller files" : "Lossless quality"}
                </span>
              </button>
            );
          })}
        </div>

        {settings.format === "mp3" && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-faint">Quality</span>
            {TTS_BITRATES.map((bitrate) => {
              const selected = settings.bitrate === bitrate;
              return (
                <button
                  key={bitrate}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPatch({ bitrate })}
                  className={`h-7 rounded-full border px-3 text-[11px] font-medium tabular-nums transition-colors ${chipClass(selected)}`}
                >
                  {bitrate} kbps
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3.5 rounded-xl border border-line bg-white p-3.5">
        <PaidToggle
          title="Pause between paragraphs"
          description="Adds a natural breath when a paragraph ends."
          checked={settings.paragraphPauses}
          onChange={(paragraphPauses) => onPatch({ paragraphPauses })}
        />
        <div className="border-t border-line-soft pt-3.5">
          <PaidToggle
            title="Read numbers & dates clearly"
            description="Expands percentages, currency and dates."
            checked={settings.emphasizeNumbers}
            onChange={(emphasizeNumbers) => onPatch({ emphasizeNumbers })}
          />
        </div>
        <div className="border-t border-line-soft pt-3.5">
          <PaidToggle
            title="Embed file info"
            description="Stores the voice name and script title in the file."
            checked={settings.metadata}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      </div>
    </>
  );
}
