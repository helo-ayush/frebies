"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Scissors, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Switch } from "@/components/arc/switch/switch";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import {
  ActionRow,
  DownloadAction,
  Field,
  Note,
  PrimaryAction,
  ResultCard,
  SecondaryAction,
  Segmented,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
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

const FORMAT_NOTES: Record<TrimFormat, string> = {
  mp3: "Plays everywhere. Small files.",
  wav: "Uncompressed and lossless. Large files.",
  m4a: "AAC audio. Best for iPhone, Mac and iTunes.",
  ogg: "Open format. Good for the web and games.",
};

const FORMAT_OPTIONS = TRIM_FORMATS.map((format) => ({
  value: format.value,
  label: format.label,
  title: format.hint,
}));

const HELP_TEXT = "mt-2 text-[12.5px] leading-relaxed text-faint";

function presetClass(active: boolean) {
  return `h-10 rounded-[10px] border text-[13px] font-medium tabular-nums transition-colors ${
    active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-[#cfc9bd]"
  }`;
}

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
  const lossless = settings.format === "wav";
  const busy = phase === "running";
  const canRun = Boolean(item && !item.decoding && item.buffer && selection && trimDuration > 0 && !busy);
  const decodeFailed = Boolean(item && !item.decoding && !item.buffer);

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

  function discardResult() {
    revokeResult();
    setPhase("idle");
    setStale(false);
  }

  function startOver() {
    clear();
    setRunError(null);
  }

  const downloadName = result ? `${result.baseName}-trimmed.${result.format}` : "";
  const estimateLine =
    item && estimated > 0
      ? `About ${formatBytes(estimated)} · ${lossless ? "lossless" : `${settings.bitrate} kbps`}`
      : null;
  const resultDelta = item && result ? sizeDeltaLabel(item.size, result.size) : "—";
  const showDownload = Boolean(result && !stale && !busy);

  const problem =
    runError && phase === "error"
      ? runError
      : decodeFailed
        ? "This file could not be decoded in your browser. Try an MP3, WAV, M4A or OGG file."
        : null;

  function notices(className: string) {
    if (!problem && !error) return null;
    return (
      <div className={`shrink-0 space-y-2 ${className}`}>
        {problem ? <Note tone="error">{problem}</Note> : null}
        {error ? <Note tone="error">{error}</Note> : null}
      </div>
    );
  }

  return (
    <StudioFrame id="audio-trim" label="Audio trimming studio">
      <StudioStage>
        <span
          aria-hidden
          className="hidden"
          data-success={result && !stale ? `trimmed-${runIdRef.current}` : undefined}
          data-error={runError ?? (decodeFailed ? "decode-failed" : error ?? undefined)}
        />

        {!item ? (
          <AudioDropzone
            title="Drop audio to trim"
            description="Drag two handles across the waveform, loop the selection to check it, then export."
            buttonLabel="Choose audio"
            limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>Loop preview</DropChip>
                <DropChip>Exact start and end times</DropChip>
                <DropChip>Fade in / out</DropChip>
              </>
            }
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [scrollbar-width:thin] lg:overflow-y-auto lg:overflow-x-hidden">
            {notices("mb-3")}

            {result ? (
              <div className="mb-4 shrink-0 space-y-2">
                <ResultCard
                  title={`Trimmed to ${formatTime(result.duration, true)} · ${formatBytes(result.size)}`}
                  meta={
                    stale
                      ? "Selection or settings changed. Trim again to update."
                      : `${trimSummary(result)}${resultDelta === "—" ? "" : ` · ${resultDelta} than the original`}`
                  }
                >
                  <button
                    type="button"
                    onClick={discardResult}
                    aria-label="Discard trimmed file"
                    title="Discard"
                    className="grid h-10 w-10 place-items-center rounded-[12px] text-[#3f6b54] transition-colors hover:bg-white/70 hover:text-ink"
                  >
                    <X size={15} aria-hidden />
                  </button>
                  <a
                    href={result.url}
                    download={downloadName}
                    aria-label={`Download ${result.format.toUpperCase()}`}
                    className={buttonClasses("success", "md", "h-10 rounded-[12px] px-3 text-[13.5px] sm:px-4")}
                  >
                    <Download size={15} aria-hidden />
                    <span className="max-sm:sr-only">Download</span>
                  </a>
                </ResultCard>
                <AudioPlayer
                  src={result.url}
                  duration={result.duration}
                  peaks={result.peaks}
                  formatLabel={result.format.toUpperCase()}
                  compact
                />
              </div>
            ) : null}

            <div className="mb-2 flex shrink-0 items-center justify-between gap-3 px-0.5">
              <p className="min-w-0 text-[13px] leading-snug text-muted">
                Drag the two handles to choose the part to keep.
              </p>
              <button
                type="button"
                onClick={resetSelection}
                disabled={!item.duration}
                aria-label="Reset selection"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
              >
                <RotateCcw size={13} aria-hidden />
                Reset
              </button>
            </div>

            <AudioPlayer
              src={item.url}
              duration={item.duration}
              peaks={item.peaks}
              selection={selection ?? undefined}
              onSelectionChange={updateSelection}
              loopSelection
            />

            <div className="mt-2.5 grid shrink-0 grid-cols-3 divide-x divide-line rounded-[14px] border border-line bg-white">
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
                max={item.duration}
                disabled={!selection}
                onCommit={(value) => {
                  if (selection) updateSelection({ ...selection, end: value });
                }}
              />
              <div className="min-w-0 px-2.5 py-2.5 sm:px-4 sm:py-3">
                <p className="truncate px-1.5 text-[12.5px] font-medium text-muted">
                  Length
                  {item.duration ? (
                    <span className="font-normal text-faint max-sm:hidden">
                      {" "}
                      of {formatTime(item.duration, true)}
                    </span>
                  ) : null}
                </p>
                <p
                  className="mt-0.5 flex h-9 items-center px-1.5 text-[19px] font-semibold tabular-nums tracking-[-0.01em] text-accent-deep sm:text-[24px]"
                >
                  {formatTime(trimDuration, true)}
                </p>
              </div>
            </div>

            <AudioFileMeta
              item={item}
              formatLabel={sourceFormat}
              onReplace={() => openPicker()}
              onRemove={startOver}
            />
          </div>
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

        {!item ? notices("mt-3") : null}
      </StudioStage>

      <StudioRail
        label="Trim settings"
        action={
          showDownload && result ? (
            <>
              <DownloadAction
                href={result.url}
                filename={downloadName}
                label={`Download ${result.format.toUpperCase()}`}
                hint={`${formatTime(result.duration, true)} · ${formatBytes(result.size)}`}
              />
              <ActionRow>
                <SecondaryAction
                  onClick={() => void runTrim()}
                  disabled={!canRun}
                  icon={<Scissors size={13} aria-hidden />}
                >
                  Trim again
                </SecondaryAction>
                <StartOverAction onClick={startOver} label="New file" />
              </ActionRow>
            </>
          ) : (
            <>
              <PrimaryAction
                label={
                  item && selection
                    ? `Trim to ${formatTime(trimDuration, true)} · ${trimFormatName(settings.format)}`
                    : "Trim audio"
                }
                busyLabel={busy ? stageLabel(progress.label) : "Reading audio…"}
                icon={<Scissors size={16} aria-hidden />}
                busy={busy || Boolean(item?.decoding)}
                progress={busy ? progress.value : undefined}
                disabled={!canRun}
                onClick={() => void runTrim()}
                hint={
                  !item
                    ? "Add an audio file to get started"
                    : decodeFailed
                      ? "This file can't be read. Try another one."
                      : (estimateLine ?? "Reading audio…")
                }
              />
              {busy ? (
                <ActionRow>
                  <SecondaryAction onClick={cancelRun} icon={<X size={13} aria-hidden />}>
                    Cancel
                  </SecondaryAction>
                </ActionRow>
              ) : null}
            </>
          )
        }
      >
        <div className="space-y-6">
          {estimateLine ? (
            <p className="text-[12.5px] tabular-nums text-muted lg:hidden">{estimateLine}</p>
          ) : null}

          <Field label="Format">
            <Segmented
              label="Output format"
              options={FORMAT_OPTIONS}
              value={settings.format}
              onChange={(format) => patch({ format })}
            />
            <p className={HELP_TEXT}>{FORMAT_NOTES[settings.format]}</p>
          </Field>

          {!lossless ? (
            <Field label="Bitrate" hint={`${settings.bitrate} kbps`}>
              <div className="grid grid-cols-3 gap-1.5">
                {TRIM_BITRATES.map((bitrate) => {
                  const selected = settings.bitrate === bitrate;
                  return (
                    <button
                      key={bitrate}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${bitrate} kbps`}
                      onClick={() => patch({ bitrate })}
                      className={presetClass(selected)}
                    >
                      {bitrate}
                    </button>
                  );
                })}
              </div>
              <p className={HELP_TEXT}>128 is fine for speech, 192 for music, 320 keeps the most detail.</p>
            </Field>
          ) : null}

          <Field label="Fades">
            <div className="space-y-3.5">
              <FadeSlider label="Fade in" value={settings.fadeIn} onChange={(fadeIn) => patch({ fadeIn })} />
              <FadeSlider
                label="Fade out"
                value={settings.fadeOut}
                onChange={(fadeOut) => patch({ fadeOut })}
              />
            </div>
          </Field>

          <AudioToggle
            title="Keep metadata"
            description="Save the file name as the track title."
            checked={settings.metadata}
            onChange={(metadata) => patch({ metadata })}
          />

          {!lossless ? (
            <Note>
              The first MP3, M4A or OGG export downloads the encoder once (about 32 MB). WAV needs no
              download.
            </Note>
          ) : null}
        </div>
      </StudioRail>
    </StudioFrame>
  );
}

/** "Encoding MP3 · 40%" → "Encoding MP3": the button shows the overall percentage itself. */
function stageLabel(label: string): string {
  if (label.startsWith("Downloading")) return "Downloading encoder";
  return label.replace(/\s*·\s*\d+%$/, "").replace(/…$/, "") || "Working";
}

function trimSummary(outcome: TrimOutcome): string {
  return `${trimFormatName(outcome.format)} · ${
    outcome.format === "wav" ? "lossless" : `${outcome.bitrate} kbps`
  }`;
}

function sizeDeltaLabel(sourceBytes: number, targetBytes: number): string {
  if (sourceBytes <= 0 || targetBytes <= 0) return "—";
  const delta = Math.round(((targetBytes - sourceBytes) / sourceBytes) * 100);
  if (delta <= 0) return `${Math.abs(delta)}% smaller`;
  return `${delta}% larger`;
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
    <div className="flex items-start justify-between gap-3">
      <button type="button" onClick={() => onChange(!checked)} className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
      </button>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} className="mt-0.5 shrink-0" />
    </div>
  );
}

/** One editable time in the selection readout under the waveform. */
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
    <label className="block min-w-0 px-2.5 py-2.5 sm:px-4 sm:py-3">
      <span className="block px-1.5 text-[12.5px] font-medium text-muted">{label}</span>
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
        className="mt-0.5 h-9 w-full min-w-0 rounded-[8px] border border-transparent bg-transparent px-1.5 text-[19px] font-semibold tabular-nums tracking-[-0.01em] text-ink outline-none transition-colors hover:border-line hover:bg-card focus:border-ink focus:bg-white disabled:opacity-45 sm:text-[24px]"
      />
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
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-muted">{label}</span>
        <span className="tabular-nums text-faint">{value.toFixed(1)} s</span>
      </div>
      <RailSlider
        label={label}
        value={value}
        min={0}
        max={3}
        step={0.1}
        onValueChange={onChange}
        className="mt-1"
      />
    </div>
  );
}
