"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Scissors } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  ActionRow,
  DownloadAction,
  Field,
  FileRow,
  Note,
  OptionCard,
  PrimaryAction,
  ResultButton,
  SecondaryAction,
  StageBar,
  StudioFrame,
  StudioStage,
  ToolIcon,
  ToolTabs,
  ToolText,
} from "@/components/tool/kit";
import { RailPick } from "@/components/tool/studio/RailControls";
import { PdfLightbox, PdfReader } from "@/components/tool/viewer/PdfReader";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { downloadAllAsZip, downloadBlob } from "@/lib/image/encode";
import { TextRow, ToggleRow } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { PdfPageGrid, usePdfDocument, type PageSize } from "../PdfPages";
import { fileStem, formatBytes, pagesOf, parseRanges, rangeLabel } from "../model";
import { usePdfQueue } from "../usePdfQueue";
import { SplitError, splitPdf, type SplitOutput } from "./split-engine";

type SplitMode = "extract" | "every" | "parity";

const MODES: { id: SplitMode; title: string; detail: string }[] = [
  { id: "extract", title: "Extract pages", detail: "Keep only the pages you pick" },
  { id: "every", title: "Split every N pages", detail: "One file per chunk of N pages" },
  { id: "parity", title: "Odd and even", detail: "Two files, one per side" },
];

const CHUNK_PRESETS = [1, 2, 5, 10];

const VIEWS = [
  { value: "pages", label: "Pages" },
  { value: "read", label: "Read" },
] as const;

const SIZES: { value: PageSize; label: string; title: string }[] = [
  { value: "s", label: "S", title: "Small pages" },
  { value: "m", label: "M", title: "Medium pages" },
  { value: "l", label: "L", title: "Large pages" },
];

function safeName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").trim().slice(0, 90) || "document";
}

