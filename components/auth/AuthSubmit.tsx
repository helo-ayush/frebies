"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useStagePress } from "./AuthShell";

/** The one loud button of an auth form. Hovering it presses the machine's. */
export function AuthSubmit({
  label,
  busyLabel,
  busy,
  disabled,
  icon,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const off = Boolean(disabled || busy);
  useStagePress(Boolean(busy) || (hover && !off));

  return (
    <button
      type="submit"
      disabled={off}
      aria-busy={busy || undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="fb-run"
    >
      {busy ? <span aria-hidden className="fb-run-fill" style={{ width: "100%" }} /> : null}
      <span className="fb-run-icon">
        {busy ? <Loader2 size={19} className="animate-spin" aria-hidden /> : icon}
      </span>
      <span className="fb-run-label">{busy ? (busyLabel ?? label) : label}</span>
    </button>
  );
}

/** Labelled field. */
export function AuthField({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between text-[14px] font-medium">
        {label}
        {hint ? <span className="text-[13px] font-normal text-faint">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Password box with a show / hide key. */
export function PasswordInput({
  id,
  value,
  onChange,
  shown,
  onToggle,
  placeholder,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  return (
    <div className="flex">
      <input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="fb-input !h-[52px] min-w-0 flex-1 !text-[16px]"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="-ml-px w-[72px] shrink-0 border border-line-strong bg-white text-[13px] font-medium uppercase transition-colors hover:bg-ink hover:text-white"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
