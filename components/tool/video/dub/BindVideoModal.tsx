"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Download, Film, Loader2, UploadCloud, X } from "lucide-react";
import { formatBytes, formatTime } from "@/components/tool/audio/format";
import { Note, ResultCard } from "@/components/tool/kit";
import { buttonClasses } from "@/components/ui/Button";
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
    title: "Both tracks",
    desc: "Switch between dubbed and original in your player.",
  },
  {
    id: "mix_ducked",
    title: "Dub over original",
    desc: "The original stays, turned down under the dub.",
  },
  {
    id: "replace",
    title: "Dub only",
    desc: "The original audio is removed.",
  },
];

const SUBTITLE_MODE_OPTIONS: {
  id: DubBindSubtitleMode;
  title: string;
  desc: string;
}[] = [
  { id: "soft_both", title: "Both languages", desc: "Switchable tracks" },
  { id: "soft_translated", title: "Translated", desc: "Switchable track" },
  { id: "soft_original", title: "Original", desc: "Switchable track" },
  { id: "burn_translated", title: "Translated, burned in", desc: "Always visible · slower" },
  { id: "burn_original", title: "Original, burned in", desc: "Always visible · slower" },
  { id: "burn_dual", title: "Both, burned in", desc: "Always visible · slower" },
  { id: "none", title: "No subtitles", desc: "Audio only" },
];

const SECTION_LABEL = "text-[13px] font-semibold text-ink";
const TILE_BASE =
  "rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40";
