"use client";

/**
 * PDF reading window: every page in one column, drawn only while it is near the
 * screen, with zoom, fit to width or page, page jump and a full-window mode.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize, Minus, Plus, X } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { openPdfDocument } from "@/components/tool/document/merge/pdf-thumbnail";
import { createRenderQueue, type RenderQueue } from "./render-queue";
import { Lightbox } from "./Lightbox";

const PT_TO_PX = 96 / 72;
const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
const GAP = 22;

type Fit = "width" | "page";
type PageSize = { w: number; h: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function PdfReader({
  pdf,
  pageCount,
  firstPage,
  initialPage = 1,
  title,
  initialFit = "width",
  fullWindow = true,
  className = "",
  children,
}: {
  pdf: PDFDocumentProxy;
  pageCount: number;
  /** Size of page 1 in points: the guess for every page until it is measured. */
  firstPage?: { width: number; height: number } | null;
  initialPage?: number;
  title?: string;
  initialFit?: Fit;
  /** Offer the full-window key. Off inside a lightbox, which already fills the window. */
  fullWindow?: boolean;
  className?: string;
  /** Overlay inside the window, e.g. a drop message. */
  children?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [measured, setMeasured] = useState(false);
  const [fit, setFit] = useState<Fit | null>(initialFit);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(initialPage);
  const [typed, setTyped] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const help = useId();
  const narrow = box.w > 0 && box.w < 520;
  const queue = useMemo(() => createRenderQueue(), [pdf]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Page sizes --------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const guess = { w: firstPage?.width ?? 612, h: firstPage?.height ?? 792 };
    const list: PageSize[] = Array.from({ length: pageCount }, () => guess);
    setSizes(list);
    setMeasured(false);
    (async () => {
      const next = [...list];
      for (let number = 1; number <= pageCount; number += 1) {
        try {
          const item = await pdf.getPage(number);
          const viewport = item.getViewport({ scale: 1 });
          next[number - 1] = { w: viewport.width, h: viewport.height };
        } catch {
          // Keep the guess: one unreadable page should not stop the rest.
        }
        if (cancelled) return;
        if (number % 24 === 0) setSizes([...next]);
      }
      setSizes([...next]);
      setMeasured(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageCount, firstPage?.width, firstPage?.height]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ---- Scale -------------------------------------------------------------------
  const pad = box.w < 560 ? 12 : 30;
  const widest = sizes.reduce((max, size) => Math.max(max, size.w), 1);
  const tallest = sizes.reduce((max, size) => Math.max(max, size.h), 1);
  const fitWidth = clamp(Math.min(box.w - pad * 2, 940) / widest, MIN_SCALE, MAX_SCALE);
  const fitPage = clamp(Math.min((box.h - 44) / tallest, (box.w - pad * 2) / widest), MIN_SCALE, MAX_SCALE);
  const scale = fit === "width" ? fitWidth : fit === "page" ? fitPage : zoom * PT_TO_PX;
  const percent = Math.round((scale / PT_TO_PX) * 100);

  // Keep the same spot in view while the scale changes. The first real scale
  // (the window has no size yet before it) must not move anything.
  const lastScale = useRef(0);
  useLayoutEffect(() => {
    const node = scroller.current;
    const from = lastScale.current;
    lastScale.current = box.w > 0 ? scale : 0;
    if (!node || box.w === 0 || from === scale || from <= 0) return;
    const ratio = scale / from;
    node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
  }, [scale, box.w]);

  const zoomTo = useCallback((next: number) => {
    setFit(null);
    setZoom(clamp(next, MIN_SCALE / PT_TO_PX, MAX_SCALE / PT_TO_PX));
  }, []);

  const wheel = useRef({ zoomTo, value: scale / PT_TO_PX });
  wheel.current = { zoomTo, value: scale / PT_TO_PX };
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = Math.exp(-clamp(event.deltaY, -120, 120) * 0.0055);
      wheel.current.zoomTo(wheel.current.value * step);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Moving between pages ------------------------------------------------------
  const goTo = useCallback((number: number, smooth = true) => {
    const node = scroller.current;
    const target = node?.querySelector<HTMLElement>(`[data-page="${number}"]`);
    if (!node || !target) return;
    node.scrollTo({ top: target.offsetTop - 18, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (measured && initialPage > 1) goTo(initialPage, false);
  }, [measured, initialPage, goTo]);

  function onScroll() {
    const node = scroller.current;
    if (!node) return;
    const line = node.scrollTop + node.clientHeight * 0.4;
    let at = 1;
    node.querySelectorAll<HTMLElement>("[data-page]").forEach((item) => {
      if (item.offsetTop <= line) at = Number(item.dataset.page);
    });
    setPage(at);
  }

  function step(delta: number) {
    const next = clamp(page + delta, 1, pageCount);
    if (next !== page) goTo(next);
  }

  // ---- Full window ---------------------------------------------------------------
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setFull(false);
    };
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [full]);

  const key = "grid h-9 w-9 place-items-center border-l border-line-strong transition-colors first:border-l-0 hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${full ? "fixed inset-0 z-[80] bg-canvas" : "relative"} ${className}`}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? "PDF reader" : undefined}
    >
      {full ? (
        <div className="flex min-h-[60px] shrink-0 items-stretch bg-ink text-white">
          <p className="flex min-w-0 flex-1 items-center truncate px-5 text-[15px] font-semibold">{title ?? "PDF"}</p>
          <button
            type="button"
            onClick={() => setFull(false)}
            aria-label="Close full window"
            data-slot="viewer-close"
            className="grid w-[60px] place-items-center border-l border-white/15 transition-colors hover:bg-white hover:text-ink"
          >
            <X size={19} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          tabIndex={0}
          role="group"
          aria-label={`PDF reader, ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          aria-describedby={help}
          data-slot="pdf-reader"
          onScroll={onScroll}
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key === "ArrowLeft") step(-1);
            else if (event.key === "ArrowRight") step(1);
            else if (event.key === "+" || event.key === "=") zoomTo((scale / PT_TO_PX) * 1.2);
            else if (event.key === "-") zoomTo(scale / PT_TO_PX / 1.2);
            else if (event.key === "0") setFit("width");
            else return;
            event.preventDefault();
          }}
          className="fb-stage studio-main absolute inset-0 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <p id={help} className="sr-only">
            Left and right arrows change page, plus and minus zoom, zero fits the width.
          </p>
          <div className="mx-auto flex w-max min-w-full flex-col items-center px-3" style={{ gap: GAP, paddingTop: 22, paddingBottom: 76 }}>
            {box.w > 0
              ? sizes.map((size, index) => (
                  <ReaderPage
                    key={index}
                    pdf={pdf}
                    number={index + 1}
                    width={Math.max(40, Math.round(size.w * scale))}
                    height={Math.max(40, Math.round(size.h * scale))}
                    queue={queue}
                  />
                ))
              : null}
          </div>
        </div>

        {/* Pages */}
        <div className="absolute bottom-3 left-3 z-[3] flex border border-line-strong bg-panel">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => step(-1)} className={key}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <label className="fb-num flex h-9 items-center border-l border-line-strong px-2.5 text-[12.5px]">
            <span className="sr-only">Page</span>
            <input
              inputMode="numeric"
              value={typed ?? String(page)}
              onFocus={(event) => {
                setTyped(String(page));
                event.currentTarget.select();
              }}
              onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
              onBlur={() => setTyped(null)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key !== "Enter") return;
                const next = Number.parseInt(typed ?? "", 10);
                if (Number.isFinite(next)) goTo(clamp(next, 1, pageCount));
                event.currentTarget.blur();
              }}
              aria-label={`Page number, of ${pageCount}`}
              className="w-8 bg-transparent text-right font-semibold outline-none focus-visible:outline-none"
            />
            <span className="pl-1.5 text-muted">/ {pageCount}</span>
          </label>
          <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => step(1)} className={key}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        {/* Zoom */}
        <div role="group" aria-label="Zoom" className="absolute bottom-3 right-3 z-[3] flex border border-line-strong bg-panel">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(scale / PT_TO_PX / 1.2)} className={`${key} ${narrow ? "hidden" : ""}`}>
            <Minus size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => zoomTo(1)}
            title="Show actual size"
            aria-label={`Zoom ${percent}%. Show actual size`}
            className={`fb-num h-9 min-w-[56px] border-l border-line-strong px-2 text-[12.5px] font-medium transition-colors hover:bg-hover ${narrow ? "hidden" : ""}`}
          >
            {percent}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo((scale / PT_TO_PX) * 1.2)} className={`${key} ${narrow ? "hidden" : ""}`}>
            <Plus size={14} aria-hidden />
          </button>
          {(["width", "page"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={fit === option}
              onClick={() => setFit(option)}
              title={option === "width" ? "Fit the width" : "Fit the whole page"}
              className={`h-9 border-l border-line-strong px-3 text-[12.5px] font-medium uppercase transition-colors first:border-l-0 ${
                fit === option ? "bg-ink text-white" : "hover:bg-hover"
              }`}
            >
              {option}
            </button>
          ))}
          {fullWindow ? (
            <button
              type="button"
              aria-label={full ? "Close full window" : "Open full window"}
              title={full ? "Close full window" : "Open full window"}
              data-slot={full ? "viewer-close" : "viewer-open"}
              onClick={() => setFull((value) => !value)}
              className={key}
            >
              {full ? <X size={15} aria-hidden /> : <Maximize size={14} aria-hidden />}
            </button>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
}

function ReaderPage({
  pdf,
  number,
  width,
  height,
  queue,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  height: number;
  queue: RenderQueue;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      root: node.closest("[data-slot=pdf-reader]"),
      rootMargin: "900px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) {
      // Far away: let go of the bitmap so long documents stay light.
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      setDrawn(false);
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    const timer = window.setTimeout(() => {
      queue(async () => {
        if (cancelled) return;
        const item = await pdf.getPage(number);
        const base = item.getViewport({ scale: 1 });
        const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        const viewport = item.getViewport({ scale: Math.min((width * ratio) / base.width, 4200 / base.width) });
        const buffer = document.createElement("canvas");
        buffer.width = Math.max(1, Math.round(viewport.width));
        buffer.height = Math.max(1, Math.round(viewport.height));
        task = item.render({ canvas: buffer, viewport });
        await task.promise;
        if (cancelled || !canvas.current) return;
        canvas.current.width = buffer.width;
        canvas.current.height = buffer.height;
        canvas.current.getContext("2d")?.drawImage(buffer, 0, 0);
        setDrawn(true);
      }).catch(() => undefined);
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [near, pdf, number, width, queue]);

  return (
    <div
      ref={holder}
      data-page={number}
      className="relative shrink-0 bg-white shadow-[0_0_0_1px_rgba(24,24,27,0.2),8px_8px_0_rgba(24,24,27,0.08)]"
      style={{ width, height }}
    >
      <canvas ref={canvas} role="img" aria-label={`Page ${number}`} className="block h-full w-full" />
      {!drawn ? (
        <span className="fb-hatch absolute inset-0 grid place-items-center text-faint">
          <span className="fb-num text-[13px]">{number}</span>
        </span>
      ) : null}
    </div>
  );
}

/** Opens PDF bytes for as long as they are shown. */
export function usePdfBytes(bytes: Uint8Array | null) {
  const [state, setState] = useState<{
    pdf: PDFDocumentProxy | null;
    pageCount: number;
    firstPage: { width: number; height: number } | null;
    error: string | null;
  }>({ pdf: null, pageCount: 0, firstPage: null, error: null });

  useEffect(() => {
    setState({ pdf: null, pageCount: 0, firstPage: null, error: null });
    if (!bytes) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    openPdfDocument(bytes.slice().buffer as ArrayBuffer)
      .then(async (pdf) => {
        opened = pdf;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setState({
          pdf,
          pageCount: pdf.numPages,
          firstPage: { width: viewport.width, height: viewport.height },
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          pdf: null,
          pageCount: 0,
          firstPage: null,
          error: "This PDF could not be shown here. Download it to open in your PDF reader.",
        });
      });
    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [bytes]);

  return state;
}

/** Reader for bytes made in this browser, with its own loading and error states. */
export function PdfBytesReader({
  bytes,
  title,
  initialFit,
  fullWindow,
}: {
  bytes: Uint8Array | null;
  title?: string;
  initialFit?: Fit;
  fullWindow?: boolean;
}) {
  const doc = usePdfBytes(bytes);
  if (doc.pdf) {
    return (
      <PdfReader
        pdf={doc.pdf}
        pageCount={doc.pageCount}
        firstPage={doc.firstPage}
        title={title}
        initialFit={initialFit}
        fullWindow={fullWindow}
      />
    );
  }
  return (
    <div className="fb-stage grid min-h-[260px] flex-1 place-items-center p-6 text-[14.5px] text-muted">
      {doc.error ? (
        <p role="alert" className="max-w-[420px] text-center text-danger">
          {doc.error}
        </p>
      ) : (
        <p className="flex items-center gap-2.5">
          <Loader2 size={17} className="animate-spin" aria-hidden />
          Opening the PDF…
        </p>
      )}
    </div>
  );
}

/** One document at full size over the page. */
export function PdfLightbox({
  open,
  onClose,
  pdf,
  pageCount = 0,
  firstPage,
  bytes = null,
  page = 1,
  title,
  meta,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  /** An open document, or `bytes` to open here. */
  pdf?: PDFDocumentProxy | null;
  pageCount?: number;
  firstPage?: { width: number; height: number } | null;
  bytes?: Uint8Array | null;
  page?: number;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Lightbox open={open} onClose={onClose} title={title} meta={meta} actions={actions}>
      {pdf ? (
        <PdfReader
          key={page}
          pdf={pdf}
          pageCount={pageCount}
          firstPage={firstPage}
          initialPage={page}
          title={title}
          initialFit="page"
          fullWindow={false}
        />
      ) : (
        <PdfBytesReader bytes={bytes} title={title} initialFit="page" fullWindow={false} />
      )}
    </Lightbox>
  );
}
