"use client";

import { useState } from "react";
import { FileText, ScanText } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  Chip,
  Field,
  FileRow,
  Note,
  STAGE_LABEL,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { NotConnectedNote, PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { SelectRow, TextRow, ToggleRow } from "../DocumentKit";
import { PagePaper } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
import { formatBytes } from "../model";
import { usePdfQueue } from "../usePdfQueue";

const LANGUAGES = [
  "Auto detect",
  "English",
  "Hindi",
  "English + Hindi",
  "Spanish",
  "French",
];

const OUTPUTS = ["Plain text", "Layout preserved", "Markdown"];

const OCR_COST = 1;

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

  const isImage = activeItem?.kind === "image";
  const pageCount = activeItem?.pages ?? 0;
  const sizeLabel = isImage ? "1 image" : `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  return (
    <>
      <StudioFrame id="ocr" label="OCR studio">
        <StudioStage>
          <span aria-hidden className="hidden" data-error={error} />

          {!activeItem ? (
            <PdfDropzone
              title="Drop a scan to read"
              description="A scanned PDF, photo or screenshot becomes text you can copy and edit."
              buttonLabel="Choose a file"
              limits={`PDF, JPG, PNG or WebP · up to ${maxSizeMB} MB`}
              note="The file stays in this browser."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <DropChip>Multiple languages</DropChip>
                  <DropChip>Tables and numbers</DropChip>
                  <DropChip>Text or Markdown</DropChip>
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
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <span className={STAGE_LABEL}>Your scan</span>
                <Chip>{sizeLabel}</Chip>
              </div>

              <div className="studio-main grid min-h-[260px] flex-1 content-start gap-3 overflow-y-auto rounded-[16px] border border-line bg-[#f3f1ec] p-3 sm:p-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:content-stretch lg:min-h-0">
                <div className="mx-auto w-full max-w-[220px]">
                  {isImage ? (
                    <span className="block overflow-hidden rounded-[6px] border border-[#dedad2] bg-white shadow-[0_6px_16px_-10px_rgba(15,15,16,0.25)]">
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
                </div>

                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#d6d1c6] bg-white/70 px-5 py-8 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-muted">
                    <ScanText size={19} strokeWidth={1.6} aria-hidden />
                  </span>
                  <p className="mt-3 text-[14px] font-semibold text-ink">
                    The extracted text will appear here
                  </p>
                  <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-muted">
                    {output} · {language === "Auto detect" ? "language detected automatically" : language}
                  </p>
                </div>
              </div>

              <FileRow
                icon={<FileText size={16} aria-hidden />}
                name={activeItem.name}
                meta={`${formatBytes(activeItem.size)} · ${sizeLabel}`}
                onReplace={() => openPicker(activeItem.id)}
                onRemove={clear}
              />
            </div>
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

          {error ? (
            <Note tone="error" className="mt-3 shrink-0">
              {error}
            </Note>
          ) : null}
        </StudioStage>

        <StudioRail
          label="OCR settings"
          action={
            <PaidRunCard
              cost={OCR_COST}
              verb="extract text"
              ready={Boolean(activeItem)}
              onRun={() => setGateOpen(true)}
              emptyLabel="Add a scan to extract text"
            />
          }
        >
          <div className="space-y-6">
            <NotConnectedNote />

            <Field label="Recognition">
              <div className="space-y-3.5">
                <SelectRow
                  label="Document language"
                  options={LANGUAGES}
                  value={language}
                  onChange={setLanguage}
                />
                <SelectRow label="Output format" options={OUTPUTS} value={output} onChange={setOutput} />
                {!isImage && (
                  <TextRow
                    label="Pages"
                    value={pages}
                    onChange={setPages}
                    placeholder="All pages"
                    hint="For example 1-3, 5"
                  />
                )}
              </div>
            </Field>

            <Field label="Detail">
              <div className="space-y-3.5">
                <ToggleRow
                  label="Detect tables"
                  description="Keep columns and rows instead of one stream of text."
                  checked={tables}
                  onChange={setTables}
                />
                <ToggleRow
                  label="Smart numbers"
                  description="Restore dates, amounts and decimal separators."
                  checked={numbers}
                  onChange={setNumbers}
                />
              </div>
            </Field>
          </div>
        </StudioRail>
      </StudioFrame>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="extract text"
        cost={OCR_COST}
      />
    </>
  );
}
