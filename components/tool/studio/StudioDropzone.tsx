"use client";

import type { DragEvent, ReactNode } from "react";
import { ShieldCheck, UploadCloud } from "lucide-react";
import { MagneticButton } from "@/components/aceternity/magnetic-button";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph } from "@/components/icons/NavGlyph";

export function StudioDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Processed locally. Nothing is uploaded.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  minHeightClass = "min-h-[430px]",
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
      className={`flex ${minHeightClass} flex-1 flex-col items-center justify-center rounded-[16px] border px-5 py-10 text-center transition-colors ${
        dragging
          ? "border-[#b8a992] bg-[#f8f3ea]"
          : "border-dashed border-[#d7d2c8] bg-[#fbfaf7]"
      }`}
    >
      <span className="relative grid h-[68px] w-[68px] place-items-center rounded-[20px] border border-white bg-white text-muted shadow-[0_10px_30px_rgba(71,54,35,0.07)]">
        <UploadCloud size={27} strokeWidth={1.4} aria-hidden />
        <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-[#fbfaf7] bg-[#c79862]" />
      </span>
      <p className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">
        {title}
      </p>
      <p className="mt-1.5 max-w-sm text-ui leading-relaxed text-muted">{description}</p>
      <MagneticButton className="mt-5">
        <button type="button" onClick={onChoose} className={buttonClasses("primary", "md")}>
          {buttonLabel}
          <ArrowRightGlyph size={13} />
        </button>
      </MagneticButton>
      <p className="mt-4 text-micro text-faint">{limits}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#7c7469]">
        <ShieldCheck size={11} aria-hidden />
        {note}
      </p>
      {chips ? <div className="mt-5 flex flex-wrap justify-center gap-1.5">{chips}</div> : null}
    </div>
  );
}

export function StudioChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
      {icon}
      {children}
    </span>
  );
}
