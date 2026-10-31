"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { StudioImage } from "./types";

export const DEFAULT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/tiff",
];

export const DEFAULT_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".svg",
  ".gif",
  ".bmp",
  ".ico",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
];

type ImageQueueOptions = {
  maxFiles: number;
  maxSizeMB: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  formatHint?: string;
  noun?: string;
};

/**
 * Shared image queue for browser tools: multi-file selection, replacement,
 * drag and drop, object-URL cleanup and image dimensions.
 * Supports JPG, PNG, WebP, AVIF, SVG, GIF, BMP, ICO and HEIC/HEIF.
 */
export function useImageQueue({
  maxFiles,
  maxSizeMB,
  allowedTypes = DEFAULT_IMAGE_TYPES,
  allowedExtensions = DEFAULT_IMAGE_EXTENSIONS,
  formatHint = "JPG, PNG, WebP, AVIF, HEIC or SVG",
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

  function isAcceptedFile(file: File): boolean {
    if (file.type && allowedTypes.includes(file.type)) return true;
    const lowerName = file.name.toLowerCase();
    return allowedExtensions.some((ext) => lowerName.endsWith(ext));
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
      if (!isAcceptedFile(file)) {
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

    // Resolve image dimensions & generate preview for HEIC files
    accepted.forEach((item) => {
      const lowerName = item.file.name.toLowerCase();
      const isHeic =
        lowerName.endsWith(".heic") ||
        lowerName.endsWith(".heif") ||
        item.file.type.includes("heic") ||
        item.file.type.includes("heif");

      if (isHeic && typeof window !== "undefined") {
        import("heic2any")
          .then(({ default: heic2any }) => {
            return heic2any({ blob: item.file, toType: "image/jpeg", quality: 0.85 });
          })
          .then((converted) => {
            const blob = Array.isArray(converted) ? converted[0] : converted;
            const previewUrl = URL.createObjectURL(blob);
            const img = new window.Image();
            img.onload = () => {
              setItems((current) =>
                current.map((entry) => {
                  if (entry.id === item.id) {
                    URL.revokeObjectURL(entry.preview);
                    return {
                      ...entry,
                      preview: previewUrl,
                      width: img.naturalWidth || 1,
                      height: img.naturalHeight || 1,
                    };
                  }
                  return entry;
                }),
              );
            };
            img.src = previewUrl;
          })
          .catch((err) => {
            console.warn("HEIC preview decode error:", err);
          });
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        let width = image.naturalWidth;
        let height = image.naturalHeight;

        // If SVG with 0 natural dimensions, try parsing text
        if ((!width || !height) && (lowerName.endsWith(".svg") || item.file.type.includes("svg"))) {
          width = 1024;
          height = 1024;
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, width: width || 1, height: height || 1 }
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

  function reorderItem(id: string, toIndex: number) {
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === id);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
    reorderItem,
    reverseItems,
  };
}
