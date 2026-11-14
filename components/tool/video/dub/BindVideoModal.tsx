"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  AudioLines,
  Captions,
  CheckCircle2,
  Cloud,
  Download,
  Film,
  Loader2,
  Sparkles,
  Subtitles,
  UploadCloud,
  X,
} from "lucide-react";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import {
  getDubLanguageLabel,
  type DubBindAudioMode,
  type DubBindSubtitleMode,
  type DubJobSnapshot,
} from "@/lib/video/dub-types";
import {
  bindDubbedAudioToVideoInBrowser,
  detectMediaKind,
  verifyVideoMatchesDubDuration,
  type DurationMatchCheck,
} from "./video-audio-utils";

export type BindVideoModalProps = {
  job: DubJobSnapshot | null;
  loadedVideoFile: File | null;
  workerAuth?: { url: string; token: string; expiresAt: number } | null;
  onClose: () => void;
  onDownloadText: (content: string, fileName: string) => void;
  onSavedToVault?: (updatedJob: DubJobSnapshot) => void;
};

const AUDIO_MODE_OPTIONS: {
  id: DubBindAudioMode;
  title: string;
  desc: string;
}[] = [
  {
    id: "keep_both",
    title: "Keep both audio tracks",
    desc: "Dual-language stream: switch between Dubbed & Original in any player.",
  },
  {
    id: "mix_ducked",
    title: "Mix over ducked original",
    desc: "Blends dubbed speech cleanly above lowered original sound bed.",
  },
  {
    id: "replace",
    title: "Dubbed audio only",
    desc: "Replaces original audio completely with the dubbed track.",
  },
];

const SUBTITLE_MODE_OPTIONS: {
  id: DubBindSubtitleMode;
  title: string;
  badge: string;
}[] = [
  { id: "soft_both", title: "Keep both subtitle tracks", badge: "Fast · Toggleable" },
  { id: "soft_translated", title: "Translated subtitles only", badge: "Fast · Soft track" },
  { id: "soft_original", title: "Original subtitles only", badge: "Fast · Soft track" },
  { id: "burn_translated", title: "Burn-in translated captions", badge: "Hard-baked" },
  { id: "burn_original", title: "Burn-in original captions", badge: "Hard-baked" },
  { id: "burn_dual", title: "Burn-in dual bilingual captions", badge: "Hard-baked" },
  { id: "none", title: "No subtitles in video", badge: "Audio only" },
];

