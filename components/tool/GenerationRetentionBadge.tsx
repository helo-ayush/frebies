"use client";

import { Clock } from "lucide-react";
import {
  formatRemainingHoursVerbose,
  formatRemainingWindow,
  getRetentionTone,
} from "@/lib/storage/retention";

const TONE_STYLES = {
  healthy: "border-line-strong text-muted",
  warning: "border-accent text-accent-deep",
  critical: "border-danger text-danger",
  expired: "border-danger/50 text-danger",
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
      className={`fb-num inline-flex h-6 items-center gap-1.5 border px-2 text-[12px] font-medium ${TONE_STYLES[tone]}`}
    >
      <Clock size={11} className="shrink-0 opacity-80" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function GenerationStorageNotice({
  ttlHours = 24,
  noun = "Generated audio",
}: {
  ttlHours?: number;
  noun?: string;
}) {
  const stayVerb = noun.trim().toLowerCase().endsWith("s") ? "stay" : "stays";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[13px] text-muted">
      <span className="inline-flex items-center gap-2">
        <Clock size={14} className="shrink-0 text-faint" aria-hidden />
        {noun} {stayVerb} saved for <strong className="font-semibold text-ink">{ttlHours} hours</strong>
      </span>
      <span className="text-faint">Older items may be cleared earlier when space is needed</span>
    </div>
  );
}
