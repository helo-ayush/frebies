"use client";

import type { DragEvent, ReactNode } from "react";
import { Dropzone } from "@/components/tool/kit/Dropzone";

/** Audio flavour of the shared studio dropzone: same empty state as every other tool. */
export function AudioDropzone({
  note = "Your audio stays on this device.",
  ...props
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
}) {
  return <Dropzone note={note} {...props} />;
}
