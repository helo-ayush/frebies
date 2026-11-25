"use client";

import { AudioLines } from "lucide-react";
import { FileRow } from "@/components/tool/kit";
import type { AudioItem } from "./useAudioFile";
import { formatBytes, formatTime } from "./format";

/** The loaded audio file: name, the facts about it, replace and remove. */
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
  const details = [
    formatLabel,
    formatBytes(item.size),
    item.duration ? formatTime(item.duration) : "reading…",
    item.sampleRate ? `${(item.sampleRate / 1000).toFixed(1)} kHz` : null,
    item.channels ? (item.channels === 1 ? "mono" : "stereo") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <FileRow
      className="mt-2.5 shrink-0"
      icon={<AudioLines size={16} aria-hidden />}
      name={item.name}
      meta={details}
      onReplace={onReplace}
      onRemove={onRemove}
    />
  );
}
