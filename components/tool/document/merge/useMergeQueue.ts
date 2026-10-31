"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { parseRanges } from "../model";
import type { MergeSource } from "./merge-engine";
import { MergeFileError, readPdfInfo } from "./merge-engine";
import type { PdfInfo } from "./merge-model";
import { renderPdfThumbnail, type PdfThumbnail } from "./pdf-thumbnail";

export const MAX_MERGE_FILES = 12;
export const MAX_MERGE_TOTAL_MB = 120;
export const MAX_MERGE_PAGES = 1200;

export type MergeQueueItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  bytes: ArrayBuffer;
  pageCount: number;
  /** Selected pages, 1-based. */
  pages: number[];
  /** Raw text in the page-range field. */
  range: string;
  rotation: number;
  status: "reading" | "ready";
  info: PdfInfo;
  thumbnail: PdfThumbnail | null;
  thumbnailState: "idle" | "loading" | "ready";
};

type QueueOptions = {
  maxFiles?: number;
  maxSizeMB?: number;
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function looksLikePdf(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024));
  return new TextDecoder("latin1").decode(head).includes("%PDF-");
}

function fullRange(pageCount: number) {
  return pageCount === 1 ? "1" : `1-${pageCount}`;
}

export function useMergeQueue({
  maxFiles = MAX_MERGE_FILES,
  maxSizeMB = 25,
}: QueueOptions = {}) {
  const [items, setItems] = useState<MergeQueueItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const thumbTokens = useRef(new Map<string, number>());
  const mounted = useRef(true);

  itemsRef.current = items;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<MergeQueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const loadThumbnail = useCallback(
    (id: string, bytes: ArrayBuffer, rotation: number) => {
      const token = (thumbTokens.current.get(id) ?? 0) + 1;
      thumbTokens.current.set(id, token);
      patchItem(id, { thumbnailState: "loading" });

      renderPdfThumbnail(bytes, 150, rotation)
        .then((thumbnail) => {
          if (!mounted.current || thumbTokens.current.get(id) !== token) return;
          patchItem(id, { thumbnail, thumbnailState: "ready" });
        })
        .catch(() => {
          if (!mounted.current || thumbTokens.current.get(id) !== token) return;
          patchItem(id, { thumbnailState: "idle" });
        });
    },
    [patchItem],
  );

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      if (files.length === 0) return;

      const existing = itemsRef.current;
      const issues: string[] = [];
      const accepted: File[] = [];
      const seen = new Set(existing.map((item) => `${item.name}:${item.size}`));
      let slots = maxFiles - existing.length;
      let totalBytes = existing.reduce((sum, item) => sum + item.size, 0);
      let totalPages = existing.reduce((sum, item) => sum + item.pageCount, 0);

      for (const file of files) {
        if (slots <= 0) {
          issues.push(`You can merge up to ${maxFiles} PDFs at once.`);
          break;
        }
        if (!isPdfFile(file)) {
          issues.push(`“${file.name}” is not a PDF.`);
          continue;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          issues.push(`“${file.name}” is larger than ${maxSizeMB} MB.`);
          continue;
        }
        if (totalBytes + file.size > MAX_MERGE_TOTAL_MB * 1024 * 1024) {
          issues.push(
            `Keep the queue under ${MAX_MERGE_TOTAL_MB} MB so merging stays fast in the browser.`,
          );
          break;
        }
        const key = `${file.name}:${file.size}`;
        if (seen.has(key)) {
          issues.push(`“${file.name}” is already in the merge list.`);
          continue;
        }
        seen.add(key);
        accepted.push(file);
        slots -= 1;
        totalBytes += file.size;
      }

      if (accepted.length === 0) {
        if (issues.length > 0 && mounted.current) setErrors(issues);
        return;
      }
      if (mounted.current) setErrors(issues);

      const placeholders: MergeQueueItem[] = accepted.map((file) => ({
        id: createId(),
        file,
        name: file.name,
        size: file.size,
        bytes: new ArrayBuffer(0),
        pageCount: 0,
        pages: [],
        range: "",
        rotation: 0,
        status: "reading",
        info: { pageCount: 0 },
        thumbnail: null,
        thumbnailState: "idle",
      }));

      setItems((current) => [...current, ...placeholders]);

      const readIssues: string[] = [];
      for (const placeholder of placeholders) {        let bytes: ArrayBuffer;
        try {
          bytes = await placeholder.file.arrayBuffer();
        } catch {
          readIssues.push(`“${placeholder.name}” could not be read from disk.`);
          setItems((current) => current.filter((item) => item.id !== placeholder.id));
          continue;
        }
        if (!mounted.current) return;

        if (!looksLikePdf(bytes)) {
          readIssues.push(`“${placeholder.name}” does not contain a valid PDF.`);
          setItems((current) => current.filter((item) => item.id !== placeholder.id));
          continue;
        }

        let info: PdfInfo;
        try {
          info = await readPdfInfo(bytes);
        } catch (error) {
          readIssues.push(
            error instanceof MergeFileError
              ? `“${placeholder.name}”: ${error.message}`
              : `“${placeholder.name}” could not be opened.`,
          );
          setItems((current) => current.filter((item) => item.id !== placeholder.id));
          continue;
        }
        if (!mounted.current) return;

        if (totalPages + info.pageCount > MAX_MERGE_PAGES) {
          readIssues.push(
            `“${placeholder.name}” would push the merge past ${MAX_MERGE_PAGES} pages.`,
          );
          setItems((current) => current.filter((item) => item.id !== placeholder.id));
          continue;
        }
        totalPages += info.pageCount;

        patchItem(placeholder.id, {
          bytes,
          pageCount: info.pageCount,
          pages: Array.from({ length: info.pageCount }, (_, index) => index + 1),
          range: fullRange(info.pageCount),
          status: "ready",
          info,
        });
        loadThumbnail(placeholder.id, bytes, 0);
      }

      if (readIssues.length > 0 && mounted.current) setErrors(readIssues);
    },
    [loadThumbnail, maxFiles, maxSizeMB, patchItem],
  );

  const setRange = useCallback((id: string, value: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const pages = parseRanges(value, item.pageCount);
        return { ...item, range: value, pages: pages.length > 0 ? pages : item.pages };
      }),
    );
  }, []);

  const setRotation = useCallback(
    (id: string, rotation: number) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      patchItem(id, { rotation });
      if (item && item.status === "ready") {
        loadThumbnail(id, item.bytes, rotation);
      }
    },
    [loadThumbnail, patchItem],
  );

  const reorder = useCallback((next: MergeQueueItem[]) => {
    setItems(next);
  }, []);

  const move = useCallback((id: string, delta: number) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const reverse = useCallback(() => {
    setItems((current) => [...current].reverse());
  }, []);

  const remove = useCallback((id: string) => {
    thumbTokens.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    thumbTokens.current.clear();
    setItems([]);
    setErrors([]);
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onPick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      if (files.length > 0) void addFiles(files);
    },
    [addFiles],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDragging((current) => (current ? current : true));
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) void addFiles(files);
    },
    [addFiles],
  );

  const dismissErrors = useCallback(() => setErrors([]), []);

  const readyItems = items.filter((item) => item.status === "ready");
  const totalPages = readyItems.reduce((sum, item) => sum + item.pages.length, 0);
  const totalSourcePages = readyItems.reduce((sum, item) => sum + item.pageCount, 0);
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  const reading = items.some((item) => item.status === "reading");

  const sources: MergeSource[] = readyItems.map((item) => ({
    id: item.id,
    name: item.name,
    bytes: item.bytes,
    pages: item.pages,
    rotation: item.rotation,
    info: item.info,
  }));

  return {
    items,
    sources,
    errors,
    dragging,
    reading,
    inputRef,
    totalPages,
    totalSourcePages,
    totalSize,
    addFiles,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    reorder,
    move,
    reverse,
    remove,
    clear,
    setRange,
    setRotation,
    dismissErrors,
  };
}
