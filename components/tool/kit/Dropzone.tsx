"use client";

import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { Plus, UploadCloud } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

export type DropzoneProps = {
  title: string;
  description?: string;
  buttonLabel: string;
  /** Formats and size limits, e.g. "JPG, PNG, WebP · up to 25 MB". */
  limits?: string;
  /** Quiet privacy line. Shown once, here, and nowhere else in the studio. */
  note?: string;
  onChoose: () => void;
  dragging: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  chips?: ReactNode;
  icon?: ReactNode;
  minHeightClass?: string;
  className?: string;
};

/**
 * The empty state of every studio. The whole surface is a click and drop
 * target, with one big button, so the first action needs no hunting.
 */
export function Dropzone({
  title,
  description,
  buttonLabel,
  limits,
  note,
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  icon,
  minHeightClass = "min-h-[380px]",
  className = "",
}: DropzoneProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChoose();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${buttonLabel}`}
      data-slot="dropzone"
      data-dragging={dragging || undefined}
      onClick={onChoose}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative flex ${minHeightClass} flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[18px] border-[1.5px] border-dashed px-5 py-10 text-center outline-none transition-[border-color,background-color,transform] duration-200 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 ${
        dragging
          ? "scale-[0.995] border-accent bg-accent-soft"
          : "border-[#d6d1c6] bg-white hover:border-[#b9b2a4] hover:bg-[#fffdfa]"
      } ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(#e7e3da_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black_0%,transparent_70%)]"
      />

      <span className="relative">
        <span
          className={`grid h-[68px] w-[68px] place-items-center rounded-[20px] bg-ink text-white shadow-[0_18px_34px_-14px_rgba(15,15,16,0.5)] transition-transform duration-300 group-hover:-translate-y-1 ${
            dragging ? "-translate-y-1.5 scale-105" : ""
          }`}
        >
          {icon ?? <UploadCloud size={28} strokeWidth={1.5} aria-hidden />}
        </span>
        <span className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border-[3px] border-white bg-accent text-white">
          <Plus size={14} strokeWidth={3} aria-hidden />
        </span>
      </span>

      <p className="relative mt-6 font-display text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">
        {dragging ? "Drop to add" : title}
      </p>
      {description ? (
        <p className="relative mt-2 max-w-[440px] text-[14px] leading-relaxed text-muted">{description}</p>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onChoose();
        }}
        className={buttonClasses("accent", "xl", "relative mt-6 min-w-[200px] rounded-full")}
      >
        {buttonLabel}
      </button>

      <p className="relative mt-3 text-[13px] text-faint">or drag and drop anywhere here</p>

      {limits ? <p className="relative mt-4 text-[12.5px] font-medium text-muted">{limits}</p> : null}
      {chips ? <div className="relative mt-3 flex flex-wrap justify-center gap-1.5">{chips}</div> : null}
      {note ? <p className="relative mt-3 text-[12px] text-faint">{note}</p> : null}
    </div>
  );
}

/** Format / capability chip under a dropzone. */
export function DropChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-muted">
      {icon}
      {children}
    </span>
  );
}