function pdfBlob(bytes: Uint8Array) {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function SplitPdfStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
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

  const [mode, setMode] = useState<SplitMode>("extract");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ranges, setRanges] = useState("");
  const [separate, setSeparate] = useState(false);
  const [every, setEvery] = useState("1");
  const [filename, setFilename] = useState("");
  const [keepMetadata, setKeepMetadata] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputs, setOutputs] = useState<SplitOutput[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [view, setView] = useState<"pages" | "read">("pages");
  const [size, setSize] = useState<PageSize>("m");
  const [readPage, setReadPage] = useState<number | null>(null);
  const [openOutput, setOpenOutput] = useState<SplitOutput | null>(null);

  // A new document starts with nothing picked, so the choice is always deliberate.
  useEffect(() => {
    setSelected(new Set());
    setRanges("");
    setOutputs(null);
    setRunError(null);
    setView("pages");
  }, [activeItem?.id]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedPages = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const everyCount = Math.min(500, Math.max(1, Number.parseInt(every, 10) || 1));
  const baseName = safeName(filename.trim() || fileStem(activeItem?.name ?? "document"));

  /** Output files as { name, pages } for the current settings. */
  const groups = useMemo(() => {
    if (pageCount === 0) return [];
    if (mode === "extract") {
      if (selectedPages.length === 0) return [];
      if (separate) {
        return selectedPages.map((page) => ({ name: `${baseName}-page-${page}.pdf`, pages: [page] }));
      }
      return [{ name: `${baseName}-pages-${rangeLabel(selectedPages).replace(/–/g, "-").replace(/[,\s…]+/g, "_")}.pdf`, pages: selectedPages }];
    }
    if (mode === "every") {
      const chunks: { name: string; pages: number[] }[] = [];
      for (let start = 1; start <= pageCount; start += everyCount) {
        const end = Math.min(pageCount, start + everyCount - 1);
        chunks.push({
          name: `${baseName}-part-${chunks.length + 1}.pdf`,
          pages: pagesOf(end - start + 1).map((offset) => start + offset - 1),
        });
      }
      return chunks;
    }
    const all = pagesOf(pageCount);
    return [
      { name: `${baseName}-odd.pdf`, pages: all.filter((page) => page % 2 === 1) },
      { name: `${baseName}-even.pdf`, pages: all.filter((page) => page % 2 === 0) },
    ].filter((group) => group.pages.length > 0);
  }, [mode, pageCount, selectedPages, separate, everyCount, baseName]);

  const groupOfPage = useMemo(() => {
    const map = new Map<number, number>();
    groups.forEach((group, index) => group.pages.forEach((page) => map.set(page, index)));
    return map;
  }, [groups]);

  function touch() {
    setOutputs(null);
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

  function applyRanges(value: string) {
    setRanges(value);
    setSelected(new Set(parseRanges(value, pageCount)));
    touch();
  }

  async function handleSplit() {
    if (!doc.bytes || groups.length === 0) return;
    setBusy(true);
    setProgress(0);
    setRunError(null);
    try {
      const result = await splitPdf(doc.bytes, groups, { keepMetadata }, (done, total) =>
        setProgress(done / total),
      );
      setOutputs(result);
    } catch (error) {
      setRunError(
        error instanceof SplitError ? error.message : "Something went wrong while splitting. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadAll() {
    if (!outputs) return;
    if (outputs.length === 1) {
      downloadBlob(pdfBlob(outputs[0].bytes), outputs[0].name);
      return;
    }
    void downloadAllAsZip(
      outputs.map((output) => ({ blob: pdfBlob(output.bytes), name: output.name })),
      `${baseName}-split.zip`,
    );
  }

  function reset() {
    clear();
    touch();
  }

  const ready = Boolean(doc.pdf) && groups.length > 0;
  const actionLabel =
    mode === "extract"
      ? selectedPages.length === 0
        ? "Pick pages to extract"
        : separate
          ? `Extract ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"} as separate files`
          : `Extract ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"}`
      : `Split into ${groups.length} file${groups.length === 1 ? "" : "s"}`;
  const totalBytes = outputs?.reduce((sum, output) => sum + output.bytes.length, 0) ?? 0;
  const error = queueError ?? doc.error ?? runError;

  return (
    <StudioFrame id="split-pdf" label="Split PDF studio">
      <StudioStage flush>
        {!activeItem ? (
          <PdfDropzone
            title="Drop a PDF to split"
            description="Pick pages on the thumbnails, type exact ranges, or break the whole document into even parts."
            buttonLabel="Choose a PDF"
            limits={`PDF · up to ${maxSizeMB} MB`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>Extract pages</DropChip>
                <DropChip>Split every N pages</DropChip>
                <DropChip>Odd / even</DropChip>
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

            {outputs && outputs.length > 1 ? (
              <ul className="studio-main max-h-[156px] shrink-0 overflow-y-auto border-b border-line bg-panel">
                {outputs.map((output, index) => (
                  <li
                    key={output.name}
                    className="flex h-[52px] items-center gap-3 border-b border-line pl-3.5 pr-2 last:border-b-0"
                  >
                    <span className="fb-num text-[13px] text-faint">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{output.name}</span>
                    <span className="fb-num shrink-0 text-[13px] text-muted max-sm:hidden">
                      {output.pages.length} {output.pages.length === 1 ? "page" : "pages"} · {formatBytes(output.bytes.length)}
                    </span>
                    <span className="flex [&>*]:-ml-px">
                      <ToolIcon label={`Read ${output.name}`} slot="viewer-open" onClick={() => setOpenOutput(output)}>
                        <Eye size={15} aria-hidden />
                      </ToolIcon>
                      <ToolIcon
                        label={`Download ${output.name}`}
                        onClick={() => downloadBlob(pdfBlob(output.bytes), output.name)}
                      >
                        <Download size={15} aria-hidden />
                      </ToolIcon>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <StageBar
              end={
                view === "pages" ? (
                  <>
                    {mode === "extract" && pageCount > 0 ? (
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
                {mode === "extract"
                  ? selectedPages.length === 0
                    ? "Click pages to pick them"
                    : `${selectedPages.length} of ${pageCount} picked`
                  : `${pageCount} pages → ${groups.length} files`}
              </span>
            </StageBar>

            {view === "read" && doc.pdf ? (
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
                    selected={mode === "extract" ? selected : undefined}
                    onToggle={mode === "extract" && !busy ? togglePage : undefined}
                    onRange={mode === "extract" && !busy ? pickRange : undefined}
                    onOpen={setReadPage}
                    tagOf={
                      mode === "extract"
                        ? undefined
                        : (page) => {
                            const index = groupOfPage.get(page);
                            if (index === undefined) return null;
                            return {
                              label: mode === "parity" ? (page % 2 === 1 ? "Odd" : "Even") : `File ${index + 1}`,
                              tone: index,
                            };
                          }
                    }
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

        {/* Drives the finished / problem sounds */}
        <span aria-hidden className="hidden" data-success={outputs ? `split-${outputs.length}` : undefined} data-error={error ?? undefined} />
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
        <PdfLightbox
          open={openOutput !== null}
          onClose={() => setOpenOutput(null)}
          bytes={openOutput?.bytes ?? null}
          title={openOutput?.name ?? "PDF"}
          meta={openOutput ? `${openOutput.pages.length} pages · ${formatBytes(openOutput.bytes.length)}` : undefined}
          actions={
            openOutput ? (
              <ResultButton
                loud
                onClick={() => downloadBlob(pdfBlob(openOutput.bytes), openOutput.name)}
                icon={<Download size={16} aria-hidden />}
              >
                Download
              </ResultButton>
            ) : null
          }
        />
      </StudioStage>

      <StudioRail
        label="Split settings"
        action={
          outputs ? (
            <>
              <DownloadAction
                label={outputs.length === 1 ? "Download PDF" : `Download ${outputs.length} PDFs (ZIP)`}
                onClick={downloadAll}
                hint={`${outputs.length === 1 ? `${outputs[0].name} · ` : ""}${formatBytes(totalBytes)}`}
              />
              <ActionRow>
                {outputs.length === 1 ? (
                  <SecondaryAction onClick={() => setOpenOutput(outputs[0])} icon={<Eye size={14} aria-hidden />}>
                    Read it
                  </SecondaryAction>
                ) : null}
                <SecondaryAction onClick={touch} icon={<Scissors size={13} aria-hidden />}>
                  Split again
                </SecondaryAction>
              </ActionRow>
            </>
          ) : (
            <PrimaryAction
              label={activeItem ? actionLabel : "Split PDF"}
              busyLabel="Splitting…"
              icon={<Scissors size={16} aria-hidden />}
              busy={busy}
              progress={progress}
              disabled={!ready}
              onClick={handleSplit}
              hint={activeItem ? "Free · runs in your browser · no watermark" : "Add a PDF to get started"}
            />
          )
        }
      >
        <div className="space-y-7">
          <Field label="Split mode">
            <div className="space-y-2">
              {MODES.map((option) => (
                <OptionCard
                  key={option.id}
                  active={mode === option.id}
                  title={option.title}
                  detail={option.detail}
                  onClick={() => {
                    setMode(option.id);
                    touch();
                  }}
                />
              ))}
            </div>
          </Field>

          {mode === "extract" && (
            <Field label="Pages" hint={pageCount ? `of ${pageCount}` : undefined}>
              <div className="space-y-4">
                <TextRow
                  label="Page ranges"
                  value={ranges}
                  onChange={applyRanges}
                  placeholder="1-3, 5, 8-10"
                  hint="Or click the thumbnails. Commas and dashes work."
                />
                <ToggleRow
                  label="One file per page"
                  description="Save every picked page as its own PDF."
                  checked={separate}
                  onChange={(checked) => {
                    setSeparate(checked);
                    touch();
                  }}
                />
              </div>
            </Field>
          )}

          {mode === "every" && (
            <Field label="Pages per file" hint={pageCount ? `${groups.length} files` : undefined}>
              <RailPick
                label="Pages per file"
                columns={4}
                value={everyCount}
                options={CHUNK_PRESETS.map((preset) => ({ value: preset, label: preset }))}
                onChange={(preset) => {
                  setEvery(String(preset));
                  touch();
                }}
              />
              <div className="mt-3">
                <TextRow
                  label="Custom"
                  value={every}
                  inputMode="numeric"
                  onChange={(value) => {
                    setEvery(value.replace(/[^\d]/g, ""));
                    touch();
                  }}
                  placeholder="2"
                />
              </div>
            </Field>
          )}

          {mode === "parity" && (
            <Note>
              Odd pages go into one file and even pages into another. Handy for separating the two sides of a
              double-sided scan.
            </Note>
          )}

          <Field label="Output">
            <div className="space-y-4">
              <TextRow
                label="File name"
                value={filename}
                onChange={(value) => {
                  setFilename(value);
                  touch();
                }}
                placeholder={fileStem(activeItem?.name ?? "document")}
                hint={groups[0] ? `First file: ${groups[0].name}` : "A suffix is added to each file"}
              />
              <ToggleRow
                label="Keep document details"
                description="Carry the title, author and dates into each file."
                checked={keepMetadata}
                onChange={(checked) => {
                  setKeepMetadata(checked);
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
