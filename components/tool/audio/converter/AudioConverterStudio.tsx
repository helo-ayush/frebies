"use client";

import { useState } from "react";
import { ArrowRight, Check, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatBytes, formatTime } from "@/components/tool/audio/format";
import {
  AUDIO_FORMATS,
  BITRATES,
  DEFAULT_CONVERTER_SETTINGS,
  SAMPLE_RATES,
  estimateOutputBytes,
  formatName,
  isLossless,
  type AudioFormat,
  type ConverterSettings,
} from "./model";

export function AudioConverterStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<ConverterSettings>(DEFAULT_CONVERTER_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  const lossless = isLossless(settings.format);
  const sourceFormat = item ? fileFormatLabel(item.file) : "—";
  const estimated = item ? estimateOutputBytes(settings, item.duration) : 0;

  function patch(next: Partial<ConverterSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    setNotice(null);
  }

  return (
    <section
      id="audio-convert"
      aria-label="Audio conversion studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
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

      <div className="grid lg:h-[700px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
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
                  setNotice(null);
                }}
              />

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
                    {formatName(settings.format)} ·{" "}
                    {lossless ? "lossless" : `${settings.bitrate} kbps`} ·{" "}
                    <span className="font-semibold">≈ {formatBytes(estimated)}</span>
                  </p>
                </div>
                <div className="hidden h-7 w-[92px] items-center opacity-70 sm:flex">
                  <MiniWaveform peaks={item.peaks} bars={18} height={22} progress={0.6} />
                </div>
              </div>

              <div className="mt-3 flex items-start gap-3 rounded-[13px] border border-line bg-[#fbfaf7] p-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-[#557a68]">
                  <ShieldCheck size={14} aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink">Local by design</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    Waveform analysis, playback and size estimates run in your browser. The
                    encoder is connected in the next build step.
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

          <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} aria-hidden />
              Free · no upload · no watermark
            </p>
            <button
              type="button"
              onClick={() =>
                setNotice(
                  `The studio is ready. The ${formatName(settings.format)} encoder is connected in the next build step — your audio stays on this device.`,
                )
              }
              disabled={!item}
              className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[140px]")}
            >
              Convert audio
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

        <StudioRail label="Audio conversion settings">
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

            <div>
              <div className="flex items-center justify-between">
                <span className="text-ui font-medium text-ink">Bitrate</span>
                <span className="text-micro tabular-nums text-faint">
                  {lossless ? "PCM" : `${settings.bitrate} kbps`}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BITRATES.map((bitrate) => {
                  const selected = settings.bitrate === bitrate;
                  return (
                    <button
                      key={bitrate}
                      type="button"
                      disabled={lossless}
                      aria-pressed={selected}
                      onClick={() => patch({ bitrate })}
                      className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                        selected && !lossless
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
                {lossless
                  ? "WAV keeps uncompressed PCM, so bitrate does not apply."
                  : "Higher bitrate keeps more detail and creates a larger file."}
              </p>
            </div>

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
                description="Even out quiet and loud sections."
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
                description="Carry title and artist tags where supported."
                checked={settings.metadata}
                onChange={(metadata) => patch({ metadata })}
              />
            </div>

            <div className="rounded-[11px] border border-line bg-white p-3.5">
              <div className="flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Output</span>
                <span className="font-medium text-ink">
                  {formatName(settings.format)} ·{" "}
                  {lossless ? "PCM" : `${settings.bitrate} kbps`}
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
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              The waveform and playback are real and local. The encoder is connected in the
              next build step.
            </p>
          </div>
        </StudioRail>
      </div>
    </section>
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
