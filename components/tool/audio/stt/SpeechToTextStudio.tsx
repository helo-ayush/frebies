"use client";

import { useState } from "react";
import { AudioLines, FileText } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { FileRow, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { DropChip, Dropzone } from "@/components/tool/kit/Dropzone";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { PreviewAction } from "@/components/tool/paid/PreviewAction";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel, formatBytes, formatTime } from "@/components/tool/audio/format";
import { SttControls } from "./SttControls";
import {
  DEFAULT_STT_SETTINGS,
  STT_LANGUAGES,
  type SttSettings,
} from "./model";

export function SpeechToTextStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 30 });
  const [settings, setSettings] = useState<SttSettings>(DEFAULT_STT_SETTINGS);

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
    <StudioFrame id="speech-to-text" label="Speech to text studio">
      <StudioStage flush>
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
            chips={
              <>
                <DropChip>TXT · SRT · VTT</DropChip>
                <DropChip>Speaker labels</DropChip>
                <DropChip>Timestamps</DropChip>
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
            <FileRow
              flush
              className="shrink-0 border-b border-line"
              icon={<AudioLines size={17} aria-hidden />}
              name={item.name}
              meta={fileMeta}
              onReplace={() => openPicker()}
              onRemove={clear}
            />

            <AudioPlayer
              src={item.url}
              duration={item.duration}
              peaks={item.peaks}
              fileName={item.name}
              formatLabel={fileFormatLabel(item.file)}
              className="min-h-[280px] lg:max-h-[46%] lg:min-h-[250px]"
            />

            <div className="fb-corners relative flex min-h-[220px] flex-1 flex-col items-center justify-center bg-panel px-6 py-8 text-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center bg-ink text-white">
                <FileText size={22} strokeWidth={1.6} aria-hidden />
              </span>
              <p className="fb-wide mt-5 text-[19px]">The transcript lands here</p>
              <p className="mt-3 max-w-[320px] text-[14.5px] leading-relaxed text-muted">
                {settings.format.toUpperCase()} · {language}
                {settings.speakers ? " · speaker labels" : ""}
              </p>
            </div>

            {dragging ? <DropOver label="Drop to replace" /> : null}
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

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
      </StudioStage>

      <StudioRail
        label="Transcript settings"
        action={<PreviewAction />}
      >
        <div className="space-y-7">
          <SttControls settings={settings} onPatch={patch} />
        </div>
      </StudioRail>
    </StudioFrame>
  );
}
