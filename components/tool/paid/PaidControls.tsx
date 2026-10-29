"use client";

import type { CSSProperties, ReactNode } from "react";

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
    <label
      className={`flex items-start justify-between gap-3 ${
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        style={rangeFill(value, min, max)}
        className="range mt-2"
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

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
