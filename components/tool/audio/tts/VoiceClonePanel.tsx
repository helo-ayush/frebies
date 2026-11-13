"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, Square, Trash2, Upload, Volume2, X } from "lucide-react";
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
    <section
      aria-label="Voice cloning studio"
      className="mt-2.5 rounded-xl border border-line bg-[#fbfbfa] p-3.5 transition-all"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">
              Clone a voice
            </h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-muted ring-1 ring-line">
              5–{MAX_CLONE_SECONDS}s sample
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            Record with your mic or upload clean speech (WAV, MP3, M4A). Trimmed automatically for fast cloning.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (recording) stopRecording();
            onClose();
          }}
          aria-label="Close voice cloner"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      {/* Reusable saved cloned voices inside cloner */}
      {showSavedList && customVoices.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-white p-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted">
            <span>Saved cloned voices ({customVoices.length}/4)</span>
            <span>Click to select</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {customVoices.map((entry) => {
              const selected = activeVoiceId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 text-[12px] transition-colors ${
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-[#fbfbfa] text-ink hover:border-ink/30"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectVoice(entry)}
                    className="inline-flex items-center gap-1.5 font-medium"
                  >
                    {selected && <Check size={11} aria-hidden />}
                    <span>{entry.name}</span>
                    {entry.durationLabel && (
                      <span
                        className={`font-mono text-[10.5px] ${
                          selected ? "text-white/75" : "text-muted"
                        }`}
                      >
                        {entry.durationLabel}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.name}`}
                    onClick={() => onDeleteVoice(entry.id)}
                    className={`rounded-full p-1 transition-colors ${
                      selected
                        ? "text-white/75 hover:bg-white/15 hover:text-white"
                        : "text-muted hover:bg-rose-50 hover:text-rose-600"
                    }`}
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input area: record or upload */}
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
          className={`mt-3 rounded-xl border border-dashed p-4 transition-colors ${
            dragActive
              ? "border-accent bg-accent/[0.04]"
              : "border-[#d6d4cc] bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.ogg,.webm,audio/*"
            className="hidden"
            onChange={(e) => {
              handleFilePicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!recording ? (
                <button
                  type="button"
                  disabled={processing}
                  onClick={startRecording}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
                >
                  <Mic size={14} aria-hidden />
                  <span>Record mic</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-rose-700"
                >
                  <Square size={12} className="fill-current" aria-hidden />
                  <span>
                    Stop ({recordSeconds}s / {MAX_CLONE_SECONDS}s)
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={recording || processing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-[#fbfbfa] px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/35 hover:bg-white disabled:opacity-50"
              >
                <Upload size={14} aria-hidden />
                <span>Upload audio</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
              {processing ? (
                <>
                  <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
                  <span>Preparing clean WAV clip…</span>
                </>
              ) : recording ? (
                <span className="font-medium text-rose-600">
                  Recording live — speak naturally…
                </span>
              ) : (
                <span>Or drag & drop an audio file here</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loaded clip editor & preview */}
      {draftAudioBase64 && (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-white p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Volume2 size={14} className="text-accent" aria-hidden />
              <span>Sample ready</span>
              {draftDurationSeconds !== undefined && (
                <span className="rounded-full bg-[#f3f3f1] px-2 py-0.5 font-mono text-[11px] text-muted">
                  {draftDurationSeconds.toFixed(1)}s WAV
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={resetDraft}
              className="text-[11.5px] font-medium text-muted hover:text-ink"
            >
              Replace clip
            </button>
          </div>

          {previewUrl && (
            <audio
              controls
              preload="metadata"
              src={previewUrl}
              className="h-9 w-full"
            />
          )}

          <div className="grid gap-2.5">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-muted">
                Voice name
              </label>
              <input
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Narrator, Founder, Alex"
                className="h-9 w-full rounded-lg border border-line bg-[#fbfbfa] px-3 text-[12.5px] text-ink outline-none focus:border-ink/40 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-muted">
                Transcript <span className="font-normal">(optional, boosts clarity)</span>
              </label>
              <input
                type="text"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                maxLength={500}
                placeholder="Words spoken in your sample"
                className="h-9 w-full rounded-lg border border-line bg-[#fbfbfa] px-3 text-[12.5px] text-ink outline-none focus:border-ink/40 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={resetDraft}
              className="h-8 rounded-lg border border-line px-3 text-[12px] font-medium text-muted transition-colors hover:bg-[#fbfbfa] hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Check size={13} aria-hidden />
              <span>Save &amp; use voice</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
    </section>
  );
}

