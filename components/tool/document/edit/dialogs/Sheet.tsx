"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** The frame of every panel of the editor. */
export function Sheet({
  title,
  open,
  onClose,
  width = 620,
  children,
  foot,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  /** Stays in view however long the panel gets. */
  foot?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-24px)] max-w-none overflow-hidden border border-line-strong bg-panel p-0 text-ink"
      style={{ width: `min(${width}px, calc(100vw - 24px))` }}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-26px)] flex-col">
          <div className="flex h-[58px] shrink-0 items-stretch justify-between border-b border-line">
            <p className="fb-wide flex items-center px-5 text-[19px]">{title}</p>
            <button
              type="button"
              aria-label="Close"
              data-slot="viewer-close"
              onClick={() => ref.current?.close()}
              className="grid w-[58px] place-items-center border-l border-line transition-colors hover:bg-hover hover:text-accent-deep focus-visible:outline-offset-[-3px]"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {foot ? <div className="shrink-0 border-t border-line p-4">{foot}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Part({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`border-b border-line px-5 py-4 last:border-b-0 ${className}`}>
      {title ? <p className="mb-2.5 text-[13px] text-muted">{title}</p> : null}
      {children}
    </div>
  );
}

/** A few choices side by side. */
export function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.title}
          data-sound="select"
          onClick={() => onChange(option.value)}
          className={`min-h-[38px] border px-3 text-[13.5px] transition-colors ${
            value === option.value ? "fb-ed-tile-on font-medium" : "border-line-strong bg-white hover:border-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tick({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 py-1 text-[14px] leading-snug">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[2px] h-4 w-4 shrink-0 accent-[#1d1c1f]"
      />
      <span>{children}</span>
    </label>
  );
}
