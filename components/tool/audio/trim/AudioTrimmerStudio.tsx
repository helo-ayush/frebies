"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Scissors, ShieldCheck, TriangleAlert } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer, type AudioSelection } from "@/components/tool/audio/AudioPlayer";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import {
  estimateEncodedBytes,
  estimatePcmBytes,
  fileFormatLabel,
  formatBytes,
  formatTime,
  parseTimeInput,
} from "@/components/tool/audio/format";
import {
  DEFAULT_TRIM_SETTINGS,
  TRIM_BITRATES,
  TRIM_FORMATS,
  trimFormatName,
  type TrimFormat,
  type TrimSettings,
} from "./model";

export function AudioTrimmerStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<TrimSettings>(DEFAULT_TRIM_SETTINGS);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item) {
      setSelection(null);
      initializedRef.current = null;
      return;
    }
    if (item.duration <= 0 || initializedRef.current === item.id) return;
    initializedRef.current = item.id;
    const start = Math.max(0, item.duration * 0.2);
    const end = Math.min(item.duration, Math.max(start + 0.2, item.duration * 0.8));
    setSelection({ start, end });
  }, [item]);

  const trimDuration = selection ? Math.max(0, selection.end - selection.start) : 0;
  const estimated = item
    ? settings.format === "wav"
      ? estimatePcmBytes(trimDuration, 44100, 2)
      : estimateEncodedBytes(trimDuration, settings.bitrate)
    : 0;
  const minGap = item ? Math.min(0.2, item.duration / 20) : 0.2;

  function patch(next: Partial<TrimSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    setNotice(null);
  }

  function resetSelection() {
    if (!item) return;
    setSelection({
      start: item.duration * 0.2,
      end: Math.min(item.duration, Math.max(item.duration * 0.2 + 0.2, item.duration * 0.8)),
    });
    setNotice(null);
  }

  return (
    <section
      id="audio-trim"
      aria-label="Audio trimming studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/audio/trim" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Waveform studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Select a passage · keep the good part.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8fae9f]" aria-hidden />
            On-device
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Audio stays local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[720px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!item ? (
            <AudioDropzone
              title="Drop audio to trim"
              description="Load one clip, drag the selection across the waveform and preview the loop before exporting."
              buttonLabel="Choose audio"
              limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Scissors size={9} className="text-accent" aria-hidden />
                    Drag handles
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Check size={9} aria-hidden />
                    Fades
                  </span>
                </>
              }
            />
          ) : (
            <>
              <div className="rounded-[16px] border border-line bg-[#faf8f3] p-2.5">
                <AudioPlayer
                  src={item.url}
                  duration={item.duration}
                  peaks={item.peaks}
                  fileName={item.name}
                  formatLabel={fileFormatLabel(item.file)}
                  selection={selection ?? undefined}
                  onSelectionChange={setSelection}
                  loopSelection
                />
              </div>

              <AudioFileMeta
                item={item}
                formatLabel={fileFormatLabel(item.file)}
                onReplace={() => openPicker()}
                onRemove={() => {
                  clear();
                  setNotice(null);
                }}
              />

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-[13px] border border-line bg-white p-3.5">
                <SelectionStat label="Start" value={selection ? formatTime(selection.start, true) : "—"} />
                <SelectionStat label="End" value={selection ? formatTime(selection.end, true) : "—"} />
                <SelectionStat
                  label="Selection"
                  value={selection ? formatTime(trimDuration, true) : "—"}
                  accent
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[13px] border border-line bg-white p-3.5">
                <div className="min-w-0">
                  <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">
                    Trim plan
                  </p>
                  <p className="mt-0.5 text-[11.5px] font-medium tabular-nums text-ink">
                    {formatTime(item.duration, true)} → {formatTime(trimDuration, true)}
                  </p>
                </div>
                <ArrowRight size={12} className="shrink-0 text-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">
                    Output
                  </p>
                  <p className="mt-0.5 text-[11.5px] font-medium text-ink">
                    {trimFormatName(settings.format)} · ≈ {formatBytes(estimated)}
                  </p>
                </div>
                <span className="rounded-full border border-line bg-[#fbfaf7] px-2 py-0.5 text-[9.5px] text-muted">
                  {settings.format === "wav" ? "PCM" : `${settings.bitrate} kbps`}
                </span>
              </div>

              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Drag either orange handle on the waveform. Playback loops inside the
                selection.
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
            tabIndex={-1}
            aria-label="Choose an audio file"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} aria-hidden />
              Free · no upload · no watermark
            </p>
            <button
              type="button"
              onClick={() =>
                setNotice(
                  "The selection is ready. The trim engine is connected in the next build step — the audio stays on this device.",
                )
              }
              disabled={!item || !selection}
              className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[140px]")}
            >
              Trim audio
              <ArrowRightGlyph size={13} />
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <StudioRail label="Trim settings">
          <div className="space-y-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-ui font-semibold text-ink">Selection</h3>
              <button
                type="button"
                onClick={resetSelection}
                disabled={!item || !item.duration}
                className="text-[10px] font-medium text-faint transition-colors hover:text-ink disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <TimeField
                label="Start"
                value={selection?.start ?? 0}
                min={0}
                max={selection ? Math.max(0, selection.end - minGap) : 0}
                disabled={!selection}
                onCommit={(value) =>
                  setSelection((current) => (current ? { ...current, start: value } : current))
                }
              />
              <TimeField
                label="End"
                value={selection?.end ?? 0}
                min={selection ? Math.min(selection.start + minGap, selection.end) : 0}
                max={item?.duration ?? 0}
                disabled={!selection}
                onCommit={(value) =>
                  setSelection((current) => (current ? { ...current, end: value } : current))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10.5px]">
              <span className="text-muted">Selected length</span>
              <span className="font-medium tabular-nums text-ink">{formatTime(trimDuration, true)}</span>
            </div>

            <div className="border-t border-line-soft pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-ui font-semibold text-ink">Fades</h3>
                <span className="text-[10px] text-faint">Seconds</span>
              </div>
              <div className="mt-3 space-y-4">
                <FadeSlider
                  label="Fade in"
                  value={settings.fadeIn}
                  onChange={(fadeIn) => patch({ fadeIn })}
                />
                <FadeSlider
                  label="Fade out"
                  value={settings.fadeOut}
                  onChange={(fadeOut) => patch({ fadeOut })}
                />
              </div>
            </div>

            <div className="border-t border-line-soft pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-ui font-semibold text-ink">Output</h3>
                <span className="text-[10px] text-faint">{trimFormatName(settings.format)}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {TRIM_FORMATS.map((format) => {
                  const selected = settings.format === format.value;
                  return (
                    <button
                      key={format.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => patch({ format: format.value as TrimFormat })}
                      className={`rounded-[8px] border py-2 text-center transition-colors ${
                        selected
                          ? "border-ink bg-rail text-ink"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      }`}
                    >
                      <span className="block text-[11.5px] font-medium">{format.label}</span>
                      <span className="mt-0.5 block text-[9px] text-faint">{format.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {TRIM_BITRATES.map((bitrate) => {
                  const selected = settings.bitrate === bitrate;
                  return (
                    <button
                      key={bitrate}
                      type="button"
                      disabled={settings.format === "wav"}
                      aria-pressed={selected}
                      onClick={() => patch({ bitrate })}
                      className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                        selected && settings.format !== "wav"
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      } disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      {bitrate}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-line-soft pt-4">
              <span>
                <span className="block text-[11.5px] font-medium text-ink">Keep metadata</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
                  Keep title and artist tags on the clip.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.metadata}
                onChange={(event) => patch({ metadata: event.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
              />
            </label>

            <div className="rounded-[11px] border border-line bg-white p-3.5">
              <div className="flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Format</span>
                <span className="font-medium text-ink">{trimFormatName(settings.format)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Length</span>
                <span className="font-medium tabular-nums text-ink">{formatTime(trimDuration, true)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Estimated size</span>
                <span className="font-medium tabular-nums text-ink">
                  {item ? `≈ ${formatBytes(estimated)}` : "—"}
                </span>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              Playback and waveform analysis are real and local. The trim engine is
              connected in the next build step.
            </p>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}

function SelectionStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">{label}</p>
      <p
        className={`mt-0.5 text-[12px] font-semibold tabular-nums ${
          accent ? "text-[#a8432c]" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TimeField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(formatTime(value, true));

  useEffect(() => {
    setText(formatTime(value, true));
  }, [value]);

  function commit() {
    const parsed = parseTimeInput(text);
    if (parsed === null) {
      setText(formatTime(value, true));
      return;
    }
    const next = Math.min(Math.max(min, parsed), max);
    setText(formatTime(next, true));
    onCommit(next);
  }

  return (
    <label className="block">
      <span className="block text-[10.5px] font-medium text-muted">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          aria-label={`${label} time`}
          className="h-9 w-full rounded-[9px] border border-line bg-white px-2.5 text-[11.5px] font-medium tabular-nums text-ink outline-none transition-colors focus:border-[#c3beb4] disabled:opacity-45"
        />
      </span>
    </label>
  );
}

function FadeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="font-medium text-muted">{label}</span>
        <span className="tabular-nums text-faint">{value.toFixed(1)} s</span>
      </div>
      <input
        type="range"
        min={0}
        max={3}
        step={0.1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        style={rangeFill(value, 0, 3)}
        className="range mt-1.5"
      />
    </div>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
