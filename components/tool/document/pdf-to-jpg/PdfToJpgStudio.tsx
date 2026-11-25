"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageDown, Loader2, Pencil } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import {
  ActionRow,
  Chip,
  DownloadAction,
  Field,
  FileRow,
  Note,
  PrimaryAction,
  ResultCard,
  STAGE_LABEL,
  SecondaryAction,
  Segmented,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { downloadAllAsZip, downloadBlob } from "@/lib/image/encode";
import { TextRow, ToggleRow } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { PdfPageGrid, usePdfDocument } from "../PdfPages";
import { fileStem, formatBytes, pagesOf, parseRanges, rangeLabel } from "../model";
import { usePdfQueue } from "../usePdfQueue";
import {
  outputPixels,
  renderPagesToImages,
  type PageImage,
  type PageImageFormat,
} from "./render-engine";

const FORMATS: { value: PageImageFormat; label: string; title: string }[] = [
  { value: "JPG", label: "JPG", title: "Works everywhere" },
  { value: "PNG", label: "PNG", title: "Lossless, sharp text" },
  { value: "WebP", label: "WebP", title: "Smallest files" },
];

const RESOLUTIONS = [
  { value: "72", label: "Screen", detail: "72 DPI" },
  { value: "150", label: "Standard", detail: "150 DPI" },
  { value: "300", label: "Print", detail: "300 DPI" },
] as const;

const BACKGROUNDS: { value: string; label: string }[] = [
  { value: "#ffffff", label: "White" },
  { value: "#f7f1e3", label: "Cream" },
  { value: "transparent", label: "Clear" },
];

function safeName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").trim().slice(0, 90) || "pages";
}

