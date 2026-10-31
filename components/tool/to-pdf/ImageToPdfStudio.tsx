"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Grid,
  Layers3,
  Loader2,
  Plus,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { canvasToBlob, downloadBlob, loadImageFile, formatBytes, transformImage } from "@/lib/image/encode";
import { buildPdf, type PdfImagePage } from "@/lib/image/pdf";
import { pagePixelSize, pagePoints, renderPdfPage } from "@/lib/image/pdf-page";
import { PdfControls } from "./PdfControls";
import {
  DEFAULT_PDF_SETTINGS,
  backgroundValue,
  estimatePdfBytes,
  marginMeta,
  pageAspect,
  pageLabel,
  pdfFilename,
  type PdfSettings,
} from "./model";

const MAX_FILES = 25;
const FILMSTRIP_H = 80;

function thumbWidth(item: { width?: number; height?: number }, rotation = 0): number {
  const isRotatedQuarter = rotation === 90 || rotation === 270;
  const rawW = item.width || 800;
  const rawH = item.height || 600;
  const w = isRotatedQuarter ? rawH : rawW;
  const h = isRotatedQuarter ? rawW : rawH;
  const aspect = w / h;
  return Math.min(130, Math.max(54, Math.round(FILMSTRIP_H * aspect)));
}

