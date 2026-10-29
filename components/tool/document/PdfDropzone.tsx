"use client";

import type { DragEvent, ReactNode } from "react";
import { FileStack, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph } from "@/components/icons/NavGlyph";

/** Drop target shared by the document tools. */
export function PdfDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Files are read locally. Nothing is uploaded.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  minHeightClass = "min-h-[400px]",
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
          ? "border-[#b3a7ce] bg-[#f6f2fb]"
          : "border-dashed border-[#d5d0dd] bg-[#faf9fc]"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(157,151,207,0.18),transparent_68%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(196,140,74,0.13),transparent_68%)]"
      />

      <span className="relative h-[74px] w-[68px]">
        <span className="absolute left-3 top-0 h-[58px] w-[44px] -rotate-[9deg] rounded-[6px] border border-[#ded8e6] bg-white shadow-[0_8px_18px_rgba(60,48,80,0.10)]" />
        <span className="absolute left-5 top-1 h-[58px] w-[44px] rotate-[4deg] rounded-[6px] border border-[#ded8e6] bg-white shadow-[0_10px_20px_rgba(60,48,80,0.12)]" />
        <span className="absolute left-1 top-3 grid h-[58px] w-[44px] place-items-center rounded-[6px] border border-[#d8d1e2] bg-white text-[#6b6384] shadow-[0_12px_22px_rgba(60,48,80,0.14)]">
          <FileStack size={20} strokeWidth={1.5} aria-hidden />
        </span>
        <span className="absolute -right-1 bottom-0 grid h-6 w-6 place-items-center rounded-full border-4 border-[#faf9fc] bg-[#9d97cf] text-[9px] font-semibold text-white">
          PDF
        </span>
      </span>

      <p className="relative mt-5 font-display text-[24px] font-semibold tracking-[-0.025em] text-ink">
        {title}
      </p>
      <p className="relative mt-2 max-w-sm text-ui leading-relaxed text-muted">{description}</p>
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

      {chips ? <div className="relative mt-5 flex flex-wrap justify-center gap-1.5">{chips}</div> : null}
    </div>
  );
}
