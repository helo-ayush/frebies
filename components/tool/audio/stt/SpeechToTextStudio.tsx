"use client";

import { useState } from "react";
import { AudioLines, FileText } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { FileRow, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { NotConnectedNote, PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatBytes, formatTime } from "@/components/tool/audio/format";
import { SttControls } from "./SttControls";
import {
  DEFAULT_STT_SETTINGS,
  STT_LANGUAGES,
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

  function patch(next: Partial<SttSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  const fileMeta = item
    ? [
        formatBytes(item.size),
        item.duration ? formatTime(item.duration) : "reading…",
        item.sampleRate ? `${(item.sampleRate / 1000).toFixed(1)} kHz` : null,
        item.channels ? (item.channels === 1 ? "mono" : "stereo") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      <StudioFrame id="speech-to-text" label="Speech to text studio">
        <StudioStage>
          <span aria-hidden className="hidden" data-error={error} />

          {!item ? (
            <Dropzone
              title="Drop audio to transcribe"
              description="Interviews, calls, lectures and voice notes become text or subtitles."
              buttonLabel="Choose audio"
              limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB and 30 minutes`}
              note="The file stays in this browser."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              icon={<AudioLines size={27} strokeWidth={1.5} aria-hidden />}
              chips={
                <>
                  <DropChip>TXT · SRT · VTT</DropChip>
                  <DropChip>Speaker labels</DropChip>
                  <DropChip>Timestamps</DropChip>
                </>
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="shrink-0">
                <AudioPlayer
                  src={item.url}
                  duration={item.duration}
                  peaks={item.peaks}
                  fileName={item.name}
                  formatLabel={fileFormatLabel(item.file)}
                />
              </div>

              <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d6d1c6] bg-white/70 px-5 py-8 text-center lg:min-h-0">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-muted">
                  <FileText size={19} strokeWidth={1.6} aria-hidden />
                </span>
                <p className="mt-3 text-[14px] font-semibold text-ink">
                  Your transcript will appear here
                </p>
                <p className="mt-1 max-w-[320px] text-[13px] leading-relaxed text-muted">
                  {settings.format.toUpperCase()} · {language}
                  {settings.speakers ? " · speaker labels" : ""}
                </p>
              </div>

              <FileRow
                icon={<AudioLines size={16} aria-hidden />}
                name={item.name}
                meta={fileMeta}
                onReplace={() => openPicker()}
                onRemove={clear}
              />
            </div>
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

          {error ? (
            <Note tone="error" className="mt-3 shrink-0">
              {error}
            </Note>
          ) : null}
        </StudioStage>

        <StudioRail
          label="Transcript settings"
          action={
            <PaidRunCard
              cost={credits}
              verb="transcribe"
              ready={Boolean(item)}
              onRun={() => setGateOpen(true)}
              emptyLabel="Add audio to transcribe"
              hint="2 credits per started minute · new accounts get 25 free"
            />
          }
        >
          <div className="space-y-6">
            <NotConnectedNote />
            <SttControls settings={settings} onPatch={patch} />
          </div>
        </StudioRail>
      </StudioFrame>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="transcribe this audio"
        cost={credits}
      />
    </>
  );
}
