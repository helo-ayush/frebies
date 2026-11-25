"use client";

import { useState } from "react";
import { FileText, GitCompareArrows, Loader2 } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { Field, FileRow, Note, StudioFrame, StudioStage, ToolText } from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
import { PreviewAction } from "@/components/tool/paid/PreviewAction";
import { SelectRow, ToggleRow } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { usePdfDocument } from "../PdfPages";
import { DropOver } from "@/components/tool/viewer/DropOver";
import { PdfReader } from "@/components/tool/viewer/PdfReader";
import { formatBytes } from "../model";
import { usePdfQueue } from "../usePdfQueue";

const EDIT_TYPES = [
  "Rewrite selected text",
  "Find and replace",
  "Summarize document",
  "Translate document",
];

const TONES = ["Keep original", "Professional", "Friendly", "Concise"];
const LANGUAGES = ["Keep original", "English", "Hindi"];

const SUGGESTIONS = ["Make it concise", "Fix the date", "Rewrite a clause"];

export function AiEditorStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
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
  } = usePdfQueue({ maxFiles: 1, maxSizeMB });

  const [editType, setEditType] = useState(EDIT_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [prompt, setPrompt] = useState("");
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [reviewFirst, setReviewFirst] = useState(true);

  const doc = usePdfDocument(activeItem?.file ?? null);
  const pageCount = doc.pageCount || activeItem?.pages || 0;
  const pagesLabel = `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  return (
    <StudioFrame id="ai-editor" label="AI PDF editor studio">
      <StudioStage flush>
        <span aria-hidden className="hidden" data-error={error} />

        {!activeItem ? (
          <PdfDropzone
            title="Drop a PDF to edit"
            description="Change a date, rewrite a clause or translate a page by describing it in plain words."
            buttonLabel="Choose a PDF"
            limits={`PDF · up to ${maxSizeMB} MB`}
            note="The document stays in this browser."
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <DropChip>Plain-language edits</DropChip>
                <DropChip>Review before download</DropChip>
                <DropChip>Layout preserved</DropChip>
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
              meta={`${formatBytes(activeItem.size)} · ${pagesLabel}`}
              onReplace={() => openPicker(activeItem.id)}
              onRemove={clear}
            />

            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="flex min-h-[44svh] min-w-0 flex-col max-md:order-2 md:min-h-0">
                {doc.pdf ? (
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

              <div className="studio-main flex min-w-0 flex-col border-line bg-panel max-md:border-b md:overflow-y-auto md:border-l">
                <div className="border-b border-line p-4 sm:p-5">
                  <label htmlFor="pdf-prompt" className="fb-wide block text-[18px]">
                    What should change?
                  </label>
                  <textarea
                    id="pdf-prompt"
                    rows={5}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="For example: update the payment terms to 14 days and mention the late fee."
                    className="fb-input mt-4 block resize-none"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <ToolText key={suggestion} onClick={() => setPrompt(suggestion)}>
                        {suggestion}
                      </ToolText>
                    ))}
                  </div>
                </div>

                <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                  <span className="grid h-12 w-12 shrink-0 place-items-center bg-ink text-white">
                    <GitCompareArrows size={22} strokeWidth={1.6} aria-hidden />
                  </span>
                  <p className="fb-wide mt-5 max-w-[300px] text-[18px]">Before and after, here</p>
                  <p className="mt-3 max-w-[320px] text-[14.5px] leading-relaxed text-muted">
                    Each change is shown next to the original text, and the edit is saved as a separate PDF.
                  </p>
                </div>
              </div>
            </div>

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
      </StudioStage>

      <StudioRail
        label="Edit settings"
        action={<PreviewAction />}
      >
        <div className="space-y-7">
          <Field label="Edit">
            <div className="space-y-4">
              <SelectRow label="Edit type" options={EDIT_TYPES} value={editType} onChange={setEditType} />
              <SelectRow label="Tone" options={TONES} value={tone} onChange={setTone} />
              <SelectRow
                label="Output language"
                options={LANGUAGES}
                value={language}
                onChange={setLanguage}
              />
            </div>
          </Field>

          <Field label="Review">
            <div className="space-y-4">
              <ToggleRow
                label="Preserve layout"
                description="Keep fonts, spacing and page structure where possible."
                checked={preserveLayout}
                onChange={setPreserveLayout}
              />
              <ToggleRow
                label="Review changes first"
                description="Show a before and after for approval before download."
                checked={reviewFirst}
                onChange={setReviewFirst}
              />
            </div>
          </Field>
        </div>
      </StudioRail>
    </StudioFrame>
  );
}
