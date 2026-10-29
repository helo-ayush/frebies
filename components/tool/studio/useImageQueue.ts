"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { StudioImage } from "./types";

const DEFAULT_TYPES = ["image/jpeg", "image/png", "image/webp"];

type ImageQueueOptions = {
  maxFiles: number;
  maxSizeMB: number;
  allowedTypes?: string[];
  formatHint?: string;
  noun?: string;
};

/**
 * Shared image queue for browser tools: multi-file selection, replacement,
 * drag and drop, object-URL cleanup and image dimensions.
 */
export function useImageQueue({
  maxFiles,
  maxSizeMB,
  allowedTypes = DEFAULT_TYPES,
  formatHint = "JPG, PNG or WebP",
  noun = "image",
}: ImageQueueOptions) {
  const [items, setItems] = useState<StudioImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const itemsRef = useRef<StudioImage[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    },
    [],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? items[0] ?? null;
  const activeIndex = activeItem
    ? items.findIndex((item) => item.id === activeItem.id)
    : -1;

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
    if (replaceId) {
      baseItems = items.filter((item) => item.id !== replaceId);
    }

    const remaining = Math.max(0, maxFiles - baseItems.length);
    const accepted: StudioImage[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedOverflow = 0;

    for (const file of incoming) {
      if (!allowedTypes.includes(file.type)) {
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
        id: `image-${idRef.current}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (accepted.length === 0) {
      setError(
        skippedType > 0
          ? `Choose ${formatHint} files.`
          : skippedSize > 0
            ? `That file is larger than ${maxSizeMB} MB.`
            : maxFiles === 1
              ? `Only one ${noun} can be open at a time.`
              : `You can add up to ${maxFiles} ${noun}s at a time.`,
      );
      return;
    }

    if (replaceId) {
      const replaced = items.find((item) => item.id === replaceId);
      if (replaced) URL.revokeObjectURL(replaced.preview);
    }

    setItems([...baseItems, ...accepted]);
    setActiveId(accepted[0].id);

    const messages: string[] = [];
    if (skippedType > 0) {
      messages.push(
        `${skippedType} file${skippedType === 1 ? "" : "s"} skipped — use ${formatHint}.`,
      );
    }
    if (skippedSize > 0) {
      messages.push(
        `${skippedSize} file${skippedSize === 1 ? " was" : "s were"} over ${maxSizeMB} MB.`,
      );
    }
    if (skippedOverflow > 0) {
      messages.push(
        maxFiles === 1
          ? `Only one ${noun} can be open at a time.`
          : `Only ${maxFiles} ${noun}s fit in one batch.`,
      );
    }
    setError(messages.length > 0 ? messages.join(" ") : null);

    accepted.forEach((item) => {
      const image = new window.Image();
      image.onload = () => {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, width: image.naturalWidth, height: image.naturalHeight }
              : entry,
          ),
        );
      };
      image.src = item.preview;
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(event.target.files);
    event.target.value = "";
  }

  function removeItem(id: string) {
    const target = items.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    setActiveId((current) => (current === id ? next[0]?.id ?? null : current));
  }

  function clearAll() {
    items.forEach((item) => URL.revokeObjectURL(item.preview));
    setItems([]);
    setActiveId(null);
    setError(null);
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
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
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
    activeIndex,
    error,
    setError,
    dragging,
    setActiveId,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clearAll,
    moveItem,
    reverseItems,
  };
}
