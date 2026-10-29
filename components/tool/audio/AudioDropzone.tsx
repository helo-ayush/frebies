"use client";

import type { DragEvent, ReactNode } from "react";
import { AudioLines, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "./MiniWaveform";

export function AudioDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Playback and waveform analysis stay on this device.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  minHeightClass = "min-h-[390px]",
}: {
  title: string;
  description: string;
  buttonLabel: string;
  limits: string;
  note?: string;
  onChoose: () => void;
  dragging: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  chips?: ReactNode;
  minHeightClass?: string;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex ${minHeightClass} flex-1 flex-col items-center justify-center overflow-hidden rounded-[16px] border px-5 py-10 text-center transition-colors ${
        dragging
          ? "border-accent/50 bg-[#fff6f1]"
          : "border-dashed border-[#d8d2c6] bg-[#faf8f3]"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(229,94,64,0.14),transparent_68%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(143,174,159,0.2),transparent_68%)]"
      />

      <span className="relative grid h-[68px] w-[68px] place-items-center rounded-full border border-white bg-white text-ink shadow-[0_12px_30px_rgba(70,55,35,0.08)]">
        <AudioLines size={27} strokeWidth={1.5} aria-hidden />
        <span className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full border-4 border-[#faf8f3] bg-accent" />
      </span>

      <p className="relative mt-5 font-display text-[24px] font-semibold tracking-[-0.025em] text-ink">
        {title}
      </p>
      <p className="relative mt-2 max-w-sm text-ui leading-relaxed text-muted">
        {description}
      </p>
      <button
        type="button"
        onClick={onChoose}
        className={buttonClasses("primary", "md", "relative mt-5 rounded-full px-5")}
      >
        {buttonLabel}
        <ArrowRightGlyph size={13} />
      </button>
      <p className="relative mt-4 text-micro text-faint">{limits}</p>
      <p className="relative mt-2 flex items-center gap-1.5 text-[10.5px] text-[#7c7469]">
        <ShieldCheck size={11} aria-hidden />
        {note}
      </p>

      <div className="relative mt-7 flex w-full max-w-[260px] items-center justify-center opacity-70">
        <MiniWaveform bars={36} height={30} progress={0.35} />
      </div>

      {chips ? <div className="relative mt-5 flex flex-wrap justify-center gap-1.5">{chips}</div> : null}
    </div>
  );
}
