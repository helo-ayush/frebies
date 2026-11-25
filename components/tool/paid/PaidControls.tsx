"use client";

import type { ReactNode } from "react";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { Switch } from "@/components/arc/switch/switch";

/** Flat settings group: a heading and its controls. Spacing separates groups. */
export function PaidSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {hint ? <span className="text-[12px] tabular-nums text-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function PaidToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
      >
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">
          {description}
        </span>
      </button>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function PaidSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  left,
  right,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  left?: string;
  right?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="text-[12px] tabular-nums text-faint">
          {value}
          {suffix}
        </span>
      </div>
      <RailSlider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onValueChange={onChange}
        className="mt-1"
      />
      {(left || right) && (
        <div className="mt-1 flex justify-between text-[12px] text-faint">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}
