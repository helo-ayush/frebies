"use client";

import { useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ImagePlus,
  Layers3,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { PdfControls } from "./PdfControls";
import {
  DEFAULT_PDF_SETTINGS,
  backgroundValue,
  estimatePdfBytes,
  formatBytes,
  marginMeta,
  pageAspect,
  pageLabel,
  pdfFilename,
  type PdfSettings,
} from "./model";

const MAX_FILES = 20;

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
    reverseItems,
  } = useImageQueue({
    maxFiles: MAX_FILES,
    maxSizeMB,
    formatHint: "JPG, PNG or WebP",
    noun: "image",
  });

  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_PDF_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  const totalInput = items.reduce((sum, item) => sum + item.file.size, 0);
  const estimate = estimatePdfBytes(
    totalInput,
    items.length,
    settings.quality,
    settings.optimize,
  );
  const aspect = pageAspect({
    settings,
    imageWidth: activeItem?.width,
    imageHeight: activeItem?.height,
  });
  const label = pageLabel(settings, aspect);
  const margin = marginMeta(settings.margin);
  const background = backgroundValue(settings.background);

  const sheetStyle: CSSProperties =
    aspect >= 1
      ? { width: "min(74%, 430px)", aspectRatio: aspect }
      : { height: "min(88%, 460px)", aspectRatio: aspect };

  function patch(next: Partial<PdfSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    setNotice(null);
  }

  function handleCreate() {
    setNotice(
      `The ${pdfFilename(settings.filename)} draft is ready. The PDF assembly engine is connected in the next build step — ${items.length} page${items.length === 1 ? "" : "s"} will be created locally.`,
    );
  }

  return (
    <section
      id="to-pdf"
      aria-label="Image to PDF studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/image/to-pdf" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">PDF studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Images into one clean document.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
            <Layers3 size={10} aria-hidden />
            {items.length ? `${items.length} page${items.length === 1 ? "" : "s"}` : "No pages"}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[720px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <StudioDropzone
              title="Drop images to build a PDF"
              description="Add one or more JPG, PNG or WebP images. Set the paper size, margins and page order before export."
              buttonLabel="Add images"
              limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB each · ${MAX_FILES} images`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              minHeightClass="min-h-[360px]"
              chips={
                <>
                  <StudioChip icon={<Layers3 size={10} aria-hidden />}>Reorder pages</StudioChip>
                  <StudioChip icon={<FileText size={10} aria-hidden />}>A4 / Letter</StudioChip>
                </>
              }
            />
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[320px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              <div className="relative flex min-h-[250px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#eeece6] p-4">
                <span className="absolute left-3 top-3 z-10 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                  Page {activeIndex + 1} of {items.length}
                </span>
                <span className="absolute right-3 top-3 z-10 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                  {label}
                </span>

                <div
                  className="relative overflow-hidden rounded-[4px] shadow-[0_18px_45px_rgba(45,35,22,0.18)]"
                  style={{ ...sheetStyle, background }}
                >
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ padding: `${margin.percent}%` }}
                  >
                    {activeItem && settings.fit === "contain" && (
                      <img
                        src={activeItem.preview}
                        alt={`Page ${activeIndex + 1} preview`}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                    {activeItem && settings.fit === "cover" && (
                      <img
                        src={activeItem.preview}
                        alt={`Page ${activeIndex + 1} preview`}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {activeItem && settings.fit === "stretch" && (
                      <img
                        src={activeItem.preview}
                        alt={`Page ${activeIndex + 1} preview`}
                        className="h-full w-full object-fill"
                      />
                    )}
                  </div>
                  {settings.pageNumbers && (
                    <span
                      className={`absolute bottom-1.5 right-2 text-[7px] tabular-nums ${
                        settings.background === "black" ? "text-white/55" : "text-[#9a9488]"
                      }`}
                    >
                      {activeIndex + 1} / {items.length}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-0 rounded-[4px] ring-1 ring-inset ring-black/5" />
                </div>

                <span
                  className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 truncate rounded-lg border border-white/70 bg-white/90 px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm backdrop-blur"
                  style={{ maxWidth: 320 }}
                >
                  <FileText size={11} className="shrink-0" aria-hidden />
                  <span className="truncate">{pdfFilename(settings.filename)}</span>
                </span>
              </div>

              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                    <FileText size={14} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">{activeItem.file.name}</p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(activeItem.file.size)}
                      {activeItem.width && activeItem.height
                        ? ` · ${activeItem.width} × ${activeItem.height}px`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => moveItem(activeItem.id, -1)}
                    disabled={activeIndex <= 0}
                    aria-label="Move page earlier"
                    className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(activeItem.id, 1)}
                    disabled={activeIndex >= items.length - 1}
                    aria-label="Move page later"
                    className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker(activeItem.id)}
                    aria-label="Replace image"
                    className="hidden h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink sm:flex"
                  >
                    <ImagePlus size={11} aria-hidden />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(activeItem.id)}
                    aria-label={`Remove ${activeItem.file.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={13} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

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

          {items.length > 0 && (
            <div className="mt-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                  Pages · {items.length}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPicker()}
                    className="text-[10px] font-medium text-ink transition-colors hover:opacity-70"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reverseItems();
                      setNotice(null);
                    }}
                    disabled={items.length < 2}
                    className="text-[10px] font-medium text-faint transition-colors hover:text-ink disabled:opacity-40"
                  >
                    Reverse
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAll();
                      setNotice(null);
                    }}
                    className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                {items.map((item, index) => {
                  const isActive = item.id === activeItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      aria-pressed={isActive}
                      aria-label={`Page ${index + 1}: ${item.file.name}`}
                      title={item.file.name}
                      className={`relative h-[58px] w-[46px] shrink-0 overflow-hidden rounded-[6px] border bg-white transition-colors ${
                        isActive
                          ? "border-ink ring-2 ring-ink/10"
                          : "border-line hover:border-[#cbc5b9]"
                      }`}
                    >
                      <img src={item.preview} alt="" className="h-full w-full object-cover" />
                      <span className="absolute left-0.5 top-0.5 grid h-[13px] w-[13px] place-items-center rounded-[3px] bg-white/90 text-[7.5px] font-semibold text-ink">
                        {index + 1}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => openPicker()}
                  aria-label="Add more images"
                  className="grid h-[58px] w-[46px] shrink-0 place-items-center rounded-[6px] border border-dashed border-[#d7d2c8] text-faint transition-colors hover:border-[#b8a992] hover:text-ink"
                >
                  <Plus size={14} aria-hidden />
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} aria-hidden />
              Free · no upload · no watermark
            </p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={items.length === 0}
              className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[150px]")}
            >
              {items.length > 0
                ? `Create PDF · ${items.length} page${items.length === 1 ? "" : "s"}`
                : "Create PDF"}
              <ArrowRightGlyph size={13} />
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <StudioRail label="PDF settings">
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
