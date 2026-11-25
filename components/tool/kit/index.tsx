"use client";

/**
 * Shared building blocks for every tool studio.
 *
 * The rules they encode:
 *  - the studio fills the screen under the header, edge to edge, so the tool is
 *    usable the moment the page opens;
 *  - one loud control per studio (run, then download), at the top of the
 *    settings rail on desktop and pinned to the bottom of the screen on phones;
 *  - hairlines and cells instead of cards; nothing under 11px.
 */

import { Children, type ReactNode } from "react";
import { ArrowLeftRight, Check, Download, Info, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/** Height that makes a studio fill the screen under the top bar and tool header. */
export const STUDIO_HEIGHT = "lg:h-[calc(100dvh-var(--fb-bar)-var(--fb-head))] lg:min-h-[540px]";
/** Stage on the left, settings rail on the right. */
export const STUDIO_GRID = "grid lg:grid-cols-[minmax(0,1fr)_clamp(364px,29%,440px)]";

/**
 * Outer frame of a studio. `fill` locks it to the viewport height so the stage
 * and the rail scroll on their own; without it the studio grows with its
 * content and a `sticky` rail keeps the action in view.
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
    <section id={id} aria-label={label} className={`scroll-mt-[var(--fb-bar)] overflow-clip ${className}`}>
      <div className={`${gridClassName ?? STUDIO_GRID} ${fill ? STUDIO_HEIGHT : "lg:items-stretch"}`}>{children}</div>
    </section>
  );
}

/** Left side of a studio: the dropzone, viewer or editor. `flush` removes the padding for edge-to-edge bars. */
export function StudioStage({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={`fb-stage relative flex min-h-0 min-w-0 flex-col ${flush ? "" : "p-3 sm:p-4"} ${className}`}>
      {children}
    </div>
  );
}

/** Strip above the viewport: what you are looking at on the left, how to look at it on the right. */
export function StageBar({
  children,
  end,
  className = "",
}: {
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel/80 px-3 py-2 sm:px-4 ${className}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {end ? <div className="flex flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

/** Strip under the viewport, usually the loaded file. */
export function StageFoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shrink-0 border-t border-line bg-panel ${className}`}>{children}</div>;
}

/** Joined toggle buttons for a stage bar. */
export function ToolTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`-ml-px inline-flex h-9 items-center gap-1.5 border px-3 text-[12.5px] font-medium uppercase transition-colors first:ml-0 ${
              active ? "relative z-[1] border-ink bg-ink text-white" : "border-line-strong bg-panel hover:bg-hover"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Square icon button for a stage bar. */
export function ToolIcon({
  children,
  onClick,
  label,
  active,
  disabled,
  slot,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  slot?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-slot={slot}
      className={`grid h-9 w-9 shrink-0 place-items-center border transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-panel text-ink hover:bg-hover"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Small text button for a stage bar or foot. */
export function ToolText({
  children,
  onClick,
  disabled,
  icon,
  title,
  compact = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
  /** In a tight file row, keep only the icon. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-compact={(compact && Boolean(icon)) || undefined}
      className={`inline-flex h-9 items-center gap-2 border border-line-strong bg-panel px-3 text-[12.5px] font-medium uppercase transition-colors hover:border-ink hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {icon}
      <span className="contents">{children}</span>
    </button>
  );
}

/**
 * Holds the primary action. Sits at the top of the rail on desktop; on phones
 * it becomes a bar fixed to the bottom of the screen, so the run / download
 * control is always one thumb away.
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
      className={`shrink-0 border-line bg-panel px-4 py-4 sm:px-5 lg:border-b ${
        pinned
          ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-line-strong max-lg:px-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3"
          : "border-b"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The one setting people change most, as a strip above the run button. Phones
 * only: on desktop the same control is already in view in the rail.
 */
export function QuickPick<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-3 mb-2.5 flex overflow-x-auto px-3 lg:hidden">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`-ml-px h-10 min-w-[60px] shrink-0 border px-3.5 text-[13px] font-medium uppercase first:ml-0 ${
              active ? "relative z-[1] border-ink bg-ink text-white" : "border-line-strong bg-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type ActionTone = "accent" | "success" | "ink";

const TONE_ATTR: Record<ActionTone, string | undefined> = {
  accent: undefined,
  success: "done",
  ink: "ink",
};

const HINT =
  "mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-snug text-faint max-lg:mt-2 max-lg:flex-nowrap max-lg:overflow-hidden max-lg:whitespace-nowrap";

/**
 * The single loud control of a studio. Coral while there is work to do; ink
 * with a coral cell once there is something to take. Fills with moving pages
 * while it runs.
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
  /** One short line under the button (cost, size). */
  hint?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const percent = typeof progress === "number" ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
        data-slot="primary-action"
        data-tone={TONE_ATTR[tone]}
        className="fb-run"
      >
        {busy ? (
          <span aria-hidden className="fb-run-fill" style={{ width: percent === null ? "100%" : `${Math.max(6, percent)}%` }} />
        ) : null}
        <span className="fb-run-icon">
          {busy ? <Loader2 size={19} className="animate-spin" aria-hidden /> : (icon ?? <Arrow />)}
        </span>
        <span className="fb-run-label">
          <span className="min-w-0 flex-1">{busy ? busyLabel : label}</span>
          {busy && percent !== null ? <span className="fb-num pl-3">{percent}%</span> : null}
        </span>
      </button>
      {hint ? <p className={HINT}>{hint}</p> : null}
    </div>
  );
}

function Arrow() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1.5 8h12M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

/** The finished state of the primary action. */
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
        <a href={href} download={filename} data-slot="primary-action" data-tone="done" className="fb-run">
          <span className="fb-run-icon">
            <Download size={19} aria-hidden />
          </span>
          <span className="fb-run-label">{label}</span>
        </a>
        {hint ? <p className={HINT}>{hint}</p> : null}
      </div>
    );
  }
  return (
    <PrimaryAction
      tone="success"
      label={label}
      icon={<Download size={19} aria-hidden />}
      onClick={onClick}
      disabled={disabled}
      hint={hint}
    />
  );
}

/** Row of quieter buttons under the primary action (ZIP, start over, …). */
export function ActionRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-2.5 flex gap-2 [&>*]:min-w-0 [&>*]:flex-1 ${className}`}>{children}</div>;
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
      className={buttonClasses("secondary", "md", "!h-11 px-3 !text-[13px]")}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function StartOverAction({ onClick, label = "Start over" }: { onClick: () => void; label?: string }) {
  return (
    <SecondaryAction onClick={onClick} icon={<RotateCcw size={14} aria-hidden />}>
      {label}
    </SecondaryAction>
  );
}

/** Readout shown on the stage once output is ready: an ink strip like the machine's display. */
export function ResultCard({
  title,
  meta,
  children,
  className = "",
  busy = false,
  stack = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  /** Buttons on the right. Use `ResultButton`. */
  children?: ReactNode;
  className?: string;
  /** Swap the check for a spinner while the result is being remade. */
  busy?: boolean;
  /** Several downloads: in a narrow band the buttons take a row of their own and keep their words. */
  stack?: boolean;
}) {
  return (
    <div
      role="status"
      data-stack={stack || undefined}
      className={`fb-result fb-unfold shrink-0 bg-ink text-white ${className}`}
    >
      <div className="flex flex-wrap items-stretch">
        <span className="grid w-14 shrink-0 place-items-center bg-accent-deep">
          {busy ? <Loader2 size={19} className="animate-spin" aria-hidden /> : <Check size={20} strokeWidth={2.4} aria-hidden />}
        </span>
        <div className="min-w-[150px] flex-1 px-4 py-3.5">
          <p className="fb-wide truncate text-[17px] !leading-[1.15]">{title}</p>
          {meta ? <p className="mt-1 truncate text-[13px] text-white/60">{meta}</p> : null}
        </div>
        {children ? <div className="fb-result-keys flex max-w-full flex-wrap items-stretch">{children}</div> : null}
      </div>
    </div>
  );
}

/** Button inside a `ResultCard`. `loud` is the one that takes the file away. */
export function ResultButton({
  children,
  onClick,
  icon,
  disabled,
  loud = false,
  href,
  filename,
  label,
}: {
  children?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loud?: boolean;
  href?: string;
  filename?: string;
  /** Accessible name when there is only an icon. */
  label?: string;
}) {
  const look = `inline-flex min-h-[52px] items-center justify-center gap-2 border-l border-white/15 px-4 text-[13px] font-semibold uppercase transition-colors disabled:pointer-events-none disabled:opacity-45 ${
    loud ? "bg-accent-deep hover:bg-white hover:text-ink" : "hover:bg-white hover:text-ink"
  }`;
  // In a narrow band only the icon stays: the big download key is in view anyway.
  const text = children ? icon ? <span className="fb-result-text">{children}</span> : children : null;
  if (href) {
    return (
      <a href={href} download={filename} aria-label={label} className={look}>
        {icon}
        {text}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={look}>
      {icon}
      {text}
    </button>
  );
}

const NOTE_TONES = {
  info: { box: "border-l-ink text-muted", Icon: Info },
  warn: { box: "border-l-accent text-ink", Icon: TriangleAlert },
  error: { box: "border-l-danger bg-danger-soft text-danger", Icon: TriangleAlert },
  success: { box: "border-l-accent text-ink", Icon: Check },
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
      className={`flex items-start gap-2.5 border border-l-[3px] border-line bg-panel px-3.5 py-3 text-[13.5px] leading-relaxed ${box} ${className}`}
    >
      <Icon size={15} className="mt-[3px] shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The loaded file, with replace / remove. Sits flush in a `StageFoot`, or framed on its own. */
export function FileRow({
  icon,
  name,
  meta,
  onReplace,
  onRemove,
  className = "",
  flush = false,
  children,
}: {
  icon?: ReactNode;
  name: string;
  meta?: ReactNode;
  onReplace?: () => void;
  onRemove?: () => void;
  className?: string;
  flush?: boolean;
  /** Extra buttons before Replace. */
  children?: ReactNode;
}) {
  const extras = Children.toArray(children).length > 0;
  return (
    <div
      data-extras={extras || undefined}
      className={`fb-filerow shrink-0 bg-panel ${flush ? "" : "border border-line"} ${className}`}
    >
      <div className="flex min-h-[60px] flex-wrap items-center gap-x-3.5 pl-3.5 pr-2">
        {icon ? (
          <span
            className="fb-ear grid h-10 w-9 shrink-0 place-items-center bg-ink text-white"
            style={{ ["--ear" as string]: "10px" }}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-[120px] flex-1 py-2">
          <p className="truncate text-[14.5px] font-semibold" title={name}>
            {name}
          </p>
          {meta ? <p className="mt-0.5 truncate text-[13px] text-muted">{meta}</p> : null}
        </div>
        {extras ? <div className="fb-filerow-extras flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div> : null}
        <div className="flex shrink-0 items-center">
          {onReplace ? (
            <button
              type="button"
              onClick={onReplace}
              title="Replace this file"
              className="fb-filerow-replace inline-flex h-9 min-w-9 items-center justify-center px-2.5 text-[12.5px] font-medium uppercase transition-colors hover:bg-ink hover:text-white"
            >
              <ArrowLeftRight size={16} aria-hidden />
              <span>Replace</span>
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${name}`}
              title="Remove"
              data-slot="file-remove"
              className="grid h-9 w-9 shrink-0 place-items-center transition-colors hover:bg-ink hover:text-white"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Group of settings in a rail. Flat: a label, then controls. */
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
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold uppercase">{label}</span>
        {hint ? <span className="fb-num text-right text-[13px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Joined cells, one choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
  disabled = false,
}: {
  options: readonly { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid auto-cols-fr grid-flow-col border border-line-strong bg-white ${className}`}
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
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative h-10 border-l border-line-strong px-1.5 text-[13.5px] font-medium transition-colors first:border-l-0 disabled:pointer-events-none disabled:opacity-45 ${
              active ? "bg-ink text-white" : "hover:bg-hover"
            }`}
          >
            {option.label}
            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Selectable row: a title with one line of detail. */
export function OptionCard({
  active,
  title,
  detail,
  icon,
  onClick,
  className = "",
  disabled = false,
}: {
  active: boolean;
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-45 ${
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-white hover:border-ink"
      } ${className}`}
    >
      {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-[4px] bg-accent" /> : null}
      {icon ? <span className={`shrink-0 ${active ? "text-accent" : "text-muted"}`}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        {detail ? (
          <span className={`mt-0.5 block text-[13px] leading-snug ${active ? "text-white/65" : "text-muted"}`}>{detail}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center border ${
          active ? "border-accent bg-accent text-white" : "border-line-strong bg-transparent text-transparent"
        }`}
      >
        <Check size={12} strokeWidth={3.2} />
      </span>
    </button>
  );
}
