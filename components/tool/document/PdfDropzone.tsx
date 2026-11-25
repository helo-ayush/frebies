"use client";

import type { DragEvent, ReactNode } from "react";
import { FileStack } from "lucide-react";
import { Dropzone } from "@/components/tool/kit/Dropzone";

/** Drop target shared by the document tools. */
export function PdfDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Read in your browser. Nothing is uploaded.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  minHeightClass = "min-h-[380px]",
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
      icon={<FileStack size={27} strokeWidth={1.5} aria-hidden />}
      minHeightClass={minHeightClass}
    />
  );
}
