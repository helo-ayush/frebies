"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/arc/switch/switch";
import { PrimaryAction, Note } from "@/components/tool/kit";

/**
 * Legacy header strip. The page header already names the tool, so studios no
 * longer render a second title; this stays only for the optional status pills.
 */
export function StudioHeader({ pills }: { path?: string; title?: string; subtitle?: string; pills?: ReactNode }) {
  if (!pills) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line bg-white px-4 py-2.5 sm:px-5">
      {pills}
    </div>
  );
}

/** Primary action pinned at the top of a settings rail. */
export function StudioAction({
  label,
  hint,
  disabled = false,
  children,
  busy = false,
  busyLabel,
  progress,
  onAction,
  icon,
}: {
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  progress?: number;
  onAction?: () => void;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PrimaryAction
      label={label}
      icon={icon}
      busy={busy}
      busyLabel={busyLabel}
      progress={progress}
      disabled={disabled}
      onClick={onAction}
      hint={
        hint || children ? (
          <>
            {hint ? <span className="inline-flex items-center gap-1.5">{hint}</span> : null}
            {children}
          </>
        ) : undefined
      }
    />
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
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {hint ? <span className="text-[12px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

const FIELD_LABEL = "block text-[12.5px] font-medium text-muted";
const FIELD_BOX =
  "h-10 w-full rounded-[10px] border border-line bg-white text-[13px] text-ink outline-none transition-colors placeholder:text-faint hover:border-[#cfc9bd] focus:border-ink";

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
      <span className={FIELD_LABEL}>{label}</span>
      <span className="relative mt-1.5 block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD_BOX} appearance-none pl-3 pr-9`}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
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
    <div className="flex items-start justify-between gap-3">
      <button type="button" onClick={() => onChange(!checked)} className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
        ) : null}
      </button>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5 shrink-0" />
    </div>
  );
}

export function TextRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${FIELD_BOX} mt-1.5 px-3`}
      />
      {hint ? <span className="mt-1.5 block text-[12px] text-faint">{hint}</span> : null}
    </label>
  );
}

/** A short "this is a preview" note used beside run buttons. */
export function PreviewNote({ children }: { children: ReactNode }) {
  return <Note tone="warn">{children}</Note>;
}
