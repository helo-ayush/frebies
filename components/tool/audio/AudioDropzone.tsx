"use client";

import type { DragEvent, ReactNode } from "react";
import { AudioLines } from "lucide-react";
import { Dropzone } from "@/components/tool/kit/Dropzone";

/** Audio flavour of the shared studio dropzone: same empty state as every other tool. */
export function AudioDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Your audio stays on this device.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  minHeightClass = "min-h-[380px] lg:min-h-[440px]",
}: {
  title: string;
  description: string;
  buttonLabel: string;
  limits: string;
  note?: string;
  onChoose: () => void;
  dragging: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  chips?: ReactNode;
  minHeightClass?: string;
}) {
  return (
    <Dropzone
      title={title}
      description={description}
      buttonLabel={buttonLabel}
      limits={limits}
      note={note}
      onChoose={onChoose}
      dragging={dragging}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      chips={chips}
      minHeightClass={minHeightClass}
      icon={<AudioLines size={28} strokeWidth={1.5} aria-hidden />}
    />
  );
}
