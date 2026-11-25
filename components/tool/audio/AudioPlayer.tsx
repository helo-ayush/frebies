"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Loader2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { formatTime } from "./format";

export type AudioSelection = { start: number; end: number };

type DragMode = "seek" | "start" | "end";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75, 0.5];

/**
 * Waveform player. Three looks from the same props:
 *  - default: a preview that grows to fill a flex column;
 *  - `compact`: a short strip for results;
 *  - with `selection` + `onSelectionChange`: a trim editor, with a tall
 *    waveform and two draggable handles.
 */
export function AudioPlayer({
  src,
  duration,
  peaks,
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
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  const total = audioDuration || duration || 0;
  const progress = total > 0 ? Math.min(1, currentTime / total) : 0;
  const selectionStart = selection && total ? selection.start / total : 0;
  const selectionEnd = selection && total ? selection.end / total : 0;
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 80 }, () => 0.2);
  const editing = Boolean(selection && onSelectionChange);

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
    setLoading(false);
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

  /** Moves one edge of the selection, keeping the minimum gap between the two. */
  function moveSelectionEdge(mode: "start" | "end", time: number) {
    if (!selection || !onSelectionChange) return;
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

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const mode = dragRef.current;
    if (!mode) return;
    if (mode === "seek") {
      seekTo(timeAt(event.clientX));
      return;
    }
    moveSelectionEdge(mode, timeAt(event.clientX));
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

  /** Arrow keys nudge a focused handle: 0.1 s, or 1 s with Shift. */
  function onHandleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, mode: "start" | "end") {
    if (!selection || total <= 0) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 1 : 0.1) * (event.key === "ArrowLeft" ? -1 : 1);
    moveSelectionEdge(mode, (mode === "start" ? selection.start : selection.end) + step);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing || loading) {
      audio.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }
    if (selection && loopSelection) {
      if (audio.currentTime < selection.start || audio.currentTime >= selection.end) {
        audio.currentTime = selection.start;
      }
    }
    if (audio.readyState < 3) {
      setLoading(true);
    }
    try {
      await audio.play();
      setPlaying(true);
      setLoading(false);
    } catch {
      setPlaying(false);
      setLoading(false);
    }
  }

  function skip(seconds: number) {
    seekTo(currentTime + seconds);
  }

  function changeVolume(next: number) {
    const audio = audioRef.current;
    const clamped = Math.min(1, Math.max(0, next));
    setVolume(clamped);
    if (audio) audio.volume = clamped;
  }

  function changeRate(next: number) {
    const audio = audioRef.current;
    setRate(next);
    if (audio) {
      audio.playbackRate = next;
      audio.defaultPlaybackRate = next;
    }
  }

  function cycleRate() {
    const index = PLAYBACK_RATES.indexOf(rate);
    changeRate(PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]);
  }

  const trackSize = editing
    ? "mx-2.5 min-h-[176px] flex-1 lg:min-h-[240px]"
    : compact
      ? "h-14"
      : "min-h-[112px] flex-1";
  const skipButton = `grid shrink-0 place-items-center rounded-full border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink ${
    compact ? "h-8 w-8" : "h-9 w-9"
  }`;

  return (
    <div
      className={`min-w-0 rounded-[14px] border border-line bg-white ${
        compact ? "p-3" : "flex flex-1 flex-col p-3.5 sm:p-4"
      }`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setAudioDuration(value);
        }}
        onPlay={() => setPlaying(true)}
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPause={() => {
          setPlaying(false);
          setLoading(false);
        }}
        onError={() => {
          setPlaying(false);
          setLoading(false);
        }}
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

      <div
        ref={trackRef}
        role="slider"
        data-sound="none"
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
        className={`relative cursor-pointer touch-none select-none rounded-[10px] bg-card outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${trackSize}`}
      >
        {selection && total > 0 && (
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 ${
              editing ? "border-y-[3px] border-accent bg-white" : "bg-accent-soft"
            }`}
            style={{
              left: `${selectionStart * 100}%`,
              right: `${(1 - selectionEnd) * 100}%`,
            }}
          />
        )}

        <div className={`absolute inset-x-0 flex items-center gap-[2px] ${editing ? "inset-y-3" : "inset-y-1.5"}`}>
          {bars.map((peak, index) => {
            const position = (index + 0.5) / bars.length;
            const played = position <= progress;
            const inSelection =
              Boolean(selection) && position >= selectionStart && position <= selectionEnd;
            const tone = selection
              ? inSelection
                ? played
                  ? "bg-ink"
                  : "bg-accent/70"
                : "bg-[#ddd8cd]"
              : played
                ? "bg-ink"
                : "bg-[#d8d2c5]";
            return (
              <span
                key={index}
                className={`w-full flex-1 rounded-full transition-colors ${tone}`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            );
          })}
        </div>

        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full ${
            editing ? "bg-ink" : "bg-accent"
          }`}
          style={{ left: `${progress * 100}%` }}
        />

        {selection && onSelectionChange && total > 0 && (
          <>
            <SelectionHandle
              side="start"
              label="Drag selection start"
              left={selectionStart}
              onPointerDown={(event) => beginSelection(event, "start")}
              onKeyDown={(event) => onHandleKeyDown(event, "start")}
            />
            <SelectionHandle
              side="end"
              label="Drag selection end"
              left={selectionEnd}
              onPointerDown={(event) => beginSelection(event, "end")}
              onKeyDown={(event) => onHandleKeyDown(event, "end")}
            />
          </>
        )}
      </div>

      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 ${
          compact ? "mt-2.5" : "mt-3"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => skip(-5)} aria-label="Back 5 seconds" className={skipButton}>
            <SkipBack size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void togglePlayback()}
            aria-label={loading ? "Loading audio" : playing ? "Pause" : "Play"}
            aria-busy={loading}
            className={`grid shrink-0 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-[#2a2a2b] ${
              compact ? "h-10 w-10" : "h-11 w-11"
            }`}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : playing ? (
              <Pause size={16} fill="currentColor" aria-hidden />
            ) : (
              <Play size={16} fill="currentColor" className="ml-0.5" aria-hidden />
            )}
          </button>
          <button type="button" onClick={() => skip(5)} aria-label="Forward 5 seconds" className={skipButton}>
            <SkipForward size={14} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-line bg-white px-1.5 py-1">
          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${rate}×`}
            title={`Playback speed ${rate}×`}
            className="h-7 min-w-[42px] rounded-full px-1.5 text-[12px] font-medium tabular-nums text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            {rate}×
          </button>
          <span className="h-4 w-px bg-line" aria-hidden />
          <button
            type="button"
            onClick={() => changeVolume(volume > 0 ? 0 : 1)}
            aria-label={volume > 0 ? "Mute" : "Unmute"}
            className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            {volume > 0 ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(event) => changeVolume(Number(event.target.value))}
            className="mr-1 hidden h-1 w-16 cursor-pointer accent-ink sm:block"
          />
        </div>

        <div className="flex items-center gap-2">
          {formatLabel && (
            <span className="inline-flex h-6 items-center rounded-full border border-line bg-white px-2.5 text-[12px] font-medium text-muted">
              {formatLabel}
            </span>
          )}
          <span className="text-[13px] tabular-nums text-faint">
            <span className="font-semibold text-ink">{formatTime(currentTime, true)}</span> /{" "}
            {formatTime(total, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * One edge of the trim selection. The hit area is 44px wide for touch; the
 * visible bar sits just outside the selection so it never covers kept audio.
 */
function SelectionHandle({
  side,
  label,
  left,
  onPointerDown,
  onKeyDown,
}: {
  side: "start" | "end";
  label: string;
  left: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 z-20 w-11 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: `${left * 100}%` }}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 grid w-3.5 place-items-center bg-accent shadow-[0_2px_8px_-2px_rgba(207,74,44,0.6)] transition-colors group-hover:bg-accent-deep group-active:bg-accent-deep ${
          side === "start" ? "right-1/2 rounded-l-[7px]" : "left-1/2 rounded-r-[7px]"
        }`}
      >
        <span className="h-6 w-[3px] rounded-full bg-white/90" />
      </span>
    </button>
  );
}
