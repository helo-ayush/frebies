"use client";

/**
 * The video window: picture on ink, a timeline that shows where the script's
 * lines fall, the machine's round button, and full screen. Audio files play
 * through it too, with their waveform where the picture would be.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Loader2, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { formatTime } from "@/components/tool/audio/format";
import { Waveform } from "@/components/tool/audio/Waveform";
import { bringToFront, registerDeck, type Deck } from "./decks";

const RATES = [1, 1.25, 1.5, 2, 0.75];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type VideoMark = { id: string; start: number; end: number; label?: string };

export function VideoDeck({
  videoRef,
  src,
  kind = "video",
  duration: knownDuration = 0,
  peaks,
  marks = [],
  captions,
  onTime,
  onVolume,
  title,
  className = "",
  children,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  src: string;
  kind?: "video" | "audio";
  duration?: number;
  /** Waveform for audio files. */
  peaks?: readonly number[];
  /** Spans drawn on the timeline, e.g. script lines. */
  marks?: readonly VideoMark[];
  /** Drawn over the bottom of the picture. */
  captions?: ReactNode;
  onTime?: (seconds: number) => void;
  /** The same level for anything played alongside, e.g. a dubbed track. */
  onVolume?: (volume: number) => void;
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [full, setFull] = useState(false);
  const [failed, setFailed] = useState(false);
  const help = useId();

  const total = length || knownDuration || 0;
  const progress = total > 0 ? clamp(time / total, 0, 1) : 0;

  useEffect(() => {
    setTime(0);
    setLength(0);
    setPlaying(false);
    setWaiting(false);
    setFailed(false);
  }, [src]);

  // Smooth playhead while it runs; timeupdate alone only fires four times a second.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setTime(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, videoRef]);

  const deckRef = useRef<Deck>({ toggle: () => undefined, pause: () => undefined });
  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      bringToFront(deckRef.current);
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [videoRef]);
  deckRef.current.toggle = toggle;
  deckRef.current.pause = () => videoRef.current?.pause();
  useEffect(() => registerDeck(deckRef.current), []);

  function seek(seconds: number) {
    const video = videoRef.current;
    const next = clamp(seconds, 0, total || 0);
    if (video) video.currentTime = next;
    setTime(next);
    onTime?.(next);
  }

  function at(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  function onTrackDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || total <= 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seek(at(event.clientX) * total);
  }

  function onTrackMove(event: ReactPointerEvent<HTMLDivElement>) {
    const fraction = at(event.clientX);
    if (hoverRef.current && trackRef.current) {
      hoverRef.current.style.transform = `translateX(${fraction * trackRef.current.clientWidth}px)`;
      hoverRef.current.dataset.time = formatTime(fraction * total, total < 60);
    }
    if (dragging.current) seek(fraction * total);
  }

  function changeVolume(next: number) {
    const value = clamp(next, 0, 1);
    setVolume(value);
    if (videoRef.current) videoRef.current.volume = value;
    onVolume?.(value);
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  async function toggleFull() {
    const root = rootRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root?.requestFullscreen) await root.requestFullscreen();
      else video?.webkitEnterFullscreen?.();
    } catch {
      // Full screen was refused; the window stays as it is.
    }
  }

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input")) return;
    const onButton = Boolean((event.target as HTMLElement).closest("button"));
    if ((event.key === " " || event.key === "Enter") && onButton) return;
    if (event.key === " " || event.key.toLowerCase() === "k") toggle();
    else if (event.key === "ArrowLeft") seek(time - (event.shiftKey ? 10 : 3));
    else if (event.key === "ArrowRight") seek(time + (event.shiftKey ? 10 : 3));
    else if (event.key.toLowerCase() === "m") changeVolume(volume > 0 ? 0 : 1);
    else if (event.key.toLowerCase() === "f") void toggleFull();
    else return;
    event.preventDefault();
  }

  const key = "min-h-[52px] px-2 text-[13px] font-medium text-white/65 transition-colors hover:bg-white hover:text-ink";

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={title}
      aria-describedby={help}
      data-slot="video-deck"
      className={`flex min-h-0 min-w-0 flex-col bg-ink text-white ${className}`}
    >
      <p id={help} className="sr-only">
        Space plays and pauses, arrows move three seconds, M mutes, F is full screen.
      </p>

      <div
        className={`relative min-h-0 flex-1 overflow-hidden bg-black ${kind === "audio" ? "!bg-ink" : ""}`}
        onClick={toggle}
      >
        <video
          ref={videoRef}
          key={src}
          src={src}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) setLength(video.duration);
            video.volume = volume;
            video.playbackRate = rate;
          }}
          onTimeUpdate={(event) => {
            setTime(event.currentTarget.currentTime);
            onTime?.(event.currentTarget.currentTime);
          }}
          onPlay={() => {
            bringToFront(deckRef.current);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={() => setFailed(true)}
          className={kind === "audio" ? "hidden" : "absolute inset-0 h-full w-full object-contain"}
        />
        {kind === "audio" ? (
          <div className="absolute inset-0 flex items-center px-6" onClick={(event) => event.stopPropagation()}>
            <Waveform
              peaks={peaks ?? []}
              progress={progress}
              idle="rgba(255,255,255,.34)"
              pitch={5}
              onSeek={(fraction) => seek(fraction * total)}
              className="h-[72%]"
            />
          </div>
        ) : null}
        {waiting && playing ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 size={30} className="animate-spin" aria-hidden />
          </span>
        ) : null}
        {failed ? (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-[14.5px] text-white/75">
            This browser cannot play this file, but it can still be dubbed.
          </p>
        ) : null}
        {captions ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-5 flex justify-center">{captions}</div>
        ) : null}
        {children}
      </div>

      {/* Timeline */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        data-sound="none"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatTime(time)} of ${formatTime(total)}`}
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        className="group/track relative h-9 shrink-0 cursor-pointer select-none border-t border-white/15 bg-white/[0.06] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        style={{ touchAction: "none" }}
      >
        {total > 0
          ? marks.map((mark) => {
              const from = clamp(mark.start / total, 0, 1);
              const to = clamp(mark.end / total, from, 1);
              const on = time >= mark.start && time <= mark.end;
              return (
                <span
                  key={mark.id}
                  aria-hidden
                  title={mark.label}
                  className={`absolute bottom-0 h-[14px] border-l border-ink ${on ? "bg-white" : "bg-white/35"}`}
                  style={{ left: `${from * 100}%`, width: `max(3px, ${(to - from) * 100}%)` }}
                />
              );
            })
          : null}
        <span aria-hidden className="absolute left-0 top-0 h-[8px] bg-accent" style={{ width: `${progress * 100}%` }} />
        <span aria-hidden className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white" style={{ left: `${progress * 100}%` }} />
        <span
          ref={hoverRef}
          aria-hidden
          data-time=""
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/50 opacity-0 transition-opacity after:absolute after:bottom-full after:left-0 after:-translate-x-1/2 after:bg-accent-deep after:px-1.5 after:py-1 after:text-[11.5px] after:tabular-nums after:leading-none after:text-white after:content-[attr(data-time)] group-hover/track:opacity-100"
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-stretch border-t border-white/15">
        <span className="grid w-[84px] shrink-0 place-items-center bg-black/40 py-2.5">
          <button
            type="button"
            onClick={toggle}
            data-playing={playing || undefined}
            data-sound="none"
            aria-label={playing ? "Pause" : "Play"}
            className="fb-play h-[54px] w-[54px]"
          >
            {playing ? (
              <svg aria-hidden width="19" height="19" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 1h3v10H2zM7 1h3v10H7z" />
              </svg>
            ) : (
              <svg aria-hidden width="19" height="19" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 .8 11 6l-8 5.2z" />
              </svg>
            )}
          </button>
        </span>
        <span className="flex min-w-[130px] flex-1 items-baseline gap-2 self-center px-5">
          <span className="fb-wide fb-num text-[clamp(19px,1.9vw,27px)] normal-case">{formatTime(time)}</span>
          <span className="fb-num text-[13px] text-white/55">/ {formatTime(total)}</span>
        </span>
        <span className="flex items-stretch border-white/15 max-sm:w-full max-sm:border-t">
          <button type="button" onClick={() => seek(time - 5)} aria-label="Back 5 seconds" className={`${key} min-w-[56px] flex-1 sm:border-l sm:border-white/15`}>
            −5 s
          </button>
          <button type="button" onClick={() => seek(time + 5)} aria-label="Forward 5 seconds" className={`${key} min-w-[56px] flex-1 border-l border-white/15`}>
            +5 s
          </button>
          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${rate}×`}
            className={`${key} fb-num min-w-[52px] flex-1 border-l border-white/15`}
          >
            {rate}×
          </button>
          <span className="flex items-center border-l border-white/15">
            <button
              type="button"
              onClick={() => changeVolume(volume > 0 ? 0 : 1)}
              aria-label={volume > 0 ? "Mute" : "Unmute"}
              className={`${key} grid h-full w-12 place-items-center`}
            >
              {volume > 0 ? <Volume2 size={17} aria-hidden /> : <VolumeX size={17} aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Volume"
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="range fb-deck-range mr-4 hidden !w-[76px] xl:block"
              style={{ ["--fill" as string]: `${volume * 100}%` }}
            />
          </span>
          {kind === "video" ? (
            <button
              type="button"
              onClick={() => void toggleFull()}
              aria-label={full ? "Leave full screen" : "Full screen"}
              title={full ? "Leave full screen" : "Full screen"}
              className={`${key} grid w-[56px] place-items-center border-l border-white/15`}
            >
              {full ? <Minimize size={17} aria-hidden /> : <Maximize size={17} aria-hidden />}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
