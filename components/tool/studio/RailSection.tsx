"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export const RAIL_FIELD_LABEL = "block text-[13px] font-medium text-ink";
export const RAIL_FIELD_META = "text-[12px] text-faint tabular-nums";
export const RAIL_CARD_IDLE = "border-line bg-white hover:border-[#cfc9bd]";
export const RAIL_CARD_ACTIVE = "border-ink bg-white shadow-[inset_0_0_0_1px_#0f0f10]";

/**
 * Collapsible settings group shared by the tool studios. Flat by design: a
 * heading row and its controls, separated from the next group by a hairline,
 * so a rail reads as one calm list instead of a stack of boxes.
 */
export function RailSection({
  icon: Icon,
  title,
  hint,
  defaultOpen = true,
  aside,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  aside?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-line-soft pb-4 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-slot="section-trigger"
        title={hint}
        className="group flex w-full items-center gap-2.5 rounded-lg py-1 text-left"
      >
        <Icon size={15} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{title}</span>
        {aside ? (
          <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[12px] font-medium tabular-nums text-muted">
            {aside}
          </span>
        ) : null}
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 text-faint transition-transform duration-200 group-hover:text-ink ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? <div className="pt-3">{children}</div> : null}
    </div>
  );
}
