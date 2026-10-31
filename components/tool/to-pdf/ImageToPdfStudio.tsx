"use client";

import { useEffect, useLayoutEffect, useState } from "react";
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

  // Stage measurement. The stage only exists once pages are added, so it is
  // tracked through a callback ref rather than a mount-only effect.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 720, height: 500 });

  useLayoutEffect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setStageSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

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

  const margin = marginMeta(settings.margin);
  const effectiveMarginPercent = settings.pageSize === "fit" ? 0 : margin.percent;
  const background = backgroundValue(settings.background);

  // Compute responsive PDF paper sheet dimensions for the stage canvas.
  // The reserve keeps the sheet clear of the page-turn buttons and the
  // floating page navigator, without leaving a wide empty band around it.
  // Narrow stages hide the side buttons, so they only need edge breathing room.
  const sideClearance = stageSize.width < 520 ? 56 : 104;
  const availableW = Math.max(160, stageSize.width - sideClearance);
  const availableH = Math.max(160, stageSize.height - 96);

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

      <div className="grid grid-cols-1 lg:h-[720px] lg:grid-cols-[minmax(0,1fr)_370px] xl:h-[780px] xl:grid-cols-[minmax(0,1fr)_430px]">
        {/* Left Column: PDF Document Workspace */}
        <div className="flex min-h-0 min-w-0 flex-col p-3 sm:p-5">
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
              <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-[#f0ede6] shadow-2xs select-none lg:min-h-[320px]">
                {/* Pinned Top Stage Toolbar — Never covered by cards or scrolled away */}
                <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-white/95 px-3.5 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    {/* View Mode Switcher */}
                    <div className="flex rounded-[10px] border border-line bg-[#f8f6f2] p-1">
                      <button
                        type="button"
                        onClick={() => setStageView("single")}
                        aria-pressed={stageView === "single"}
                        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3.5 text-[12.5px] font-medium transition-colors ${
                          stageView === "single"
                            ? "bg-white text-ink shadow-2xs"
                            : "text-muted hover:text-ink"
                        }`}
                        title="Inspect the active page"
                      >
                        <FileText size={14} aria-hidden />
                        <span>Single</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStageView("grid")}
                        aria-pressed={stageView === "grid"}
                        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3.5 text-[12.5px] font-medium transition-colors ${
                          stageView === "grid"
                            ? "bg-white text-ink shadow-2xs"
                            : "text-muted hover:text-ink"
                        }`}
                        title="View all pages in the document grid"
                      >
                        <Grid size={14} aria-hidden />
                        <span>All pages ({items.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Top Right Stage Controls: Rotate, Zoom & Delete */}
                  <div className="flex items-center gap-1.5">
                    {stageView === "single" && activeItem && (
                      <>
                        {/* Rotate Active Page 90° */}
                        <button
                          type="button"
                          onClick={() => rotatePage(activeItem.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line bg-white px-3 text-[12.5px] font-medium text-ink shadow-2xs transition-colors hover:bg-[#faf9f6]"
                          title="Rotate the active page 90° clockwise"
                        >
                          <RotateCw size={13} aria-hidden />
                          <span>Rotate</span>
                          {activeRotation !== 0 && (
                            <span className="ml-0.5 rounded bg-ink/10 px-1 py-0.5 text-[9.5px] font-semibold tabular-nums">
                              {activeRotation}°
                            </span>
                          )}
                        </button>

                        {/* Zoom mode */}
                        <div className="flex h-9 items-center rounded-[9px] border border-line bg-[#f8f6f2] p-1">
                          <button
                            type="button"
                            onClick={() => setZoomMode("fit")}
                            aria-pressed={zoomMode === "fit"}
                            className={`flex h-full items-center rounded-[6px] px-3 text-[12px] font-medium transition-colors ${
                              zoomMode === "fit" ? "bg-white text-ink shadow-2xs" : "text-muted hover:text-ink"
                            }`}
                            title="Fit the page to the desk"
                          >
                            Fit
                          </button>
                          <button
                            type="button"
                            onClick={() => setZoomMode("100%")}
                            aria-pressed={zoomMode === "100%"}
                            className={`flex h-full items-center rounded-[6px] px-3 text-[12px] font-medium transition-colors ${
                              zoomMode === "100%" ? "bg-white text-ink shadow-2xs" : "text-muted hover:text-ink"
                            }`}
                            title="View the page at full size"
                          >
                            100%
                          </button>
                        </div>

                        {/* Remove Active Page */}
                        <button
                          type="button"
                          onClick={() => handleRemovePage(activeItem.id)}
                          className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-white text-muted shadow-2xs transition-colors hover:border-[#a13d30]/40 hover:bg-[#fff5f5] hover:text-[#a13d30]"
                          title={`Remove page ${activeIndex + 1}`}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Desk Workspace Canvas */}
                <div
                  ref={setStageEl}
                  className="relative flex-1 overflow-hidden bg-[#ece8df] bg-[radial-gradient(#0000000a_1px,transparent_1px)] [background-size:16px_16px]"
                >
                  {/* VIEW MODE A: Single Page Document Reader View */}
                  {stageView === "single" && activeItem && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-auto px-4 py-8">
                      {/* Left Page Turn Button */}
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                          disabled={activeIndex === 0}
                          aria-label="Previous document page"
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 z-20 hidden h-9 w-9 sm:grid place-items-center rounded-full border border-line bg-white/95 text-ink shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-105 disabled:pointer-events-none disabled:opacity-20"
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
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 z-20 hidden h-9 w-9 sm:grid place-items-center rounded-full border border-line bg-white/95 text-ink shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-105 disabled:pointer-events-none disabled:opacity-20"
                        >
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      )}

                      {/* Realistic PDF Paper Document Sheet */}
                      <div
                        className="relative shrink-0 overflow-hidden rounded-[3px] border border-black/[0.12] shadow-[0_20px_50px_rgba(25,20,15,0.18),0_2px_8px_rgba(25,20,15,0.08)] transition-all duration-150"
                        style={{
                          width: `${sheetW}px`,
                          height: `${sheetH}px`,
                          background,
                        }}
                      >
                        {/* Printable Area / Margins Box */}
                        <div
                          className="relative flex h-full w-full items-center justify-center overflow-hidden"
                          style={{ padding: `${effectiveMarginPercent}%` }}
                        >
                          {/* Printable Margin Boundary Guide (subtle dashed border when margins enabled) */}
                          {effectiveMarginPercent > 0 && (
                            <div className="pointer-events-none absolute inset-0 m-[inherit] border border-dashed border-black/15 rounded-[2px]" />
                          )}

                          {/* Page Image: fits the longest dimension edge-to-edge when margin is 0 */}
                          <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                            <img
                              src={activeItem.preview}
                              alt={`PDF Page ${activeIndex + 1}`}
                              className={`select-none pointer-events-none transition-transform duration-150 ${
                                settings.fit === "cover"
                                  ? "h-full w-full object-cover"
                                  : "h-full w-full object-contain"
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
                            className={`absolute bottom-2 inset-x-3 text-[9.5px] font-medium tabular-nums ${
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
                      <div className="absolute bottom-3 z-20 flex items-center gap-1 rounded-full border border-line bg-white/95 py-1 pl-1 pr-1.5 text-[12px] font-medium text-ink shadow-sm backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                          disabled={activeIndex === 0}
                          aria-label="Previous page"
                          className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-[#f6f4f0] hover:text-ink disabled:opacity-30"
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <span className="tabular-nums px-1.5">
                          Page {activeIndex + 1} of {items.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => activeIndex < items.length - 1 && setActiveId(items[activeIndex + 1].id)}
                          disabled={activeIndex === items.length - 1}
                          aria-label="Next page"
                          className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-[#f6f4f0] hover:text-ink disabled:opacity-30"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* VIEW MODE B: All Pages Booklet Grid Overview */}
                  {stageView === "grid" && (
                    <div className="absolute inset-0 overflow-y-auto p-5 sm:p-6">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 justify-items-center">
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

                          // Bounded sheet dimensions inside grid card:
                          // Ensures sheet stays bounded within 185px wide by 140px high, never overflowing
                          const maxBoxW = 185;
                          const maxBoxH = 140;
                          let gridSheetW = Math.round(maxBoxH * cardAspect);
                          let gridSheetH = maxBoxH;
                          if (gridSheetW > maxBoxW) {
                            gridSheetW = maxBoxW;
                            gridSheetH = Math.round(maxBoxW / cardAspect);
                          }

                          return (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={(e) => handleItemDragStart(e, item.id)}
                              onDragOver={(e) => handleItemDragOver(e, item.id)}
                              onDrop={handleItemDrop}
                              onDragEnd={handleItemDragEnd}
                              className={`group relative flex w-full max-w-[220px] min-h-[195px] flex-col items-center justify-between rounded-[14px] border p-3 transition-all cursor-grab active:cursor-grabbing ${
                                isFocused
                                  ? "border-ink ring-2 ring-ink shadow-md bg-white"
                                  : "border-line bg-white/70 hover:border-[#b8a992] hover:bg-white hover:shadow-xs"
                              } ${isDragging ? "opacity-30 scale-95" : ""} ${isDragOver && !isDragging ? "scale-105 ring-2 ring-ink/60" : ""}`}
                            >
                              {/* Miniature Document Sheet Container */}
                              <div className="flex h-[142px] w-full items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveId(item.id);
                                    setStageView("single");
                                  }}
                                  className="relative flex items-center justify-center overflow-hidden rounded-[3px] border border-black/10 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-transform group-hover:scale-[1.02]"
                                  style={{
                                    width: `${gridSheetW}px`,
                                    height: `${gridSheetH}px`,
                                    background,
                                  }}
                                  title={`Click to inspect page ${index + 1} · Drag to reorder`}
                                >
                                  <div
                                    className="flex h-full w-full items-center justify-center overflow-hidden"
                                    style={{ padding: `${effectiveMarginPercent}%` }}
                                  >
                                    <img
                                      src={item.preview}
                                      alt={`Page ${index + 1}`}
                                      className={`h-full w-full select-none pointer-events-none ${
                                        settings.fit === "cover" ? "object-cover" : "object-contain"
                                      }`}
                                      style={{
                                        transform: pageRot !== 0 ? `rotate(${pageRot}deg)` : undefined,
                                        filter: settings.grayscale ? "grayscale(100%) contrast(108%)" : undefined,
                                      }}
                                    />
                                  </div>

                                  {/* Page Stamp Number inside Sheet */}
                                  {settings.pageNumbers && (
                                    <span className="absolute bottom-1 right-1.5 text-[8.5px] font-semibold text-black/40 tabular-nums">
                                      {index + 1}
                                    </span>
                                  )}
                                </button>
                              </div>

                              {/* Hover action: Rotate 90° on top-left of card */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rotatePage(item.id);
                                }}
                                className="absolute left-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-muted shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-ink hover:bg-white"
                                title="Rotate 90° clockwise"
                              >
                                <RotateCw size={11} />
                              </button>

                              {/* Hover action: Delete on top-right of card */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePage(item.id);
                                }}
                                className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-muted shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:border-[#a13d30]/50 hover:bg-[#fff5f5] hover:text-[#a13d30]"
                                title="Remove page"
                              >
                                <X size={12} />
                              </button>

                              {/* Page label below card */}
                              <div className="mt-2 flex items-center justify-center">
                                <span className="text-[12px] font-bold text-ink tabular-nums">
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
                          className="flex w-full max-w-[220px] min-h-[195px] flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-[#cbc4b7] p-4 text-center hover:border-ink hover:bg-white/70 transition-all cursor-pointer"
                          title="Add more images as pages"
                        >
                          <Plus size={24} className="text-muted mb-1.5" />
                          <span className="text-[12px] font-bold text-ink">Add Page</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Pages Filmstrip Tray */}
              {items.length > 0 && (
                <div className="mt-2.5 shrink-0 rounded-[14px] border border-line bg-white p-3 shadow-2xs">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-ink">
                        <Layers3 size={13} className="text-muted" />
                        Document pages ({items.length})
                      </span>
                      <span className="text-micro text-faint hidden sm:inline">· Drag to reorder</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => openPicker()}
                        className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-[7px] px-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-[#f6f4f0]"
                      >
                        <Plus size={13} />
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
                        className="h-7 whitespace-nowrap rounded-[7px] px-1.5 text-[11.5px] font-medium text-faint transition-colors hover:bg-[#f6f4f0] hover:text-ink disabled:opacity-40"
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
                        className="h-7 whitespace-nowrap rounded-[7px] px-1.5 text-[11.5px] font-medium text-faint transition-colors hover:bg-[#f6f4f0] hover:text-[#a13d30]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Filmstrip Track */}
                  <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-1 scrollbar-thin">
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
                            isDragging ? "opacity-30 scale-95" : ""
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
                            title={`Page ${index + 1}: ${item.file.name} · Click to view`}
                            className={`relative shrink-0 overflow-hidden rounded-[7px] border transition-colors ${
                              isActive
                                ? "border-ink shadow-sm"
                                : "border-line bg-white shadow-2xs hover:border-[#b8a992]"
                            }`}
                            style={{ width: `${tw}px`, height: `${FILMSTRIP_H}px`, background }}
                          >
                            {/* Filmstrip thumbs crop to fill: a contain letterbox leaves a hairline
                                between the image and the selection frame */}
                            <div className="flex h-full w-full items-center justify-center overflow-hidden">
                              <img
                                src={item.preview}
                                alt=""
                                className="h-full w-full select-none pointer-events-none object-cover"
                                style={{
                                  transform: pageRot !== 0 ? `rotate(${pageRot}deg)` : undefined,
                                  filter: settings.grayscale ? "grayscale(100%)" : undefined,
                                }}
                              />
                            </div>

                            {/* Selected frame drawn inside the thumb so the scroll tray can't clip it */}
                            {isActive && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-[6px] ring-2 ring-inset ring-ink"
                              />
                            )}

                            {/* Page number badge, clear of the remove control */}
                            <span className="absolute bottom-1 left-1 rounded-[3px] bg-black/75 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white tabular-nums shadow-xs">
                              {index + 1}
                            </span>

                            {/* Rotation indicator */}
                            {pageRot !== 0 && (
                              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[7px] font-bold leading-none text-white">
                                {pageRot}°
                              </span>
                            )}
                          </button>

                          {/* Remove page — inside the frame, visible on hover or focus */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePage(item.id);
                            }}
                            aria-label={`Remove page ${index + 1}`}
                            title="Remove page"
                            className={`absolute right-1 top-1 z-10 grid h-[22px] w-[22px] place-items-center rounded-full border border-white/60 bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-[#a13d30] focus-visible:opacity-100 ${
                              isActive
                                ? "opacity-100"
                                : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                            }`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Add More Pages Button */}
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      aria-label="Add more document pages"
                      className="grid shrink-0 place-items-center rounded-[6px] border-2 border-dashed border-[#d7d2c8] text-faint transition-colors hover:border-ink hover:text-ink hover:bg-white"
                      style={{ width: "60px", height: `${FILMSTRIP_H}px` }}
                      title="Add more images as pages"
                    >
                      <Plus size={18} aria-hidden />
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
        </div>

        {/* Right Column: PDF Settings Rail */}
        <StudioRail
          label="PDF Inspector"
          footer={
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 text-[11.5px]">
                <span className="flex items-center gap-1.5 font-medium text-muted">
                  <ShieldCheck size={13} className="shrink-0 text-[#305e2b]" aria-hidden />
                  On-device · no upload
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {items.length ? `≈ ${formatBytes(estimate)}` : "No pages yet"}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={items.length === 0 || busy}
                className={buttonClasses("primary", "md", "w-full")}
              >
                {busy && progress ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    <span>
                      Building page {progress.done} of {progress.total}…
                    </span>
                  </>
                ) : items.length > 0 ? (
                  <>
                    <span>
                      Export PDF · {items.length} {items.length === 1 ? "page" : "pages"}
                    </span>
                    <ArrowRightGlyph size={13} />
                  </>
                ) : (
                  <span>Export PDF</span>
                )}
              </button>

              {result && (
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line bg-white text-[11.5px] font-medium text-ink transition-colors hover:bg-[#faf9f6]"
                >
                  <Download size={13} aria-hidden />
                  Download again ({formatBytes(result.bytes)})
                </button>
              )}

              {notice && (
                <p
                  role="status"
                  className="rounded-[9px] border border-[#d9e3d5] bg-[#f4f8f2] px-2.5 py-2 text-[11px] font-medium leading-relaxed text-[#305e2b]"
                >
                  {notice}
                </p>
              )}
            </div>
          }
        >
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
