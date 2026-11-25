"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Download, RefreshCw, Settings2, X } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSection } from "@/components/tool/studio/RailSection";
import {
  ActionRow,
  DownloadAction,
  Field,
  Note,
  PrimaryAction,
  QuickPick,
  ResultButton,
  ResultCard,
  SecondaryAction,
  Segmented,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolTabs,
} from "@/components/tool/kit";
import { RailHint, RailPick } from "@/components/tool/studio/RailControls";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import { DropOver } from "@/components/tool/viewer/DropOver";
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

const LISTEN = [
  { value: "after", label: "Converted" },
  { value: "before", label: "Original" },
] as const;

export function AudioConverterStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<ConverterSettings>(DEFAULT_CONVERTER_SETTINGS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ value: 0, label: "Preparing…" });
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionOutcome | null>(null);
  const [stale, setStale] = useState(false);
  const [listen, setListen] = useState<"after" | "before">("after");

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
      setListen("after");
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
    <StudioFrame id="audio-convert" label="Audio conversion studio">
      <StudioStage flush>
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
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <AudioFileMeta
              item={item}
              formatLabel={sourceFormat}
              onReplace={() => openPicker()}
              onRemove={startOver}
            >
              {result ? <ToolTabs label="Listen to" options={LISTEN} value={listen} onChange={setListen} /> : null}
            </AudioFileMeta>

            {notices("p-3")}

            {result ? (
              <ResultCard
                title={`${result.format.toUpperCase()}, ${formatBytes(result.size)}`}
                meta={
                  stale
                    ? "Settings changed since. Convert again to apply them."
                    : `${resultDelta === "—" ? "" : `${resultDelta} than the original · `}${settingsSummary(settings, vbrOn)}`
                }
              >
                <ResultButton onClick={discardResult} label="Discard converted file" icon={<X size={17} aria-hidden />} />
                <ResultButton
                  loud
                  href={result.url}
                  filename={downloadName}
                  label={`Download ${result.format.toUpperCase()}`}
                  icon={<Download size={16} aria-hidden />}
                >
                  Download
                </ResultButton>
              </ResultCard>
            ) : null}

            <AudioPlayer
              src={result && listen === "after" ? result.url : item.url}
              duration={result && listen === "after" ? result.duration : item.duration}
              peaks={result && listen === "after" ? result.peaks : item.peaks}
              formatLabel={result && listen === "after" ? `${result.format.toUpperCase()} converted` : `${sourceFormat} original`}
              fileName={item.name}
              keepPosition
              className="min-h-[330px] lg:min-h-0"
            />

            {dragging ? <DropOver label="Drop to replace" /> : null}
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

        {!item ? notices("p-3") : null}
      </StudioStage>

      <StudioRail
        label="Audio conversion settings"
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
              <QuickPick
                label="Output format"
                value={settings.format}
                options={FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                onChange={(format) => patch({ format })}
              />
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
        <div className="space-y-7 pb-7">
          <Field label="Format">
            <Segmented
              label="Output format"
              options={FORMAT_OPTIONS}
              value={settings.format}
              onChange={(format) => patch({ format })}
            />
            <RailHint>{FORMAT_NOTES[settings.format]}</RailHint>
          </Field>

          {lossless ? (
            <Field label="Bit depth">
              <Segmented
                label="Bit depth"
                options={DEPTH_OPTIONS}
                value={String(settings.bitDepth)}
                onChange={(depth) => patch({ bitDepth: Number(depth) as BitDepth })}
              />
              <RailHint>
                16-bit plays everywhere. Pick 24 or 32-bit if you will keep editing the file.
              </RailHint>
            </Field>
          ) : (
            <Field label="Bitrate" hint={vbrOn ? "Variable" : `${settings.bitrate} kbps`}>
              <RailPick
                label="Bitrate"
                columns={5}
                disabled={vbrOn}
                value={vbrOn ? null : settings.bitrate}
                options={BITRATES.map((bitrate) => ({
                  value: bitrate,
                  label: bitrate,
                  ariaLabel: `${bitrate} kbps`,
                }))}
                onChange={(bitrate) => patch({ bitrate, vbr: false })}
              />
              <RailHint>64–96 is fine for speech, 128–192 for music, 320 keeps the most detail.</RailHint>
              {vbrAvailable ? (
                <div className="mt-4">
                  <RailSwitch
                    label="Variable bitrate (VBR)"
                    description="Lets the encoder spend fewer bits on quiet or simple passages."
                    checked={settings.vbr}
                    onChange={(vbr) => patch({ vbr })}
                  />
                </div>
              ) : null}
            </Field>
          )}

          {!lossless ? (
            <Note>
              The first MP3, M4A or OGG conversion downloads the encoder once (about 32 MB). WAV needs no
              download.
            </Note>
          ) : null}
        </div>

        <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
          <RailSection icon={Settings2} title="More options" aside={advancedSummary} defaultOpen={false}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[14px] font-medium">Sample rate</span>
                  <select
                    value={settings.sampleRate}
                    onChange={(event) => patch({ sampleRate: Number(event.target.value) })}
                    className="fb-input mt-2 cursor-pointer"
                  >
                    {SAMPLE_RATES.map((rate) => (
                      <option key={rate.value} value={rate.value}>
                        {rate.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="block text-[14px] font-medium">Channels</span>
                  <Segmented
                    label="Channels"
                    className="mt-2 [&>button]:h-[42px]"
                    options={CHANNEL_OPTIONS}
                    value={settings.channels}
                    onChange={(channels) => patch({ channels })}
                  />
                </div>
              </div>

              <RailSwitch
                label="Normalize volume"
                description="Bring the loudest moment to a standard level."
                checked={settings.normalize}
                onChange={(normalize) => patch({ normalize })}
              />
              <RailSwitch
                label="Trim silence"
                description="Remove long gaps at the start and end."
                checked={settings.trimSilence}
                onChange={(trimSilence) => patch({ trimSilence })}
              />
              <RailSwitch
                label="Keep metadata"
                description="Write a title and artist into the file where the format allows."
                checked={settings.metadata}
                onChange={(metadata) => patch({ metadata })}
              />

              {settings.metadata && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[14px] font-medium">Title</span>
                    <input
                      type="text"
                      value={settings.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      placeholder="Untitled"
                      className="fb-input mt-2"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[14px] font-medium">Artist</span>
                    <input
                      type="text"
                      value={settings.artist}
                      onChange={(event) => patch({ artist: event.target.value })}
                      placeholder="Unknown"
                      className="fb-input mt-2"
                    />
                  </label>
                </div>
              )}

              <label className="block">
                <span className="block text-[14px] font-medium">File name</span>
                <span className="relative mt-2 block">
                  <input
                    type="text"
                    value={settings.outputName}
                    onChange={(event) => patch({ outputName: event.target.value })}
                    placeholder={item ? item.name.replace(/\.[^.]+$/, "") : "converted"}
                    spellCheck={false}
                    className="fb-input !pr-16"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">
                    .{settings.format}
                  </span>
                </span>
              </label>
            </div>
          </RailSection>
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
