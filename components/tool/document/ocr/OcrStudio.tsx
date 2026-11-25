"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, ScanText } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { Field, FileRow, Note, StudioFrame, StudioStage } from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { PreviewAction } from "@/components/tool/paid/PreviewAction";
import { SelectRow, TextRow, ToggleRow } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { usePdfDocument } from "../PdfPages";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { ImageViewer } from "@/components/tool/viewer/ImageViewer";
import { PdfReader } from "@/components/tool/viewer/PdfReader";
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

  const isImage = activeItem?.kind === "image";
  const doc = usePdfDocument(activeItem && !isImage ? activeItem.file : null);
  const pageCount = doc.pageCount || activeItem?.pages || 0;
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setImageSize(null);
    if (!activeItem || !isImage) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setImageSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    };
    image.src = activeItem.url;
    return () => {
      cancelled = true;
    };
  }, [activeItem, isImage]);

  const sizeLabel = isImage ? "1 image" : `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  return (
    <StudioFrame id="ocr" label="OCR studio">
      <StudioStage flush>
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
              meta={`${formatBytes(activeItem.size)} · ${sizeLabel}`}
              onReplace={() => openPicker(activeItem.id)}
              onRemove={clear}
            />

            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="flex min-h-[46svh] min-w-0 flex-col md:min-h-0">
                {isImage ? (
                  imageSize ? (
                    <ImageViewer
                      title={activeItem.name}
                      before={{
                        src: activeItem.url,
                        width: imageSize.width,
                        height: imageSize.height,
                        label: "Scan",
                        note: `${imageSize.width} × ${imageSize.height}`,
                        alt: `Scan preview of ${activeItem.name}`,
                      }}
                    />
                  ) : null
                ) : doc.pdf ? (
                  <PdfReader pdf={doc.pdf} pageCount={doc.pageCount} firstPage={doc.firstPage} title={activeItem.name} />
                ) : doc.error ? (
                  <Note tone="error" className="m-3">
                    {doc.error}
                  </Note>
                ) : (
                  <p className="grid flex-1 place-items-center text-[14.5px] text-muted">
                    <span className="flex items-center gap-2.5">
                      <Loader2 size={17} className="animate-spin" aria-hidden />
                      Opening the PDF…
                    </span>
                  </p>
                )}
              </div>

              <div className="fb-corners relative flex min-h-[220px] flex-col items-center justify-center border-line bg-panel px-6 py-8 text-center max-md:border-t md:border-l">
                <span className="grid h-12 w-12 shrink-0 place-items-center bg-ink text-white">
                  <ScanText size={22} strokeWidth={1.6} aria-hidden />
                </span>
                <p className="fb-wide mt-5 max-w-[300px] text-[19px]">The text lands here</p>
                <p className="mt-3 max-w-[300px] text-[14.5px] leading-relaxed text-muted">
                  {output} · {language === "Auto detect" ? "language detected automatically" : language}
                </p>
              </div>
            </div>

            {dragging ? <DropOver label="Drop to replace" /> : null}
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

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
      </StudioStage>

      <StudioRail
        label="OCR settings"
        action={<PreviewAction />}
      >
        <div className="space-y-7">
          <Field label="Recognition">
            <div className="space-y-4">
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
            <div className="space-y-4">
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
  );
}
