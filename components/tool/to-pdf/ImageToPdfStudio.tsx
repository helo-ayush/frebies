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
  DownloadAction,
  Note,
  PrimaryAction,
  SecondaryAction,
  StageBar,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolTabs,
  ToolText,
} from "@/components/tool/kit";
import { Filmstrip } from "@/components/tool/viewer/Filmstrip";
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

/** One cell of the key row under a page. */
const CARD_BUTTON =
  "grid h-9 flex-1 place-items-center border-l border-line transition-colors first:border-l-0 hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-25";

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
  const availableH = Math.max(160, stageSize.height - 64);
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
  const pageNumberColor = settings.background === "black" ? "text-white/60" : "text-faint";

  return (
    <StudioFrame id="to-pdf" label="Image to PDF studio">
      <StudioStage flush>
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
            className="flex min-h-0 flex-1 flex-col"
          >
            <StageBar
              end={
                <>
                  <ToolText
                    onClick={() => {
                      reverseItems();
                      setNotice(null);
                    }}
                    disabled={items.length < 2}
                  >
                    Reverse
                  </ToolText>
                  <ToolText onClick={startOver}>Clear all</ToolText>
                </>
              }
            >
              <ToolTabs label="Stage view" options={VIEW_OPTIONS} value={stageView} onChange={setStageView} />
              <span className="fb-num pl-1 text-[13.5px] text-muted">
                {items.length} {pageWord}
                {stageView === "grid" && items.length > 1 ? (
                  <span className="max-sm:hidden">, drag to reorder</span>
                ) : null}
              </span>
            </StageBar>

            {/* The light table: page order, or one page at full size */}
            <div
              ref={setStageEl}
              className={`relative flex-1 lg:min-h-0 lg:overflow-hidden ${
                stageView === "single" ? "min-h-[max(360px,56svh)] overflow-hidden" : ""
              }`}
            >
              {stageView === "grid" && (
                <div className="studio-main lg:absolute lg:inset-0 lg:overflow-y-auto">
                  <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] sm:gap-4 sm:p-4">
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
                          className={`relative flex cursor-grab flex-col border bg-panel transition-[border-color,opacity] active:cursor-grabbing ${
                            isDragging ? "opacity-40" : ""
                          } ${isDragOver ? "border-accent" : "border-line hover:border-ink"}`}
                        >
                          {isDragOver ? (
                            <span aria-hidden className="absolute -left-[11px] bottom-0 top-0 w-[5px] bg-accent" />
                          ) : null}
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
                            className="relative block w-full"
                          >
                            <span className="grid aspect-square w-full place-items-center p-4">
                              <span
                                className={`relative block overflow-hidden shadow-[0_0_0_1px_rgba(24,24,27,0.2),5px_5px_0_rgba(24,24,27,0.08)] ${
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
                            <span className="fb-num absolute left-0 top-0 bg-ink px-2 py-[5px] text-[12px] font-semibold leading-none text-white">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>

                          <div className="mt-auto flex border-t border-line">
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
                              className={CARD_BUTTON}
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
                          className="fb-hatch flex min-h-[150px] w-full flex-col items-center justify-center gap-3 border border-dashed border-line-strong text-[13px] font-semibold uppercase transition-colors hover:border-ink hover:bg-ink hover:text-white"
                        >
                          <Plus size={22} aria-hidden />
                          Add images
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {stageView === "single" && activeItem && (
                <div className="fb-corners absolute inset-0 flex items-center justify-center overflow-hidden p-6">
                  {/* The page as it will print */}
                  <div
                    className="relative shrink-0 overflow-hidden shadow-[0_0_0_1px_rgba(24,24,27,0.22),10px_10px_0_rgba(24,24,27,0.09)]"
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
                            className="pointer-events-none absolute inset-0 border border-dashed border-accent/60"
                          />
                        )}
                      </div>
                    </div>

                    {settings.pageNumbers && (
                      <div
                        className={`absolute inset-x-3 bottom-2 text-[12px] font-medium tabular-nums ${pageNumberColor} ${pageNumberAlign}`}
                      >
                        {activeIndex + 1} / {items.length}
                      </div>
                    )}
                  </div>

                  <span className="fb-num absolute left-3 top-3 bg-ink px-2.5 py-[7px] text-[12px] font-semibold uppercase leading-none text-white">
                    Page {activeIndex + 1} of {items.length}
                  </span>

                  {/* Page keys */}
                  <div className="absolute bottom-3 right-3 z-20 flex [&>*]:-ml-px">
                    <ToolIcon
                      label="Previous page"
                      disabled={activeIndex === 0}
                      onClick={() => activeIndex > 0 && setActiveId(items[activeIndex - 1].id)}
                    >
                      <ChevronLeft size={16} aria-hidden />
                    </ToolIcon>
                    <ToolIcon
                      label="Next page"
                      disabled={activeIndex === items.length - 1}
                      onClick={() => activeIndex < items.length - 1 && setActiveId(items[activeIndex + 1].id)}
                    >
                      <ChevronRight size={16} aria-hidden />
                    </ToolIcon>
                    <ToolIcon
                      label={`Rotate page ${activeIndex + 1} 90° clockwise`}
                      onClick={() => rotatePage(activeItem.id)}
                    >
                      <RotateCw size={15} aria-hidden />
                    </ToolIcon>
                    <ToolIcon
                      label={`Remove page ${activeIndex + 1}`}
                      slot="page-remove"
                      onClick={() => handleRemovePage(activeItem.id)}
                    >
                      <Trash2 size={15} aria-hidden />
                    </ToolIcon>
                  </div>
                </div>
              )}

              {dragging && !dragId ? (
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border-[3px] border-accent bg-canvas/85">
                  <p className="fb-wide text-[clamp(22px,2.6vw,38px)]">Drop to add</p>
                </div>
              ) : null}
            </div>

            {stageView === "single" && activeItem ? (
              <Filmstrip
                label="Pages in this PDF"
                addLabel="Add images"
                activeId={activeItem.id}
                onSelect={setActiveId}
                onAdd={items.length < MAX_FILES ? () => openPicker() : undefined}
                items={items.map((item, index) => ({
                  id: item.id,
                  name: `page ${index + 1}: ${item.file.name}`,
                  src: item.preview,
                  badge: String(index + 1).padStart(2, "0"),
                }))}
              />
            ) : null}
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

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
        {noticeError ? <Note tone="error" className="m-3 shrink-0">{noticeError}</Note> : null}
      </StudioStage>

      <StudioRail
        label="PDF settings"
        action={
          result ? (
            <>
              <DownloadAction
                label="Download PDF"
                onClick={() => downloadBlob(result.blob, result.name)}
                hint={`${result.name} · ${items.length} ${pageWord} · ${formatBytes(result.bytes)}`}
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
