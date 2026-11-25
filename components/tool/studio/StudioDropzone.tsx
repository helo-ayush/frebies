"use client";

import type { DragEvent, ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { Dropzone, DropChip } from "@/components/tool/kit/Dropzone";

/** Image / generic drop target. Thin wrapper over the shared kit dropzone. */
export function StudioDropzone({
  title,
  description,
  buttonLabel,
  limits,
  note = "Processed in your browser. Nothing is uploaded.",
  onChoose,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  chips,
  icon,
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
  icon?: ReactNode;
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
      icon={icon ?? <ImagePlus size={27} strokeWidth={1.5} aria-hidden />}
      minHeightClass={minHeightClass}
    />
  );
}

export function StudioChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <DropChip icon={icon}>{children}</DropChip>;
}
