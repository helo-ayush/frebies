"use client";

/**
 * Shared building blocks for every tool studio.
 *
 * The rules they encode:
 *  - the studio fills the viewport, so the tool is usable the moment the page opens;
 *  - one loud primary action per studio (run → download), pinned to the top of the
 *    settings rail on desktop and to the bottom of the screen on mobile;
 *  - no text below 11px, and no repeated reassurance pills.
 */

import type { ReactNode } from "react";
import { Check, Download, Info, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { buttonClasses, type ButtonVariant } from "@/components/ui/Button";

/** Height that makes a studio fill the screen under the topbar and tool header. */
export const STUDIO_HEIGHT = "lg:h-[calc(100dvh-150px)] lg:min-h-[600px] lg:max-h-[980px]";
/** Stage on the left, 384px settings rail on the right. */
export const STUDIO_GRID = "grid lg:grid-cols-[minmax(0,1fr)_384px]";
export const STAGE_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-faint";

/**
 * Outer card of a studio. `fill` locks it to the viewport height so the stage
 * and the rail scroll internally; without it the studio grows with its content
 * and the rail can be made sticky.
 */
export function StudioFrame({
  id,
  label,
  children,
  fill = true,
  className = "",
  gridClassName,
}: {
  id?: string;
  label: string;
  children: ReactNode;
  fill?: boolean;
  className?: string;
  gridClassName?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={`scroll-mt-20 overflow-clip rounded-[22px] border border-line bg-white shadow-stage ${className}`}
    >
      <div className={`${gridClassName ?? STUDIO_GRID} ${fill ? STUDIO_HEIGHT : "lg:items-start"}`}>
        {children}
      </div>
    </section>
  );
}

/** Left side of a studio: the dropzone, preview or editor. */
export function StudioStage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col bg-paper p-3 sm:p-4 ${className}`}>{children}</div>
  );
}

/**
 * Holds the primary action. Sits at the top of the rail on desktop; on phones
 * it becomes a bar fixed to the bottom of the screen so the run / download
 * button is always one thumb away.
 */
export function ActionDock({
  children,
  pinned = true,
  className = "",
}: {
  children: ReactNode;
  /** Pin to the bottom of the viewport below the `lg` breakpoint. */
  pinned?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="action-dock"
      className={`shrink-0 border-line bg-white px-4 py-3.5 sm:px-5 lg:border-b ${
        pinned
          ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:bg-white/95 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3 max-lg:shadow-[0_-12px_30px_-14px_rgba(15,15,16,0.22)] max-lg:backdrop-blur"
          : "border-b"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export type ActionTone = "accent" | "success" | "ink";

const TONE_VARIANT: Record<ActionTone, ButtonVariant> = {
  accent: "accent",
  success: "success",
  ink: "primary",
};

/**
 * The single loud button of a studio. Shows a filling progress bar while busy.
 * Use tone="accent" to run the tool and tone="success" for the finished download.
 */
export function PrimaryAction({
  label,
  busyLabel = "Working…",
  icon,
  busy = false,
  progress,
  disabled = false,
  onClick,
  tone = "accent",
  hint,
  className = "",
  ariaLabel,
}: {
  label: ReactNode;
  busyLabel?: ReactNode;
  icon?: ReactNode;
  busy?: boolean;
  /** 0–1. Omit for an indeterminate run. */
  progress?: number;
  disabled?: boolean;
  onClick?: () => void;
  tone?: ActionTone;
  /** One short line under the button (cost, size). Kept to one line in the mobile dock. */
  hint?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const percent =
    typeof progress === "number" ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
        data-slot="primary-action"
        className={buttonClasses(
          TONE_VARIANT[tone],
          "xl",
          `relative w-full overflow-hidden ${busy ? "!opacity-100 brightness-95" : ""}`,
        )}
      >
        {busy && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-300"
            style={{ width: percent === null ? "100%" : `${percent}%` }}
          />
        )}
        {busy && percent === null && (
          <span
            aria-hidden
            className="absolute inset-0 animate-kit-stripes bg-[linear-gradient(110deg,transparent_0_40%,rgba(255,255,255,0.22)_40%_60%,transparent_60%)] bg-[length:28px_100%]"
          />
        )}
        <span className="relative flex items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
          <span>{busy ? busyLabel : label}</span>
          {busy && percent !== null && <span className="tabular-nums opacity-80">{percent}%</span>}
        </span>
      </button>
      {hint ? (
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-[12px] leading-snug text-faint max-lg:mt-1.5 max-lg:flex-nowrap max-lg:overflow-hidden max-lg:whitespace-nowrap">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Convenience for the finished state: a green download button. */
export function DownloadAction({
  label = "Download",
  onClick,
  hint,
  disabled,
  href,
  filename,
}: {
  label?: ReactNode;
  onClick?: () => void;
  hint?: ReactNode;
  disabled?: boolean;
  /** When set, renders a real link so the browser handles the save. */
  href?: string;
  filename?: string;
}) {
  if (href) {
    return (
      <div>
        <a
          href={href}
          download={filename}
          data-slot="primary-action"
          className={buttonClasses("success", "xl", "w-full")}
        >
          <Download size={16} aria-hidden />
          {label}
        </a>
        {hint ? (
          <p className="mt-2 text-center text-[12px] leading-snug text-faint max-lg:mt-1.5 max-lg:truncate">{hint}</p>
        ) : null}
      </div>
    );
  }
  return (
    <PrimaryAction
      tone="success"
      label={label}
      icon={<Download size={16} aria-hidden />}
      onClick={onClick}
      disabled={disabled}
      hint={hint}
    />
  );
}

/** Row of quieter buttons under the primary action (ZIP, start over, …). */
export function ActionRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-2 flex gap-2 [&>*]:flex-1 ${className}`}>{children}</div>;
}

export function SecondaryAction({
  children,
  onClick,
  disabled,
  icon,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={buttonClasses("secondary", "md", "h-10 rounded-[12px] text-[13px]")}
    >
      {icon}
      {children}
    </button>
  );
}

export function StartOverAction({ onClick, label = "Start over" }: { onClick: () => void; label?: string }) {
  return (
    <SecondaryAction onClick={onClick} icon={<RotateCcw size={13} aria-hidden />}>
      {label}
    </SecondaryAction>
  );
}

/** Green "it worked" strip shown on the stage once output is ready. */
export function ResultCard({
  title,
  meta,
  children,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  /** Buttons on the right. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex animate-kit-rise flex-wrap items-center gap-3 rounded-[14px] border border-[#cfe6d8] bg-success-soft px-3.5 py-3 ${className}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success text-white">
        <Check size={16} strokeWidth={2.6} aria-hidden />
      </span>
      <div className="min-w-[140px] flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{title}</p>
        {meta ? <p className="mt-0.5 truncate text-[12.5px] text-[#3f6b54]">{meta}</p> : null}
      </div>
      {children ? <div className="flex max-w-full flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

const NOTE_TONES = {
  info: { box: "border-line bg-white text-muted", Icon: Info },
  warn: { box: "border-[#eadfce] bg-[#fdf9f2] text-[#77603f]", Icon: TriangleAlert },
  error: { box: "border-[#f1cfc9] bg-danger-soft text-danger", Icon: TriangleAlert },
  success: { box: "border-[#cfe6d8] bg-success-soft text-[#2f6248]", Icon: Check },
} as const;

/** Inline message. `error` is announced as an alert, the rest as status. */
export function Note({
  tone = "info",
  children,
  className = "",
}: {
  tone?: keyof typeof NOTE_TONES;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = NOTE_TONES[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-[12px] border px-3 py-2.5 text-[12.5px] leading-relaxed ${box} ${className}`}
    >
      <Icon size={14} className="mt-[2px] shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The loaded file, with replace / remove. */
export function FileRow({
  icon,
  name,
  meta,
  onReplace,
  onRemove,
  className = "",
}: {
  icon?: ReactNode;
  name: string;
  meta?: ReactNode;
  onReplace?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[12px] border border-line bg-white px-2.5 py-2 ${className}`}
    >
      {icon ? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-card text-muted">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{name}</p>
        {meta ? <p className="mt-0.5 truncate text-[12px] text-faint">{meta}</p> : null}
      </div>
      {onReplace ? (
        <button
          type="button"
          onClick={onReplace}
          className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          Replace
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          data-slot="file-remove"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Group of settings in a rail. Flat: a label, then controls. No nested cards. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {hint ? <span className="text-[12px] tabular-nums text-faint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Pill-style single choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid auto-cols-fr grid-flow-col gap-1 rounded-[12px] bg-card p-1 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-[9px] px-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Selectable card: a title with one line of detail. */
export function OptionCard({
  active,
  title,
  detail,
  icon,
  onClick,
  className = "",
}: {
  active: boolean;
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-ink bg-white shadow-[inset_0_0_0_1px_#0f0f10]"
          : "border-line bg-white hover:border-[#cfc9bd]"
      } ${className}`}
    >
      {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        {detail ? <span className="mt-0.5 block text-[12px] leading-snug text-faint">{detail}</span> : null}
      </span>
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${
          active ? "border-ink bg-ink text-white" : "border-[#d7d2c8] bg-white text-transparent"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
    </button>
  );
}

/** Small count / state chip for stage toolbars. */
export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-white px-2.5 text-[12px] font-medium tabular-nums text-muted ${className}`}
    >
      {children}
    </span>
  );
}
