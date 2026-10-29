"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileOutput,
  Scissors,
  ShieldCheck,
  Sparkles,
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
import { formatBytes, fileStem, pagesOf, parseRanges, rangeLabel } from "../model";
import { usePdfQueue } from "../usePdfQueue";

type SplitMode = "extract" | "every" | "parity";

const MODES: { id: SplitMode; title: string; detail: string }[] = [
  { id: "extract", title: "Extract pages", detail: "One file with the pages you pick" },
  { id: "every", title: "Every N pages", detail: "A file per chunk of N pages" },
  { id: "parity", title: "Odd & even", detail: "Two files, one per side" },
];

export function SplitPdfStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
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
    removeItem,
    clear,
  } = usePdfQueue({ maxFiles: 1, maxSizeMB });

  const [mode, setMode] = useState<SplitMode>("extract");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ranges, setRanges] = useState("");
  const [every, setEvery] = useState("2");
  const [parity, setParity] = useState("Odd pages");
  const [filename, setFilename] = useState("");
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const pageCount = activeItem?.pages ?? 0;

  useEffect(() => {
    if (!activeItem) {
      setSelected(new Set());
      setRanges("");
      return;
    }
    const pages = pagesOf(activeItem.pages);
    setSelected(new Set(pages));
    setRanges(rangeLabel(pages));
  }, [activeItem]);

  const everyCount = Math.min(100, Math.max(1, Number.parseInt(every, 10) || 1));
  const chunkCount = pageCount > 0 ? Math.ceil(pageCount / everyCount) : 0;
  const selectedPages = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  const outputCount =
    mode === "extract" ? (selectedPages.length > 0 ? 1 : 0) : mode === "every" ? chunkCount : 2;

  const baseName = filename.trim() || fileStem(activeItem?.name ?? "document");

  function patch() {
    setNotice(null);
  }

  function togglePage(page: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      setRanges(rangeLabel([...next]));
      return next;
    });
    patch();
  }

  function applyRanges(value: string) {
    setRanges(value);
    setSelected(new Set(parseRanges(value, pageCount)));
    patch();
  }

  function selectAll() {
    const pages = pagesOf(pageCount);
    setSelected(new Set(pages));
    setRanges(rangeLabel(pages));
    patch();
  }

  function selectNone() {
    setSelected(new Set());
    setRanges("");
    patch();
  }

  function handleSplit() {
    const summary =
      mode === "extract"
        ? `${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"} (${rangeLabel(selectedPages)}) into one PDF`
        : mode === "every"
          ? `${pageCount} pages into ${chunkCount} files of ${everyCount} page${everyCount === 1 ? "" : "s"}`
          : `${pageCount} pages into two files, ${parity.toLowerCase()} in ${parity === "Odd pages" ? "the first" : "the second"}`;
    setNotice(
      `The ${baseName} draft splits ${summary}. PDF assembly is connected in the next build step, and nothing leaves this device.`,
    );
  }

  return (
    <section
      id="split-pdf"
      aria-label="Split PDF studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/split-pdf"
        title="Split studio"
        subtitle="Extract ranges or break a document apart."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <Scissors size={10} aria-hidden />
              {activeItem ? `${pageCount} pages` : "No document"}
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
              title="Drop a PDF to split"
              description="Pick pages on the grid, type exact ranges, or break the whole document into even chunks."
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
                    <Scissors size={9} aria-hidden />
                    Exact ranges
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <FileOutput size={9} aria-hidden />
                    One file per chunk
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
                    {mode === "extract" ? "Select pages" : "Pages"}
                  </span>
                  <div className="flex items-center gap-3">
                    {mode === "extract" ? (
                      <>
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={selectNone}
                          className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                        >
                          None
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-faint">Every page stays in the output</span>
                    )}
                    <span className="text-[10px] tabular-nums text-faint">
                      {mode === "extract" ? `${selectedPages.length} of ${pageCount}` : `${pageCount} pages`}
                    </span>
                  </div>
                </div>

                <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-[10px] border border-line bg-[#f1efeb] p-2">
                  <PageGrid
                    count={pageCount}
                    selected={mode === "extract" ? selected : undefined}
                    onToggle={mode === "extract" ? togglePage : undefined}
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
                    <FileOutput size={15} aria-hidden />
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
                      Output
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                        {outputCount} {outputCount === 1 ? "file" : "files"}
                      </span>
                      <span className="text-[10px] text-faint">
                        {mode === "extract"
                          ? `${selectedPages.length} pages`
                          : mode === "every"
                            ? `${everyCount} pages each`
                            : "odd and even"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-faint">
                      {mode === "extract"
                        ? `${baseName}-pages.pdf`
                        : `${baseName}-1.pdf, ${baseName}-2.pdf${chunkCount > 2 ? ", …" : ""}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                    <Check size={9} aria-hidden />
                    {keepMetadata ? "Metadata kept" : "Metadata removed"}
                  </span>
                </div>
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
            label={
              mode === "extract"
                ? `Extract ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"}`
                : mode === "every"
                  ? `Split into ${chunkCount} files`
                  : "Split into 2 files"
            }
            hint={
              <>
                <ShieldCheck size={12} aria-hidden />
                Free · no upload · no watermark
              </>
            }
            disabled={!activeItem || outputCount === 0}
            onAction={handleSplit}
          >
            <span className="hidden items-center gap-1 text-[10.5px] text-faint sm:flex">
              <Sparkles size={10} aria-hidden />
              {rangeLabel(selectedPages)}
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

        <StudioRail label="Split settings">
          <div className="space-y-5">
            <RailSection title="Split mode" hint="How pages leave">
              <div className="space-y-1.5">
                {MODES.map((option) => {
                  const active = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setMode(option.id);
                        patch();
                      }}
                      className={`w-full rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-ink bg-rail"
                          : "border-line bg-white hover:border-[#d8d4cb] hover:bg-[#fcfbf9]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium text-ink">{option.title}</span>
                        {active && <Check size={12} className="text-ink" aria-hidden />}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
                        {option.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </RailSection>

            <RailSection title="Selection" hint={mode === "extract" ? "Pages" : "Automatic"} className="border-t border-line-soft pt-4">
              {mode === "extract" && (
                <TextRow
                  label="Page ranges"
                  value={ranges}
                  onChange={applyRanges}
                  placeholder="1-3, 5, 8-10"
                  hint="Commas and dashes are supported"
                />
              )}
              {mode === "every" && (
                <TextRow
                  label="Pages per file"
                  value={every}
                  onChange={(value) => {
                    setEvery(value);
                    patch();
                  }}
                  placeholder="2"
                  hint={`${pageCount} pages → ${chunkCount} files`}
                />
              )}
              {mode === "parity" && (
                <SelectRow
                  label="First file"
                  options={["Odd pages", "Even pages"]}
                  value={parity}
                  onChange={(value) => {
                    setParity(value);
                    patch();
                  }}
                />
              )}
            </RailSection>

            <RailSection title="Output" hint="Naming" className="border-t border-line-soft pt-4">
              <TextRow
                label="File name"
                value={filename}
                onChange={(value) => {
                  setFilename(value);
                  patch();
                }}
                placeholder={fileStem(activeItem?.name ?? "document")}
                hint="Number suffixes are added per file"
              />
              <ToggleRow
                label="Keep document metadata"
                description="Carry titles, authors and dates into each output."
                checked={keepMetadata}
                onChange={(checked) => {
                  setKeepMetadata(checked);
                  patch();
                }}
              />
            </RailSection>

            <PreviewNote>
              Splitting runs entirely on your device once the PDF engine is connected.
              The page counts here come from the file you added.
            </PreviewNote>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}
