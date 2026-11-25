"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageDown, Loader2, Pencil } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { RailCards, RailEnds } from "@/components/tool/studio/RailControls";
import {
  ActionRow,
  DownloadAction,
  Field,
  FileRow,
  Note,
  PrimaryAction,
  QuickPick,
  ResultButton,
  ResultCard,
  SecondaryAction,
  Segmented,
  StageBar,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolTabs,
  ToolText,
} from "@/components/tool/kit";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { ImageLightbox } from "@/components/tool/viewer/Lightbox";
import { PdfLightbox, PdfReader } from "@/components/tool/viewer/PdfReader";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { downloadAllAsZip, downloadBlob } from "@/lib/image/encode";
import { TextRow, ToggleRow } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { PdfPageGrid, usePdfDocument, type PageSize } from "../PdfPages";
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

const VIEWS = [
  { value: "pages", label: "Pages" },
  { value: "read", label: "Read" },
] as const;

const SIZES: { value: PageSize; label: string; title: string }[] = [
  { value: "s", label: "S", title: "Small pages" },
  { value: "m", label: "M", title: "Medium pages" },
  { value: "l", label: "L", title: "Large pages" },
];

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
  const [view, setView] = useState<"pages" | "read">("pages");
  const [size, setSize] = useState<PageSize>("m");
  const [readPage, setReadPage] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
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

  function pickRange(from: number, to: number) {
    const next = new Set(selectedRef.current);
    for (let page = from; page <= to; page += 1) next.add(page);
    setPages([...next].sort((a, b) => a - b));
  }

  function chooseFormat(value: PageImageFormat) {
    setFormat(value);
    if (value === "JPG" && background === "transparent") setBackground("#ffffff");
    touch();
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
      <StudioStage flush>
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
            className="relative flex min-h-0 flex-1 flex-col"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <FileRow
              flush
              className="border-b border-line"
              icon={<FileText size={17} aria-hidden />}
              name={activeItem.name}
              meta={`${formatBytes(activeItem.size)}${pageCount ? ` · ${pageCount} pages` : ""}`}
              onReplace={() => openPicker(activeItem.id)}
              onRemove={reset}
            />

            {images ? (
              <ResultCard
                title={`${images.length} ${format} image${images.length === 1 ? "" : "s"}`}
                meta={`${formatBytes(totalBytes)} · ${images[0]?.width} × ${images[0]?.height} px`}
              >
                <ResultButton loud onClick={downloadAll} icon={<Download size={16} aria-hidden />}>
                  {images.length === 1 ? "Download" : "Download ZIP"}
                </ResultButton>
              </ResultCard>
            ) : (
              <StageBar
                end={
                  view === "pages" ? (
                    <>
                      {pageCount > 0 ? (
                        <>
                          <ToolText onClick={() => setPages(pagesOf(pageCount))}>All</ToolText>
                          <ToolText onClick={() => setPages([])}>None</ToolText>
                        </>
                      ) : null}
                      <span className="max-sm:hidden">
                        <ToolTabs label="Page size" options={SIZES} value={size} onChange={setSize} />
                      </span>
                    </>
                  ) : null
                }
              >
                <ToolTabs label="Stage view" options={VIEWS} value={view} onChange={setView} />
                <span className="fb-num pl-1 text-[13.5px] text-muted">
                  {count} of {pageCount} pages
                </span>
              </StageBar>
            )}

            {images ? (
              <div className="studio-main min-h-[280px] flex-1 overflow-y-auto lg:min-h-0">
                <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 xl:grid-cols-4">
                  {images.map((image, index) => (
                    <li key={image.name} className="group flex flex-col border border-line bg-panel hover:border-ink">
                      <button
                        type="button"
                        onClick={() => setShown(index)}
                        aria-label={`Open ${image.name}`}
                        data-slot="viewer-open"
                        className="fb-checker relative block flex-1 overflow-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={`Page ${image.page}`} className="block h-auto w-full" />
                        <span className="fb-num absolute bottom-0 left-0 bg-ink px-2 py-[5px] text-[12px] font-semibold leading-none text-white">
                          {image.page}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 border-t border-line pl-3">
                        <span className="min-w-0 flex-1 py-2">
                          <span className="block truncate text-[13.5px] font-semibold">{image.name}</span>
                          <span className="fb-num block text-[12.5px] text-muted">{formatBytes(image.blob.size)}</span>
                        </span>
                        <ToolIcon
                          label={`Download ${image.name}`}
                          onClick={() => downloadBlob(image.blob, image.name)}
                          className="!h-full !min-h-[52px] !w-12 !border-y-0 !border-r-0"
                        >
                          <Download size={16} aria-hidden />
                        </ToolIcon>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : view === "read" && doc.pdf ? (
              <PdfReader
                pdf={doc.pdf}
                pageCount={pageCount}
                firstPage={doc.firstPage}
                title={activeItem.name}
                className="max-lg:min-h-[60svh]"
              />
            ) : (
              <div className="studio-main min-h-[280px] flex-1 overflow-y-auto p-4 lg:min-h-0">
                {doc.pdf ? (
                  <PdfPageGrid
                    pdf={doc.pdf}
                    pageCount={pageCount}
                    size={size}
                    selected={selected}
                    onToggle={busy ? undefined : togglePage}
                    onRange={busy ? undefined : pickRange}
                    onOpen={setReadPage}
                  />
                ) : doc.loading ? (
                  <div className="grid h-full min-h-[220px] place-items-center text-[14.5px] text-muted">
                    <span className="flex items-center gap-2.5">
                      <Loader2 size={17} className="animate-spin" aria-hidden />
                      Reading pages…
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {dragging ? <DropOver label="Drop to replace" /> : null}
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

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}

        <PdfLightbox
          open={readPage !== null && Boolean(doc.pdf)}
          onClose={() => setReadPage(null)}
          pdf={readPage !== null ? doc.pdf : null}
          pageCount={pageCount}
          firstPage={doc.firstPage}
          page={readPage ?? 1}
          title={activeItem?.name ?? "PDF"}
          meta={pageCount ? `${pageCount} pages` : undefined}
        />
        <ImageLightbox
          images={(images ?? []).map((image) => ({
            id: image.name,
            name: image.name,
            src: image.url,
            width: image.width,
            height: image.height,
            note: formatBytes(image.blob.size),
          }))}
          index={images ? shown : null}
          onIndex={setShown}
          onClose={() => setShown(null)}
          actions={(image) => {
            const source = images?.find((entry) => entry.name === image.id);
            return source ? (
              <ResultButton
                loud
                onClick={() => downloadBlob(source.blob, source.name)}
                icon={<Download size={16} aria-hidden />}
              >
                Download
              </ResultButton>
            ) : null;
          }}
        />
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
                  Adjust
                </SecondaryAction>
                <StartOverAction onClick={reset} label="New PDF" />
              </ActionRow>
            </>
          ) : (
            <>
            <QuickPick
              label="Image format"
              value={format}
              options={FORMATS.map((entry) => ({ value: entry.value, label: entry.label }))}
              onChange={chooseFormat}
            />
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
            </>
          )
        }
      >
        <div className="space-y-7">
          <Field label="Image format" hint={FORMATS.find((entry) => entry.value === format)?.title}>
            <Segmented
              label="Image format"
              options={FORMATS}
              value={format}
              onChange={chooseFormat}
            />
          </Field>

          <Field label="Resolution" hint={pixels ? `${pixels.width} × ${pixels.height} px` : undefined}>
            <RailCards
              label="Resolution"
              columns={3}
              value={dpi}
              options={RESOLUTIONS.map((option) => ({
                value: option.value as string,
                label: option.label,
                note: option.detail,
              }))}
              onChange={(value) => {
                setDpi(value);
                touch();
              }}
            />
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
              className=""
            />
            <RailEnds left="Smaller file" right="More detail" />
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
            <div className="space-y-4">
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
