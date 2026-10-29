"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatTime } from "./format";

export type AudioSelection = { start: number; end: number };

type DragMode = "seek" | "start" | "end";

export function AudioPlayer({
  src,
  duration,
  peaks,
  fileName,
  formatLabel,
  selection,
  onSelectionChange,
  loopSelection = false,
  compact = false,
}: {
  src: string;
  duration: number;
  peaks: number[];
  fileName?: string;
  formatLabel?: string;
  selection?: AudioSelection;
  onSelectionChange?: (selection: AudioSelection) => void;
  loopSelection?: boolean;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const total = audioDuration || duration || 0;
  const progress = total > 0 ? Math.min(1, currentTime / total) : 0;
  const selectionStart = selection && total ? selection.start / total : 0;
  const selectionEnd = selection && total ? selection.end / total : 0;
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 80 }, () => 0.2);

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
    const audio = audioRef.current;
    if (audio) audio.load();
  }, [src]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        if (selection && loopSelection && audio.currentTime >= selection.end - 0.02) {
          audio.currentTime = selection.start;
        }
        setCurrentTime(audio.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loopSelection, playing, selection]);

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function timeAt(clientX: number) {
    const track = trackRef.current;
    if (!track || total <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1) * total;
  }

  function seekTo(time: number) {
    const audio = audioRef.current;
    const next = clamp(time, 0, total);
    if (audio) audio.currentTime = next;
    setCurrentTime(next);
  }

  function beginSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (total <= 0) return;
    event.preventDefault();
    trackRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = "seek";
    seekTo(timeAt(event.clientX));
  }

  function beginSelection(event: ReactPointerEvent<HTMLElement>, mode: "start" | "end") {
    if (!selection || !onSelectionChange || total <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    trackRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = mode;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const mode = dragRef.current;
    if (!mode) return;
    if (mode === "seek") {
      seekTo(timeAt(event.clientX));
      return;
    }
    if (!selection || !onSelectionChange) return;
    const time = timeAt(event.clientX);
    const gap = Math.min(0.2, total / 20);
    if (mode === "start") {
      onSelectionChange({
        start: clamp(time, 0, Math.max(0, selection.end - gap)),
        end: selection.end,
      });
    } else {
      onSelectionChange({
        start: selection.start,
        end: clamp(time, Math.min(total, selection.start + gap), total),
      });
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function onTrackKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekTo(currentTime - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seekTo(currentTime + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      seekTo(total);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (selection && loopSelection) {
      if (audio.currentTime < selection.start || audio.currentTime >= selection.end) {
        audio.currentTime = selection.start;
      }
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function skip(seconds: number) {
    seekTo(currentTime + seconds);
  }

  return (
    <div className={`rounded-[14px] border border-line bg-white ${compact ? "p-3.5" : "p-4"}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setAudioDuration(value);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          const audio = audioRef.current;
          if (selection && loopSelection && audio) {
            audio.currentTime = selection.start;
            void audio.play();
          } else {
            setPlaying(false);
          }
        }}
        className="hidden"
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
            {fileName ? "Preview" : "Waveform"}
          </span>
        </div>
        {formatLabel && (
          <span className="shrink-0 rounded-full border border-line bg-[#fbfaf7] px-2 py-0.5 text-[9px] font-medium text-muted">
            {formatLabel}
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Audio position"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime, true)} of ${formatTime(total, true)}`}
        onPointerDown={beginSeek}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onTrackKeyDown}
        className={`relative mt-3 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          compact ? "h-16" : "h-24"
        } cursor-pointer rounded-[8px] bg-[#fbfaf7]`}
      >
        <div className="absolute inset-0 flex items-center gap-[2px]">
          {bars.map((peak, index) => {
            const position = (index + 0.5) / bars.length;
            const played = position <= progress;
            const inSelection =
              Boolean(selection) && position >= selectionStart && position <= selectionEnd;
            return (
              <span
                key={index}
                className={`w-full flex-1 rounded-full transition-colors ${
                  played
                    ? "bg-ink"
                    : inSelection
                      ? "bg-accent/55"
                      : "bg-[#d8d2c5]"
                }`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            );
          })}
        </div>

        {selection && total > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-[4px] border-x border-accent/50 bg-accent/[0.06]"
            style={{
              left: `calc(${selectionStart * 100}% + 0px)`,
              right: `calc(${(1 - selectionEnd) * 100}% + 0px)`,
            }}
          />
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 w-px bg-accent"
          style={{ left: `calc(${progress * 100}%)` }}
        >
          <span className="absolute -left-[3px] -top-1 h-[7px] w-[7px] rounded-full border border-white bg-accent" />
        </span>

        {selection && onSelectionChange && total > 0 && (
          <>
            <SelectionHandle
              label="Drag selection start"
              left={selectionStart}
              onPointerDown={(event) => beginSelection(event, "start")}
            />
            <SelectionHandle
              label="Drag selection end"
              left={selectionEnd}
              onPointerDown={(event) => beginSelection(event, "end")}
            />
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => skip(-5)}
            aria-label="Back 5 seconds"
            className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <SkipBack size={13} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void togglePlayback()}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-[#2a2a2b]"
          >
            {playing ? (
              <Pause size={15} fill="currentColor" aria-hidden />
            ) : (
              <Play size={15} fill="currentColor" className="ml-0.5" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => skip(5)}
            aria-label="Forward 5 seconds"
            className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <SkipForward size={13} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selection && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9.5px] font-medium text-[#a8432c]">
              {formatTime(selection.end - selection.start, true)} selected
            </span>
          )}
          <span className="text-[10.5px] tabular-nums text-faint">
            <span className="font-medium text-ink">{formatTime(currentTime, true)}</span> /{" "}
            {formatTime(total, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SelectionHandle({
  label,
  left,
  onPointerDown,
}: {
  label: string;
  left: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      className="absolute top-1/2 z-20 h-9 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize"
      style={{ left: `${left * 100}%` }}
    >
      <span className="absolute left-1/2 top-1/2 h-7 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      <span className="absolute left-1/2 top-[3px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-accent bg-white shadow-sm" />
      <span className="absolute bottom-[3px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-accent bg-white shadow-sm" />
    </button>
  );
}
