"use client";

import { useId, type ReactNode } from "react";
import { Switch } from "@/components/arc/switch/switch";

/** Toggle row shared by every rail: label on the left, key on the right. */
export function RailSwitch({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className={`min-w-0 flex-1 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
        <span className="flex items-center gap-2 text-[14px] font-medium">
          {icon}
          {label}
        </span>
        {description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span> : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
        className="shrink-0 !min-h-0"
      />
    </div>
  );
}
