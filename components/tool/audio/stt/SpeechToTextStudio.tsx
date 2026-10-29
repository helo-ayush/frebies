"use client";

import { useState } from "react";
import { Cloud, FileText, Lock, Sparkles, TriangleAlert } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { AudioRunCard } from "@/components/tool/audio/AudioRunCard";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatTime } from "@/components/tool/audio/format";
import { SttControls } from "./SttControls";
import {
  DEFAULT_STT_SETTINGS,
  STT_LANGUAGES,
  STT_MODELS,
  sttCredits,
  type SttSettings,
} from "./model";

export function SpeechToTextStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<SttSettings>(DEFAULT_STT_SETTINGS);
  const [gateOpen, setGateOpen] = useState(false);

  const credits = sttCredits(item?.duration ?? 0);
  const language = STT_LANGUAGES.find((entry) => entry.value === settings.language)?.label ?? "Auto";
  const model = STT_MODELS.find((entry) => entry.value === settings.model)?.label ?? "Balanced";

  function patch(next: Partial<SttSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <section
      id="speech-to-text"
      aria-label="Speech to text studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/audio/speech-to-text" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Transcript studio</h2>
            <p className="mt-0.5 text-micro text-faint">Audio in, text out.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />2 credits / min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Cloud size={10} aria-hidden />
            Cloud AI
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
        </div>
      </div>

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_396px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!item ? (
            <AudioDropzone
              title="Drop audio to transcribe"
              description="Interviews, calls, lectures and voice notes. Choose the language, model and output before you run."
              buttonLabel="Choose audio"
              limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              note="The file stays here until you start the cloud transcription."
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <FileText size={9} className="text-accent" aria-hidden />
                    SRT &amp; VTT
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Sparkles size={9} aria-hidden />
                    Speaker labels
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
                onRemove={clear}
              />

              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-line bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText size={13} className="text-muted" aria-hidden />
                    <span className="text-[11px] font-medium text-ink">Transcript</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-line bg-[#fbfaf7] px-2 py-0.5 text-[9px] font-medium text-muted">
                      {settings.format.toUpperCase()}
                    </span>
                    <span className="rounded-full border border-line bg-[#fbfaf7] px-2 py-0.5 text-[9px] text-faint">
                      {language}
                    </span>
                    <span className="rounded-full border border-line bg-[#fbfaf7] px-2 py-0.5 text-[9px] text-faint">
                      {model}
                    </span>
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden p-4">
                  <div className="space-y-4 opacity-70" aria-hidden>
                    {[
                      { time: "00:00", width: "88%", second: "64%" },
                      { time: "00:04", width: "94%", second: "72%" },
                      { time: "00:09", width: "78%", second: "56%" },
                      { time: "00:13", width: "90%", second: "68%" },
                    ].map((row) => (
                      <div key={row.time}>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] tabular-nums text-[#a09a89]">{row.time}</span>
                          <span className="h-1 w-1 rounded-full bg-[#8fae9f]" />
                        </div>
                        <span
                          className="mt-1.5 block h-2 rounded-full bg-[#eee9df]"
                          style={{ width: row.width }}
                        />
                        <span
                          className="mt-1.5 block h-2 rounded-full bg-[#f2eee6]"
                          style={{ width: row.second }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 px-5 text-center backdrop-blur-[1px]">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-[#faf8f3] text-muted">
                      <Lock size={16} strokeWidth={1.6} aria-hidden />
                    </span>
                    <p className="mt-3 text-[12px] font-medium text-ink">
                      Your transcript will appear here
                    </p>
                    <p className="mt-1 max-w-[260px] text-[10.5px] leading-relaxed text-muted">
                      Run the transcription to fill this panel. You can edit the text and
                      timestamps before downloading.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[9.5px] text-faint">
                  <span>
                    {settings.timestamps || settings.format !== "txt"
                      ? "Timestamps on"
                      : "Plain text"}{" "}
                    · {settings.speakers ? "Speaker labels on" : "No speaker labels"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Cloud size={9} aria-hidden />
                    Deleted within 1 hour
                  </span>
                </div>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
            tabIndex={-1}
            aria-label="Choose an audio file to transcribe"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {item && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
              <span className="tabular-nums">
                {formatTime(item.duration)} · {credits} credits
              </span>
              <span aria-hidden>·</span>
              <span>Upload starts only when you run.</span>
            </p>
          )}
        </div>

        <PaidRail
          label="Transcript settings"
          footer={
            <AudioRunCard
              cost={credits}
              verb="transcribe"
              ready={Boolean(item)}
              emptyLabel="Add audio to transcribe"
              onRun={() => setGateOpen(true)}
              note="2 credits per started minute, minimum 2. No credits are used until the run starts; failed runs are refunded."
            />
          }
        >
          <SttControls settings={settings} onPatch={patch} />
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="transcribe this audio"
        cost={credits}
      />
    </section>
  );
}
