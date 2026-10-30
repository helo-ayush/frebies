"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { computePeaks, useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatBytes, formatTime } from "@/components/tool/audio/format";
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

export function AudioConverterStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<ConverterSettings>(DEFAULT_CONVERTER_SETTINGS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ value: 0, label: "Preparing…" });
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionOutcome | null>(null);
  const [stale, setStale] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const sourceFormat = item ? fileFormatLabel(item.file) : "—";
  const estimated = item ? estimateOutputBytes(settings, item.duration) : 0;
  const busy = phase === "running";
  const canRun = Boolean(item && !item.decoding && item.buffer && !busy);
  const decodeFailed = Boolean(item && !item.decoding && !item.buffer);
  const advancedModified =
    settings.sampleRate !== DEFAULT_CONVERTER_SETTINGS.sampleRate ||
    settings.channels !== DEFAULT_CONVERTER_SETTINGS.channels ||
    settings.normalize !== DEFAULT_CONVERTER_SETTINGS.normalize ||
    settings.trimSilence !== DEFAULT_CONVERTER_SETTINGS.trimSilence ||
    settings.metadata !== DEFAULT_CONVERTER_SETTINGS.metadata ||
    settings.outputName.trim() !== "";
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

  const downloadName = result
    ? `${safeOutputName(settings.outputName, result.baseName)}.${result.format}`
    : "";

  return (
    <section
      id="audio-convert"
      aria-label="Audio conversion studio"
      className="scroll-mt-20 rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/audio/convert" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Audio studio</h2>
            <p className="mt-0.5 text-micro text-faint">Convert, tune and preview audio.</p>
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
        <div className="studio-main flex min-h-0 min-w-0 flex-col p-4 sm:p-5 lg:min-h-[620px]">
          {!item ? (
            <AudioDropzone
              title="Drop audio to convert"
              description="One MP3, WAV, M4A or OGG file. Preview the waveform, then choose the format and quality."
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
                    <Sparkles size={9} className="text-accent" aria-hidden />
                    Bitrate control
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Check size={9} aria-hidden />
                    Waveform preview
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
                    formatLabel={fileFormatLabel(item.file)}
                  />
                </div>

                <AudioFileMeta
                  item={item}
                  formatLabel={fileFormatLabel(item.file)}
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
                    {formatName(settings.format)} · {bitrateLabel(settings)} ·{" "}
                    <span className="font-semibold">≈ {formatBytes(estimated)}</span>
                  </p>
                </div>
                <div className="hidden h-7 w-[92px] items-center opacity-70 sm:flex">
                  <MiniWaveform peaks={item.peaks} bars={18} height={22} progress={0.6} />
                </div>
              </div>

              {result && (
                <ConvertedCard
                  outcome={result}
                  stale={stale}
                  sourceSize={item.size}
                  summary={settingsSummary(result.format, settings)}
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
                    Playback, analysis and conversion run on your device. The first MP3, M4A or
                    OGG conversion downloads the encoding engine once (≈ 32 MB).
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
                  onClick={() => void runConversion()}
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
                      Convert audio
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

        <StudioRail label="Audio conversion settings" sticky>
          <div className="space-y-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-ui font-semibold text-ink">Output format</h3>
              <span className="text-[10px] text-faint">{formatName(settings.format)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {AUDIO_FORMATS.map((format) => {
                const selected = settings.format === format.value;
                return (
                  <button
                    key={format.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => patch({ format: format.value as AudioFormat })}
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

            {lossless ? (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-ui font-medium text-ink">Bit depth</span>
                  <span className="text-micro tabular-nums text-faint">
                    {BIT_DEPTHS.find((entry) => entry.value === settings.bitDepth)?.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BIT_DEPTHS.map((depth) => {
                    const selected = settings.bitDepth === depth.value;
                    return (
                      <button
                        key={depth.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => patch({ bitDepth: depth.value })}
                        title={depth.hint}
                        className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                        }`}
                      >
                        {depth.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                  WAV keeps uncompressed PCM, so bitrate does not apply. 16-bit plays everywhere.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-ui font-medium text-ink">Bitrate</span>
                  <span className="text-micro tabular-nums text-faint">
                    {settings.vbr ? "VBR" : `${settings.bitrate} kbps`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BITRATES.map((bitrate) => {
                    const selected = settings.bitrate === bitrate && !settings.vbr;
                    return (
                      <button
                        key={bitrate}
                        type="button"
                        disabled={settings.vbr}
                        aria-pressed={selected}
                        onClick={() => patch({ bitrate, vbr: false })}
                        className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                        } disabled:cursor-not-allowed disabled:opacity-35`}
                      >
                        {bitrate}
                      </button>
                    );
                  })}
                  {supportsVbr(settings.format) && (
                    <button
                      type="button"
                      aria-pressed={settings.vbr}
                      onClick={() => patch({ vbr: !settings.vbr })}
                      className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium transition-colors ${
                        settings.vbr
                          ? "border-accent bg-accent text-white"
                          : "border-[#e5c9bc] bg-white text-[#a8432c] hover:border-accent"
                      }`}
                    >
                      VBR
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                  {settings.vbr
                    ? "Variable bitrate keeps quality steady while shrinking simple passages."
                    : supportsVbr(settings.format)
                      ? "Higher bitrate keeps more detail and creates a larger file."
                      : "M4A uses a constant bitrate with the AAC encoder."}
                </p>
              </div>
            )}

            <div className="rounded-[11px] border border-line bg-white p-3.5">
              <div className="flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Output</span>
                <span className="font-medium text-ink">
                  {formatName(settings.format)} · {bitrateLabel(settings)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Duration</span>
                <span className="font-medium tabular-nums text-ink">
                  {item ? formatTime(item.duration) : "—"}
                </span>
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
                aria-controls="audio-advanced-settings"
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
                <div id="audio-advanced-settings" className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[10.5px] font-medium text-muted">Sample rate</span>
                      <span className="relative mt-1.5 block">
                        <select
                          value={settings.sampleRate}
                          onChange={(event) => patch({ sampleRate: Number(event.target.value) })}
                          className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-2.5 pr-7 text-[11.5px] text-ink outline-none hover:border-[#d5d1c8]"
                        >
                          {SAMPLE_RATES.map((rate) => (
                            <option key={rate.value} value={rate.value}>
                              {rate.label}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-faint">
                          ▾
                        </span>
                      </span>
                    </label>

                    <div>
                      <span className="block text-[10.5px] font-medium text-muted">Channels</span>
                      <div className="mt-1.5 grid grid-cols-2 overflow-hidden rounded-[9px] border border-line">
                        {(["stereo", "mono"] as const).map((channel) => (
                          <button
                            key={channel}
                            type="button"
                            aria-pressed={settings.channels === channel}
                            onClick={() => patch({ channels: channel })}
                            className={`h-9 text-[10.5px] font-medium capitalize transition-colors ${
                              settings.channels === channel
                                ? "bg-ink text-white"
                                : "bg-white text-muted hover:text-ink"
                            }`}
                          >
                            {channel}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-line-soft pt-4">
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
                      description="Write title and artist tags where supported."
                      checked={settings.metadata}
                      onChange={(metadata) => patch({ metadata })}
                    />
                  </div>

                  {settings.metadata && (
                    <div className="space-y-2 rounded-[11px] border border-line bg-white p-3">
                      <label className="block">
                        <span className="block text-[10.5px] font-medium text-muted">Title</span>
                        <input
                          type="text"
                          value={settings.title}
                          onChange={(event) => patch({ title: event.target.value })}
                          placeholder="Untitled"
                          className="mt-1.5 h-8 w-full rounded-[8px] border border-line bg-white px-2.5 text-[11.5px] text-ink outline-none placeholder:text-faint/60 hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10.5px] font-medium text-muted">Artist</span>
                        <input
                          type="text"
                          value={settings.artist}
                          onChange={(event) => patch({ artist: event.target.value })}
                          placeholder="—"
                          className="mt-1.5 h-8 w-full rounded-[8px] border border-line bg-white px-2.5 text-[11.5px] text-ink outline-none placeholder:text-faint/60 hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
                        />
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="block">
                      <span className="block text-[10.5px] font-medium text-muted">Output name</span>
                      <span className="relative mt-1.5 block">
                        <input
                          type="text"
                          value={settings.outputName}
                          onChange={(event) => patch({ outputName: event.target.value })}
                          placeholder={item ? item.name.replace(/\.[^.]+$/, "") : "converted"}
                          spellCheck={false}
                          className="h-9 w-full rounded-[9px] border border-line bg-white px-2.5 pr-14 text-[11.5px] text-ink outline-none placeholder:text-faint/60 hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] bg-[#f4f1ea] px-1.5 py-0.5 text-[9px] font-medium text-muted">
                          .{settings.format}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              WAV conversions are instant. MP3, M4A and OGG use the on-device engine — the first
              run downloads it once.
            </p>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}

function settingsSummary(format: AudioFormat, settings: ConverterSettings): string {
  const parts = [formatName(format), bitrateLabel(settings)];
  const rate = SAMPLE_RATES.find((entry) => entry.value === settings.sampleRate)?.label;
  if (rate) parts.push(rate);
  parts.push(settings.channels);
  if (settings.normalize) parts.push("normalized");
  if (settings.trimSilence) parts.push("trimmed");
  return parts.join(" · ");
}

function sizeDeltaLabel(sourceBytes: number, targetBytes: number): string {
  if (sourceBytes <= 0 || targetBytes <= 0) return "—";
  const delta = Math.round(((targetBytes - sourceBytes) / sourceBytes) * 100);
  if (delta <= 0) return `${Math.abs(delta)}% smaller`;
  return `${delta}% larger`;
}

function ConvertedCard({
  outcome,
  stale,
  sourceSize,
  summary,
  downloadName,
  onRemove,
}: {
  outcome: ConversionOutcome;
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
            <p className="text-[11px] font-medium text-ink">Converted</p>
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
