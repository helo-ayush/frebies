"use client";

/** The small controls every settings rail is built from. */

import type { ReactNode } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";

/** A line of cells where one is chosen: sizes, percentages, presets. */
export function RailPick<T extends string | number>({
  options,
  value,
  onChange,
  columns = 3,
  label,
  disabled = false,
  className = "",
  compact = false,
}: {
  options: readonly { value: T; label: ReactNode; note?: ReactNode; title?: string; ariaLabel?: string }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  columns?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-px border border-line-strong bg-line-strong ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative flex min-w-0 items-center justify-center gap-1.5 px-1 text-[13px] font-medium tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-45 ${
              compact ? "h-9" : "h-10"
            } ${active ? "bg-ink text-white" : "bg-white hover:bg-hover"}`}
          >
            {option.label}
            {option.note ? <span className={active ? "text-white/65" : "text-faint"}>{option.note}</span> : null}
            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
          </button>
        );
      })}
      <Filler count={options.length} columns={columns} />
    </div>
  );
}

/** Empty cells at the end of a grid are hatched, like the blanks on the landing grid. */
function Filler({ count, columns }: { count: number; columns: number }) {
  const rest = (columns - (count % columns)) % columns;
  return rest > 0 ? (
    <span aria-hidden className="fb-hatch bg-panel" style={{ gridColumn: `span ${rest} / span ${rest}` }} />
  ) : null;
}

/** Two-line cells: a name over one quiet line. */
export function RailCards<T extends string | number>({
  options,
  value,
  onChange,
  columns = 2,
  label,
  disabled = false,
  className = "",
}: {
  options: readonly {
    value: T;
    label: ReactNode;
    note?: ReactNode;
    icon?: ReactNode;
    title?: string;
    disabled?: boolean;
  }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  columns?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-px border border-line-strong bg-line-strong ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            title={option.title}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={`group relative flex min-h-[46px] min-w-0 items-center py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-45 ${
              columns > 2 ? "gap-2 px-2.5" : "gap-2.5 px-3"
            } ${
              active ? "bg-ink text-white" : "bg-white hover:bg-hover"
            }`}
          >
            {option.icon ? <span className={`shrink-0 ${active ? "text-accent" : "text-muted"}`}>{option.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{option.label}</span>
              {option.note ? (
                <span className={`mt-0.5 line-clamp-2 block text-[12.5px] leading-[1.25] ${active ? "text-white/60" : "text-faint"}`}>
                  {option.note}
                </span>
              ) : null}
            </span>
            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
          </button>
        );
      })}
      <Filler count={options.length} columns={columns} />
    </div>
  );
}

/** Number with a unit, for pixels and seconds. */
export function RailNumber({
  label,
  value,
  min = 1,
  max,
  step,
  unit = "px",
  disabled = false,
  onChange,
}: {
  label: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[13px] font-medium text-muted">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 w-full pl-3 pr-9 text-[15px] font-medium tabular-nums disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">{unit}</span>
      </span>
    </label>
  );
}

/** Minus, a number, plus: one joined control. */
export function RailStepper({
  value,
  onChange,
  onStep,
  label,
  min,
  max,
  step,
  placeholder,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  onStep: (direction: -1 | 1) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** A unit switch on the end. */
  children?: ReactNode;
}) {
  const key =
    "grid h-12 w-12 shrink-0 place-items-center border border-line-strong bg-white transition-colors hover:bg-ink hover:text-white";
  return (
    <div className="flex items-stretch">
      <button type="button" onClick={() => onStep(-1)} aria-label={`Decrease ${label.toLowerCase()}`} className={key}>
        <Minus size={16} aria-hidden />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="fb-wide h-12 min-w-0 flex-1 !border-x-0 px-2 text-center !text-[19px] tabular-nums"
      />
      <button type="button" onClick={() => onStep(1)} aria-label={`Increase ${label.toLowerCase()}`} className={key}>
        <Plus size={16} aria-hidden />
      </button>
      {children ? <div className="ml-2 shrink-0">{children}</div> : null}
    </div>
  );
}

/** Colour presets and a free pick. */
export function RailColors({
  presets,
  value,
  onChange,
  label = "Background color",
}: {
  presets: readonly { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const custom = !presets.some((preset) => preset.value.toLowerCase() === value.toLowerCase());
  return (
    <div role="group" aria-label={label} className="flex border border-line-strong bg-white">
      {presets.map((preset) => {
        const active = preset.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={preset.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(preset.value)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 border-r border-line-strong px-1.5 text-[13px] font-medium transition-colors ${
              active ? "bg-ink text-white" : "hover:bg-hover"
            }`}
          >
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 border border-black/25"
              style={{ backgroundColor: preset.value }}
            />
            <span className="truncate">{preset.label}</span>
          </button>
        );
      })}
      <label
        title="Pick any color"
        className={`relative flex h-11 w-[58px] shrink-0 cursor-pointer items-center justify-center transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent ${
          custom ? "bg-ink text-white" : "hover:bg-hover"
        }`}
      >
        <span
          aria-hidden
          className="h-5 w-5 border border-black/25"
          style={
            custom
              ? { backgroundColor: value }
              : { background: "conic-gradient(#f2552c,#f5c542,#3aa76d,#3a7bd5,#8a4fd3,#f2552c)" }
          }
        />
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Custom ${label.toLowerCase()}`}
          className="!absolute !inset-0 !h-full !w-full cursor-pointer !border-0 opacity-0"
        />
      </label>
    </div>
  );
}

/** Field caption with a quiet value on the right. */
export function RailLabel({
  children,
  value,
  className = "",
}: {
  children: ReactNode;
  value?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-baseline justify-between gap-3 ${className}`}>
      <span className="text-[14px] font-medium">{children}</span>
      {value ? <span className="fb-num shrink-0 text-[13px] text-faint">{value}</span> : null}
    </div>
  );
}

/** What each end of a slider means. */
export function RailEnds({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mt-0.5 flex justify-between gap-3 text-[12.5px] text-faint">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/** One quiet explanatory line under a control. */
export function RailHint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`mt-3 text-[13px] leading-[1.5] text-muted ${className}`}>{children}</p>;
}

/** Small "on" mark for rows that can be selected. */
export function RailMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center border ${
        on ? "border-accent bg-accent text-white" : "border-line-strong text-transparent"
      }`}
    >
      <Check size={12} strokeWidth={3.2} />
    </span>
  );
}

export function RailReset({ onClick, label = "Reset settings" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 text-[13px] font-medium uppercase text-muted transition-colors hover:text-accent-deep"
    >
      <RotateCcw size={14} aria-hidden />
      {label}
    </button>
  );
}