export function BindVideoModal({
  job,
  loadedVideoFile,
  workerAuth,
  onClose,
  onDownloadText,
  onSavedToVault,
}: BindVideoModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<DurationMatchCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [audioMode, setAudioMode] = useState<DubBindAudioMode>("keep_both");
  const [subtitleMode, setSubtitleMode] = useState<DubBindSubtitleMode>("soft_both");

  const [binding, setBinding] = useState(false);
  const [bindStage, setBindStage] = useState<string | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);
  const [boundResult, setBoundResult] = useState<{
    url: string;
    blob: Blob;
    fileName: string;
    savedToVault?: boolean;
  } | null>(null);
  const [savingVault, setSavingVault] = useState(false);

  async function validateAndSelectVideo(file: File, expectedDuration: number) {
    setCheckError(null);
    setCheckResult(null);
    setBindError(null);
    setBoundResult(null);

    const kind = detectMediaKind(file);
    if (kind !== "video") {
      setCheckError("Please select a video file (MP4, MOV, WebM, or MKV) to bind audio onto.");
      return;
    }

    setSelectedVideo(file);
    setChecking(true);
    try {
      const check = await verifyVideoMatchesDubDuration(file, expectedDuration);
      setCheckResult(check);
    } catch (err) {
      setCheckError(
        err instanceof Error ? err.message : "Could not inspect video duration.",
      );
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!job) {
      setSelectedVideo(null);
      setCheckResult(null);
      setCheckError(null);
      setBoundResult(null);
      return;
    }

    setBoundResult(null);
    setBindError(null);
    setAudioMode(job.keepBackground ? "keep_both" : "keep_both");
    setSubtitleMode(job.sourceSrtText && job.srtText ? "soft_both" : job.srtText ? "soft_translated" : "none");

    if (loadedVideoFile) {
      void validateAndSelectVideo(loadedVideoFile, job.durationSeconds);
    } else {
      setSelectedVideo(null);
      setCheckResult(null);
      setCheckError(null);
    }
  }, [job?.id]);

  if (!job) return null;

  const currentJob = job;
  const targetLabel = getDubLanguageLabel(currentJob.targetLanguage);
  const sourceLabel = getDubLanguageLabel(currentJob.sourceLanguage);
  const stem = currentJob.sourceVideoName.replace(/\.[^/.]+$/, "") || "video";

  async function handleRunBind() {
    if (!selectedVideo || !checkResult?.matches || !currentJob.audioUrl) return;
    setBinding(true);
    setBindError(null);
    setBindStage("Preparing dubbed audio...");
    try {
      const res = await bindDubbedAudioToVideoInBrowser({
        sourceVideo: selectedVideo,
        dubbedAudioUrl: currentJob.audioUrl,
        segments: currentJob.segments,
        audioMode,
        subtitleMode,
        sourceSrtText: currentJob.sourceSrtText || "",
        translatedSrtText: currentJob.srtText || "",
        sourceLanguageLabel: sourceLabel === "Auto-detect" ? "Original" : sourceLabel,
        targetLanguageLabel: targetLabel,
        targetLanguageCode: currentJob.targetLanguage,
        backgroundLevel: currentJob.backgroundLevel,
        onProgress: setBindStage,
      });
      setBoundResult(res);
      setBindStage(null);
    } catch (err) {
      setBindStage(null);
      setBindError(err instanceof Error ? err.message : "Browser video binding failed.");
    } finally {
      setBinding(false);
    }
  }

  async function handleSaveToVault() {
    if (!boundResult) return;
    setSavingVault(true);
    setBindError(null);
    try {
      const form = new FormData();
      form.append("file", boundResult.blob, boundResult.fileName);
      form.append("fileName", boundResult.fileName);
      let res: Response | null = null;
      if (workerAuth && workerAuth.expiresAt > Date.now() + 60_000) {
        try {
          const direct = await fetch(`${workerAuth.url}/api/video/dub/jobs/${currentJob.id}`, {
            method: "POST",
            headers: { "x-worker-token": workerAuth.token },
            body: form,
          });
          if (direct.status < 500) {
            res = direct;
          }
        } catch {
          // Fall back to Next.js API proxy
        }
      }
      if (!res) {
        res = await fetch(`/api/video/dub/jobs/${currentJob.id}`, {
          method: "POST",
          body: form,
        });
      }
      const data = (await res.json()) as { job?: DubJobSnapshot; error?: string };
      if (!res.ok || !data.job) {
        throw new Error(data.error || "Could not upload bound MP4 to vault.");
      }
      setBoundResult((cur) => (cur ? { ...cur, savedToVault: true } : cur));
      onSavedToVault?.(data.job);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSavingVault(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bind-modal-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_24px_80px_rgba(15,15,16,0.28)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-[#fafaf9] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-ink text-white">
              <Film size={17} aria-hidden />
            </span>
            <div>
              <h3 id="bind-modal-title" className="text-[15px] font-semibold text-ink">
                Bind dubbed audio to video
              </h3>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Runs 100% locally in your browser · {currentJob.sourceVideoName} ({formatTime(currentJob.durationSeconds, false)})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bind dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-rail hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-5">
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv,.m4v"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void validateAndSelectVideo(f, currentJob.durationSeconds);
            }}
            className="hidden"
          />

          {/* Step 1: Select & verify original video */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                1. Original video file
              </p>
              {selectedVideo && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  Choose different video
                </button>
              )}
            </div>

            <div
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void validateAndSelectVideo(f, currentJob.durationSeconds);
              }}
              onClick={() => {
                if (!selectedVideo) inputRef.current?.click();
              }}
              className={`rounded-[16px] border border-dashed p-4 transition-colors ${
                dragging
                  ? "border-accent bg-accent/[0.04]"
                  : checkResult?.matches
                    ? "border-[#9bc5a7] bg-[#f4faf5]"
                    : checkResult && !checkResult.matches
                      ? "border-[#eab2ad] bg-[#fdf4f3]"
                      : "cursor-pointer border-[#d5d5d0] bg-[#fafaf9] hover:border-ink/40"
              }`}
            >
              {!selectedVideo ? (
                <div className="flex flex-col items-center py-3 text-center">
                  <UploadCloud size={22} className="text-muted" aria-hidden />
                  <p className="mt-2 text-[13px] font-medium text-ink">
                    Select or drag your original video here
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Expected duration: ~{formatTime(currentJob.durationSeconds, false)} · Target file: {currentJob.sourceVideoName}
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{selectedVideo.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatBytes(selectedVideo.size)}
                      {checkResult ? ` · Duration ${formatTime(checkResult.videoDuration, false)}` : ""}
                    </p>
                  </div>

                  {checking ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink">
                      <Loader2 size={12} className="animate-spin text-accent" aria-hidden />
                      Checking duration...
                    </span>
                  ) : checkResult?.matches ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f3e7] px-2.5 py-1 text-[11px] font-semibold text-[#236337]">
                      <CheckCircle2 size={12} aria-hidden />
                      Duration matches
                    </span>
                  ) : checkResult && !checkResult.matches ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fae2df] px-2.5 py-1 text-[11px] font-semibold text-[#9b3127]">
                      <AlertTriangle size={12} aria-hidden />
                      Duration mismatch
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {checkResult && !checkResult.matches && (
              <div className="flex items-start gap-2 rounded-[12px] border border-[#f2c6c2] bg-[#fdf4f3] px-3.5 py-2.5 text-[11.5px] text-[#9b3127]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span>{checkResult.message}</span>
              </div>
            )}

            {checkError && (
              <div className="flex items-start gap-2 rounded-[12px] border border-[#f2c6c2] bg-[#fdf4f3] px-3.5 py-2.5 text-[11.5px] text-[#9b3127]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span>{checkError}</span>
              </div>
            )}
          </div>

          {/* Step 2: Audio tracks mode */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <AudioLines size={12} className="text-accent" aria-hidden />
              2. Audio track configuration
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {AUDIO_MODE_OPTIONS.map((opt) => {
                const active = audioMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudioMode(opt.id)}
                    className={`rounded-[13px] border p-3 text-left transition-all ${
                      active
                        ? "border-ink bg-[#fcfcfb] shadow-[0_2px_8px_rgba(15,15,16,0.06)]"
                        : "border-line bg-white hover:bg-rail/50"
                    }`}
                  >
                    <p className="text-[12px] font-semibold text-ink">{opt.title}</p>
                    <p className="mt-1 text-[10.5px] leading-snug text-faint">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Subtitles mode */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                <Subtitles size={12} className="text-accent" aria-hidden />
                3. Subtitles embedding
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {currentJob.srtText && (
                  <button
                    type="button"
                    onClick={() =>
                      onDownloadText(currentJob.srtText, `${stem}-${currentJob.targetLanguage}.srt`)
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-rail px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white"
                  >
                    <Captions size={10} aria-hidden />
                    Translated .SRT
                  </button>
                )}
                {currentJob.sourceSrtText && (
                  <button
                    type="button"
                    onClick={() => onDownloadText(currentJob.sourceSrtText, `${stem}-original.srt`)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-rail px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white"
                  >
                    <Captions size={10} aria-hidden />
                    Original .SRT
                  </button>
                )}
                {currentJob.dualSrtText && (
                  <button
                    type="button"
                    onClick={() => onDownloadText(currentJob.dualSrtText, `${stem}-dual.srt`)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-rail px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white"
                  >
                    <Captions size={10} aria-hidden />
                    Dual .SRT
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2">
              {SUBTITLE_MODE_OPTIONS.map((opt) => {
                const active = subtitleMode === opt.id;
                const noSubsAvailable =
                  opt.id !== "none" && !currentJob.srtText && !currentJob.sourceSrtText;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={noSubsAvailable}
                    onClick={() => setSubtitleMode(opt.id)}
                    className={`flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-ink hover:bg-rail/60"
                    }`}
                  >
                    <span className="text-[11.5px] font-medium">{opt.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] ${
                        active ? "bg-white/15 text-white" : "bg-rail text-faint"
                      }`}
                    >
                      {opt.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {bindStage && (
            <div className="flex items-center gap-2 rounded-[12px] border border-line bg-[#fafaf9] px-3.5 py-2.5 text-[12px] font-medium text-ink">
              <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
              <span>{bindStage}</span>
            </div>
          )}

          {bindError && (
            <div className="rounded-[12px] border border-[#f2c6c2] bg-[#fdf4f3] px-3.5 py-2.5 text-[11.5px] text-[#9b3127]">
              {bindError}
            </div>
          )}

          {boundResult && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#9bc5a7] bg-[#f4faf5] p-3.5">
              <div>
                <p className="text-[12.5px] font-semibold text-[#1f5731]">
                  Bound video ready ({formatBytes(boundResult.blob.size)})
                </p>
                <p className="text-[11px] text-[#356c46]">{boundResult.fileName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={boundResult.url}
                  download={boundResult.fileName}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12px] font-medium text-white hover:bg-[#242426]"
                >
                  <Download size={13} aria-hidden />
                  Download Video
                </a>
                {boundResult.blob.size <= 45 * 1024 * 1024 && !boundResult.savedToVault && (
                  <button
                    type="button"
                    onClick={() => void handleSaveToVault()}
                    disabled={savingVault}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[11.5px] font-medium text-ink hover:bg-rail"
                  >
                    {savingVault ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Cloud size={12} aria-hidden />
                    )}
                    Save to 24h vault
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-[#fafaf9] px-5 py-3.5">
          <p className="text-[11px] text-faint">
            No video is uploaded to servers · processed cleanly on your device
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-full border border-line bg-white px-4 text-[12px] font-medium text-ink hover:bg-rail"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleRunBind()}
              disabled={!selectedVideo || !checkResult?.matches || binding || checking}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-5 text-[12px] font-semibold text-white transition hover:bg-[#232325] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {binding ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Sparkles size={13} aria-hidden />
              )}
              {binding ? "Binding..." : "Bind & Export Video"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
