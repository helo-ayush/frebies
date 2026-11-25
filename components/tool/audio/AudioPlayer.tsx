"use client";

/**
 * The audio deck. An ink face with a time ruler, a waveform that fills in coral
 * as it plays, and the landing machine's round button. Three looks from the
 * same props:
 *  - default: grows to fill a flex column;
 *  - `compact`: one strip, for results and lists;
 *  - with `selection` + `onSelectionChange`: a trim editor with two handles.
 *
 * Space plays and pauses, arrows seek, and only one deck plays at a time.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { bringToFront, registerDeck, type Deck } from "@/components/tool/viewer/decks";
import { formatTime } from "./format";

export type AudioSelection = { start: number; end: number };

type DragMode = "seek" | "start" | "end";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75, 0.5];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ---- Waveform -------------------------------------------------------------------

/** Loudest value in each of `count` slices. */
function resample(peaks: readonly number[], count: number): number[] {
  if (peaks.length <= count) return [...peaks];
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index / count) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((index + 1) / count) * peaks.length));
    let max = 0;
    for (let cursor = from; cursor < to; cursor += 1) max = Math.max(max, peaks[cursor]);
    return max;
  });
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

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
  tone,
  keepPosition = false,
  className = "",
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
  /** Ink by default; light for strips inside lists. */
  tone?: "ink" | "light";
  /** Carry on from the same moment when `src` changes, for A/B listening. */
  keepPosition?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const help = useId();

  const look = tone ?? "ink";
  const ink = look === "ink";
  const total = audioDuration || duration || 0;
  const progress = total > 0 ? Math.min(1, currentTime / total) : 0;
  const selectionStart = selection && total ? selection.start / total : 0;
  const selectionEnd = selection && total ? selection.end / total : 0;
  const editing = Boolean(selection && onSelectionChange);

  // ---- Source changes -------------------------------------------------------------
  const positionRef = useRef({ time: 0, playing: false });
  positionRef.current = { time: currentTime, playing };
  const firstSrc = useRef(src);
  useEffect(() => {
    const changed = firstSrc.current !== src;
    firstSrc.current = src;
    resumeRef.current =
      keepPosition && changed ? { time: positionRef.current.time, play: positionRef.current.playing } : null;
    if (!resumeRef.current) setCurrentTime(0);
    setPlaying(false);
    setLoading(false);
    audioRef.current?.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ---- Measure ----------------------------------------------------------------------
  useLayoutEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const wave = useMemo(() => {
    if (box.w === 0 || box.h === 0) return { path: "", width: 2 };
    const source = peaks.length > 0 ? peaks : Array.from({ length: 80 }, () => 0.2);
    const pitch = compact ? 4 : 5;
    const bars = resample(source, clamp(Math.floor(box.w / pitch), 12, 400));
    const step = box.w / bars.length;
    const middle = box.h / 2;
    const reach = box.h / 2 - (compact ? 4 : editing ? 16 : 10);
    const path = bars
      .map((peak, index) => {
        const x = (index + 0.5) * step;
        const half = Math.max(1.5, peak * reach);
        return `M${x.toFixed(2)} ${(middle - half).toFixed(1)}V${(middle + half).toFixed(1)}`;
      })
      .join("");
    return { path, width: Math.max(1.5, step * 0.62) };
  }, [box.h, box.w, compact, editing, peaks]);

  // ---- Seeking and trimming --------------------------------------------------------
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
    if (total <= 0 || event.button !== 0) return;
    trackRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = "seek";
    seekTo(timeAt(event.clientX));
  }

  function beginSelection(event: ReactPointerEvent<HTMLElement>, mode: "start" | "end") {
    if (!selection || !onSelectionChange || total <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
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
    if (hoverRef.current && trackRef.current && total > 0) {
      const rect = trackRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      hoverRef.current.style.transform = `translateX(${x}px)`;
      hoverRef.current.dataset.time = formatTime((x / rect.width) * total, true);
    }
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
    if (event.target !== event.currentTarget) return;
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") seekTo(currentTime - step);
    else if (event.key === "ArrowRight") seekTo(currentTime + step);
    else if (event.key === "Home") seekTo(0);
    else if (event.key === "End") seekTo(total);
    else if (event.key === " " || event.key === "Enter") void togglePlayback();
    else return;
    event.preventDefault();
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

  // ---- Playback --------------------------------------------------------------------
  const deckRef = useRef<Deck>({ toggle: () => undefined, pause: () => undefined });

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
    if (audio.readyState < 3) setLoading(true);
    bringToFront(deckRef.current);
    try {
      await audio.play();
      setPlaying(true);
      setLoading(false);
    } catch {
      setPlaying(false);
      setLoading(false);
    }
  }

  deckRef.current.toggle = () => void togglePlayback();
  deckRef.current.pause = () => audioRef.current?.pause();
  useEffect(() => registerDeck(deckRef.current), []);

  function changeVolume(next: number) {
    const audio = audioRef.current;
    const value = clamp(next, 0, 1);
    setVolume(value);
    if (audio) audio.volume = value;
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

  // ---- Pieces ----------------------------------------------------------------------
  const face = ink ? "bg-ink text-white" : "bg-panel text-ink";
  const rule = ink ? "border-white/15" : "border-line";
  const idle = ink ? "rgba(255,255,255,.36)" : "#a5a4a2";
  const quiet = ink ? "text-white/60 hover:bg-white hover:text-ink" : "text-muted hover:bg-ink hover:text-white";
  const beyond = ink ? "rgba(255,255,255,.16)" : "#cfcfcb";

  const audioTag = (
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget;
        if (Number.isFinite(audio.duration)) setAudioDuration(audio.duration);
        audio.volume = volume;
        audio.playbackRate = rate;
        const resume = resumeRef.current;
        resumeRef.current = null;
        if (!resume) return;
        audio.currentTime = Math.min(resume.time, audio.duration || resume.time);
        setCurrentTime(audio.currentTime);
        if (resume.play) void audio.play().catch(() => undefined);
      }}
      onPlay={() => {
        bringToFront(deckRef.current);
        setPlaying(true);
      }}
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
  );

  const track = (
    <div
      ref={trackRef}
      role="slider"
      data-sound="none"
      tabIndex={0}
      aria-label={fileName ? `${fileName}, position` : "Audio position"}
      aria-describedby={help}
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatTime(currentTime, true)} of ${formatTime(total, true)}`}
      onPointerDown={beginSeek}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onTrackKeyDown}
      className={`group/track relative min-w-0 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        editing ? "mx-4 min-h-[150px] flex-1" : compact ? "h-14 flex-1" : "min-h-[120px] flex-1"
      }`}
      style={{ touchAction: editing ? "none" : "pan-y" }}
    >
      <span id={help} className="sr-only">
        Space plays and pauses, arrow keys move two seconds.
      </span>

      {/* Kept part */}
      {editing && total > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 border-y-[3px] border-accent bg-white/[0.07]"
          style={{ left: `${selectionStart * 100}%`, right: `${(1 - selectionEnd) * 100}%` }}
        />
      ) : null}

      <svg aria-hidden width={box.w} height={box.h} className="pointer-events-none absolute inset-0">
        <path d={wave.path} stroke={editing ? beyond : idle} strokeWidth={wave.width} fill="none" />
      </svg>
      {editing && total > 0 ? (
        <svg
          aria-hidden
          width={box.w}
          height={box.h}
          className="pointer-events-none absolute inset-0"
          style={{ clipPath: `inset(0 ${(1 - selectionEnd) * 100}% 0 ${selectionStart * 100}%)` }}
        >
          <path d={wave.path} stroke="rgba(255,255,255,.78)" strokeWidth={wave.width} fill="none" />
        </svg>
      ) : null}
      <svg
        aria-hidden
        width={box.w}
        height={box.h}
        className="pointer-events-none absolute inset-0"
        style={{
          clipPath: editing
            ? `inset(0 ${(1 - clamp(progress, selectionStart, selectionEnd)) * 100}% 0 ${selectionStart * 100}%)`
            : `inset(0 ${(1 - progress) * 100}% 0 0)`,
        }}
      >
        <path d={wave.path} stroke="#f2552c" strokeWidth={wave.width} fill="none" />
      </svg>

      {/* Under the pointer */}
      <span
        ref={hoverRef}
        aria-hidden
        data-time=""
        className={`pointer-events-none absolute inset-y-0 left-0 w-px opacity-0 transition-opacity group-hover/track:opacity-100 ${
          ink ? "bg-white/45" : "bg-ink/40"
        } ${
          compact
            ? ""
            : "after:absolute after:left-1.5 after:top-1 after:whitespace-nowrap after:text-[11.5px] after:tabular-nums after:text-white/70 after:content-[attr(data-time)]"
        }`}
      />

      {/* Playhead */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${progress * 100}%` }}>
        <span className={`absolute inset-y-0 -left-px w-[2px] ${ink ? "bg-white" : "bg-ink"}`} />
        {!compact ? <span className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] bg-accent" /> : null}
      </span>

      {selection && onSelectionChange && total > 0 ? (
        <>
          <SelectionHandle
            side="start"
            label="Drag selection start"
            left={selectionStart}
            time={selection.start}
            onPointerDown={(event) => beginSelection(event, "start")}
            onKeyDown={(event) => onHandleKeyDown(event, "start")}
          />
          <SelectionHandle
            side="end"
            label="Drag selection end"
            left={selectionEnd}
            time={selection.end}
            onPointerDown={(event) => beginSelection(event, "end")}
            onKeyDown={(event) => onHandleKeyDown(event, "end")}
          />
        </>
      ) : null}
    </div>
  );

  const playKey = (size: number) => (
    <button
      type="button"
      onClick={() => void togglePlayback()}
      aria-label={loading ? "Loading audio" : playing ? "Pause" : "Play"}
      aria-busy={loading || undefined}
      data-playing={playing || undefined}
      className="fb-play shrink-0"
      style={{ width: size, height: size }}
    >
      {loading ? (
        <Loader2 size={Math.round(size * 0.34)} className="animate-spin" aria-hidden />
      ) : playing ? (
        <svg aria-hidden width={size * 0.34} height={size * 0.34} viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 1h3v10H2zM7 1h3v10H7z" />
        </svg>
      ) : (
        <svg aria-hidden width={size * 0.34} height={size * 0.34} viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 .8 11 6l-8 5.2z" />
        </svg>
      )}
    </button>
  );

  const rateKey = (
    <button
      type="button"
      onClick={cycleRate}
      aria-label={`Playback speed ${rate}×`}
      title={`Playback speed ${rate}×`}
      className={`fb-num h-full min-w-[52px] px-2 text-[13px] font-medium transition-colors ${quiet}`}
    >
      {rate}×
    </button>
  );

  const muteKey = (
    <button
      type="button"
      onClick={() => changeVolume(volume > 0 ? 0 : 1)}
      aria-label={volume > 0 ? "Mute" : "Unmute"}
      className={`grid h-full w-12 shrink-0 place-items-center transition-colors ${quiet}`}
    >
      {volume > 0 ? <Volume2 size={17} aria-hidden /> : <VolumeX size={17} aria-hidden />}
    </button>
  );

  if (compact) {
    return (
      <div className={`fb-deckrow min-w-0 ${face} ${ink ? "" : "border border-line"} ${className}`}>
        {audioTag}
        <div className="flex min-w-0 items-center">
          <span className={`grid w-[68px] shrink-0 place-items-center self-stretch ${ink ? "bg-black/40" : "border-r border-line"}`}>
            {playKey(44)}
          </span>
          <div className="flex min-w-0 flex-1 items-center px-3 py-2.5">{track}</div>
          <span className="fb-num shrink-0 px-3 text-[13px]">
            <span className="font-semibold">{formatTime(currentTime)}</span>
            <span className={ink ? "text-white/50" : "text-faint"}> / {formatTime(total)}</span>
          </span>
          {formatLabel ? (
            <span className={`shrink-0 border-l px-3 text-[12.5px] uppercase max-md:hidden ${rule} ${ink ? "text-white/60" : "text-muted"}`}>
              {formatLabel}
            </span>
          ) : null}
          <span className={`fb-deckrow-keys flex shrink-0 self-stretch border-l ${rule}`}>
            {rateKey}
            {muteKey}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 flex-col ${face} ${className}`}>
      {audioTag}
      <TimeRuler total={total} inset={editing ? 16 : 0} />
      <div className="flex min-h-0 flex-1 flex-col py-4">{track}</div>

      <div className={`flex shrink-0 flex-wrap items-stretch border-t ${rule}`}>
        <span className="grid w-[92px] shrink-0 place-items-center bg-black/40 py-3">{playKey(64)}</span>
        <span className="flex min-w-[168px] flex-1 flex-col justify-center px-5 py-3">
          <span className="fb-wide fb-num text-[clamp(22px,2.2vw,32px)] normal-case !tracking-[-0.02em]">
            {formatTime(currentTime, true)}
          </span>
          <span className="fb-num mt-1.5 text-[13px] text-white/55">
            {editing && selection ? (
              <>
                of {formatTime(total, true)}, keeping {formatTime(selection.end - selection.start, true)}
              </>
            ) : (
              <>
                of {formatTime(total, true)}
                {formatLabel ? ` · ${formatLabel}` : ""}
              </>
            )}
          </span>
        </span>
        <span className={`flex items-stretch max-sm:w-full max-sm:border-t ${rule}`}>
          <button
            type="button"
            onClick={() => seekTo(currentTime - 5)}
            aria-label="Back 5 seconds"
            className={`min-h-[52px] min-w-[58px] flex-1 border-l px-2 text-[13px] font-medium transition-colors max-sm:border-l-0 ${rule} ${quiet}`}
          >
            −5 s
          </button>
          <button
            type="button"
            onClick={() => seekTo(currentTime + 5)}
            aria-label="Forward 5 seconds"
            className={`min-w-[58px] flex-1 border-l px-2 text-[13px] font-medium transition-colors ${rule} ${quiet}`}
          >
            +5 s
          </button>
          <span className={`flex border-l ${rule}`}>{rateKey}</span>
          <span className={`flex items-center border-l ${rule}`}>
            {muteKey}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Volume"
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="range fb-deck-range mr-4 hidden !w-[84px] md:block"
              style={{ ["--fill" as string]: `${volume * 100}%` }}
            />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Seconds along the top edge of a deck. */
function TimeRuler({ total, inset }: { total: number; inset: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const span = Math.max(0, width - inset * 2);
  const perSecond = total > 0 ? span / total : 0;
  const step = STEPS.find((value) => value * perSecond >= 76) ?? STEPS[STEPS.length - 1];
  const minor = step / 5;
  const count = perSecond > 0 ? Math.floor(total / minor + 1e-6) : 0;

  return (
    <div ref={ref} aria-hidden className="relative h-[26px] shrink-0 border-b border-white/15 text-white/55">
      {count > 0 && count < 900 ? (
        <>
          <svg width={width} height={26} className="absolute inset-0">
            <path
              d={Array.from({ length: count + 1 }, (_, index) => {
                const x = Math.round(inset + index * minor * perSecond) + 0.5;
                return `M${x} ${index % 5 === 0 ? 14 : 20}V26`;
              }).join("")}
              stroke="currentColor"
              strokeOpacity="0.6"
              fill="none"
              shapeRendering="crispEdges"
            />
          </svg>
          {Array.from({ length: Math.floor(count / 5) + 1 }, (_, index) => {
            const x = inset + index * step * perSecond;
            if (x > width - 34) return null;
            return (
              <span key={index} className="fb-num absolute top-[4px] text-[11px] leading-none" style={{ left: x + 4 }}>
                {formatTime(index * step, step < 1)}
              </span>
            );
          })}
        </>
      ) : null}
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
  time,
  onPointerDown,
  onKeyDown,
}: {
  side: "start" | "end";
  label: string;
  left: number;
  time: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const start = side === "start";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 z-20 w-11 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
      style={{ left: `${left * 100}%` }}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 grid w-4 place-items-center bg-accent transition-colors group-hover:bg-accent-deep group-focus-visible:bg-white group-active:bg-accent-deep ${
          start ? "right-1/2" : "left-1/2"
        }`}
      >
        <span className="h-9 w-[3px] bg-white/90 group-focus-visible:bg-accent" />
      </span>
      <span
        aria-hidden
        className={`fb-num pointer-events-none absolute bottom-0 whitespace-nowrap bg-accent-deep px-1.5 py-1 text-[11.5px] font-semibold leading-none text-white ${
          start ? "left-1/2" : "right-1/2"
        }`}
      >
        {formatTime(time, true)}
      </span>
    </button>
  );
}
