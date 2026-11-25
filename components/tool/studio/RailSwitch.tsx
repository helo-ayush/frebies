"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/arc/switch/switch";

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
    <div className="flex items-start justify-between gap-3 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5 transition-colors hover:border-[#cfc9bd]">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          {icon}
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
      </button>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
