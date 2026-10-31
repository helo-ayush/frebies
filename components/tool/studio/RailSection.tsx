"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export const RAIL_FIELD_LABEL = "block text-[12px] font-medium text-ink";
export const RAIL_FIELD_META = "text-[11px] text-faint tabular-nums";
export const RAIL_CARD_IDLE =
  "border-line bg-white hover:border-[#cfc9bd] hover:bg-[#fdfdfc]";
export const RAIL_CARD_ACTIVE =
  "border-ink bg-[#fbfaf7] shadow-[inset_0_0_0_1px_#0f0f10]";

/** Collapsible settings card shared by the tool studios. */
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
    <div className="overflow-hidden rounded-[16px] border border-line bg-white shadow-2xs">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-[#fbfaf8]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-line bg-[#faf9f6] text-ink">
          <Icon size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
          {hint ? (
            <span className="mt-0.5 block truncate text-[11px] text-faint">{hint}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {aside ? (
            <span className="rounded-full border border-line bg-[#faf9f6] px-2 py-0.5 text-[10.5px] font-medium text-muted">
              {aside}
            </span>
          ) : null}
          <ChevronDown
            size={14}
            aria-hidden
            className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open ? <div className="border-t border-line-soft p-4 pt-3.5">{children}</div> : null}
    </div>
  );
}
