export const DEFAULT_GENERATION_TTL_HOURS = 24;
export const DEFAULT_GENERATION_TTL_MS = DEFAULT_GENERATION_TTL_HOURS * 60 * 60 * 1000;

export type RetentionTone = "healthy" | "warning" | "critical" | "expired";

export function getRemainingMs(expiresAt: number | null | undefined, now = Date.now()): number {
  if (!expiresAt || !Number.isFinite(expiresAt)) return 0;
  return Math.max(0, expiresAt - now);
}

export function getRetentionTone(expiresAt: number | null | undefined, now = Date.now()): RetentionTone {
  const remaining = getRemainingMs(expiresAt, now);
  if (remaining <= 0) return "expired";
  if (remaining <= 30 * 60 * 1000) return "critical";
  if (remaining <= 4 * 60 * 60 * 1000) return "warning";
  return "healthy";
}

export function formatRemainingWindow(expiresAt: number | null | undefined, now = Date.now()): string {
  const remaining = getRemainingMs(expiresAt, now);
  if (remaining <= 0) return "Expired";

  if (remaining < 60 * 1000) {
    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    return `${seconds}s remaining`;
  }

  const totalMinutes = Math.floor(remaining / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"} remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} remaining`;
  }
  return `${hours}h ${mins}m remaining`;
}

export function formatRemainingHoursVerbose(expiresAt: number | null | undefined, now = Date.now()): string {
  const remaining = getRemainingMs(expiresAt, now);
  if (remaining <= 0) return "Expired — scheduled for deletion";
  const totalMinutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"} remaining before automatic cleanup`;
  }
  if (mins === 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} remaining before automatic cleanup`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${mins} min remaining before automatic cleanup`;
}

