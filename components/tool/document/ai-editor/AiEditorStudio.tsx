"use client";

import { useState } from "react";
import { FileText, GitCompareArrows } from "lucide-react";
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
import { SelectRow, ToggleRow } from "../DocumentKit";
import { PagePaper } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
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

const EDIT_COST = 3;

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
  const [gateOpen, setGateOpen] = useState(false);

  const pageCount = activeItem?.pages ?? 0;
  const pagesLabel = `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  return (
    <>
      <StudioFrame id="ai-editor" label="AI PDF editor studio">
        <StudioStage>
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
              className="flex min-h-0 flex-1 flex-col gap-3"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <span className={STAGE_LABEL}>Describe the change</span>
                <Chip>{pagesLabel}</Chip>
              </div>

              <div className="studio-main grid min-h-[260px] flex-1 content-start gap-3 overflow-y-auto rounded-[16px] border border-line bg-[#f3f1ec] p-3 sm:p-4 md:grid-cols-[minmax(0,190px)_minmax(0,1fr)] md:content-stretch lg:min-h-0">
                <div className="mx-auto hidden w-full max-w-[190px] md:block">
                  <PagePaper index={1} weight={3} />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="rounded-[14px] border border-line bg-white transition-colors focus-within:border-ink">
                    <label
                      htmlFor="pdf-prompt"
                      className="block px-3.5 pt-3 text-[13px] font-semibold text-ink"
                    >
                      What should change?
                    </label>
                    <textarea
                      id="pdf-prompt"
                      rows={4}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="For example: update the payment terms to 14 days and mention the late fee."
                      className="mt-1 block w-full resize-none bg-transparent px-3.5 py-1.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 pt-1">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setPrompt(suggestion)}
                          className="h-8 rounded-full border border-line bg-white px-3 text-[12.5px] font-medium text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center rounded-[12px] border border-dashed border-[#d6d1c6] bg-white/70 px-5 py-7 text-center">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-muted">
                      <GitCompareArrows size={19} strokeWidth={1.6} aria-hidden />
                    </span>
                    <p className="mt-3 text-[14px] font-semibold text-ink">
                      The before and after will appear here
                    </p>
                    <p className="mt-1 max-w-[320px] text-[13px] leading-relaxed text-muted">
                      Each change is shown next to the original text, and the edit is saved as a
                      separate PDF.
                    </p>
                  </div>
                </div>
              </div>

              <FileRow
                icon={<FileText size={16} aria-hidden />}
                name={activeItem.name}
                meta={`${formatBytes(activeItem.size)} · ${pagesLabel}`}
                onReplace={() => openPicker(activeItem.id)}
                onRemove={clear}
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
          label="Edit settings"
          action={
            <PaidRunCard
              cost={EDIT_COST}
              verb="review edits"
              ready={Boolean(activeItem) && prompt.trim().length > 0}
              onRun={() => setGateOpen(true)}
              emptyLabel={activeItem ? "Describe the edit to continue" : "Add a PDF to edit"}
            />
          }
        >
          <div className="space-y-6">
            <NotConnectedNote />

            <Field label="Edit">
              <div className="space-y-3.5">
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
              <div className="space-y-3.5">
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

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="review edits"
        cost={EDIT_COST}
      />
    </>
  );
}
