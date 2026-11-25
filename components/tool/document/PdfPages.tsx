"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
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

/** Runs pdf.js renders one after another so a long document never floods the worker. */
function createRenderQueue() {
  let chain: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job, job);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

type Enqueue = ReturnType<typeof createRenderQueue>;

const TAG_TONES = [
  "bg-ink text-white",
  "bg-accent text-white",
  "bg-[#2f6fb5] text-white",
  "bg-success text-white",
  "bg-[#8a5cc2] text-white",
  "bg-[#b0781f] text-white",
];

function PageThumb({
  pdf,
  page,
  cache,
  enqueue,
  selected,
  dimmed,
  onToggle,
  tag,
  tagTone = 0,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  cache: Map<number, string>;
  enqueue: Enqueue;
  selected?: boolean;
  dimmed?: boolean;
  onToggle?: () => void;
  tag?: string;
  tagTone?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => cache.get(page) ?? null);

  useEffect(() => {
    const cached = cache.get(page);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    const node = ref.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        enqueue(async () => (cancelled ? null : renderPdfPage(pdf, page, 220)))
          .then((thumb) => {
            if (!thumb || cancelled) return;
            cache.set(page, thumb.dataUrl);
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
  }, [pdf, page, cache, enqueue]);

  const selectable = Boolean(onToggle);

  const body = (
    <>
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-[8px] border bg-white transition-[border-color,box-shadow,opacity] ${
          selected
            ? "border-ink shadow-[0_0_0_2px_#0f0f10,0_10px_22px_-12px_rgba(15,15,16,0.4)]"
            : "border-[#dedad2] shadow-[0_6px_16px_-10px_rgba(15,15,16,0.25)] group-hover:border-[#bdb6a8]"
        } ${dimmed ? "opacity-45" : ""}`}
        style={{ aspectRatio: "1 / 1.34" }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : (
          <div className="h-full w-full animate-pulse bg-[linear-gradient(180deg,#f4f2ed,#ebe8e1)]" />
        )}

        {tag ? (
          <span
            className={`absolute left-1.5 top-1.5 rounded-full px-2 py-[3px] text-[12px] font-semibold leading-none ${
              TAG_TONES[tagTone % TAG_TONES.length]
            }`}
          >
            {tag}
          </span>
        ) : null}

        {selectable ? (
          <span
            aria-hidden
            className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border transition-colors ${
              selected ? "border-ink bg-ink text-white" : "border-[#cfcabf] bg-white/95 text-transparent"
            }`}
          >
            <Check size={12} strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <span
        className={`mt-1.5 block text-center text-[12px] tabular-nums ${
          selected ? "font-semibold text-ink" : "text-faint"
        }`}
      >
        {page}
      </span>
    </>
  );

  if (!selectable) return <div className="group">{body}</div>;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`Page ${page}`}
      className="group block w-full rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {body}
    </button>
  );
}

/**
 * Real page thumbnails for an open PDF, rendered lazily as they scroll into
 * view. Pass `selected` + `onToggle` for a pickable grid, or `tagOf` to label
 * each page with the output file it lands in.
 */
export function PdfPageGrid({
  pdf,
  pageCount,
  selected,
  onToggle,
  tagOf,
  className = "",
}: {
  pdf: PDFDocumentProxy;
  pageCount: number;
  selected?: Set<number>;
  onToggle?: (page: number) => void;
  tagOf?: (page: number) => { label: string; tone: number } | null;
  className?: string;
}) {
  // One cache and one render queue per open document.
  const cache = useMemo(() => new Map<number, string>(), [pdf]); // eslint-disable-line react-hooks/exhaustive-deps
  const enqueue = useMemo(() => createRenderQueue(), [pdf]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  return (
    <div
      className={`grid grid-cols-3 gap-x-3 gap-y-3.5 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${className}`}
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
            selected={selected ? selected.has(page) : undefined}
            dimmed={tagOf ? tag === null : false}
            onToggle={onToggle ? () => onToggle(page) : undefined}
            tag={tag?.label}
            tagTone={tag?.tone}
          />
        );
      })}
    </div>
  );
}
