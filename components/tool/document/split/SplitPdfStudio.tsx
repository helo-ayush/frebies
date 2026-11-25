"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Scissors } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  ActionRow,
  Chip,
  DownloadAction,
  Field,
  FileRow,
  Note,
  OptionCard,
  PrimaryAction,
  ResultCard,
  STAGE_LABEL,
  SecondaryAction,
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
import { SplitError, splitPdf, type SplitOutput } from "./split-engine";

type SplitMode = "extract" | "every" | "parity";

const MODES: { id: SplitMode; title: string; detail: string }[] = [
  { id: "extract", title: "Extract pages", detail: "Keep only the pages you pick" },
  { id: "every", title: "Split every N pages", detail: "One file per chunk of N pages" },
  { id: "parity", title: "Odd and even", detail: "Two files, one per side" },
];

const CHUNK_PRESETS = [1, 2, 5, 10];

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

  // A new document starts with nothing picked, so the choice is always deliberate.
  useEffect(() => {
    setSelected(new Set());
    setRanges("");
    setOutputs(null);
    setRunError(null);
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
      <StudioStage>
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
            className="flex min-h-0 flex-1 flex-col gap-3"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {outputs ? (
              <ResultCard
                title={
                  outputs.length === 1 ? `${outputs[0].name} is ready` : `${outputs.length} PDFs are ready`
                }
                meta={`${formatBytes(totalBytes)} · made on your device`}
              >
                <button
                  type="button"
                  onClick={downloadAll}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
                >
                  <Download size={15} aria-hidden />
                  {outputs.length === 1 ? "Download" : "Download ZIP"}
                </button>
              </ResultCard>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <span className={STAGE_LABEL}>
                {mode === "extract" ? "Click pages to pick them" : "How the pages will be split"}
              </span>
              <div className="flex items-center gap-1.5">
                {mode === "extract" && pageCount > 0 ? (
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
                  {mode === "extract"
                    ? `${selectedPages.length} of ${pageCount} pages`
                    : `${pageCount} pages → ${groups.length} files`}
                </Chip>
              </div>
            </div>

            <div className="studio-main min-h-[260px] flex-1 overflow-y-auto rounded-[16px] border border-line bg-[#f3f1ec] p-3 sm:p-4 lg:min-h-0">
              {doc.pdf ? (
                <PdfPageGrid
                  pdf={doc.pdf}
                  pageCount={pageCount}
                  selected={mode === "extract" ? selected : undefined}
                  onToggle={mode === "extract" && !busy ? togglePage : undefined}
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
                <div className="grid h-full min-h-[220px] place-items-center text-[13px] text-muted">
                  <span className="flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Reading pages…
                  </span>
                </div>
              ) : null}
            </div>

            {outputs && outputs.length > 1 ? (
              <ul className="studio-main max-h-[168px] shrink-0 space-y-1.5 overflow-y-auto">
                {outputs.map((output) => (
                  <li
                    key={output.name}
                    className="flex items-center gap-2.5 rounded-[12px] border border-line bg-white px-3 py-2"
                  >
                    <FileText size={15} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{output.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-faint">
                      {output.pages.length} {output.pages.length === 1 ? "page" : "pages"} · {formatBytes(output.bytes.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadBlob(pdfBlob(output.bytes), output.name)}
                      aria-label={`Download ${output.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <Download size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

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
        label="Split settings"
        action={
          outputs ? (
            <>
              <DownloadAction
                label={outputs.length === 1 ? "Download PDF" : `Download ${outputs.length} PDFs (ZIP)`}
                onClick={downloadAll}
                hint={`${formatBytes(totalBytes)} · no watermark`}
              />
              <ActionRow>
                <SecondaryAction onClick={touch} icon={<Scissors size={13} aria-hidden />}>
                  Split again
                </SecondaryAction>
                <StartOverAction onClick={reset} label="New PDF" />
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
        <div className="space-y-6">
          <Field label="Split mode">
            <div className="space-y-1.5">
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
              <div className="space-y-3.5">
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
              <div className="grid grid-cols-4 gap-1.5">
                {CHUNK_PRESETS.map((preset) => {
                  const active = everyCount === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setEvery(String(preset));
                        touch();
                      }}
                      className={`h-10 rounded-[10px] border text-[13px] font-medium tabular-nums transition-colors ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-ink hover:border-[#cfc9bd]"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
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
            <div className="space-y-3.5">
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
