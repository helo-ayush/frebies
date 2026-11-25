"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, ChevronDown, Download, RefreshCw, Settings2, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Switch } from "@/components/arc/switch/switch";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSection } from "@/components/tool/studio/RailSection";
import {
  ActionRow,
  DownloadAction,
  Field,
  Note,
  PrimaryAction,
  ResultCard,
  STAGE_LABEL,
  SecondaryAction,
  Segmented,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { computePeaks, useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatBytes } from "@/components/tool/audio/format";
import {
  AUDIO_FORMATS,
  BIT_DEPTHS,
  BITRATES,
  DEFAULT_CONVERTER_SETTINGS,
  SAMPLE_RATES,
  bitrateLabel,
  estimateOutputBytes,
  formatName,
  isLossless,
  safeOutputName,
  supportsVbr,
  type AudioFormat,
  type BitDepth,
  type ChannelMode,
  type ConverterSettings,
} from "./model";
import { ConversionCancelled, cancelEngine, convertAudio } from "./engine";

type Phase = "idle" | "running" | "done" | "error";

type ConversionOutcome = {
  url: string;
  size: number;
  duration: number;
  peaks: number[];
  format: AudioFormat;
  baseName: string;
};

const STRUCTURAL_KEYS: (keyof ConverterSettings)[] = [
  "format",
  "bitrate",
  "vbr",
  "sampleRate",
  "channels",
  "bitDepth",
  "normalize",
  "trimSilence",
];

const FORMAT_NOTES: Record<AudioFormat, string> = {
  mp3: "Plays everywhere. Small files.",
  wav: "Uncompressed and lossless. Large files.",
  m4a: "AAC audio. Best for iPhone, Mac and iTunes.",
  ogg: "Open format. Good for the web and games.",
};

const FORMAT_OPTIONS = AUDIO_FORMATS.map((format) => ({
  value: format.value,
  label: format.label,
  title: format.hint,
}));

const DEPTH_OPTIONS = BIT_DEPTHS.map((depth) => ({
  value: String(depth.value),
  label: depth.label,
  title: depth.hint,
}));

const CHANNEL_OPTIONS: { value: ChannelMode; label: string }[] = [
  { value: "stereo", label: "Stereo" },
  { value: "mono", label: "Mono" },
];

const HELP_TEXT = "mt-2 text-[12.5px] leading-relaxed text-faint";
const SUB_LABEL = "block text-[12.5px] font-medium text-muted";
const INPUT_BOX =
  "w-full rounded-[10px] border border-line bg-white text-[13px] text-ink outline-none transition-colors placeholder:text-faint hover:border-[#cfc9bd] focus:border-ink";

function presetClass(active: boolean) {
  return `h-10 rounded-[10px] border text-[13px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-[#cfc9bd]"
  }`;
}

export function AudioConverterStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<ConverterSettings>(DEFAULT_CONVERTER_SETTINGS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ value: 0, label: "Preparing…" });
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionOutcome | null>(null);
  const [stale, setStale] = useState(false);

  const resultRef = useRef<ConversionOutcome | null>(null);
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

  // A new source file invalidates any previous conversion.
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

  const lossless = isLossless(settings.format);
  const vbrAvailable = supportsVbr(settings.format);
  const vbrOn = settings.vbr && vbrAvailable;
  // What the labels and the size estimate describe: VBR only counts where the format has it.
  const shown: ConverterSettings = settings.vbr === vbrOn ? settings : { ...settings, vbr: false };
  const sourceFormat = item ? fileFormatLabel(item.file) : "—";
  const estimated = item ? estimateOutputBytes(shown, item.duration) : 0;
  const busy = phase === "running";
  const canRun = Boolean(item && !item.decoding && item.buffer && !busy);
  const decodeFailed = Boolean(item && !item.decoding && !item.buffer);
  const advancedSummary = `${SAMPLE_RATES.find((rate) => rate.value === settings.sampleRate)?.label} · ${settings.channels}`;

  function patch(next: Partial<ConverterSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    if (STRUCTURAL_KEYS.some((key) => next[key] !== undefined)) setStale(true);
    setRunError(null);
  }

  async function runConversion() {
    const source = item?.buffer;
    if (!item || !source || busy || !canRun) return;
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
      const converted = await convertAudio(
        source,
        settings,
        (value, label) => {
          if (runIdRef.current === runId) setProgress({ value, label });
        },
        () => cancelledRef.current || runIdRef.current !== runId,
      );
      if (cancelledRef.current || runIdRef.current !== runId) return;

      const outcome = await describeResult(converted.blob, settings, item);
      if (cancelledRef.current || runIdRef.current !== runId) {
        URL.revokeObjectURL(outcome.url);
        return;
      }
      revokeResult();
      resultRef.current = outcome;
      setResult(outcome);
      setPhase("done");
      setProgress({ value: 1, label: "Done" });
    } catch (conversionError) {
      if (
        conversionError instanceof ConversionCancelled ||
        cancelledRef.current ||
        runIdRef.current !== runId
      ) {
        setPhase("idle");
        return;
      }
      setRunError(
        conversionError instanceof Error ? conversionError.message : "Conversion failed. Try again.",
      );
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

  async function describeResult(
    blob: Blob,
    usedSettings: ConverterSettings,
    source: NonNullable<typeof item>,
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
        baseName: source.name.replace(/\.[^.]+$/, ""),
      };
    } catch {
      return {
        url,
        size: blob.size,
        duration: source.duration,
        peaks: source.peaks,
        format: usedSettings.format,
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

  const downloadName = result
    ? `${safeOutputName(settings.outputName, result.baseName)}.${result.format}`
    : "";
  const target = `${formatName(settings.format)} · ${bitrateLabel(shown)}`;
  const estimateDelta = item ? sizeDeltaLabel(item.size, estimated) : "—";
  const estimateLine =
    item && estimated > 0
      ? `About ${formatBytes(estimated)}${estimateDelta === "—" ? "" : ` · ${estimateDelta} than the original`}`
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
    <StudioFrame id="audio-convert" label="Audio conversion studio" fill={false}>
      <StudioStage className="lg:self-stretch">
        <span
          aria-hidden
          className="hidden"
          data-success={result && !stale ? `converted-${runIdRef.current}` : undefined}
          data-error={runError ?? (decodeFailed ? "decode-failed" : error ?? undefined)}
        />

        {!item ? (
          <AudioDropzone
            title="Drop audio to convert"
            description="Listen to it first, then pick the format and quality you need."
            buttonLabel="Choose audio"
            limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>Bitrate control</DropChip>
                <DropChip>Normalize volume</DropChip>
                <DropChip>Trim silence</DropChip>
              </>
            }
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {notices("mb-3")}

            {result ? (
              <div className="mb-4 shrink-0 space-y-2">
                <ResultCard
                  title={`Converted to ${result.format.toUpperCase()} · ${formatBytes(result.size)}`}
                  meta={
                    stale
                      ? "Settings changed since. Convert again to apply them."
                      : `${resultDelta === "—" ? "" : `${resultDelta} than the original · `}${settingsSummary(settings, vbrOn)}`
                  }
                >
                  <button
                    type="button"
                    onClick={discardResult}
                    aria-label="Discard converted file"
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

            {result ? <p className={`${STAGE_LABEL} mb-2 px-0.5`}>Original</p> : null}

            <div className="flex flex-1 flex-col lg:max-h-[440px]">
              <AudioPlayer
                src={item.url}
                duration={item.duration}
                peaks={item.peaks}
                formatLabel={result ? sourceFormat : undefined}
              />
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
        label="Audio conversion settings"
        sticky
        action={
          showDownload && result ? (
            <>
              <DownloadAction
                href={result.url}
                filename={downloadName}
                label={`Download ${result.format.toUpperCase()}`}
                hint={`${formatBytes(result.size)}${resultDelta === "—" ? "" : ` · ${resultDelta} than the original`}`}
              />
              <ActionRow>
                <SecondaryAction
                  onClick={() => void runConversion()}
                  disabled={!canRun}
                  icon={<RefreshCw size={13} aria-hidden />}
                >
                  Convert again
                </SecondaryAction>
                <StartOverAction onClick={startOver} label="New file" />
              </ActionRow>
            </>
          ) : (
            <>
              <PrimaryAction
                label={item ? `Convert to ${target}` : "Convert audio"}
                busyLabel={busy ? stageLabel(progress.label) : "Reading audio…"}
                icon={<ArrowRightLeft size={16} aria-hidden />}
                busy={busy || Boolean(item?.decoding)}
                progress={busy ? progress.value : undefined}
                disabled={!canRun}
                onClick={() => void runConversion()}
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

          {lossless ? (
            <Field label="Bit depth">
              <Segmented
                label="Bit depth"
                options={DEPTH_OPTIONS}
                value={String(settings.bitDepth)}
                onChange={(depth) => patch({ bitDepth: Number(depth) as BitDepth })}
              />
              <p className={HELP_TEXT}>
                16-bit plays everywhere. Pick 24 or 32-bit if you will keep editing the file.
              </p>
            </Field>
          ) : (
            <Field label="Bitrate" hint={vbrOn ? "Variable" : `${settings.bitrate} kbps`}>
              <div className="grid grid-cols-5 gap-1.5">
                {BITRATES.map((bitrate) => {
                  const selected = settings.bitrate === bitrate && !vbrOn;
                  return (
                    <button
                      key={bitrate}
                      type="button"
                      disabled={vbrOn}
                      aria-pressed={selected}
                      aria-label={`${bitrate} kbps`}
                      onClick={() => patch({ bitrate, vbr: false })}
                      className={presetClass(selected)}
                    >
                      {bitrate}
                    </button>
                  );
                })}
              </div>
              <p className={HELP_TEXT}>
                64–96 is fine for speech, 128–192 for music, 320 keeps the most detail.
              </p>
              {vbrAvailable ? (
                <div className="mt-3.5">
                  <AudioToggle
                    title="Variable bitrate (VBR)"
                    description="Lets the encoder spend fewer bits on quiet or simple passages."
                    checked={settings.vbr}
                    onChange={(vbr) => patch({ vbr })}
                  />
                </div>
              ) : null}
            </Field>
          )}

          <RailSection icon={Settings2} title="More options" aside={advancedSummary} defaultOpen={false}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={SUB_LABEL}>Sample rate</span>
                  <span className="relative mt-1.5 block">
                    <select
                      value={settings.sampleRate}
                      onChange={(event) => patch({ sampleRate: Number(event.target.value) })}
                      className={`${INPUT_BOX} h-11 appearance-none pl-3 pr-8`}
                    >
                      {SAMPLE_RATES.map((rate) => (
                        <option key={rate.value} value={rate.value}>
                          {rate.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
                      aria-hidden
                    />
                  </span>
                </label>

                <div>
                  <span className={SUB_LABEL}>Channels</span>
                  <Segmented
                    label="Channels"
                    className="mt-1.5"
                    options={CHANNEL_OPTIONS}
                    value={settings.channels}
                    onChange={(channels) => patch({ channels })}
                  />
                </div>
              </div>

              <AudioToggle
                title="Normalize volume"
                description="Bring the loudest moment to a standard level."
                checked={settings.normalize}
                onChange={(normalize) => patch({ normalize })}
              />
              <AudioToggle
                title="Trim silence"
                description="Remove long gaps at the start and end."
                checked={settings.trimSilence}
                onChange={(trimSilence) => patch({ trimSilence })}
              />
              <AudioToggle
                title="Keep metadata"
                description="Write a title and artist into the file where the format allows."
                checked={settings.metadata}
                onChange={(metadata) => patch({ metadata })}
              />

              {settings.metadata && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={SUB_LABEL}>Title</span>
                    <input
                      type="text"
                      value={settings.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      placeholder="Untitled"
                      className={`${INPUT_BOX} mt-1.5 h-10 px-3`}
                    />
                  </label>
                  <label className="block">
                    <span className={SUB_LABEL}>Artist</span>
                    <input
                      type="text"
                      value={settings.artist}
                      onChange={(event) => patch({ artist: event.target.value })}
                      placeholder="—"
                      className={`${INPUT_BOX} mt-1.5 h-10 px-3`}
                    />
                  </label>
                </div>
              )}

              <label className="block">
                <span className={SUB_LABEL}>File name</span>
                <span className="relative mt-1.5 block">
                  <input
                    type="text"
                    value={settings.outputName}
                    onChange={(event) => patch({ outputName: event.target.value })}
                    placeholder={item ? item.name.replace(/\.[^.]+$/, "") : "converted"}
                    spellCheck={false}
                    className={`${INPUT_BOX} h-10 pl-3 pr-16`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-card px-1.5 py-0.5 text-[12px] font-medium text-muted">
                    .{settings.format}
                  </span>
                </span>
              </label>
            </div>
          </RailSection>

          {!lossless ? (
            <Note>
              The first MP3, M4A or OGG conversion downloads the encoder once (about 32 MB). WAV needs
              no download.
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

function settingsSummary(settings: ConverterSettings, vbrOn: boolean): string {
  const parts = [bitrateLabel(settings.vbr === vbrOn ? settings : { ...settings, vbr: false })];
  const rate = SAMPLE_RATES.find((entry) => entry.value === settings.sampleRate)?.label;
  if (rate) parts.push(rate);
  parts.push(settings.channels);
  if (settings.normalize) parts.push("normalized");
  if (settings.trimSilence) parts.push("silence trimmed");
  return parts.join(" · ");
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
