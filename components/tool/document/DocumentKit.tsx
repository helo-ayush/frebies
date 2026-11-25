"use client";

import type { ReactNode } from "react";
import { Note } from "@/components/tool/kit";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";

const FIELD_LABEL = "block text-[14px] font-medium";

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
      <select value={value} onChange={(event) => onChange(event.target.value)} className="fb-input mt-2 cursor-pointer">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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
  return <RailSwitch label={label} description={description} checked={checked} onChange={onChange} />;
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
        type="text"
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="fb-input mt-2"
      />
      {hint ? <span className="mt-2 block text-[13px] leading-snug text-muted">{hint}</span> : null}
    </label>
  );
}

/** A short "this is a preview" note used beside run buttons. */
export function PreviewNote({ children }: { children: ReactNode }) {
  return <Note tone="warn">{children}</Note>;
}
