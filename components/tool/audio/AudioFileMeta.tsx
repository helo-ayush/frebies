"use client";

import { ImageUp, X } from "lucide-react";
import type { AudioItem } from "./useAudioFile";
import { formatBytes, formatTime } from "./format";

export function AudioFileMeta({
  item,
  formatLabel,
  onReplace,
  onRemove,
}: {
  item: AudioItem;
  formatLabel?: string;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const durationLabel = item.duration ? formatTime(item.duration) : "reading…";
  const details = [
    formatBytes(item.size),
    durationLabel,
    item.sampleRate ? `${(item.sampleRate / 1000).toFixed(1)} kHz` : null,
    item.channels ? (item.channels === 1 ? "mono" : "stereo") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f1f5f1] text-[#557a68]">
        <span className="flex h-4 items-end gap-[2px]" aria-hidden>
          <span className="h-1.5 w-0.5 rounded-full bg-current" />
          <span className="h-3 w-0.5 rounded-full bg-current" />
          <span className="h-2 w-0.5 rounded-full bg-current" />
          <span className="h-3.5 w-0.5 rounded-full bg-current" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{item.name}</p>
        <p className="mt-0.5 text-micro text-faint">
          {details}
          {formatLabel ? ` · ${formatLabel}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onReplace}
        className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <ImageUp size={11} aria-hidden />
        <span className="hidden sm:inline">Replace</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
