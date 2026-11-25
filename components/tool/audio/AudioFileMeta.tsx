"use client";

import type { ReactNode } from "react";
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
  children,
}: {
  item: AudioItem;
  formatLabel?: string;
  onReplace: () => void;
  onRemove: () => void;
  children?: ReactNode;
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
      flush
      className="shrink-0 border-b border-line"
      icon={<AudioLines size={17} aria-hidden />}
      name={item.name}
      meta={details}
      onReplace={onReplace}
      onRemove={onRemove}
    >
      {children}
    </FileRow>
  );
}
