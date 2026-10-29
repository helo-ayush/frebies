"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { pdfPageCount } from "./model";

export type PdfItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  url: string;
  pages: number;
  kind: "pdf" | "image";
};

type PdfQueueOptions = {
  maxFiles?: number;
  maxSizeMB?: number;
  /** Accept JPG, PNG and WebP alongside PDFs (used by OCR). */
  allowImages?: boolean;
};

/**
 * Shared PDF queue for the document studios: selection, replacement, drag and
 * drop, ordering, object-URL cleanup and a lightweight page count.
 */
export function usePdfQueue({
  maxFiles = 1,
  maxSizeMB = 25,
  allowImages = false,
}: PdfQueueOptions = {}) {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const itemsRef = useRef<PdfItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );

  const activeItem = items[0] ?? null;

  function openPicker(replaceId?: string) {
    replaceIdRef.current = replaceId ?? null;
    inputRef.current?.click();
  }

  function acceptFiles(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? []);
    if (incoming.length === 0) return;

    const replaceId = replaceIdRef.current;
    replaceIdRef.current = null;

    let baseItems = items;
    if (replaceId) baseItems = items.filter((item) => item.id !== replaceId);

    const remaining = Math.max(0, maxFiles - baseItems.length);
    const accepted: PdfItem[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedOverflow = 0;

    for (const file of incoming) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImage =
        allowImages && ["image/jpeg", "image/png", "image/webp"].includes(file.type);
      if (!isPdf && !isImage) {
        skippedType += 1;
        continue;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        skippedSize += 1;
        continue;
      }
      if (accepted.length >= remaining) {
        skippedOverflow += 1;
        continue;
      }

      idRef.current += 1;
      accepted.push({
        id: `pdf-${idRef.current}`,
        file,
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        pages: 1,
        kind: isPdf ? "pdf" : "image",
      });
    }

    if (accepted.length === 0) {
      setError(
        skippedType > 0
          ? allowImages
            ? "Choose a PDF, JPG, PNG or WebP file."
            : "Choose PDF files only."
          : skippedSize > 0
            ? `That file is larger than ${maxSizeMB} MB.`
            : maxFiles === 1
              ? "Only one file can be open at a time."
              : `You can add up to ${maxFiles} files at a time.`,
      );
      return;
    }

    if (replaceId) {
      const replaced = items.find((item) => item.id === replaceId);
      if (replaced) URL.revokeObjectURL(replaced.url);
    }

    setItems([...baseItems, ...accepted]);
    setError(
      [
        skippedType > 0 ? `${skippedType} non-PDF file${skippedType === 1 ? "" : "s"} skipped.` : null,
        skippedSize > 0 ? `${skippedSize} file${skippedSize === 1 ? " was" : "s were"} over ${maxSizeMB} MB.` : null,
        skippedOverflow > 0
          ? maxFiles === 1
            ? "Only one PDF can be open at a time."
            : `Only ${maxFiles} PDFs fit in one batch.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    );

    setReading(true);
    accepted.forEach((item) => {
      if (item.kind === "image") {
        setReading(false);
        return;
      }
      item.file
        .arrayBuffer()
        .then((buffer) => {
          const pages = pdfPageCount(buffer);
          setItems((current) =>
            current.map((entry) => (entry.id === item.id ? { ...entry, pages } : entry)),
          );
        })
        .catch(() => undefined)
        .finally(() => setReading(false));
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(event.target.files);
    event.target.value = "";
  }

  function removeItem(id: string) {
    const target = items.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clear() {
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setError(null);
    setReading(false);
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reverseItems() {
    setItems((current) => [...current].reverse());
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    replaceIdRef.current = null;
    acceptFiles(event.dataTransfer.files);
  }

  return {
    items,
    activeItem,
    totalPages: items.reduce((sum, item) => sum + item.pages, 0),
    reading,
    error,
    setError,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clear,
    moveItem,
    reverseItems,
  };
}
