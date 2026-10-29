"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";


/** Header strip shared by every document studio. */
export function StudioHeader({
  path,
  title,
  subtitle,
  pills,
}: {
  path: string;
  title: string;
  subtitle: string;
  pills?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
          <ToolGlyph path={path} size={18} />
        </span>
        <div>
          <h2 className="text-[14px] font-medium text-ink">{title}</h2>
          <p className="mt-0.5 text-micro text-faint">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pills}
        <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
          <LockGlyph size={11} />
          Files stay local
        </span>
      </div>
    </div>
  );
}

/** Footer with the local-processing promise and the primary action. */
export function StudioFooter({
  label,
  hint,
  disabled = false,
  children,
  busy = false,
  onAction,
}: {
  label: string;
  hint: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p className="flex items-center gap-1.5 text-micro text-faint">{hint}</p>
      <div className="flex items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled || busy}
          className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[150px]")}
        >
          {busy ? "Working…" : label}
          <ArrowRightGlyph size={13} />
        </button>
      </div>
    </div>
  );
}

export function RailSection({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-ui font-semibold text-ink">{title}</h3>
        {hint ? <span className="text-[10px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function SelectRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-medium text-muted">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white pl-2.5 pr-8 text-[11.5px] text-ink outline-none transition-colors hover:border-[#d5d1c8]"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
          aria-hidden
        />
      </span>
    </label>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
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

export function TextRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-9 w-full rounded-[9px] border border-line bg-white px-2.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-faint hover:border-[#d5d1c8]"
      />
      {hint ? <span className="mt-1 block text-[10px] text-faint">{hint}</span> : null}
    </label>
  );
}

/** A short "this is a preview" note used beside run buttons. */
export function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]">
      {children}
    </p>
  );
}
