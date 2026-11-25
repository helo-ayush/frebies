"use client";

/** Things made earlier in an AI studio: a ruled list under the stage. */

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ToolIcon } from "@/components/tool/kit";

export function HistorySection({
  title,
  count,
  note,
  pager,
  children,
  label,
  className = "",
}: {
  title: string;
  count?: number;
  note?: ReactNode;
  pager?: ReactNode;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section aria-label={label ?? title} className={className}>
      <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="fb-wide flex items-baseline gap-3 text-[19px]">
            {title}
            {count ? <span className="fb-num text-[13px] font-normal tracking-normal text-faint">[{count}]</span> : null}
          </h2>
          {note ? <p className="mt-1.5 text-[13px] text-muted">{note}</p> : null}
        </div>
        {pager}
      </div>
      {children}
    </section>
  );
}

/** One quiet line when there is nothing to list. */
export function HistoryEmpty({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2.5 border-t border-line px-4 py-6 text-[14.5px] text-muted sm:px-6">{children}</p>;
}

export function HistoryList({ children }: { children: ReactNode }) {
  return <ul className="border-t border-line">{children}</ul>;
}

export function HistoryRow({
  thumb,
  title,
  badge,
  meta,
  metaTitle,
  progress,
  progressLabel,
  progressTitle,
  error,
  active = false,
  children,
  actions,
}: {
  thumb?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  metaTitle?: string;
  /** 0–100 while the job runs. */
  progress?: number;
  progressLabel?: string;
  progressTitle?: string;
  error?: ReactNode;
  active?: boolean;
  /** Extra content under the row, e.g. a player. */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className={`relative border-b border-line ${active ? "bg-panel" : ""}`}>
      {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-[4px] bg-accent" /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-6">
        {thumb}
        <div className="min-w-0 flex-1 basis-[200px]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 max-w-full truncate text-[15px] font-semibold">{title}</span>
            {badge}
          </div>
          {meta ? (
            <p className="fb-num mt-1 text-[13px] leading-snug text-muted" title={metaTitle}>
              {meta}
            </p>
          ) : null}
          {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
        {typeof progress === "number" ? (
          <div className="basis-full" title={progressTitle}>
            <div className="flex items-center justify-between text-[13px] text-muted">
              <span>{progressLabel}</span>
              <span className="fb-num">{progress}%</span>
            </div>
            <JobBar value={progress} label={progressLabel ?? "Progress"} className="mt-1.5" />
          </div>
        ) : null}
      </div>
      {children}
    </li>
  );
}

/** Thin progress track. */
export function JobBar({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={`h-[6px] w-full overflow-hidden bg-line-strong/50 ${className}`}
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(4, value)}%` }} />
    </div>
  );
}

/** Square picture slot at the start of a row. */
export function HistoryThumb({ src, children }: { src?: string | null; children?: ReactNode }) {
  return src ? (
    <img src={src} alt="" className="fb-checker h-14 w-14 shrink-0 object-cover" />
  ) : (
    <span className="grid h-14 w-14 shrink-0 place-items-center bg-ink text-white">{children}</span>
  );
}

export function HistoryButton({
  children,
  onClick,
  icon,
  disabled,
  href,
  filename,
  loud = false,
  label,
}: {
  children?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  href?: string;
  filename?: string;
  loud?: boolean;
  label?: string;
}) {
  const look = `inline-flex h-9 items-center gap-2 px-3.5 text-[12.5px] font-semibold uppercase transition-colors disabled:pointer-events-none disabled:opacity-45 ${
    loud ? "bg-ink text-white hover:bg-accent-deep" : "border border-line-strong hover:border-ink hover:bg-ink hover:text-white"
  }`;
  if (href) {
    return (
      <a href={href} download={filename} aria-label={label} className={look}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={look}>
      {icon}
      {children}
    </button>
  );
}

export function HistoryPager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center">
      <ToolIcon label="Previous page" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
        <ChevronLeft size={16} aria-hidden />
      </ToolIcon>
      <span className="fb-num grid h-9 min-w-[64px] place-items-center border-y border-line-strong px-2 text-[13px]">
        {page} / {pages}
      </span>
      <ToolIcon label="Next page" disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))}>
        <ChevronRight size={16} aria-hidden />
      </ToolIcon>
    </div>
  );
}
