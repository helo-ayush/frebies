"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Mic, Square, Trash2, Upload, X } from "lucide-react";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { Note, ToolIcon, ToolText } from "@/components/tool/kit";
import { buttonClasses } from "@/components/ui/Button";
import type { SavedCustomVoice } from "./model";
import {
  MAX_CLONE_SECONDS,
  loadSavedClonedVoices,
  normalizeReferenceAudio,
} from "./voice-clone-utils";

export type VoiceClonePanelProps = {
  open: boolean;
  customVoices: SavedCustomVoice[];
  activeVoiceId: string | null;
  onSelectVoice: (voice: SavedCustomVoice) => void;
  onSaveVoice: (voice: SavedCustomVoice) => void;
  onDeleteVoice: (id: string) => void;
  onClose: () => void;
  /** Hide the built-in saved voices list when the parent already renders one. */
  showSavedList?: boolean;
};

function cleanFilenameToVoiceName(filename: string): string {
  const stem = filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!stem) return "Uploaded voice";
  return stem.slice(0, 32);
}

export function VoiceClonePanel({
  open,
  customVoices,
  activeVoiceId,
  onSelectVoice,
  onSaveVoice,
  onDeleteVoice,
  onClose,
  showSavedList = true,
}: VoiceClonePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voiceName, setVoiceName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [draftAudioBase64, setDraftAudioBase64] = useState<string | null>(null);
  const [draftDurationSeconds, setDraftDurationSeconds] = useState<number | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const nameId = useId();
  const transcriptId = useId();

  const stopTracksAndTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  };

  // The panel opens under the button, often past the end of the rail.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  useEffect(() => {
    return () => {
      stopTracksAndTimer();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!open) return null;

  const resetDraft = () => {
    setDraftAudioBase64(null);
    setDraftDurationSeconds(undefined);
    setPreviewUrl(null);
    setVoiceName("");
    setTranscript("");
    setError(null);
  };

  const ingestAudioBlob = async (blob: Blob, suggestedName: string) => {
    setProcessing(true);
    setError(null);
    try {
      const normalized = await normalizeReferenceAudio(blob, MAX_CLONE_SECONDS);
      setDraftAudioBase64(normalized.audioBase64);
      setDraftDurationSeconds(normalized.durationSeconds);
      setPreviewUrl(normalized.previewUrl);
      setVoiceName((prev) => (prev.trim() ? prev : suggestedName));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read this audio clip. Try a clean WAV, MP3, or M4A file.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
    stopTracksAndTimer();
  };

  const startRecording = async () => {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Microphone recording is unavailable in this browser. Upload an audio file instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopTracksAndTimer();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 256) {
          setError("Recording was empty. Please speak clearly for a few seconds.");
          return;
        }
        const nextIndex = loadSavedClonedVoices().length + 1;
        void ingestAudioBlob(blob, `My Voice ${nextIndex}`);
      };

      recorder.onerror = () => {
        stopTracksAndTimer();
        setRecording(false);
        setError("Microphone recording failed. Try uploading a WAV or MP3 clip instead.");
      };

      setRecordSeconds(0);
      setRecording(true);
      recorder.start(250);

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_CLONE_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch (err) {
      stopTracksAndTimer();
      setRecording(false);
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow mic access or upload an audio file."
          : "Could not access your microphone. Upload an audio file instead.",
      );
    }
  };

  const handleFilePicked = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("Audio file must be under 15 MB.");
      return;
    }
    void ingestAudioBlob(file, cleanFilenameToVoiceName(file.name));
  };

  const handleSave = () => {
    if (!draftAudioBase64) return;
    const cleanName = voiceName.trim() || `Custom Voice ${customVoices.length + 1}`;
    const durationSec = draftDurationSeconds;
    const saved: SavedCustomVoice = {
      id: `clone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.slice(0, 40),
      audioBase64: draftAudioBase64,
      text: transcript.trim(),
      durationSeconds: durationSec,
      durationLabel: durationSec ? `${durationSec.toFixed(1)}s` : undefined,
      createdAt: Date.now(),
    };
    resetDraft();
    onSaveVoice(saved);
  };

  return (
    <section ref={panelRef} aria-label="Voice cloning" className="mt-4 scroll-mb-[150px] scroll-mt-[76px] space-y-4 border border-line-strong bg-canvas p-4 lg:scroll-mb-4 lg:scroll-mt-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="fb-wide text-[17px]">Clone a voice</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Record or upload 5 to {MAX_CLONE_SECONDS} seconds of clear speech. Longer clips are
            trimmed.
          </p>
        </div>

        <ToolIcon
          label="Close voice cloner"
          slot="cloner-close"
          onClick={() => {
            if (recording) stopRecording();
            onClose();
          }}
        >
          <X size={16} aria-hidden />
        </ToolIcon>
      </div>

      {/* Saved voices, only when the parent does not already list them */}
      {showSavedList && customVoices.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-muted">
            Saved voices ({customVoices.length} of 4)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {customVoices.map((entry) => {
              const selected = activeVoiceId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`inline-flex items-center gap-1 border py-1 pl-3 pr-1 text-[13px] transition-colors ${
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line-strong bg-white hover:border-ink"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectVoice(entry)}
                    className="inline-flex items-center gap-1.5 font-medium"
                  >
                    {selected && <Check size={12} aria-hidden />}
                    <span>{entry.name}</span>
                    {entry.durationLabel && (
                      <span className={`tabular-nums ${selected ? "text-white/75" : "text-faint"}`}>
                        {entry.durationLabel}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.name}`}
                    onClick={() => onDeleteVoice(entry.id)}
                    className={`grid h-6 w-6 place-items-center transition-colors ${
                      selected
                        ? "text-white/75 hover:bg-white/15 hover:text-white"
                        : "text-faint hover:bg-danger-soft hover:text-danger"
                    }`}
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input: record or upload */}
      {!draftAudioBase64 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFilePicked(e.dataTransfer.files?.[0]);
          }}
          className={`border border-dashed p-3 transition-colors ${
            dragActive ? "border-accent bg-accent-soft" : "border-line-strong bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.ogg,.webm,audio/*"
            aria-label="Upload a voice sample"
            tabIndex={-1}
            className="sr-only"
            onChange={(e) => {
              handleFilePicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            {!recording ? (
              <button
                type="button"
                disabled={processing}
                onClick={startRecording}
                className={buttonClasses("primary", "md", "!h-12 px-2")}
              >
                <Mic size={14} aria-hidden />
                Record
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex h-12 items-center justify-center gap-2 bg-accent-deep px-2 text-[13.5px] font-semibold uppercase tabular-nums text-white transition-colors hover:bg-ink"
              >
                <Square size={11} className="fill-current" aria-hidden />
                Stop · {recordSeconds}s
              </button>
            )}

            <button
              type="button"
              disabled={recording || processing}
              onClick={() => fileInputRef.current?.click()}
              className={buttonClasses("secondary", "md", "!h-12 px-2")}
            >
              <Upload size={14} aria-hidden />
              Upload
            </button>
          </div>

          <p
            role="status"
            className={`mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] leading-snug ${
              recording ? "font-medium text-accent-deep" : "text-muted"
            }`}
          >
            {processing ? (
              <>
                <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden />
                Preparing your sample…
              </>
            ) : recording ? (
              `Recording, up to ${MAX_CLONE_SECONDS}s. Speak naturally.`
            ) : (
              "WAV, MP3 or M4A, up to 15 MB. Or drop a file here."
            )}
          </p>
        </div>
      )}

      {/* Loaded clip: preview, name, save */}
      {draftAudioBase64 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14.5px] font-semibold">
              Sample ready
              {draftDurationSeconds !== undefined && (
                <span className="fb-num font-normal text-faint"> {draftDurationSeconds.toFixed(1)} s</span>
              )}
            </p>
            <ToolText onClick={resetDraft}>Replace</ToolText>
          </div>

          {previewUrl && (
            <AudioPlayer
              src={previewUrl}
              duration={draftDurationSeconds ?? 1}
              peaks={[]}
              fileName="Voice sample"
              compact
              tone="light"
              className="bg-white"
            />
          )}

          <div>
            <label htmlFor={nameId} className="mb-2 block text-[14px] font-medium">
              Voice name
            </label>
            <input
              id={nameId}
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Narrator, Founder, Alex"
              className="fb-input"
            />
          </div>

          <div>
            <label htmlFor={transcriptId} className="mb-2 block text-[14px] font-medium">
              What the sample says <span className="font-normal text-faint">(optional)</span>
            </label>
            <input
              id={transcriptId}
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              maxLength={500}
              placeholder="Typing the words improves the match"
              className="fb-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetDraft}
              className={buttonClasses("secondary", "md", "!h-12 px-2")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={buttonClasses("primary", "md", "!h-12 px-2")}
            >
              <Check size={14} aria-hidden />
              Save and use
            </button>
          </div>
        </div>
      )}

      {error && <Note tone="error">{error}</Note>}
    </section>
  );
}
