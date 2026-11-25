"use client";

import type { DragEvent, ReactNode } from "react";
import { Dropzone } from "@/components/tool/kit/Dropzone";

/** Drop target shared by the document tools. */
export function PdfDropzone({
  note = "Read in your browser. Nothing is uploaded.",
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