export function PdfToJpgStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error: queueError,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    clear,
  } = usePdfQueue({ maxFiles: 1, maxSizeMB });

  const doc = usePdfDocument(activeItem?.file ?? null);
  const pageCount = doc.pageCount;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ranges, setRanges] = useState("");
  const [format, setFormat] = useState<PageImageFormat>("JPG");
  const [quality, setQuality] = useState(90);
  const [dpi, setDpi] = useState("150");
  const [background, setBackground] = useState<string>("#ffffff");
  const [trimMargins, setTrimMargins] = useState(false);
  const [filename, setFilename] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [images, setImages] = useState<PageImage[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const imagesRef = useRef<PageImage[] | null>(null);
  const runRef = useRef(0);

  function releaseImages() {
    imagesRef.current?.forEach((image) => URL.revokeObjectURL(image.url));
    imagesRef.current = null;
  }

  useEffect(() => releaseImages, []);

  // Every page is exported by default: that is the common case for this tool.
  useEffect(() => {
    runRef.current += 1;
    releaseImages();
    setImages(null);
    setRunError(null);
    const pages = pagesOf(pageCount);
    setSelected(new Set(pages));
    setRanges(pages.length > 0 ? `1-${pageCount}` : "");
  }, [activeItem?.id, pageCount]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedPages = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const lossy = format !== "PNG";
  const baseName = safeName(filename.trim() || fileStem(activeItem?.name ?? "pages"));
  const pixels = doc.firstPage
    ? outputPixels(doc.firstPage.width, doc.firstPage.height, Number(dpi))
    : null;

  function touch() {
    runRef.current += 1;
    releaseImages();
    setImages(null);
    setRunError(null);
  }

  function setPages(pages: number[]) {
    selectedRef.current = new Set(pages);
    setSelected(new Set(pages));
    setRanges(pages.length > 0 ? rangeLabel(pages).replace(/–/g, "-") : "");
    touch();
  }

  function togglePage(page: number) {
    // Read through the ref so rapid clicks never work from a stale selection.
    const next = new Set(selectedRef.current);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    setPages([...next].sort((a, b) => a - b));
  }

  async function handleConvert() {
    if (!doc.pdf || selectedPages.length === 0) return;
    const run = (runRef.current += 1);
    setBusy(true);
    setProgress(0);
    setRunError(null);
    try {
      const result = await renderPagesToImages(
        doc.pdf,
        selectedPages,
        { format, quality, dpi: Number(dpi), background, trimMargins, baseName },
        (done, total) => setProgress(done / total),
        () => runRef.current !== run,
      );
      if (runRef.current !== run) {
        result.forEach((image) => URL.revokeObjectURL(image.url));
        return;
      }
      imagesRef.current = result;
      setImages(result);
    } catch {
      setRunError("A page could not be rendered. Try a lower resolution or fewer pages.");
    } finally {
      setBusy(false);
    }
  }

  function downloadAll() {
    if (!images || images.length === 0) return;
    if (images.length === 1) {
      downloadBlob(images[0].blob, images[0].name);
      return;
    }
    void downloadAllAsZip(
      images.map((image) => ({ blob: image.blob, name: image.name })),
      `${baseName}-${format.toLowerCase()}.zip`,
    );
  }

  function reset() {
    touch();
    clear();
  }

  const totalBytes = images?.reduce((sum, image) => sum + image.blob.size, 0) ?? 0;
  const error = queueError ?? doc.error ?? runError;
  const count = selectedPages.length;

  return (
    <StudioFrame id="pdf-to-jpg" label="PDF to image studio">
      <StudioStage>
        {!activeItem ? (
          <PdfDropzone
            title="Drop a PDF to turn into images"
            description="Every page becomes a JPG, PNG or WebP. Pick the pages, choose a resolution and download."
            buttonLabel="Choose a PDF"
            limits={`PDF · up to ${maxSizeMB} MB`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>JPG · PNG · WebP</DropChip>
                <DropChip>Up to 300 DPI</DropChip>
                <DropChip>ZIP download</DropChip>
              </>
            }
          />
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col gap-3"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {images ? (
              <ResultCard
                title={`${images.length} ${format} image${images.length === 1 ? "" : "s"} ready`}
                meta={`${formatBytes(totalBytes)} · ${images[0]?.width} × ${images[0]?.height} px`}
              >
                <button
                  type="button"
                  onClick={downloadAll}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
                >
                  <Download size={15} aria-hidden />
                  {images.length === 1 ? "Download" : "Download ZIP"}
                </button>
              </ResultCard>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <span className={STAGE_LABEL}>{images ? "Your images" : "Click pages to include or skip them"}</span>
              <div className="flex items-center gap-1.5">
                {!images && pageCount > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPages(pagesOf(pageCount))}
                      className="h-7 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setPages([])}
                      className="h-7 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
                <Chip>
                  {images ? `${images.length} files` : `${count} of ${pageCount} pages`}
                </Chip>
              </div>
            </div>

            <div className="studio-main min-h-[260px] flex-1 overflow-y-auto rounded-[16px] border border-line bg-[#f3f1ec] p-3 sm:p-4 lg:min-h-0">
              {images ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {images.map((image) => (
                    <li key={image.name} className="group animate-kit-rise">
                      <div className="checkerboard relative overflow-hidden rounded-[8px] border border-[#dedad2] shadow-[0_6px_16px_-10px_rgba(15,15,16,0.25)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={`Page ${image.page}`} className="block h-auto w-full" />
                        <button
                          type="button"
                          onClick={() => downloadBlob(image.blob, image.name)}
                          aria-label={`Download ${image.name}`}
                          className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-ink text-white opacity-90 shadow-pop transition hover:scale-105 hover:opacity-100"
                        >
                          <Download size={15} aria-hidden />
                        </button>
                      </div>
                      <p className="mt-1.5 truncate text-[12px] font-medium text-ink">{image.name}</p>
                      <p className="text-[12px] tabular-nums text-faint">{formatBytes(image.blob.size)}</p>
                    </li>
                  ))}
                </ul>
              ) : doc.pdf ? (
                <PdfPageGrid
                  pdf={doc.pdf}
                  pageCount={pageCount}
                  selected={selected}
                  onToggle={busy ? undefined : togglePage}
                />
              ) : doc.loading ? (
                <div className="grid h-full min-h-[220px] place-items-center text-[13px] text-muted">
                  <span className="flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Reading pages…
                  </span>
                </div>
              ) : null}
            </div>

            <FileRow
              icon={<FileText size={16} aria-hidden />}
              name={activeItem.name}
              meta={`${formatBytes(activeItem.size)}${pageCount ? ` · ${pageCount} pages` : ""}`}
              onReplace={() => openPicker(activeItem.id)}
              onRemove={reset}
            />
          </div>
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

        {error ? (
          <Note tone="error" className="mt-3 shrink-0">
            {error}
          </Note>
        ) : null}
      </StudioStage>

      <StudioRail
        label="Image settings"
        action={
          images ? (
            <>
              <DownloadAction
                label={images.length === 1 ? `Download ${format}` : `Download ${images.length} images (ZIP)`}
                onClick={downloadAll}
                hint={`${formatBytes(totalBytes)} · no watermark`}
              />
              <ActionRow>
                <SecondaryAction onClick={touch} icon={<Pencil size={13} aria-hidden />}>
                  Change settings
                </SecondaryAction>
                <StartOverAction onClick={reset} label="New PDF" />
              </ActionRow>
            </>
          ) : (
            <PrimaryAction
              label={
                !activeItem
                  ? `Convert to ${format}`
                  : count === 0
                    ? "Pick pages to convert"
                    : `Convert ${count} page${count === 1 ? "" : "s"} to ${format}`
              }
              busyLabel="Rendering…"
              icon={<ImageDown size={16} aria-hidden />}
              busy={busy}
              progress={progress}
              disabled={!doc.pdf || count === 0}
              onClick={handleConvert}
              hint={activeItem ? "Free · runs in your browser · no watermark" : "Add a PDF to get started"}
            />
          )
        }
      >
        <div className="space-y-6">
          <Field label="Image format" hint={FORMATS.find((entry) => entry.value === format)?.title}>
            <Segmented
              label="Image format"
              options={FORMATS}
              value={format}
              onChange={(value) => {
                setFormat(value);
                if (value === "JPG" && background === "transparent") setBackground("#ffffff");
                touch();
              }}
            />
          </Field>

          <Field label="Resolution" hint={pixels ? `${pixels.width} × ${pixels.height} px` : undefined}>
            <div className="grid grid-cols-3 gap-1.5">
              {RESOLUTIONS.map((option) => {
                const active = dpi === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDpi(option.value);
                      touch();
                    }}
                    className={`rounded-[10px] border px-1 py-2.5 text-center transition-colors ${
                      active
                        ? "border-ink bg-white shadow-[inset_0_0_0_1px_#0f0f10]"
                        : "border-line bg-white hover:border-[#cfc9bd]"
                    }`}
                  >
                    <span className="block text-[13px] font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-[12px] text-faint">{option.detail}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Quality" hint={lossy ? `${quality}%` : "Lossless"}>
            <RailSlider
              label="Image quality"
              value={lossy ? quality : 100}
              min={40}
              max={100}
              disabled={!lossy}
              onValueChange={(next) => {
                setQuality(next);
                touch();
              }}
              className="mt-1"
            />
            <div className="mt-1 flex justify-between text-[12px] text-faint">
              <span>Smaller file</span>
              <span>More detail</span>
            </div>
          </Field>

          <Field label="Pages" hint={pageCount ? `${count} of ${pageCount}` : undefined}>
            <TextRow
              label="Page ranges"
              value={ranges}
              onChange={(value) => {
                setRanges(value);
                setSelected(new Set(parseRanges(value, pageCount)));
                touch();
              }}
              placeholder="1-3, 5, 8-10"
              hint="Or click the thumbnails."
            />
          </Field>

          <Field label="Page background">
            <Segmented
              label="Page background"
              options={BACKGROUNDS.filter((option) => option.value !== "transparent" || format !== "JPG")}
              value={background}
              onChange={(value) => {
                setBackground(value);
                touch();
              }}
            />
          </Field>

          <Field label="Output">
            <div className="space-y-3.5">
              <TextRow
                label="File name"
                value={filename}
                onChange={(value) => {
                  setFilename(value);
                  touch();
                }}
                placeholder={fileStem(activeItem?.name ?? "pages")}
                hint={`Each image is numbered: ${baseName}-1.${format.toLowerCase()}`}
              />
              <ToggleRow
                label="Trim empty margins"
                description="Crop the blank border around each page."
                checked={trimMargins}
                onChange={(checked) => {
                  setTrimMargins(checked);
                  touch();
                }}
              />
            </div>
          </Field>
        </div>
      </StudioRail>
    </StudioFrame>
  );
}
