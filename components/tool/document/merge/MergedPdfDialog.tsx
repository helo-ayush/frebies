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
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-28px)] w-[min(760px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-white p-0 text-ink shadow-pop"
    >
      <span aria-hidden className="hidden" data-error={error} />

      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="min-w-0">
          <h2 id="merged-preview-title" className="truncate text-[15px] font-semibold text-ink">
            {name}
          </h2>
          <p className="truncate text-[12.5px] text-faint">
            Preview · {pageCount} page{pageCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close preview"
          data-slot="dialog-close"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="bg-[#f3f1ec] px-4 py-5 sm:px-6">
        <div className="relative mx-auto flex min-h-[300px] w-full max-w-[620px] items-center justify-center">
          {preview ? (
            <img
              src={preview.dataUrl}
              alt={`Page ${page} of ${pageCount}`}
              className="max-h-[min(62dvh,760px)] w-auto max-w-full rounded-[4px] border border-[#dedad2] bg-white shadow-[0_10px_30px_-12px_rgba(15,15,16,0.3)]"
            />
          ) : error ? (
            <p role="alert" className="flex items-start gap-2 px-4 py-8 text-[13px] leading-relaxed text-danger">
              <TriangleAlert size={14} className="mt-[3px] shrink-0" aria-hidden />
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Drawing page {page}…
            </p>
          )}

          {rendering && preview && (
            <span className="absolute inset-0 grid place-items-center bg-[#f3f1ec]/50">
              <Loader2 size={18} className="animate-spin text-ink" aria-hidden />
            </span>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
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
              className="h-9 w-14 rounded-[9px] border border-line bg-white text-center text-[13px] tabular-nums text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
            />
            <span className="tabular-nums">/ {pageCount}</span>
          </label>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-white text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            data-slot="dialog-close"
            className={buttonClasses("secondary", "md", "h-10 rounded-[12px]")}
          >
            Close
          </button>
          {url && (
            <a
              href={url}
              download={name}
              className={buttonClasses("success", "md", "h-10 rounded-[12px]")}
            >
              <Download size={14} aria-hidden />
              Download
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}
