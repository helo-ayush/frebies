"use client";

import { useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Collapsible settings group shared by the tool studios. Flat by design: a
 * heading row and its controls, ruled off from the next group edge to edge.
 */
export function RailSection({
  icon: Icon,
  title,
  hint,
  defaultOpen = true,
  aside,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  aside?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={`-mx-4 border-b border-line px-4 pt-2.5 first:-mt-3 last:border-b-0 sm:-mx-5 sm:px-5 ${open ? "pb-6" : "pb-2.5"}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={id}
        data-slot="section-trigger"
        title={hint}
        className="group flex min-h-[40px] w-full items-center gap-3 text-left"
      >
        {Icon ? <Icon size={16} strokeWidth={1.7} className="shrink-0 text-muted" aria-hidden /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase">{title}</span>
        {aside ? <span className="fb-num shrink-0 text-[13px] text-faint">{aside}</span> : null}
        <svg
          aria-hidden
          width="11"
          height="11"
          viewBox="0 0 11 11"
          stroke="currentColor"
          strokeWidth="1.5"
          className="shrink-0 text-faint group-hover:text-accent-deep"
        >
          <path d="M0 5.5h11" />
          <path
            d="M5.5 0v11"
            className="origin-center transition-transform duration-300"
            style={{ transform: open ? "scaleY(0)" : undefined }}
          />
        </svg>
      </button>

      <div id={id} hidden={!open} className="pt-2.5">
        {children}
      </div>
    </div>
  );
}
