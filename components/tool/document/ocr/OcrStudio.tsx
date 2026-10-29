"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Languages,
  ScanText,
  ShieldCheck,
  TableProperties,
  TriangleAlert,
  X,
} from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import {
  PreviewNote,
  RailSection,
  SelectRow,
  StudioHeader,
  TextRow,
  ToggleRow,
} from "../DocumentKit";
import { PagePaper } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
import { formatBytes, fileStem, rangeLabel } from "../model";
import { usePdfQueue } from "../usePdfQueue";

const SAMPLE_LINES = [
  "INVOICE 2026-118",
  "Billed to: Northwind Studio, 14 Bridge Lane",
  "Issued: 12 September 2026 · Due: 30 October 2026",
  "Design retainer — September 2026      2,400.00",
  "Additional icon set — 18 icons         320.00",
  "Total due                             2,720.00",
  "Payment within 14 days. Late payments accrue 2% monthly.",
];

const SAMPLE_TEXT = SAMPLE_LINES.join("\n");

const LANGUAGES = [
  "Auto detect",
  "English",
  "Hindi",
  "English + Hindi",
  "Spanish",
  "French",
];

const OUTPUTS = ["Plain text", "Layout preserved", "Markdown"];

export function OcrStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    clear,
  } = usePdfQueue({ maxFiles: 1, maxSizeMB, allowImages: true });

  const [language, setLanguage] = useState("Auto detect");
  const [output, setOutput] = useState("Layout preserved");
  const [pages, setPages] = useState("All pages");
  const [tables, setTables] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [gateOpen, setGateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isImage = activeItem?.kind === "image";
  const pageCount = activeItem?.pages ?? 0;
  const rangeText = pages.trim().toLowerCase() === "all pages" ? `1–${pageCount}` : pages;

  function patch() {
    setNotice(null);
  }

  async function copySample() {
    try {
      await navigator.clipboard.writeText(SAMPLE_TEXT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Copying needs clipboard permission in this browser.");
    }
  }

  return (
    <section
      id="ocr"
      aria-label="OCR studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/ocr"
        title="OCR studio"
        subtitle="Scans and screenshots into editable text."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <ScanText size={10} aria-hidden />
              {activeItem ? (isImage ? "1 image" : `${pageCount} pages`) : "No scan"}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
              Interface preview
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />1 credit
            </span>
          </>
        }
      />

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <PdfDropzone
              title="Drop a scan to read"
              description="A PDF, photo or screenshot. Pick the language and layout, then copy the text straight out of the page."
              buttonLabel="Choose a file"
              limits={`PDF, JPG, PNG or WebP · up to ${maxSizeMB} MB`}
              note="Recognition is a preview here; the file stays in this browser."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Languages size={9} aria-hidden />
                    Multiple languages
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <TableProperties size={9} aria-hidden />
                    Tables and numbers
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
              <div className="min-h-[280px] flex-1 overflow-hidden rounded-[16px] border border-line bg-[#f6f4f0] p-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                    Source · page 1
                  </span>
                  <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[9.5px] font-medium text-muted">
                    {tables ? "Tables detected" : "Text only"}
                  </span>
                </div>

                <div className="mt-2 grid gap-3 md:grid-cols-[176px_minmax(0,1fr)]">
                  <div className="mx-auto w-full max-w-[176px]">
                    {isImage ? (
                      <span className="block overflow-hidden rounded-[5px] border border-[#e2dee8] bg-white shadow-[0_6px_16px_rgba(45,36,60,0.10)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={activeItem.url}
                          alt={`Scan preview of ${activeItem.name}`}
                          className="block h-auto w-full object-contain"
                        />
                      </span>
                    ) : (
                      <PagePaper index={1} weight={2} />
                    )}
                    <p className="mt-1.5 truncate text-center text-[9px] text-faint">
                      {activeItem.name}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-line bg-white">
                    <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                        Extracted text
                      </span>
                      <button
                        type="button"
                        onClick={copySample}
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                      >
                        {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <div className="studio-rail min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
                        {output === "Plain text" ? "Plain text" : output}
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {SAMPLE_LINES.map((line, index) => (
                          <p
                            key={line}
                            className={`rounded px-1 py-0.5 text-[10.5px] leading-relaxed ${
                              index === 0
                                ? "font-semibold text-ink"
                                : "text-[#5f5a67]"
                            } ${language !== "Auto detect" && index === 0 ? "bg-[#faf6ee]" : ""}`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 border-t border-line-soft pt-2 text-[9px] text-faint">
                        <Check size={9} className="text-[#3d6b4a]" aria-hidden />
                        {language === "Auto detect" ? "English detected" : language} · 98% confidence
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2.5">
                <div className="flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f3f0f7] text-[#6b6384]">
                    <FileText size={15} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">{activeItem.name}</p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(activeItem.size)}
                      {isImage ? " · image" : ` · ${pageCount} pages`}
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
                      Recognition plan
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">
                        {isImage ? "1 page" : `${pageCount} pages`}
                      </span>
                      <span className="text-[10px] text-faint">
                        {language} · {output.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-faint">
                      {fileStem(activeItem.name)}-text.txt · pages {rangeText}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {tables ? "Tables" : "No tables"}
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {numbers ? "Numbers kept" : "Raw text"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            aria-label="Choose a PDF or image"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <p className="mt-4 shrink-0 border-t border-line-soft pt-4 text-[10px] leading-relaxed text-faint">
            OCR runs on our servers once connected. A temporary copy is deleted after the
            run or within an hour, and failed runs are refunded.
          </p>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <PaidRail
          label="OCR settings"
          footer={
            <PaidRunCard
              cost={1}
              verb="extract text"
              ready={Boolean(activeItem)}
              onRun={() => setGateOpen(true)}
              emptyLabel="Add a document to run"
              note="1 credit per run. Failed runs are refunded, and files are deleted within an hour."
            />
          }
        >
          <div className="space-y-5">
            <RailSection title="Language" hint="Auto by default">
              <SelectRow
                label="Spoken language"
                options={LANGUAGES}
                value={language}
                onChange={(value) => {
                  setLanguage(value);
                  patch();
                }}
              />
            </RailSection>

            <RailSection title="Output" hint="Text format" className="border-t border-line-soft pt-4">
              <SelectRow
                label="Keep"
                options={OUTPUTS}
                value={output}
                onChange={(value) => {
                  setOutput(value);
                  patch();
                }}
              />
              <TextRow
                label="Pages"
                value={pages}
                onChange={(value) => {
                  setPages(value);
                  patch();
                }}
                placeholder="All pages"
                hint="Commas and dashes work"
              />
            </RailSection>

            <RailSection title="Detail" hint="Optional" className="border-t border-line-soft pt-4">
              <ToggleRow
                label="Detect tables"
                description="Keep columns and rows instead of a single text stream."
                checked={tables}
                onChange={(checked) => {
                  setTables(checked);
                  patch();
                }}
              />
              <ToggleRow
                label="Smart numbers"
                description="Restore dates, amounts and decimal separators."
                checked={numbers}
                onChange={(checked) => {
                  setNumbers(checked);
                  patch();
                }}
              />
            </RailSection>

            <PreviewNote>
              The text on this page is sample output. Recognition is connected in the next
              build step; the pricing and file handling above are final.
            </PreviewNote>
          </div>
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="extract text"
        cost={1}
      />
    </section>
  );
}
