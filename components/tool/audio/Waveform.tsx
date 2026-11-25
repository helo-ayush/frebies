"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

/** A waveform on its own: fills in as it plays, and seeks where it is pressed. */
export function Waveform({
  peaks,
  progress = 0,
  played = "#f2552c",
  idle = "#a5a4a2",
  pitch = 4,
  onSeek,
  className = "h-14",
}: {
  peaks: readonly number[];
  /** 0–1 */
  progress?: number;
  played?: string;
  idle?: string;
  /** Pixels per bar. */
  pitch?: number;
  onSeek?: (fraction: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const wave = useMemo(() => {
    if (box.w === 0 || box.h === 0) return { d: "", width: 2 };
    const source = peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.16);
    const count = Math.min(source.length, Math.max(12, Math.floor(box.w / pitch)));
    const step = box.w / count;
    const middle = box.h / 2;
    const reach = middle - 2;
    let d = "";
    for (let index = 0; index < count; index += 1) {
      const from = Math.floor((index / count) * source.length);
      const to = Math.max(from + 1, Math.floor(((index + 1) / count) * source.length));
      let max = 0;
      for (let cursor = from; cursor < to; cursor += 1) max = Math.max(max, source[cursor]);
      const half = Math.max(1.5, max * reach);
      d += `M${((index + 0.5) * step).toFixed(2)} ${(middle - half).toFixed(1)}V${(middle + half).toFixed(1)}`;
    }
    return { d, width: Math.max(1.5, step * 0.62) };
  }, [box.h, box.w, peaks, pitch]);

  function seek(event: PointerEvent<HTMLDivElement>) {
    if (!onSeek || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  }

  const done = Math.min(1, Math.max(0, progress));
  return (
    <div
      ref={ref}
      aria-hidden
      onPointerDown={onSeek ? seek : undefined}
      className={`relative w-full min-w-0 ${onSeek ? "cursor-pointer" : ""} ${className}`}
    >
      <svg width={box.w} height={box.h} className="absolute inset-0">
        <path d={wave.d} stroke={idle} strokeWidth={wave.width} fill="none" />
      </svg>
      <svg
        width={box.w}
        height={box.h}
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${(1 - done) * 100}% 0 0)` }}
      >
        <path d={wave.d} stroke={played} strokeWidth={wave.width} fill="none" />
      </svg>
    </div>
  );
}
