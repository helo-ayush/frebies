"use client";

import type { ReactNode } from "react";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { Switch } from "@/components/arc/switch/switch";

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
    <section className="border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-ui font-semibold text-ink">{title}</h3>
        {hint ? <span className="text-[10px] text-faint">{hint}</span> : null}
      </div>
      <div className="mt-2.5">{children}</div>
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
        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
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
      <div className="flex items-center justify-between text-ui">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-micro tabular-nums text-faint">
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
        <div className="mt-1 flex justify-between text-[10px] text-faint">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}