export function ImageToPdfStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    items,
    activeItem,
    activeIndex,
    error,
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
  } = useImageQueue({
    maxFiles: MAX_FILES,
    maxSizeMB,
    formatHint: "JPG, PNG or WebP",
    noun: "image",
  });

  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_PDF_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; bytes: number } | null>(null);

  // PDF-first workspace modes: "single" (focus reader) vs "grid" (booklet overview)
  const [stageView, setStageView] = useState<"single" | "grid">("single");
  const [zoomMode, setZoomMode] = useState<"fit" | "100%">("fit");

  // Per-page rotation overrides: { [itemId]: degrees } (0, 90, 180, 270)
  const [pageRotations, setPageRotations] = useState<Record<string, number>>({});

  // Internal drag-to-reorder state (separate from file-drop drag from useImageQueue)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Desk stage measurement
  const deskRef = useRef<HTMLDivElement>(null);
  const [deskSize, setDeskSize] = useState({ width: 720, height: 500 });

  useLayoutEffect(() => {
    if (!deskRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setDeskSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(deskRef.current);
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation for page flip in single-page reader mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (stageView !== "single" || items.length <= 1) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && activeIndex > 0) {
        e.preventDefault();
        setActiveId(items[activeIndex - 1].id);
      } else if (e.key === "ArrowRight" && activeIndex < items.length - 1) {
        e.preventDefault();
        setActiveId(items[activeIndex + 1].id);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stageView, items, activeIndex, setActiveId]);

  const totalInput = items.reduce((sum, item) => sum + item.file.size, 0);
  const estimate = estimatePdfBytes(
    totalInput,
    items.length,
    settings.quality,
    settings.optimize,
  );

  const activeRotation = activeItem ? (pageRotations[activeItem.id] || 0) : 0;
  const isRotatedQuarter = activeRotation === 90 || activeRotation === 270;
  const rawImageW = activeItem?.width || 800;
  const rawImageH = activeItem?.height || 600;
  const effectiveImageW = isRotatedQuarter ? rawImageH : rawImageW;
  const effectiveImageH = isRotatedQuarter ? rawImageW : rawImageH;

  const aspect = pageAspect({
    settings,
    imageWidth: effectiveImageW,
    imageHeight: effectiveImageH,
  });

  const label = pageLabel(settings, aspect);
  const margin = marginMeta(settings.margin);
  const effectiveMarginPercent = settings.pageSize === "fit" ? 0 : margin.percent;
  const background = backgroundValue(settings.background);

  // Compute responsive PDF paper sheet dimensions for the desk stage
  const availableW = Math.max(160, deskSize.width - 64);
  const availableH = Math.max(160, deskSize.height - 84);

  let sheetW: number;
  let sheetH: number;

  if (zoomMode === "fit") {
    const baseDimension = 540;
    const baseW = aspect >= 1 ? baseDimension : baseDimension * aspect;
    const baseH = aspect >= 1 ? baseDimension / aspect : baseDimension;
    const scale = Math.min(availableW / baseW, availableH / baseH);
    sheetW = Math.max(120, Math.round(baseW * scale));
    sheetH = Math.max(120, Math.round(baseH * scale));
  } else {
    // 100% natural document view
    if (aspect >= 1) {
      sheetW = 620;
      sheetH = Math.round(620 / aspect);
    } else {
      sheetH = 640;
      sheetW = Math.round(640 * aspect);
    }
  }

  function patch(next: Partial<PdfSettings>) {
    setSettings((current) => {
      const merged = { ...current, ...next };
      if (next.pageSize === "fit") {
        merged.margin = "none";
      } else if (current.pageSize === "fit" && next.pageSize && current.margin === "none") {
        merged.margin = "medium";
      }
      return merged;
    });
    setNotice(null);
    setResult(null);
  }

  function handleItemDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function handleItemDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  }
  function handleItemDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || !dragOverId || dragId === dragOverId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = items.findIndex((i) => i.id === dragId);
    const toIdx = items.findIndex((i) => i.id === dragOverId);
    if (fromIdx !== -1 && toIdx !== -1) reorderItem(dragId, toIdx);
    setDragId(null);
    setDragOverId(null);
  }
  function handleItemDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  function rotatePage(id: string) {
    setPageRotations((prev) => {
      const cur = prev[id] || 0;
      return { ...prev, [id]: (cur + 90) % 360 };
    });
    setResult(null);
  }

  function handleRemovePage(id: string) {
    setPageRotations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    removeItem(id);
    setResult(null);
  }

  async function handleCreate() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    setNotice(null);
    setResult(null);

    try {
      const marginPercent = settings.pageSize === "fit" ? 0 : marginMeta(settings.margin).percent;
      const background = backgroundValue(settings.background);
      const textColor =
        settings.background === "black" ? "rgba(255,255,255,0.6)" : "#8b8578";
      const pages: PdfImagePage[] = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const image = await loadImageFile(item.file);
        const rotation = pageRotations[item.id] || 0;

        // Apply per-page lossless rotation if user adjusted this page
        let pageSource: CanvasImageSource = image;
        let sourceW = image.naturalWidth || item.width || 1;
        let sourceH = image.naturalHeight || item.height || 1;

        if (rotation !== 0) {
          pageSource = transformImage(image, { rotation });
          if (rotation === 90 || rotation === 270) {
            const temp = sourceW;
            sourceW = sourceH;
            sourceH = temp;
          }
        }

        const points = pagePoints({
          pageSize: settings.pageSize,
          orientation: settings.orientation,
          imageWidth: sourceW,
          imageHeight: sourceH,
        });
        const pixels = pagePixelSize(points.widthPt, points.heightPt);

        const canvas = renderPdfPage(pageSource, {
          width: pixels.width,
          height: pixels.height,
          marginPercent,
          fit: settings.fit,
          background,
          pageNumber: settings.pageNumbers ? `${index + 1} / ${items.length}` : undefined,
          pageNumberPosition: settings.pageNumberPosition,
          textColor,
          grayscale: settings.grayscale,
        });

        const jpegBlob = await canvasToBlob(canvas, "jpeg", settings.quality / 100);
        pages.push({
          jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
          widthPt: points.widthPt,
          heightPt: points.heightPt,
        });
        setProgress({ done: index + 1, total: items.length });
      }

      const name = pdfFilename(settings.filename);
      const pdf = buildPdf(pages, { title: name, creator: "frebies" });
      downloadBlob(pdf, name);
      setResult({ blob: pdf, name, bytes: pdf.size });
      setNotice(
        `Exported ${name} · ${pages.length} page${pages.length === 1 ? "" : "s"} · ${formatBytes(
          pdf.size,
        )}. Built 100% on your device, private and secure.`,
      );
    } catch (thrown) {
      setNotice(
        thrown instanceof Error
          ? thrown.message
          : "The PDF could not be built. Try another image or page size.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section
      id="to-pdf"
      aria-label="Image to PDF studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white shadow-sm"
    >
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink shadow-2xs">
            <ToolGlyph path="/image/to-pdf" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-ink">Image to PDF Studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Assemble images into clean, print-ready PDF documents
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] font-semibold tabular-nums text-ink shadow-2xs">
            <FileText size={11} className="text-muted" aria-hidden />
            {items.length ? `${items.length} page document` : "Empty document"}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#d9e3d5] bg-[#f4f8f2] px-2.5 py-1 text-[10px] font-medium text-[#4a6b47]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5f8a56]" aria-hidden />
            Ready · on device
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[750px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left Column: PDF Document Workspace */}
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <StudioDropzone
              title="Drop images to build a PDF document"
              description="Add one or multiple JPG, PNG or WebP images. Set paper size, margins, page order and B&W document scan mode before export."
              buttonLabel="Select images"
              limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB each · up to ${MAX_FILES} pages`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              minHeightClass="min-h-[380px]"
              chips={
                <>
                  <StudioChip icon={<FileText size={10} aria-hidden />}>A4 & Letter Paper</StudioChip>
                  <StudioChip icon={<Layers3 size={10} aria-hidden />}>Multi-page booklet</StudioChip>
                  <StudioChip icon={<ScanLine size={10} aria-hidden />}>B&W scan mode</StudioChip>
                </>
              }
            />
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[360px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              {/* PDF Document Desk Viewport */}
              <div
                ref={deskRef}
                className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#ece8df] bg-[radial-gradient(#0000000a_1px,transparent_1px)] [background-size:16px_16px] p-4 select-none"
              >
                {/* Top Stage Bar: View Switcher, Page Specs & Quick Actions */}
                <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
                  {/* View Mode Switcher */}
                  <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-2xs backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => setStageView("single")}
                      className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        stageView === "single"
                          ? "bg-ink font-semibold text-white shadow-2xs"
                          : "text-muted hover:text-ink"
                      }`}
                      title="Inspect active page"
                    >
                      <FileText size={13} aria-hidden />
                      <span>Single Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStageView("grid")}
                      className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        stageView === "grid"
                          ? "bg-ink font-semibold text-white shadow-2xs"
                          : "text-muted hover:text-ink"
                      }`}
                      title="View all pages in document grid"
                    >
                      <Grid size={13} aria-hidden />
                      <span>All Pages ({items.length})</span>
                    </button>
                  </div>

                  {/* Document Specs Pill */}
                  <span className="flex items-center gap-1.5 rounded-[9px] border border-line bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-ink shadow-2xs backdrop-blur-sm">
                    {stageView === "single" ? (
                      <>
                        <span>Page {activeIndex + 1} of {items.length}</span>
                        <span className="text-faint">·</span>
                        <span className="text-muted">{label}</span>
                      </>
                    ) : (
                      <span>All {items.length} Document Pages · {label}</span>
                    )}
                  </span>
                </div>

                {/* Top Right Stage Controls: Rotate, Zoom & Delete */}
                <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 pointer-events-auto">
                  {stageView === "single" && activeItem && (
                    <>
                      {/* Rotate Active Page 90° */}
                      <button
                        type="button"
                        onClick={() => rotatePage(activeItem.id)}
                        className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-line bg-white/95 px-3 text-[11.5px] font-semibold text-ink shadow-2xs backdrop-blur-sm hover:bg-hover"
                        title="Rotate active page 90° clockwise"
                      >
                        <RotateCw size={13} aria-hidden />
                        <span>Rotate</span>
                        {activeRotation !== 0 && (
                          <span className="ml-0.5 rounded bg-ink/10 px-1 py-0.2 text-[9px] font-bold">
                            {activeRotation}°
                          </span>
                        )}
                      </button>

                      {/* Zoom mode */}
                      <div className="flex rounded-[10px] border border-line bg-white/95 p-1 shadow-2xs backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => setZoomMode("fit")}
                          className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                            zoomMode === "fit"
                              ? "bg-ink font-semibold text-white shadow-2xs"
                              : "text-muted hover:text-ink"
                          }`}
                          title="Fit page to stage"
                        >
                          Fit
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomMode("100%")}
                          className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                            zoomMode === "100%"
                              ? "bg-ink font-semibold text-white shadow-2xs"
                              : "text-muted hover:text-ink"
                          }`}
                          title="View 100% size"
                        >
                          100%
                        </button>
                      </div>

                      {/* Remove Active Page */}
                      <button
                        type="button"
                        onClick={() => handleRemovePage(activeItem.id)}
                        className="grid h-8.5 w-8.5 place-items-center rounded-[9px] border border-line bg-white/95 text-muted shadow-2xs backdrop-blur-sm hover:border-[#a13d30]/40 hover:bg-[#fff5f5] hover:text-[#a13d30]"
                        title={`Remove page ${activeIndex + 1}`}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </>
                  )}
                </div>

                {/* VIEW MODE A: Single Page Document Reader View */}
                {stageView === "single" && activeItem && (
                  <div className="absolute inset-0 flex items-center justify-center overflow-auto px-4 pt-12 pb-7">
                    {/* Left Page Turn Button */}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                        disabled={activeIndex === 0}
                        aria-label="Previous document page"
                        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 grid h-9 w-9 place-items-center rounded-full border border-line bg-white/90 text-ink shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-105 disabled:pointer-events-none disabled:opacity-20"
                      >
                        <ChevronLeft size={18} aria-hidden />
                      </button>
                    )}

                    {/* Right Page Turn Button */}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => activeIndex < items.length - 1 && setActiveId(items[activeIndex + 1].id)}
                        disabled={activeIndex === items.length - 1}
                        aria-label="Next document page"
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 grid h-9 w-9 place-items-center rounded-full border border-line bg-white/90 text-ink shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-105 disabled:pointer-events-none disabled:opacity-20"
                      >
                        <ChevronRight size={18} aria-hidden />
                      </button>
                    )}

                    {/* Realistic PDF Paper Document Sheet */}
                    <div
                      className="relative shrink-0 overflow-hidden rounded-[3px] border border-black/[0.08] shadow-[0_20px_50px_rgba(25,20,15,0.15),0_2px_8px_rgba(25,20,15,0.06)] transition-all duration-150"
                      style={{
                        width: `${sheetW}px`,
                        height: `${sheetH}px`,
                        background,
                      }}
                    >
                      {/* Printable Area / Margins Box */}
                      <div
                        className="relative flex h-full w-full items-center justify-center"
                        style={{ padding: `${effectiveMarginPercent}%` }}
                      >
                        {/* Printable Margin Boundary Guide (subtle dashed border when margins enabled) */}
                        {effectiveMarginPercent > 0 && (
                          <div className="pointer-events-none absolute inset-0 m-[inherit] border border-dashed border-black/10 rounded-[2px]" />
                        )}

                        {/* Page Image */}
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                          <img
                            src={activeItem.preview}
                            alt={`PDF Page ${activeIndex + 1}`}
                            className={`select-none pointer-events-none transition-transform duration-150 ${
                              effectiveMarginPercent === 0 || settings.fit === "cover"
                                ? "h-full w-full object-cover"
                                : settings.fit === "stretch"
                                  ? "h-full w-full object-fill"
                                  : "max-h-full max-w-full object-contain"
                            }`}
                            style={{
                              transform: activeRotation !== 0 ? `rotate(${activeRotation}deg)` : undefined,
                              filter: settings.grayscale ? "grayscale(100%) contrast(108%)" : undefined,
                            }}
                          />
                        </div>
                      </div>

                      {/* Printed Page Number Footer */}
                      {settings.pageNumbers && (
                        <div
                          className={`absolute bottom-2 inset-x-3 text-[9px] font-medium tabular-nums ${
                            settings.background === "black" ? "text-white/60" : "text-[#7f796d]"
                          } ${
                            settings.pageNumberPosition === "bottom-right"
                              ? "text-right"
                              : settings.pageNumberPosition === "bottom-left"
                                ? "text-left"
                                : "text-center"
                          }`}
                        >
                          {activeIndex + 1} / {items.length}
                        </div>
                      )}

                      {/* Fine Paper Sheet Edge Highlight */}
                      <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-1 ring-inset ring-black/5" />
                    </div>

                    {/* Bottom Floating Quick Page Navigator Pill */}
                    <div className="absolute bottom-2.5 z-20 flex items-center gap-1.5 rounded-full border border-line bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-xs backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                        disabled={activeIndex === 0}
                        className="text-muted hover:text-ink disabled:opacity-30"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="tabular-nums px-1">
                        Page {activeIndex + 1} of {items.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => activeIndex < items.length - 1 && setActiveId(items[activeIndex + 1].id)}
                        disabled={activeIndex === items.length - 1}
                        className="text-muted hover:text-ink disabled:opacity-30"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}

                {/* VIEW MODE B: All Pages Booklet Grid Overview */}
                {stageView === "grid" && (
                  <div className="absolute inset-0 overflow-y-auto px-4 pt-14 pb-4">
                    <div className="flex flex-wrap gap-5 place-content-start">
                      {items.map((item, index) => {
                        const pageRot = pageRotations[item.id] || 0;
                        const isFocused = item.id === activeItem?.id;
                        const isDragging = dragId === item.id;
                        const isDragOver = dragOverId === item.id;
                        const isRotatedQuarter = pageRot === 90 || pageRot === 270;
                        const rawW = item.width || 800;
                        const rawH = item.height || 600;
                        const effW = isRotatedQuarter ? rawH : rawW;
                        const effH = isRotatedQuarter ? rawW : rawH;
                        const cardAspect = settings.pageSize === "fit" ? effW / effH : aspect;
                        // Increased card size for better preview and easier drag-and-drop
                        const cardH = 190;
                        const cardW = Math.min(270, Math.max(130, Math.round(cardH * cardAspect)));
                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, item.id)}
                            onDragOver={(e) => handleItemDragOver(e, item.id)}
                            onDrop={handleItemDrop}
                            onDragEnd={handleItemDragEnd}
                            className={`group relative flex flex-col items-center rounded-[12px] p-2 transition-all cursor-grab active:cursor-grabbing ${
                              isFocused ? "bg-white/90 ring-2 ring-ink shadow-sm" : "hover:bg-white/60"
                            } ${isDragging ? "opacity-40 scale-95" : ""} ${isDragOver && !isDragging ? "scale-105 ring-2 ring-ink/40" : ""}`}
                          >
                            {/* Miniature Document Sheet */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveId(item.id);
                                setStageView("single");
                              }}
                              className="relative overflow-hidden rounded-[4px] border border-black/10 shadow-md bg-white transition-transform group-hover:scale-[1.02]"
                              style={{
                                width: `${cardW}px`,
                                height: `${cardH}px`,
                                background,
                              }}
                              title={`Click to inspect page ${index + 1} · Drag to reorder`}
                            >
                              <div
                                className="flex h-full w-full items-center justify-center overflow-hidden"
                                style={{ padding: `${effectiveMarginPercent === 0 ? 0 : Math.min(8, effectiveMarginPercent * 0.8)}%` }}
                              >
                                <img
                                  src={item.preview}
                                  alt={`Page ${index + 1}`}
                                  className={`h-full w-full select-none ${
                                    effectiveMarginPercent === 0 || settings.fit === "cover"
                                      ? "object-cover"
                                      : settings.fit === "stretch"
                                        ? "object-fill"
                                        : "object-contain"
                                  }`}
                                  style={{
                                    transform: pageRot !== 0 ? `rotate(${pageRot}deg)` : undefined,
                                    filter: settings.grayscale ? "grayscale(100%) contrast(108%)" : undefined,
                                  }}
                                />
                              </div>

                              {/* Page Stamp Number */}
                              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
                                {index + 1}
                              </span>
                            </button>

                            {/* Cross delete button on top-right of card */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePage(item.id);
                              }}
                              className="absolute -right-1.5 -top-1.5 z-20 grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-muted shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:border-[#a13d30]/50 hover:bg-[#fff5f5] hover:text-[#a13d30]"
                              title="Remove page"
                            >
                              <X size={12} />
                            </button>

                            {/* Page label below card */}
                            <div className="mt-2 flex items-center justify-center w-full px-1">
                              <span className="text-[11.5px] font-bold text-ink tabular-nums">
                                Page {index + 1}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add Page Card */}
                      <button
                        type="button"
                        onClick={() => openPicker()}
                        className="flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-[#cbc4b7] p-4 text-center hover:border-ink hover:bg-white/60 transition-all"
                        style={{ width: `${Math.min(270, Math.max(130, Math.round(190 * aspect)))}px`, height: "190px" }}
                      >
                        <Plus size={24} className="text-muted mb-1.5" />
                        <span className="text-[12px] font-bold text-ink">Add Page</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Document Pages Filmstrip Tray */}
              {items.length > 0 && (
                <div className="mt-2.5 shrink-0 rounded-[12px] border border-line bg-white p-2.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-3 mb-2 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint flex items-center gap-1.5">
                      <Layers3 size={11} className="text-muted" />
                      Document Pages ({items.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPicker()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-ink transition-colors hover:text-muted"
                      >
                        <Plus size={11} />
                        Add pages
                      </button>
                      <span className="text-line">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          reverseItems();
                          setNotice(null);
                        }}
                        disabled={items.length < 2}
                        className="text-[10.5px] font-medium text-faint transition-colors hover:text-ink disabled:opacity-40"
                      >
                        Reverse
                      </button>
                      <span className="text-line">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          clearAll();
                          setNotice(null);
                        }}
                        className="text-[10.5px] font-medium text-faint transition-colors hover:text-[#a13d30]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Filmstrip */}
                  <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
                    {items.map((item, index) => {
                      const isActive = item.id === activeItem?.id;
                      const pageRot = pageRotations[item.id] || 0;
                      const tw = thumbWidth(item, pageRot);
                      const isDragging = dragId === item.id;
                      const isDragOver = dragOverId === item.id;
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleItemDragStart(e, item.id)}
                          onDragOver={(e) => handleItemDragOver(e, item.id)}
                          onDrop={handleItemDrop}
                          onDragEnd={handleItemDragEnd}
                          className={`group relative flex flex-col items-center shrink-0 cursor-grab active:cursor-grabbing transition-all ${
                            isDragging ? "opacity-40 scale-95" : ""
                          } ${isDragOver && !isDragging ? "scale-105" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveId(item.id);
                              if (stageView !== "single") setStageView("single");
                            }}
                            aria-pressed={isActive}
                            aria-label={`Page ${index + 1}: ${item.file.name}`}
                            title={`Page ${index + 1}: ${item.file.name}`}
                            className={`relative shrink-0 overflow-hidden rounded-[4px] border bg-white shadow-2xs transition-all ${
                              isActive
                                ? "border-ink ring-2 ring-ink shadow-xs scale-[1.03]"
                                : "border-line hover:border-[#cbc5b9]"
                            }`}
                            style={{ width: `${tw}px`, height: `${FILMSTRIP_H}px` }}
                          >
                            <img
                              src={item.preview}
                              alt=""
                              className="h-full w-full object-cover select-none pointer-events-none"
                              style={{
                                transform: pageRot !== 0 ? `rotate(${pageRot}deg)` : undefined,
                                filter: settings.grayscale ? "grayscale(100%)" : undefined,
                              }}
                            />
                            {/* Page Number Pill */}
                            <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-[3px] bg-ink text-[8.5px] font-bold text-white shadow-2xs">
                              {index + 1}
                            </span>
                            {/* Rotation Indicator */}
                            {pageRot !== 0 && (
                              <span className="absolute right-0.5 top-0.5 rounded bg-white/90 px-0.5 text-[7px] font-bold text-ink">
                                {pageRot}°
                              </span>
                            )}
                          </button>

                          {/* × remove button on hover */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePage(item.id);
                            }}
                            className="absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full border border-line bg-white text-muted shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:border-[#a13d30]/50 hover:bg-[#fff5f5] hover:text-[#a13d30]"
                            title="Remove page"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Add More Pages Button */}
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      aria-label="Add more document pages"
                      className="grid shrink-0 place-items-center rounded-[4px] border-2 border-dashed border-[#d7d2c8] text-faint transition-colors hover:border-[#b8a992] hover:text-ink hover:bg-white"
                      style={{ width: "56px", height: `${FILMSTRIP_H}px` }}
                      title="Add more images as pages"
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            tabIndex={-1}
            aria-label="Choose images"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {/* Bottom Export & CTA Bar */}
          <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-faint">
              <ShieldCheck size={13} aria-hidden className="text-[#305e2b]" />
              100% On-Device · No uploads · No watermark · Private PDF export
            </p>

            <div className="flex items-center gap-3">
              {result && (
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#305e2b] transition-colors hover:underline"
                >
                  <Download size={12} aria-hidden />
                  Download again ({formatBytes(result.bytes)})
                </button>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={items.length === 0 || busy}
                className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[190px]")}
              >
                {busy && progress ? (
                  <>
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    <span>Building page {progress.done} of {progress.total}…</span>
                  </>
                ) : items.length > 0 ? (
                  <>
                    <span>Export PDF · {items.length} {items.length === 1 ? "page" : "pages"}</span>
                    <ArrowRightGlyph size={13} />
                  </>
                ) : (
                  <span>Export PDF</span>
                )}
              </button>
            </div>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-2.5 shrink-0 rounded-[10px] border border-[#d9e3d5] bg-[#f4f8f2] px-3 py-2 text-[11.5px] font-medium leading-relaxed text-[#305e2b]"
            >
              {notice}
            </p>
          )}
        </div>

        {/* Right Column: PDF Settings Rail */}
        <StudioRail label="PDF Inspector">
          <PdfControls
            settings={settings}
            onPatch={patch}
            pageCount={items.length}
            totalInput={totalInput}
            estimate={estimate}
            aspect={aspect}
            empty={items.length === 0}
          />
        </StudioRail>
      </div>
    </section>
  );
}
