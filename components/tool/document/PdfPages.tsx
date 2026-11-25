"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, Maximize2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { createRenderQueue, type RenderQueue } from "@/components/tool/viewer/render-queue";
import { openPdfDocument, renderPdfPage } from "./merge/pdf-thumbnail";

export type PdfDocumentState = {
  pdf: PDFDocumentProxy | null;
  bytes: ArrayBuffer | null;
  pageCount: number;
  /** Size of page 1 in PDF points, used for output size readouts. */
  firstPage: { width: number; height: number } | null;
  loading: boolean;
  error: string | null;
};

const EMPTY: PdfDocumentState = {
  pdf: null,
  bytes: null,
  pageCount: 0,
  firstPage: null,
  loading: false,
  error: null,
};

/** Opens a PDF file with pdf.js in the browser and keeps it until the file changes. */
export function usePdfDocument(file: File | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>(EMPTY);

  useEffect(() => {
    if (!file) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    setState({ ...EMPTY, loading: true });

    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const pdf = await openPdfDocument(bytes);
        opened = pdf;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        page.cleanup();
        if (cancelled) return;
        setState({
          pdf,
          bytes,
          pageCount: pdf.numPages,
          firstPage: { width: viewport.width, height: viewport.height },
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        const name = (error as { name?: string } | null)?.name;
        setState({
          ...EMPTY,
          error:
            name === "PasswordException"
              ? "This PDF is password-protected. Remove the password, then add it again."
              : "This file could not be read as a PDF. It may be damaged.",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [file]);

  return state;
}

/** One tone per output file, in the site's own colours. */
const TAG_TONES = [
  "bg-ink text-white",
  "bg-accent-deep text-white",
  "bg-faint text-white",
  "bg-[#8f2a10] text-white",
  "bg-line-strong text-ink",
  "bg-accent text-white",
];

export type PageSize = "s" | "m" | "l";
const PAGE_MIN: Record<PageSize, number> = { s: 96, m: 138, l: 214 };

function PageThumb({
  pdf,
  page,
  cache,
  enqueue,
  renderWidth,
  selected,
  dimmed,
  onToggle,
  onOpen,
  tag,
  tagTone = 0,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  cache: Map<string, string>;
  enqueue: RenderQueue;
  renderWidth: number;
  selected?: boolean;
  dimmed?: boolean;
  onToggle?: (event: MouseEvent) => void;
  onOpen?: () => void;
  tag?: string;
  tagTone?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${page}:${renderWidth}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    const node = ref.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        enqueue(async () => (cancelled ? null : renderPdfPage(pdf, page, renderWidth)))
          .then((thumb) => {
            if (!thumb || cancelled) return;
            cache.set(key, thumb.dataUrl);
            setSrc(thumb.dataUrl);
          })
          .catch(() => undefined);
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdf, page, cache, enqueue, key, renderWidth]);

  const selectable = Boolean(onToggle);

  const sheet = (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-white transition-[box-shadow,opacity] ${
        selected
          ? "shadow-[0_0_0_3px_#1d1c1f]"
          : "shadow-[0_0_0_1px_rgba(24,24,27,0.22)] group-hover:shadow-[0_0_0_2px_#1d1c1f]"
      } ${dimmed ? "opacity-40" : ""}`}
      style={{ aspectRatio: "1 / 1.34" }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
      ) : (
        <div className="fb-hatch h-full w-full" />
      )}

      <span
        className={`fb-num absolute bottom-0 left-0 px-2 py-[5px] text-[12px] font-semibold leading-none ${
          tag ? TAG_TONES[tagTone % TAG_TONES.length] : selected ? "bg-ink text-white" : "bg-white text-ink"
        }`}
      >
        {tag ? `${page} / ${tag}` : page}
      </span>

      {selectable ? (
        <span
          aria-hidden
          className={`absolute right-0 top-0 grid h-7 w-7 place-items-center border-b border-l transition-colors ${
            selected
              ? "border-accent-deep bg-accent-deep text-white"
              : "border-line-strong bg-white text-transparent group-hover:text-faint"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="group relative">
      {selectable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Page ${page}`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
        >
          {sheet}
        </button>
      ) : (
        sheet
      )}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Read page ${page}`}
          title="Read this page"
          data-slot="viewer-open"
          className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center bg-ink text-white opacity-0 transition hover:bg-accent-deep focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Maximize2 size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Real page thumbnails for an open PDF, rendered lazily as they scroll into
 * view. Pass `selected` + `onToggle` for a pickable grid (Shift-click picks a
 * run of pages when `onRange` is set), or `tagOf` to label each page with the
 * output file it lands in.
 */
export function PdfPageGrid({
  pdf,
  pageCount,
  selected,
  onToggle,
  onRange,
  onOpen,
  tagOf,
  size = "m",
  className = "",
}: {
  pdf: PDFDocumentProxy;
  pageCount: number;
  selected?: Set<number>;
  onToggle?: (page: number) => void;
  onRange?: (from: number, to: number) => void;
  onOpen?: (page: number) => void;
  tagOf?: (page: number) => { label: string; tone: number } | null;
  size?: PageSize;
  className?: string;
}) {
  // One cache and one render queue per open document.
  const cache = useMemo(() => new Map<string, string>(), [pdf]); // eslint-disable-line react-hooks/exhaustive-deps
  const enqueue = useMemo(() => createRenderQueue(), [pdf]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastRef = useRef<number | null>(null);

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  return (
    <div
      className={`grid gap-4 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${PAGE_MIN[size]}px, 29vw), 1fr))` }}
    >
      {pages.map((page) => {
        const tag = tagOf?.(page) ?? null;
        return (
          <PageThumb
            key={page}
            pdf={pdf}
            page={page}
            cache={cache}
            enqueue={enqueue}
            renderWidth={size === "l" ? 380 : 240}
            selected={selected ? selected.has(page) : undefined}
            dimmed={tagOf ? tag === null : false}
            onToggle={
              onToggle
                ? (event) => {
                    const last = lastRef.current;
                    lastRef.current = page;
                    if (event.shiftKey && onRange && last && last !== page) {
                      onRange(Math.min(last, page), Math.max(last, page));
                    } else {
                      onToggle(page);
                    }
                  }
                : undefined
            }
            onOpen={onOpen ? () => onOpen(page) : undefined}
            tag={tag?.label}
            tagTone={tag?.tone}
          />
        );
      })}
    </div>
  );
}
