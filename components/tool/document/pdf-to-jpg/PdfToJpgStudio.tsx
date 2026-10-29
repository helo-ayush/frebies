"use client";

import { useEffect, useState } from "react";
import {
  Check,
  FileImage,
  ImageDown,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  PreviewNote,
  RailSection,
  SelectRow,
  StudioFooter,
  StudioHeader,
  TextRow,
  ToggleRow,
} from "../DocumentKit";
import { PageGrid } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
import { formatBytes, fileStem, pagesOf, rangeLabel } from "../model";
import { usePdfQueue } from "../usePdfQueue";

const FORMATS = [
  { id: "JPG", hint: "Universal", factor: 0.9 },
  { id: "PNG", hint: "Lossless", factor: 1.5 },
  { id: "WebP", hint: "Smallest", factor: 0.68 },
] as const;

type Format = (typeof FORMATS)[number]["id"];

const RESOLUTIONS = ["72 DPI", "150 DPI", "300 DPI"] as const;
const BACKGROUNDS = ["White", "Cream", "Transparent"] as const;

export function PdfToJpgStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error,
    reading,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    clear,
  } = usePdfQueue({ maxFiles: 1, maxSizeMB });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<Format>("JPG");
  const [quality, setQuality] = useState(88);
  const [resolution, setResolution] = useState<string>("150 DPI");
  const [background, setBackground] = useState<string>("White");
  const [trimMargins, setTrimMargins] = useState(false);
  const [filename, setFilename] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const pageCount = activeItem?.pages ?? 0;
  const selectedPages = [...selected].sort((a, b) => a - b);

  useEffect(() => {
    if (!activeItem) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pagesOf(activeItem.pages)));
  }, [activeItem]);

  const lossy = format !== "PNG";
  const dpi = Number.parseInt(resolution, 10);
  const dpiFactor = Number.isFinite(dpi) ? (dpi / 150) ** 2 : 1;
  const pages = Math.max(1, pageCount);
  const perPage = (activeItem?.size ?? 0) / pages;
  const formatMeta = FORMATS.find((entry) => entry.id === format) ?? FORMATS[0];
  const qualityFactor = lossy ? 0.55 + 0.45 * (quality / 100) : 1;
  const estimate = Math.round(perPage * formatMeta.factor * qualityFactor * dpiFactor * selectedPages.length);
  const baseName = filename.trim() || fileStem(activeItem?.name ?? "pages");

  function patch() {
    setNotice(null);
  }

  function togglePage(page: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
    patch();
  }

  function handleConvert() {
    setNotice(
      `${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"} will become ${format} images at ${resolution}, named ${baseName}-1.${format.toLowerCase()}. Image rendering is connected in the next build step, and nothing leaves this device.`,
    );
  }

  return (
    <section
      id="pdf-to-jpg"
      aria-label="PDF to image studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/pdf-to-jpg"
        title="Page studio"
        subtitle="Turn PDF pages into clean image files."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <ImageDown size={10} aria-hidden />
              {activeItem ? `${selectedPages.length} of ${pageCount} pages` : "No document"}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
              Interface preview
            </span>
          </>
        }
      />

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <PdfDropzone
              title="Drop a PDF to make images"
              description="Every page can become a JPG, PNG or WebP. Pick the pages, set the resolution and export."
              buttonLabel="Choose a PDF"
              limits={`PDF · up to ${maxSizeMB} MB`}
              note="Files are read locally. Nothing is uploaded."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <ImageDown size={9} aria-hidden />
                    JPG, PNG, WebP
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <FileImage size={9} aria-hidden />
                    Up to 300 DPI
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <ShieldCheck size={9} aria-hidden />
                    Stays on device
                  </span>
                </>
              }
            />
          ) : (
            <>
              <div className="flex min-h-[250px] flex-1 flex-col rounded-[16px] border border-line bg-[#f6f4f0] p-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                    Pages to export
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(new Set(pagesOf(pageCount)));
                        patch();
                      }}
                      className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(new Set());
                        patch();
                      }}
                      className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                    >
                      None
                    </button>
                    <span className="text-[10px] tabular-nums text-faint">
                      {selectedPages.length} of {pageCount}
                    </span>
                  </div>
                </div>

                <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-[10px] border border-line bg-[#f1efeb] p-2">
                  <PageGrid
                    count={pageCount}
                    selected={selected}
                    onToggle={togglePage}
                    columns="grid-cols-4 sm:grid-cols-6"
                    maxHeightClass="max-h-full"
                  />
                  {reading && pageCount === 1 ? (
                    <p className="mt-2 text-[10px] text-faint">Reading page count…</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-2.5">
                <div className="flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f3f0f7] text-[#6b6384]">
                    <FileImage size={15} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">{activeItem.name}</p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(activeItem.size)} · {pageCount} pages
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPicker(activeItem.id)}
                    className="h-7 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clear();
                      setNotice(null);
                    }}
                    aria-label={`Remove ${activeItem.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={13} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="mt-3 shrink-0 rounded-[13px] border border-line bg-white p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                      Estimated output
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                        ≈ {formatBytes(estimate)}
                      </span>
                      <span className="text-[10px] text-faint">
                        {selectedPages.length} × {format}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-faint">
                      {baseName}-1.{format.toLowerCase()}
                      {selectedPages.length > 1 ? ", …" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {resolution}
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {background}
                    </span>
                  </div>
                </div>
                {selectedPages.length > 0 && (
                  <p className="mt-2 border-t border-line-soft pt-2 text-[10px] tabular-nums text-faint">
                    {rangeLabel(selectedPages)}
                  </p>
                )}
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            tabIndex={-1}
            aria-label="Choose a PDF"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <StudioFooter
            label={`Convert ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"}`}
            hint={
              <>
                <ShieldCheck size={12} aria-hidden />
                Free · no upload · no watermark
              </>
            }
            disabled={!activeItem || selectedPages.length === 0}
            onAction={handleConvert}
          >
            <span className="hidden items-center gap-1 text-[10.5px] text-faint sm:flex">
              <Check size={10} aria-hidden />
              {format} · {resolution}
            </span>
          </StudioFooter>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <StudioRail label="Image settings">
          <div className="space-y-5">
            <RailSection title="Image format" hint="Per page">
              <div className="grid grid-cols-3 gap-1.5">
                {FORMATS.map((option) => {
                  const active = format === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFormat(option.id);
                        patch();
                      }}
                      className={`rounded-[9px] border px-1 py-2.5 text-center transition-colors ${
                        active
                          ? "border-ink bg-rail text-ink"
                          : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                      }`}
                    >
                      <span className="block text-[12px] font-medium">{option.id}</span>
                      <span className="mt-0.5 block text-[9px] text-faint">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
            </RailSection>

            <RailSection title="Quality" hint={lossy ? `${quality}%` : "Lossless"} className="border-t border-line-soft pt-4">
              <input
                type="range"
                min={40}
                max={100}
                value={lossy ? quality : 100}
                disabled={!lossy}
                onChange={(event) => {
                  setQuality(Number(event.target.value));
                  patch();
                }}
                aria-label="Image quality"
                className="h-1.5 w-full cursor-pointer accent-[#171717] disabled:cursor-not-allowed disabled:opacity-35"
              />
              <div className="flex justify-between text-[10px] text-faint">
                <span>Smaller file</span>
                <span>Better detail</span>
              </div>
              {!lossy && (
                <p className="text-[10px] leading-relaxed text-faint">
                  PNG keeps every pixel; quality does not apply.
                </p>
              )}
            </RailSection>

            <RailSection title="Rendering" hint="Resolution" className="border-t border-line-soft pt-4">
              <SelectRow
                label="Resolution"
                options={[...RESOLUTIONS]}
                value={resolution}
                onChange={(value) => {
                  setResolution(value);
                  patch();
                }}
              />
              <SelectRow
                label="Page background"
                options={[...BACKGROUNDS]}
                value={background}
                onChange={(value) => {
                  setBackground(value);
                  patch();
                }}
              />
            </RailSection>

            <RailSection title="Naming" hint="Files" className="border-t border-line-soft pt-4">
              <TextRow
                label="File name"
                value={filename}
                onChange={(value) => {
                  setFilename(value);
                  patch();
                }}
                placeholder={fileStem(activeItem?.name ?? "pages")}
                hint="Each page gets a number suffix"
              />
              <ToggleRow
                label="Trim white margins"
                description="Crop uniform page borders before rendering."
                checked={trimMargins}
                onChange={(checked) => {
                  setTrimMargins(checked);
                  patch();
                }}
              />
            </RailSection>

            <PreviewNote>
              Rendering runs entirely on your device once the PDF engine is connected.
              The size estimate is based on the pages you selected.
            </PreviewNote>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}
