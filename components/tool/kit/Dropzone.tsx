"use client";

import { usePathname } from "next/navigation";
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { IsoBlock } from "@/components/site/blocks";
import { seamColor } from "@/components/ui/Seam";
import { tools } from "@/lib/registry/tools";

export type DropzoneProps = {
  title: string;
  description?: string;
  buttonLabel: string;
  /** Formats and size limits, e.g. "JPG, PNG, WebP, up to 25 MB". */
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
  /** Extra controls under the button, e.g. sample files. */
  children?: ReactNode;
};

/**
 * The empty state of every studio: this tool's own block, lid up, waiting for a
 * file. The whole surface is a click and drop target, with one big button.
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
  minHeightClass = "max-lg:min-h-[calc(100svh-var(--fb-bar)-var(--fb-head)-92px)] lg:min-h-[440px]",
  className = "",
  children,
}: DropzoneProps) {
  const pathname = usePathname();
  const tool = tools.find((item) => item.path === pathname);
  const [hover, setHover] = useState(false);

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
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative flex ${minHeightClass} flex-1 cursor-pointer flex-col overflow-hidden text-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${className}`}
    >
      {/* Frame: corner marks, plus a coral outline while a file is held over it */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-3 transition-colors duration-200 sm:inset-4 ${
          dragging ? "border-2 border-accent bg-accent/[0.06]" : "border border-dashed border-line-strong group-hover:border-ink"
        }`}
      />
      <span aria-hidden className="fb-grid-bg pointer-events-none absolute inset-x-4 bottom-4 hidden h-[84px] opacity-60 [background-size:28px_28px] [mask-image:linear-gradient(0deg,black,transparent)] sm:block" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-8">
        <IsoBlock
          path={pathname}
          seam={tool ? seamColor(tool) : undefined}
          open={dragging || hover}
          sheet
          className="h-[clamp(120px,27vh,236px)] w-auto"
        />

        <p className="fb-wide mt-[clamp(10px,2.4vh,26px)] max-w-[640px] text-[clamp(22px,2.3vw,36px)] [text-wrap:balance]">
          {dragging ? "Let go" : title}
        </p>
        {description ? (
          <p className="mt-3 max-w-[460px] text-[15px] leading-[1.5] text-muted">{description}</p>
        ) : null}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChoose();
          }}
          className="fb-run mt-[clamp(14px,2.6vh,28px)] !w-auto min-w-[258px]"
        >
          <span className="fb-run-icon">
            <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M9 1v16M1 9h16" />
            </svg>
          </span>
          <span className="fb-run-label">{buttonLabel}</span>
        </button>
        <p className="mt-3 text-[13.5px] text-faint [@media(hover:none)]:hidden">or drop it anywhere, or paste it</p>

        {children ? (
          <div className="mt-4" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            {children}
          </div>
        ) : null}
        {chips ? <div className="mt-4 flex flex-wrap justify-center gap-2 max-sm:hidden">{chips}</div> : null}
      </div>

      {limits || note ? (
        <div className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-8 pb-7 text-[12.5px] uppercase text-muted sm:justify-between sm:pb-8">
          {limits ? <span>{limits}</span> : null}
          {note ? <span className="max-sm:hidden">{note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Capability chip under a dropzone. */
export function DropChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 border border-line-strong bg-panel px-3 text-[12.5px] uppercase text-muted">
      {icon}
      {children}
    </span>
  );
}