const TILE_ON = "border-ink shadow-[inset_0_0_0_1px_#0f0f10]";
const TILE_OFF = "border-line hover:border-[#cfc9bd]";
const TEXT_BUTTON =
  "inline-flex h-7 items-center rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[3px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bind-modal-title"
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3
              id="bind-modal-title"
              className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink"
            >
              Add the dub to your video
            </h3>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {currentJob.sourceVideoName} · {formatTime(currentJob.durationSeconds, false)} · {targetLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bind dialog"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="studio-main space-y-6 overflow-y-auto p-5">
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv,.m4v"
            tabIndex={-1}
            aria-label="Choose the original video"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void validateAndSelectVideo(f, currentJob.durationSeconds);
            }}
            className="sr-only"
          />

          {boundResult && (
            <ResultCard
              className="[&>div:last-child]:max-w-full [&>div:nth-child(2)]:basis-[150px]"
              title="Your video is ready"
              meta={`${boundResult.fileName} · ${formatBytes(boundResult.blob.size)}`}
            >
              {boundResult.blob.size <= 45 * 1024 * 1024 && !boundResult.savedToVault && (
                <button
                  type="button"
                  onClick={() => void handleSaveToVault()}
                  disabled={savingVault}
                  className={buttonClasses("secondary", "md", "h-10 rounded-[12px]")}
                >
                  {savingVault ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <Cloud size={14} aria-hidden />
                  )}
                  Keep for 24 hours
                </button>
              )}
              <a
                href={boundResult.url}
                download={boundResult.fileName}
                className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2"
              >
                <Download size={15} aria-hidden />
                Download video
              </a>
            </ResultCard>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className={SECTION_LABEL}>Original video</p>
              {selectedVideo && (
                <button type="button" onClick={() => inputRef.current?.click()} className={TEXT_BUTTON}>
                  Choose another
                </button>
              )}
            </div>

            <div
              role={selectedVideo ? undefined : "button"}
              tabIndex={selectedVideo ? undefined : 0}
              aria-label={selectedVideo ? undefined : "Choose the original video"}
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
              onKeyDown={(e) => {
                if (selectedVideo) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              className={`rounded-[14px] border-[1.5px] border-dashed px-4 py-3.5 outline-none transition-colors focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 ${
                dragging
                  ? "border-accent bg-accent-soft"
                  : checkResult?.matches
                    ? "border-[#cfe6d8] bg-success-soft"
                    : checkResult && !checkResult.matches
                      ? "border-[#f1cfc9] bg-danger-soft"
                      : selectedVideo
                        ? "border-line bg-paper"
                        : "cursor-pointer border-[#d6d1c6] bg-paper hover:border-[#b9b2a4]"
              }`}
            >
              {!selectedVideo ? (
                <div className="flex flex-col items-center py-3 text-center">
                  <UploadCloud size={24} strokeWidth={1.6} className="text-muted" aria-hidden />
                  <p className="mt-2 text-[14px] font-medium text-ink">Choose or drop the original video</p>
                  <p className="mt-0.5 text-[12.5px] text-faint">
                    It should be about {formatTime(currentJob.durationSeconds, false)} long.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Film size={17} className="shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{selectedVideo.name}</p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-faint">
                        {formatBytes(selectedVideo.size)}
                        {checkResult ? ` · ${formatTime(checkResult.videoDuration, false)}` : ""}
                      </p>
                    </div>
                  </div>

                  {checking ? (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted"
                    >
                      <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
                      Checking length…
                    </span>
                  ) : checkResult?.matches ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
                      <CheckCircle2 size={14} aria-hidden />
                      Length matches
                    </span>
                  ) : checkResult && !checkResult.matches ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
                      <AlertTriangle size={14} aria-hidden />
                      Length does not match
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {checkResult && !checkResult.matches && (
              <Note tone="error" className="mt-2">
                {checkResult.message}
              </Note>
            )}

            {checkError && (
              <Note tone="error" className="mt-2">
                {checkError}
              </Note>
            )}
          </div>

          <div>
            <p className={`mb-2 ${SECTION_LABEL}`}>Audio</p>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {AUDIO_MODE_OPTIONS.map((opt) => {
                const active = audioMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAudioMode(opt.id)}
                    className={`${TILE_BASE} ${active ? TILE_ON : TILE_OFF}`}
                  >
                    <span className="block text-[13px] font-medium text-ink">{opt.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-faint">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className={SECTION_LABEL}>Subtitles</p>
              {(currentJob.srtText || currentJob.sourceSrtText || currentJob.dualSrtText) && (
                <div className="flex flex-wrap items-center gap-0.5 text-[12.5px] text-faint">
                  <span className="mr-1">Download SRT:</span>
                  {currentJob.srtText && (
                    <button
                      type="button"
                      onClick={() =>
                        onDownloadText(currentJob.srtText, `${stem}-${currentJob.targetLanguage}.srt`)
                      }
                      className={TEXT_BUTTON}
                    >
                      Translated
                    </button>
                  )}
                  {currentJob.sourceSrtText && (
                    <button
                      type="button"
                      onClick={() => onDownloadText(currentJob.sourceSrtText, `${stem}-original.srt`)}
                      className={TEXT_BUTTON}
                    >
                      Original
                    </button>
                  )}
                  {currentJob.dualSrtText && (
                    <button
                      type="button"
                      onClick={() => onDownloadText(currentJob.dualSrtText, `${stem}-dual.srt`)}
                      className={TEXT_BUTTON}
                    >
                      Both
                    </button>
                  )}
                </div>
              )}
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
                    aria-pressed={active}
                    disabled={noSubsAvailable}
                    onClick={() => setSubtitleMode(opt.id)}
                    className={`flex flex-wrap items-baseline justify-between gap-x-2 ${TILE_BASE} ${
                      active ? TILE_ON : TILE_OFF
                    }`}
                  >
                    <span className="text-[13px] font-medium text-ink">{opt.title}</span>
                    <span className="text-[12px] text-faint">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {bindStage && (
            <p role="status" className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <Loader2 size={15} className="animate-spin text-accent" aria-hidden />
              <span>{bindStage}</span>
            </p>
          )}

          {bindError && <Note tone="error">{bindError}</Note>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <p className="text-[12.5px] text-faint">Made on this device. Your video is not uploaded.</p>
          <div className="flex items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
            <button type="button" onClick={onClose} className={buttonClasses("secondary", "lg")}>
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleRunBind()}
              disabled={!selectedVideo || !checkResult?.matches || binding || checking}
              aria-busy={binding || undefined}
              className={buttonClasses("accent", "lg")}
            >
              {binding ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Film size={15} aria-hidden />
              )}
              {binding ? "Creating video…" : boundResult ? "Create again" : "Create video"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
