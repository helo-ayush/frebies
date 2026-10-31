"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, TriangleAlert, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buttonClasses } from "@/components/ui/Button";
import { openPdfDocument, renderPdfPage, type PdfThumbnail } from "./pdf-thumbnail";

export function MergedPdfDialog({
  open,
  onClose,
  bytes,
  url,
  name,
  pageCount,
}: {
  open: boolean;
  onClose: () => void;
  bytes: Uint8Array | null;
  url: string | null;
  name: string;
  pageCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<PdfThumbnail | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !bytes) return;
    let cancelled = false;
    setReady(false);
    setPage(1);
    setPreview(null);
    setError(null);
    setRendering(true);

    const copy = bytes.slice().buffer as ArrayBuffer;
    openPdfDocument(copy)
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        documentRef.current = pdf;
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("This PDF could not be previewed here. Download it to open in your PDF reader.");
        setRendering(false);
      });

    return () => {
      cancelled = true;
      const pdf = documentRef.current;
      documentRef.current = null;
      if (pdf) void pdf.destroy();
    };
  }, [open, bytes]);

  useEffect(() => {
    const pdf = documentRef.current;
    if (!open || !ready || !pdf) return;
    let cancelled = false;
    setRendering(true);

    renderPdfPage(pdf, page, 620)
      .then((thumbnail) => {
        if (cancelled) return;
        setPreview(thumbnail);
        setRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("This page could not be drawn.");
        setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, ready, page]);

  function go(delta: number) {
    setPage((current) => Math.min(Math.max(1, current + delta), Math.max(1, pageCount)));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="merged-preview-title"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(1);
        }
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-28px)] w-[min(760px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[16px] border border-line bg-white p-0 text-ink shadow-[0_30px_80px_rgba(15,15,16,0.3)]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-line bg-[#f6f4f0] text-[8.5px] font-semibold uppercase tracking-[0.06em] text-muted">
            PDF
          </span>
          <div className="min-w-0">
            <h2 id="merged-preview-title" className="truncate text-[13px] font-medium text-ink">
              Merged preview
            </h2>
            <p className="truncate text-[10.5px] text-faint">
              {name} · {pageCount} page{pageCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close preview"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="bg-[#f6f4f0] px-4 py-5 sm:px-6">
        <div className="relative mx-auto flex min-h-[300px] w-full max-w-[620px] items-center justify-center rounded-[10px] border border-line bg-white/60 p-2">
          {preview ? (
            <img
              src={preview.dataUrl}
              alt={`Page ${page} of ${pageCount}`}
              className="max-h-[min(62vh,760px)] w-auto max-w-full rounded-[3px] bg-white shadow-[0_10px_30px_rgba(30,25,20,0.14)]"
            />
          ) : error ? (
            <p className="flex items-start gap-1.5 px-4 py-8 text-center text-[11px] leading-relaxed text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[11px] text-faint">
              <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
              Drawing page {page}…
            </p>
          )}

          {rendering && preview && (
            <span className="absolute inset-0 grid place-items-center rounded-[10px] bg-white/45">
              <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <label className="flex items-center gap-1 text-[11px] text-muted">
            <span className="sr-only">Page</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={page}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setPage(Math.min(Math.max(1, Math.round(next)), Math.max(1, pageCount)));
                }
              }}
              className="h-8 w-12 rounded-[7px] border border-line bg-white text-center text-[11.5px] tabular-nums text-ink outline-none hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
            />
            <span className="tabular-nums">/ {pageCount}</span>
          </label>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={buttonClasses("secondary", "sm")}
          >
            Close
          </button>
          {url && (
            <a href={url} download={name} className={buttonClasses("primary", "sm")}>
              <Download size={12} aria-hidden />
              Download
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}
