"use client";

import type { DragEvent, ReactNode } from "react";
import { Dropzone, DropChip } from "@/components/tool/kit/Dropzone";

/** Image / generic drop target. Thin wrapper over the shared kit dropzone. */
export function StudioDropzone({
  note = "Processed in your browser. Nothing is uploaded.",
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
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return <Dropzone note={note} {...props} />;
}

export function StudioChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <DropChip icon={icon}>{children}</DropChip>;
}
