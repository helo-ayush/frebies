"use client";

import type { ReactNode } from "react";

/** Toggle row shared by tool studios. */
export function RailSwitch({
  label,
  description,
  icon,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5 transition-colors hover:border-[#cfc9bd]">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          {icon}
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-[18px] peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
      />
    </label>
  );
}
