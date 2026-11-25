"use client";

import { useEffect, useLayoutEffect, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  ActionRow,
  Chip,
  DownloadAction,
  Note,
  PrimaryAction,
  ResultCard,
  SecondaryAction,
  Segmented,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
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

type StageView = "grid" | "single";

const VIEW_OPTIONS: { value: StageView; label: string }[] = [
  { value: "grid", label: "Pages" },
  { value: "single", label: "Preview" },
];

const TOOLBAR_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40";
const CARD_BUTTON =
  "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8";
const PAGER_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30";

/**
 * One image laid on its page. Quarter turns swap the box so a rotated image
 * fills the page the way it will in the PDF.
 */
function PageImage({
  src,
  alt,
  rotation,
  cover,
  grayscale,
}: {
  src: string;
  alt: string;
  rotation: number;
  cover: boolean;
  grayscale: boolean;
}) {
  const quarter = rotation === 90 || rotation === 270;
  return (
    <span className="relative block h-full w-full overflow-hidden [container-type:size]">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none ${
          cover ? "object-cover" : "object-contain"
        }`}
        style={{
          width: quarter ? "100cqh" : "100%",
          height: quarter ? "100cqw" : "100%",
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          filter: grayscale ? "grayscale(100%) contrast(108%)" : undefined,
        }}
      />
    </span>
  );
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
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; bytes: number } | null>(null);

  // "grid" is the page order, "single" previews one page at full size
  const [stageView, setStageView] = useState<StageView>("grid");

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

  // Keyboard navigation for page flip in the single-page preview
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (stageView !== "single" || items.length <= 1) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Sliders use the arrow keys themselves
      if (e.target instanceof HTMLElement && e.target.closest('[role="slider"]')) return;

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

  // A finished PDF no longer matches once pages are added, removed or reordered.
  const orderKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    setResult(null);
  }, [orderKey]);

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

  // Size the preview sheet to the stage, keeping it clear of the page
  // navigator that floats at the bottom.
  const availableW = Math.max(160, stageSize.width - 56);
  const availableH = Math.max(160, stageSize.height - 96);
  const baseDimension = 540;
  const baseW = aspect >= 1 ? baseDimension : baseDimension * aspect;
  const baseH = aspect >= 1 ? baseDimension / aspect : baseDimension;
  const sheetScale = Math.min(availableW / baseW, availableH / baseH);
  const sheetW = Math.max(120, Math.round(baseW * sheetScale));
  const sheetH = Math.max(120, Math.round(baseH * sheetScale));

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

  function handleItemDragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function handleItemDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  }
  function handleItemDrop(e: DragEvent) {
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

  function startOver() {
    clearAll();
    setPageRotations({});
    setNotice(null);
    setResult(null);
    setStageView("grid");
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
      setNoticeTone("success");
      setNotice(
        `Exported ${name} · ${pages.length} page${pages.length === 1 ? "" : "s"} · ${formatBytes(
          pdf.size,
        )}.`,
      );
    } catch (thrown) {
      setNoticeTone("error");
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

  const pageWord = items.length === 1 ? "page" : "pages";
  const noticeError = noticeTone === "error" ? notice : null;
  const pageNumberAlign =
    settings.pageNumberPosition === "bottom-right"
      ? "text-right"
      : settings.pageNumberPosition === "bottom-left"
        ? "text-left"
        : "text-center";
  const pageNumberColor = settings.background === "black" ? "text-white/60" : "text-[#7f796d]";

  return (
    <StudioFrame id="to-pdf" label="Image to PDF studio">
      <StudioStage>
        {items.length === 0 ? (
          <StudioDropzone
            title="Drop images to make a PDF"
            description="Each image becomes one page. Put them in order, rotate any that are sideways, then pick a paper size."
            buttonLabel="Choose images"
            limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB each · up to ${MAX_FILES} pages`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <StudioChip>A4, Letter, A5, Legal</StudioChip>
                <StudioChip>Drag to reorder</StudioChip>
                <StudioChip>B&amp;W scan mode</StudioChip>
              </>
            }
          />
        ) : (
          <div
            // While a page is being dragged to a new slot, the stage must not
            // treat it as an incoming file.
            onDragOver={dragId ? (event) => event.preventDefault() : onDragOver}
            onDragLeave={dragId ? undefined : onDragLeave}
            onDrop={dragId ? handleItemDrop : onDrop}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            {result ? (
              <ResultCard
                className="shrink-0"
                title={`${result.name} is ready`}
                meta={`${items.length} ${pageWord} · ${formatBytes(result.bytes)}`}
              >
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
                >
                  <Download size={15} aria-hidden />
                  Download
                </button>
              </ResultCard>
            ) : null}

            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2">
                <Segmented
                  label="Stage view"
                  className="w-[172px]"
                  options={VIEW_OPTIONS}
                  value={stageView}
                  onChange={setStageView}
                />
                <Chip>
                  {items.length} {pageWord}
                  {stageView === "grid" && items.length > 1 ? (
                    <span className="max-sm:hidden"> · drag to reorder</span>
                  ) : null}
                </Chip>
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    reverseItems();
                    setNotice(null);
                  }}
                  disabled={items.length < 2}
                  className={TOOLBAR_BUTTON}
                >
                  Reverse order
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  data-variant="destructive"
                  className={`${TOOLBAR_BUTTON} hover:!text-danger`}
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* The desk: page order, or one page at full size */}
            <div
              ref={setStageEl}
              className={`relative flex-1 rounded-[16px] border bg-[#f3f1ec] transition-colors lg:min-h-0 lg:overflow-hidden ${
                dragging ? "border-accent" : "border-line"
              } ${stageView === "single" ? "min-h-[max(360px,56svh)] overflow-hidden" : ""}`}
            >
              {stageView === "grid" && (
                <div className="studio-main p-3 sm:p-4 lg:absolute lg:inset-0 lg:overflow-y-auto">
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {items.map((item, index) => {
                      const pageRot = pageRotations[item.id] || 0;
                      const isDragging = dragId === item.id;
                      const isDragOver = dragOverId === item.id && !isDragging;
                      const quarter = pageRot === 90 || pageRot === 270;
                      const rawW = item.width || 800;
                      const rawH = item.height || 600;
                      const cardAspect = pageAspect({
                        settings,
                        imageWidth: quarter ? rawH : rawW,
                        imageHeight: quarter ? rawW : rawH,
                      });

                      return (
                        <li
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleItemDragStart(e, item.id)}
                          onDragOver={(e) => handleItemDragOver(e, item.id)}
                          onDrop={handleItemDrop}
                          onDragEnd={handleItemDragEnd}
                          className={`flex cursor-grab flex-col rounded-[14px] border bg-white p-2 transition-[border-color,box-shadow,opacity] active:cursor-grabbing ${
                            isDragging ? "opacity-40" : ""
                          } ${
                            isDragOver
                              ? "border-accent shadow-[0_0_0_3px_rgba(229,94,64,0.18)]"
                              : "border-line hover:border-[#cfc9bd]"
                          }`}
                        >
                          {/* A div, not a button: Firefox will not start a drag from a button. */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setActiveId(item.id);
                              setStageView("single");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveId(item.id);
                                setStageView("single");
                              }
                            }}
                            data-slot="page-item"
                            aria-label={`Preview page ${index + 1}: ${item.file.name}`}
                            title={`${item.file.name} · click to preview, drag to reorder`}
                            className="relative block w-full rounded-[9px] bg-card"
                          >
                            <span className="grid aspect-square w-full place-items-center p-2.5">
                              <span
                                className={`relative block overflow-hidden rounded-[2px] border border-black/10 shadow-[0_4px_12px_rgba(0,0,0,0.1)] ${
                                  cardAspect >= 1 ? "w-full" : "h-full"
                                }`}
                                style={{ aspectRatio: String(cardAspect), background }}
                              >
                                <span
                                  className="block h-full w-full"
                                  style={{ padding: `${effectiveMarginPercent}%` }}
                                >
                                  <PageImage
                                    src={item.preview}
                                    alt=""
                                    rotation={pageRot}
                                    cover={settings.fit === "cover"}
                                    grayscale={settings.grayscale}
                                  />
                                </span>
                                {settings.pageNumbers && (
                                  <span
                                    aria-hidden
                                    className={`absolute inset-x-1.5 bottom-0.5 text-[11px] font-medium leading-tight tabular-nums ${pageNumberColor} ${pageNumberAlign}`}
                                  >
                                    {index + 1}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold leading-tight tabular-nums text-white">
                              {index + 1}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => moveItem(item.id, -1)}
                              disabled={index === 0}
                              aria-label={`Move page ${index + 1} earlier`}
                              title="Move earlier"
                              className={CARD_BUTTON}
                            >
                              <ArrowLeft size={15} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveItem(item.id, 1)}
                              disabled={index === items.length - 1}
                              aria-label={`Move page ${index + 1} later`}
                              title="Move later"
                              className={CARD_BUTTON}
                            >
                              <ArrowRight size={15} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => rotatePage(item.id)}
                              aria-label={`Rotate page ${index + 1} 90° clockwise`}
                              title="Rotate 90°"
                              className={CARD_BUTTON}
                            >
                              <RotateCw size={15} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePage(item.id)}
                              data-slot="page-remove"
                              aria-label={`Remove page ${index + 1}`}
                              title="Remove page"
                              className={`${CARD_BUTTON} hover:!bg-danger-soft hover:!text-danger`}
                            >
                              <Trash2 size={15} aria-hidden />
                            </button>
                          </div>
                        </li>
                      );
                    })}

                    {items.length < MAX_FILES && (
                      <li className="flex">
                        <button
                          type="button"
                          onClick={() => openPicker()}
                          className="flex min-h-[150px] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#cbc4b7] text-[13px] font-medium text-muted transition-colors hover:border-ink hover:bg-white hover:text-ink"
                        >
                          <Plus size={20} aria-hidden />
                          Add images
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {stageView === "single" && activeItem && (
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 pb-14 pt-6">
                  {/* The page as it will print */}
                  <div
                    className="relative shrink-0 overflow-hidden rounded-[3px] border border-black/[0.12] shadow-[0_20px_50px_rgba(25,20,15,0.18),0_2px_8px_rgba(25,20,15,0.08)]"
                    style={{
                      width: `${sheetW}px`,
                      height: `${sheetH}px`,
                      background,
                    }}
                  >
                    <div className="h-full w-full" style={{ padding: `${effectiveMarginPercent}%` }}>
                      <div className="relative h-full w-full">
                        <PageImage
                          src={activeItem.preview}
                          alt={`Page ${activeIndex + 1}: ${activeItem.file.name}`}
                          rotation={activeRotation}
                          cover={settings.fit === "cover"}
                          grayscale={settings.grayscale}
                        />
                        {/* Margin guide */}
                        {effectiveMarginPercent > 0 && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 border border-dashed border-black/15"
                          />
                        )}
                      </div>
                    </div>

                    {settings.pageNumbers && (
                      <div
                        className={`absolute inset-x-3 bottom-2 text-[11px] font-medium tabular-nums ${pageNumberColor} ${pageNumberAlign}`}
                      >
                        {activeIndex + 1} / {items.length}
                      </div>
                    )}
                  </div>

                  {/* Page navigator */}
                  <div className="absolute bottom-3 z-20 flex items-center gap-0.5 rounded-full border border-line bg-white p-1 shadow-pop">
                    <button
                      type="button"
                      onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                      disabled={activeIndex === 0}
                      aria-label="Previous page"
                      className={PAGER_BUTTON}
                    >
                      <ChevronLeft size={16} aria-hidden />
                    </button>
                    <span className="px-1.5 text-[13px] font-medium tabular-nums text-ink">
                      {activeIndex + 1} / {items.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => activeIndex < items.length - 1 && setActiveId(items[activeIndex + 1].id)}
                      disabled={activeIndex === items.length - 1}
                      aria-label="Next page"
                      className={PAGER_BUTTON}
                    >
                      <ChevronRight size={16} aria-hidden />
                    </button>
                    <span aria-hidden className="mx-1 h-5 w-px bg-line" />
                    <button
                      type="button"
                      onClick={() => rotatePage(activeItem.id)}
                      aria-label={`Rotate page ${activeIndex + 1} 90° clockwise`}
                      title="Rotate 90°"
                      className={PAGER_BUTTON}
                    >
                      <RotateCw size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePage(activeItem.id)}
                      data-slot="page-remove"
                      aria-label={`Remove page ${activeIndex + 1}`}
                      title="Remove page"
                      className={`${PAGER_BUTTON} hover:!bg-danger-soft hover:!text-danger`}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>
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

        {/* Drives the success / error sound cues */}
        <span
          aria-hidden
          className="hidden"
          data-success={noticeTone === "success" ? notice : undefined}
          data-error={error ?? (noticeTone === "error" ? notice : undefined)}
        />

        {error ? (
          <Note tone="error" className="mt-3 shrink-0">
            {error}
          </Note>
        ) : null}
        {noticeError ? (
          <Note tone="error" className="mt-3 shrink-0">
            {noticeError}
          </Note>
        ) : null}
      </StudioStage>

      <StudioRail
        label="PDF settings"
        action={
          result ? (
            <>
              <DownloadAction
                label="Download PDF"
                onClick={() => downloadBlob(result.blob, result.name)}
                hint={`${result.name} · ${formatBytes(result.bytes)}`}
              />
              <ActionRow>
                <SecondaryAction
                  onClick={() => {
                    setResult(null);
                    setNotice(null);
                  }}
                  icon={<Pencil size={13} aria-hidden />}
                >
                  Keep editing
                </SecondaryAction>
                <StartOverAction onClick={startOver} label="New PDF" />
              </ActionRow>
            </>
          ) : (
            <PrimaryAction
              label={
                items.length > 0
                  ? `Create PDF from ${items.length} ${items.length === 1 ? "image" : "images"}`
                  : "Create PDF"
              }
              busyLabel={
                progress
                  ? `Page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                  : "Building PDF…"
              }
              icon={<FileText size={16} aria-hidden />}
              busy={busy}
              progress={progress ? progress.done / progress.total : undefined}
              disabled={items.length === 0}
              onClick={handleCreate}
              hint={
                items.length > 0
                  ? `${pageLabel(settings, aspect)} · about ${formatBytes(estimate)} · downloads when it finishes`
                  : "Add images to get started"
              }
            />
          )
        }
      >
        <PdfControls settings={settings} onPatch={patch} pageCount={items.length} />
      </StudioRail>
    </StudioFrame>
  );
}
