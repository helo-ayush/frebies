"use client";

import { Clock } from "lucide-react";
import {
  formatRemainingHoursVerbose,
  formatRemainingWindow,
  getRetentionTone,
} from "@/lib/storage/retention";

const TONE_STYLES = {
  healthy: "border-line bg-[#f7f7f5] text-muted",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-rose-200 bg-rose-50/70 text-rose-600",
} as const;

export function GenerationExpiryBadge({
  expiresAt,
  nowMs,
}: {
  expiresAt: number | null | undefined;
  nowMs: number;
}) {
  if (!expiresAt) return null;

  const tone = getRetentionTone(expiresAt, nowMs);
  const label = formatRemainingWindow(expiresAt, nowMs);
  const title = formatRemainingHoursVerbose(expiresAt, nowMs);

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium tabular-nums ${TONE_STYLES[tone]}`}
    >
      <Clock size={10} className="shrink-0 opacity-80" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function GenerationStorageNotice({ ttlHours = 24 }: { ttlHours?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white/80 px-3 py-2 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Clock size={12} className="shrink-0 text-faint" aria-hidden />
        Generated audio stays saved for{" "}
        <strong className="font-medium text-ink">{ttlHours} hours</strong>
      </span>
      <span className="text-[10.5px] text-faint">
        Older items may be cleared earlier when space is needed
      </span>
    </div>
  );
}
