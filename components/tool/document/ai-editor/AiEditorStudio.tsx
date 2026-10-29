"use client";

import { useState } from "react";
import {
  Check,
  FileText,
  PencilRuler,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WandSparkles,
  X,
} from "lucide-react";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import {
  PreviewNote,
  RailSection,
  SelectRow,
  StudioHeader,
  ToggleRow,
} from "../DocumentKit";
import { PagePaper } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
import { formatBytes, fileStem } from "../model";
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

const BEFORE =
  "Payment is due at the earliest convenience of the client, and any delay may be handled informally.";
const AFTER =
  "Payment is due within 14 days of the invoice date. Late payments accrue 2% interest per month.";

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
  const [notice, setNotice] = useState<string | null>(null);

  const pageCount = activeItem?.pages ?? 0;

  function patch() {
    setNotice(null);
  }

  return (
    <section
      id="ai-editor"
      aria-label="AI PDF editor studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/ai-editor"
        title="Edit studio"
        subtitle="Describe the change; review it before it lands."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <PencilRuler size={10} aria-hidden />
              {activeItem ? `${pageCount} pages` : "No document"}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
              Interface preview
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />3 credits
            </span>
          </>
        }
      />

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <PdfDropzone
              title="Drop a PDF to edit"
              description="Change a date, rewrite a clause or translate a page. Nothing is replaced until you review the diff."
              buttonLabel="Choose a PDF"
              limits={`PDF · up to ${maxSizeMB} MB`}
              note="Your document stays in this browser until a run starts."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <WandSparkles size={9} aria-hidden />
                    Plain-language edits
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <ShieldCheck size={9} aria-hidden />
                    Review before download
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Sparkles size={9} aria-hidden />
                    Layout preserved
                  </span>
                </>
              }
            />
          ) : (
            <>
              <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-[16px] border border-line bg-[#f6f4f0] p-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                    Review · page 1
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#d9e3d5] bg-[#f4f8f2] px-2 py-0.5 text-[9.5px] font-medium text-[#4a6b47]">
                    <Check size={9} aria-hidden />
                    Original kept
                  </span>
                </div>

                <div className="studio-rail mt-2 grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-[168px_minmax(0,1fr)]">
                  <div className="mx-auto w-full max-w-[168px]">
                    <PagePaper index={1} weight={3} />
                    <div className="mt-1.5 flex items-center justify-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
                      <span className="text-[8.5px] text-faint">1 paragraph edited</span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="rounded-[10px] border border-line bg-white p-2.5">
                      <p className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                        Before
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-[#8d8697]">
                        <span className="rounded bg-[#f6efef] px-0.5 line-through decoration-[#c9a8a4]">
                          {BEFORE}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-[10px] border border-[#d9e3d5] bg-[#f7faf5] p-2.5">
                      <p className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[#4a6b47]">
                        After
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-[#40513f]">
                        <span className="rounded bg-[#e6f0e1] px-0.5">{AFTER}</span>
                      </p>
                    </div>

                    <div className="rounded-[10px] border border-line bg-white p-2.5">
                      <p className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                        Why this changed
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#655f72]">
                        Made the payment terms specific and added the contractual interest
                        rate, matching the rest of the document.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 overflow-hidden rounded-[13px] border border-line bg-white">
                <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
                  <WandSparkles size={13} className="text-accent" aria-hidden />
                  <label htmlFor="pdf-prompt" className="text-[11px] font-semibold text-ink">
                    Describe your edit
                  </label>
                  <span className="ml-auto text-[9.5px] text-faint">1 paragraph selected</span>
                </div>
                <textarea
                  id="pdf-prompt"
                  rows={3}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    patch();
                  }}
                  placeholder="For example: update the payment terms to 14 days and mention the late fee."
                  className="w-full resize-none bg-white px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink outline-none placeholder:text-faint"
                />
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-3.5 py-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setPrompt(suggestion);
                        patch();
                      }}
                      className="rounded-full border border-line bg-rail px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-[#d5d1c8] hover:text-ink"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f3f0f7] text-[#6b6384]">
                  <FileText size={15} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-medium text-ink">{activeItem.name}</p>
                  <p className="mt-0.5 text-micro text-faint">
                    {formatBytes(activeItem.size)} · {pageCount} pages · {editType.toLowerCase()}
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

          <p className="mt-4 shrink-0 border-t border-line-soft pt-4 text-[10px] leading-relaxed text-faint">
            The diff above is sample output. Editing runs on our servers once connected:
            a temporary copy is used for the run and deleted within an hour.
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
          label="Edit settings"
          footer={
            <PaidRunCard
              cost={3}
              verb="review edits"
              ready={Boolean(activeItem) && prompt.trim().length > 0}
              onRun={() => setGateOpen(true)}
              emptyLabel={activeItem ? "Describe the edit to run" : "Add a document to run"}
              note="3 credits per review. Nothing is replaced until you confirm the diff."
            />
          }
        >
          <div className="space-y-5">
            <RailSection title="Edit" hint="What changes">
              <SelectRow
                label="Edit type"
                options={EDIT_TYPES}
                value={editType}
                onChange={(value) => {
                  setEditType(value);
                  patch();
                }}
              />
              <SelectRow
                label="Tone"
                options={TONES}
                value={tone}
                onChange={(value) => {
                  setTone(value);
                  patch();
                }}
              />
              <SelectRow
                label="Output language"
                options={LANGUAGES}
                value={language}
                onChange={(value) => {
                  setLanguage(value);
                  patch();
                }}
              />
            </RailSection>

            <RailSection title="Review" hint="Optional" className="border-t border-line-soft pt-4">
              <ToggleRow
                label="Preserve layout"
                description="Keep fonts, spacing and page structure where possible."
                checked={preserveLayout}
                onChange={(checked) => {
                  setPreserveLayout(checked);
                  patch();
                }}
              />
              <ToggleRow
                label="Review changes first"
                description="Always show a before-and-after preview before download."
                checked={reviewFirst}
                onChange={(checked) => {
                  setReviewFirst(checked);
                  patch();
                }}
              />
            </RailSection>

            <PreviewNote>
              This editor is an interface preview. Costs, refunds and file deletion are
              exactly as described; the model is connected in the next build step.
            </PreviewNote>

            <div className="flex items-start gap-2 rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              <Sparkles size={12} className="mt-0.5 shrink-0 text-[#c48c4a]" aria-hidden />
              {fileStem(activeItem?.name ?? "document")}-edited.pdf stays separate from the
              original — nothing is overwritten.
            </div>
          </div>
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="review edits"
        cost={3}
      />
    </section>
  );
}
