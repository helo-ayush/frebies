"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Scissors,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer, type AudioSelection } from "@/components/tool/audio/AudioPlayer";
import { computePeaks, useAudioFile } from "@/components/tool/audio/useAudioFile";
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
import { ConversionCancelled, cancelEngine } from "../converter/engine";
import { trimAudio } from "./engine";

type Phase = "idle" | "running" | "done" | "error";

type TrimOutcome = {
  url: string;
  size: number;
  duration: number;
  peaks: number[];
  format: TrimFormat;
  bitrate: number;
  baseName: string;
};

const STRUCTURAL_KEYS: (keyof TrimSettings)[] = [
  "format",
  "bitrate",
  "fadeIn",
  "fadeOut",
  "metadata",
];

export function AudioTrimmerStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<TrimSettings>(DEFAULT_TRIM_SETTINGS);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ value: 0, label: "Preparing…" });
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<TrimOutcome | null>(null);
  const [stale, setStale] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const initializedRef = useRef<string | null>(null);

  const resultRef = useRef<TrimOutcome | null>(null);
  const runIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  resultRef.current = result;

  function revokeResult() {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = null;
    }
    setResult(null);
  }

  // A fresh source file starts with a 20%–80% selection.
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

  // A new source file invalidates any previous trim.
  useEffect(() => {
    runIdRef.current += 1;
    cancelledRef.current = true;
    cancelEngine();
    revokeResult();
    setPhase("idle");
    setRunError(null);
    setStale(false);
    setProgress({ value: 0, label: "Preparing…" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useEffect(
    () => () => {
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );

  const trimDuration = selection ? Math.max(0, selection.end - selection.start) : 0;
  const estimated = item
    ? settings.format === "wav"
      ? estimatePcmBytes(trimDuration, item.sampleRate || 44100, item.channels || 2)
      : estimateEncodedBytes(trimDuration, settings.bitrate)
    : 0;
  const minGap = item ? Math.min(0.2, item.duration / 20) : 0.2;
  const sourceFormat = item ? fileFormatLabel(item.file) : "—";
  const busy = phase === "running";
  const canRun = Boolean(item && !item.decoding && item.buffer && selection && trimDuration > 0 && !busy);
  const decodeFailed = Boolean(item && !item.decoding && !item.buffer);
  const advancedModified =
    settings.fadeIn !== DEFAULT_TRIM_SETTINGS.fadeIn ||
    settings.fadeOut !== DEFAULT_TRIM_SETTINGS.fadeOut ||
    settings.metadata !== DEFAULT_TRIM_SETTINGS.metadata;
  const advancedSummary = `${settings.fadeIn.toFixed(1)}s in · ${settings.fadeOut.toFixed(1)}s out`;

  function patch(next: Partial<TrimSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    if (STRUCTURAL_KEYS.some((key) => next[key] !== undefined)) setStale(true);
    setRunError(null);
  }

  function updateSelection(next: AudioSelection) {
    setSelection(next);
    setStale(true);
  }

  function resetSelection() {
    if (!item) return;
    updateSelection({
      start: item.duration * 0.2,
      end: Math.min(item.duration, Math.max(item.duration * 0.2 + 0.2, item.duration * 0.8)),
    });
  }

  async function runTrim() {
    const source = item?.buffer;
    if (!item || !source || !selection || busy || !canRun) return;
    const usedSelection = { ...selection };
    const usedSettings = { ...settings };
    setPhase("running");
    setProgress({ value: 0, label: "Preparing…" });
    setRunError(null);
    setStale(false);
    cancelledRef.current = false;
    const runId = ++runIdRef.current;

    cancelRef.current = () => {
      cancelledRef.current = true;
      cancelEngine();
    };

    try {
      const trimmed = await trimAudio(
        source,
        usedSelection,
        usedSettings,
        item.name,
        (value, label) => {
          if (runIdRef.current === runId) setProgress({ value, label });
        },
        () => cancelledRef.current || runIdRef.current !== runId,
      );
      if (cancelledRef.current || runIdRef.current !== runId) return;

      const outcome = await describeTrimmed(trimmed.blob, usedSettings, item, usedSelection);
      if (cancelledRef.current || runIdRef.current !== runId) {
        URL.revokeObjectURL(outcome.url);
        return;
      }
      revokeResult();
      resultRef.current = outcome;
      setResult(outcome);
      setPhase("done");
      setProgress({ value: 1, label: "Done" });
    } catch (trimError) {
      if (
        trimError instanceof ConversionCancelled ||
        cancelledRef.current ||
        runIdRef.current !== runId
      ) {
        setPhase("idle");
        return;
      }
      setRunError(trimError instanceof Error ? trimError.message : "Trimming failed. Try again.");
      setPhase("error");
    } finally {
      cancelRef.current = null;
    }
  }

  function cancelRun() {
    cancelRef.current?.();
    setPhase("idle");
    setProgress({ value: 0, label: "Preparing…" });
  }

  async function describeTrimmed(
    blob: Blob,
    usedSettings: TrimSettings,
    source: NonNullable<typeof item>,
    usedSelection: AudioSelection,
  ) {
    const url = URL.createObjectURL(blob);
    try {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      await context.close();
      return {
        url,
        size: blob.size,
        duration: decoded.duration,
        peaks: computePeaks(decoded.getChannelData(0)),
        format: usedSettings.format,
        bitrate: usedSettings.bitrate,
        baseName: source.name.replace(/\.[^.]+$/, ""),
      };
    } catch {
      const total = source.duration || 1;
      const from = Math.floor((usedSelection.start / total) * source.peaks.length);
      const to = Math.ceil((usedSelection.end / total) * source.peaks.length);
      return {
        url,
        size: blob.size,
        duration: usedSelection.end - usedSelection.start,
        peaks: source.peaks.slice(from, to),
        format: usedSettings.format,
        bitrate: usedSettings.bitrate,
        baseName: source.name.replace(/\.[^.]+$/, ""),
      };
    }
  }

  const downloadName = result ? `${result.baseName}-trimmed.${result.format}` : "";

  return (
    <section
      id="audio-trim"
      aria-label="Audio trimming studio"
      className="scroll-mt-20 rounded-[26px] border border-line bg-white"
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe8e0] bg-[#f3f8f3] px-2.5 py-1 text-[10px] font-medium text-[#3f6b4f]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4f8a63]" aria-hidden />
            Engine live
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Audio stays local
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
        <div className="studio-main flex min-h-0 min-w-0 flex-col p-4 sm:p-5 lg:min-h-[100vh]">
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
              <div className="lg:sticky lg:top-[76px] lg:z-10 lg:-mx-5 lg:bg-white lg:px-5 lg:pb-3">
                <div className="rounded-[16px] border border-line bg-[#faf8f3] p-2.5">
                  <AudioPlayer
                    src={item.url}
                    duration={item.duration}
                    peaks={item.peaks}
                    fileName={item.name}
                    formatLabel={sourceFormat}
                    selection={selection ?? undefined}
                    onSelectionChange={updateSelection}
                    loopSelection
                  />
                </div>

                <AudioFileMeta
                  item={item}
                  formatLabel={sourceFormat}
                  onReplace={() => openPicker()}
                  onRemove={() => {
                    clear();
                    setRunError(null);
                  }}
                />
              </div>

              {decodeFailed && (
                <p
                  role="alert"
                  className="mt-2.5 flex items-start gap-1.5 rounded-[11px] border border-[#f0d8d1] bg-[#fdf4f1] px-3 py-2.5 text-ui leading-relaxed text-[#a13d30]"
                >
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                  This file could not be decoded in your browser. Try an MP3, WAV, M4A or OGG file.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[13px] border border-line bg-white p-3.5">
                <div className="min-w-0">
                  <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-faint">
                    Source
                  </p>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-ink">
                    {sourceFormat} · {formatTime(item.duration)}
                  </p>
                </div>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-[#fbfaf7] text-faint">
                  <ArrowRight size={12} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-faint">
                    Output
                  </p>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-ink">
                    {trimFormatName(settings.format)} ·{" "}
                    {settings.format === "wav" ? "PCM" : `${settings.bitrate} kbps`} ·{" "}
                    <span className="font-semibold">≈ {formatBytes(estimated)}</span>
                  </p>
                </div>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9.5px] font-medium text-[#a8432c]">
                  {formatTime(trimDuration, true)} selected
                </span>
              </div>

              {result && (
                <TrimmedCard
                  outcome={result}
                  stale={stale}
                  sourceSize={item.size}
                  summary={trimSummary(result)}
                  downloadName={downloadName}
                  onRemove={() => {
                    revokeResult();
                    setPhase("idle");
                    setStale(false);
                  }}
                />
              )}

              <div className="mt-3 flex items-start gap-3 rounded-[13px] border border-line bg-[#fbfaf7] p-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-[#557a68]">
                  <ShieldCheck size={14} aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink">Local by design</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    Playback, waveform and trimming run on your device. The first MP3, M4A or
                    OGG export downloads the encoding engine once (≈ 32 MB). WAV exports are
                    instant.
                  </p>
                </div>
              </div>
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

          <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4">
            {busy ? (
              <div className="w-full">
                <div className="flex items-center justify-between gap-3 text-micro">
                  <span className="flex min-w-0 items-center gap-2 truncate text-muted">
                    <Loader2 size={12} className="shrink-0 animate-spin text-accent" aria-hidden />
                    {progress.label}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-ink">
                    {Math.round(progress.value * 100)}%
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e9e4da]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.value * 100)}
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.round(progress.value * 100)}%` }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-micro text-faint">
                    <ShieldCheck size={12} aria-hidden />
                    Everything stays on this device
                  </p>
                  <button
                    type="button"
                    onClick={cancelRun}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-micro font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={11} aria-hidden />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-micro text-faint">
                  <ShieldCheck size={12} aria-hidden />
                  Free · no upload · no watermark
                </p>
                <button
                  type="button"
                  onClick={() => void runTrim()}
                  disabled={!canRun}
                  className={buttonClasses(
                    "primary",
                    "md",
                    "w-full min-w-0 sm:w-auto sm:min-w-[140px]",
                  )}
                >
                  {item?.decoding ? (
                    <>
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                      Reading audio…
                    </>
                  ) : (
                    <>
                      Trim audio
                      <ArrowRightGlyph size={13} />
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {runError && phase === "error" && (
            <p
              role="alert"
              className="mt-3 shrink-0 rounded-[10px] border border-[#f0d8d1] bg-[#fdf4f1] px-3 py-2.5 text-micro leading-relaxed text-[#a13d30]"
            >
              {runError}
            </p>
          )}
        </div>

        <StudioRail label="Trim settings" sticky>
          <div className="space-y-4">
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
                onCommit={(value) => {
                  if (selection) updateSelection({ ...selection, start: value });
                }}
              />
              <TimeField
                label="End"
                value={selection?.end ?? 0}
                min={selection ? Math.min(selection.start + minGap, selection.end) : 0}
                max={item?.duration ?? 0}
                disabled={!selection}
                onCommit={(value) => {
                  if (selection) updateSelection({ ...selection, end: value });
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10.5px]">
              <span className="text-muted">Selected length</span>
              <span className="font-medium tabular-nums text-ink">{formatTime(trimDuration, true)}</span>
            </div>

            <div className="border-t border-line-soft pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-ui font-semibold text-ink">Output</h3>
                <span className="text-[10px] text-faint">{trimFormatName(settings.format)}</span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {TRIM_FORMATS.map((format) => {
                  const selected = settings.format === format.value;
                  return (
                    <button
                      key={format.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => patch({ format: format.value as TrimFormat })}
                      className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-ink bg-rail text-ink"
                          : "border-line bg-white text-muted hover:border-[#d5d1c8] hover:text-ink"
                      }`}
                    >
                      <span className="block text-[13px] font-medium">{format.label}</span>
                      <span className="mt-0.5 block text-[9.5px] text-faint">{format.hint}</span>
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
              <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                {settings.format === "wav"
                  ? "WAV keeps uncompressed PCM — bitrate does not apply."
                  : settings.format === "m4a"
                    ? "M4A uses a constant bitrate (AAC)."
                    : "Higher bitrate keeps more detail."}
              </p>
            </div>

            <div className="rounded-[11px] border border-line bg-white p-3.5">
              <div className="flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Output</span>
                <span className="font-medium text-ink">
                  {trimFormatName(settings.format)} ·{" "}
                  {settings.format === "wav" ? "PCM" : `${settings.bitrate} kbps`}
                </span>
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
              {item && estimated > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-soft pt-2 text-micro">
                  <span className="text-faint">vs source</span>
                  <span className="font-medium tabular-nums text-ink">
                    {sizeDeltaLabel(item.size, estimated)}
                  </span>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                aria-expanded={advancedOpen}
                aria-controls="trim-advanced-settings"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-[11px] border border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-[#d5d1c8]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Settings2 size={13} className="shrink-0 text-muted" aria-hidden />
                  <span className="text-[11.5px] font-medium text-ink">Advanced settings</span>
                  {advancedModified && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-label="Some advanced settings were changed"
                    />
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-faint">{advancedSummary}</span>
                  <ChevronDown
                    size={13}
                    className={`text-faint transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </span>
              </button>

              {advancedOpen && (
                <div id="trim-advanced-settings" className="mt-3 space-y-4">
                  <div className="space-y-4">
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

                  <AudioToggle
                    title="Keep metadata"
                    description="Write title and artist tags where supported."
                    checked={settings.metadata}
                    onChange={(metadata) => patch({ metadata })}
                  />
                </div>
              )}
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              WAV exports are instant; MP3, M4A and OGG download the engine once.
            </p>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}

function trimSummary(outcome: TrimOutcome): string {
  return `${trimFormatName(outcome.format)} · ${
    outcome.format === "wav" ? "PCM" : `${outcome.bitrate} kbps`
  } · ${formatTime(outcome.duration, true)}`;
}

function sizeDeltaLabel(sourceBytes: number, targetBytes: number): string {
  if (sourceBytes <= 0 || targetBytes <= 0) return "—";
  const delta = Math.round(((targetBytes - sourceBytes) / sourceBytes) * 100);
  if (delta <= 0) return `${Math.abs(delta)}% smaller`;
  return `${delta}% larger`;
}

function TrimmedCard({
  outcome,
  stale,
  sourceSize,
  summary,
  downloadName,
  onRemove,
}: {
  outcome: TrimOutcome;
  stale: boolean;
  sourceSize: number;
  summary: string;
  downloadName: string;
  onRemove: () => void;
}) {
  const delta = sizeDeltaLabel(sourceSize, outcome.size);
  const deltaTone = delta.endsWith("smaller") ? "bg-[#e7f1e9] text-[#3f6b4f]" : "bg-[#fdf0e8] text-[#a8432c]";

  return (
    <div className="mt-3 rounded-[16px] border border-[#dde8de] bg-[#f4f8f4] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#3f6b4f] text-white">
            <Check size={13} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink">Trimmed</p>
            <p className="truncate text-[10px] text-faint">{summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {stale && (
            <span className="rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2 py-0.5 text-[9px] font-medium text-[#786344]">
              Settings changed
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-medium tabular-nums ${deltaTone}`}>
            {delta}
          </span>
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[9.5px] font-medium text-muted">
            {formatBytes(outcome.size)}
          </span>
        </div>
      </div>

      <div className="mt-2.5">
        <AudioPlayer
          src={outcome.url}
          duration={outcome.duration}
          peaks={outcome.peaks}
          compact
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-micro text-faint">
          {stale ? "Run again to apply the new settings." : "Ready — listen before you download."}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRemove}
            className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-muted transition-colors hover:bg-white hover:text-ink"
          >
            <X size={12} aria-hidden />
            Discard
          </button>
          <a
            href={outcome.url}
            download={downloadName}
            className={buttonClasses("primary", "md", "h-9 min-w-0 rounded-lg px-3.5 text-[12px]")}
          >
            <Download size={13} aria-hidden />
            Download {outcome.format.toUpperCase()}
          </a>
        </div>
      </div>
    </div>
  );
}

function AudioToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
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
