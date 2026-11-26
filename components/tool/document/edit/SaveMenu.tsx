"use client";

import { ArrowRight, Download, Loader2 } from "lucide-react";
import { FileIcon } from "@/components/site/kit";
import { useEditor, type EditorStore, type Format } from "./store";
import { PlusMark, Pop } from "./ui";

/** Every kind of file the editor can make, in the order they are offered. */
export const KINDS: { value: Format; label: string; ext: string; hint: string }[] = [
  { value: "pdf", label: "PDF", ext: "PDF", hint: "Exactly as you see it" },
  { value: "docx", label: "Word", ext: "DOCX", hint: "Opens in Word and Google Docs" },
  { value: "odt", label: "OpenDocument", ext: "ODT", hint: "For LibreOffice and others" },
  { value: "rtf", label: "Rich text", ext: "RTF", hint: "Opens in any word processor" },
  { value: "pptx", label: "PowerPoint", ext: "PPTX", hint: "A slide for each page" },
  { value: "xlsx", label: "Excel", ext: "XLSX", hint: "The tables, as sheets" },
  { value: "html", label: "Web page", ext: "HTML", hint: "Opens in any browser" },
  { value: "md", label: "Markdown", ext: "MD", hint: "Plain text with marks" },
  { value: "txt", label: "Plain text", ext: "TXT", hint: "Only the words" },
  { value: "png", label: "PNG", ext: "PNG", hint: "A picture of each page" },
  { value: "jpg", label: "JPG", ext: "JPG", hint: "Smaller pictures of the pages" },
  { value: "webp", label: "WebP", ext: "WEBP", hint: "The smallest pictures" },
];

/** The one key that gives the file back. It opens the kinds of file, the best one first and biggest. */
export function SaveKey({
  store,
  onSave,
  onMore,
}: {
  store: EditorStore;
  onSave: (format: Format) => void;
  /** Pages, size and password. */
  onMore: () => void;
}) {
  const busy = useEditor(store, (s) => s.view.busy);
  const saving = busy?.label.startsWith("Saving") ? busy : null;
  return (
    <Pop
      label="Save"
      width={348}
      align="right"
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          disabled={Boolean(busy)}
          aria-expanded={open}
          aria-busy={saving ? true : undefined}
          aria-label={saving ? "Saving" : "Save"}
          data-slot="save-key"
          data-sound={open ? "close" : "open"}
          data-tone="done"
          className="fb-run !min-h-0 min-w-0 flex-1"
        >
          {saving ? (
            <span
              aria-hidden
              className="fb-run-fill"
              style={{ width: `${Math.max(6, (saving.progress ?? 0) * 100)}%` }}
            />
          ) : null}
          <span className="fb-run-icon !w-[52px]">
            {saving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
          </span>
          <span className="fb-run-label justify-between gap-3">
            {saving ? "Saving…" : "Save"}
            {saving ? null : <PlusMark open={open} />}
          </span>
        </button>
      )}
    >
      {(close) => (
        <SaveMenu
          store={store}
          onSave={(format) => {
            close();
            onSave(format);
          }}
          onMore={() => {
            close();
            onMore();
          }}
        />
      )}
    </Pop>
  );
}

function SaveMenu({
  store,
  onSave,
  onMore,
}: {
  store: EditorStore;
  onSave: (format: Format) => void;
  onMore: () => void;
}) {
  const origin = useEditor(store, (s) => s.origin);
  const best = KINDS.find((kind) => kind.value === (origin?.format ?? "pdf")) ?? KINDS[0];
  const others = KINDS.filter((kind) => kind !== best);
  const why = origin?.why ?? "Keeps every page exactly as it looks";
  return (
    <div>
      <div className="p-3">
        <p className="fb-label mb-2 flex items-center gap-2 !text-[11.5px]">
          <span aria-hidden className="h-[7px] w-[7px] bg-accent" />
          Recommended
        </p>
        <button
          type="button"
          data-slot="primary-action"
          data-tone="done"
          onClick={() => onSave(best.value)}
          className="fb-btn fb-ear !flex !h-auto w-full !justify-start gap-3.5 !px-3.5 !py-3 text-left !normal-case"
          style={{ ["--ear" as string]: "14px" }}
        >
          <FileIcon ext={best.ext} lit />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold uppercase leading-tight">Save as {best.label}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-white/65">{why}</span>
          </span>
          <Download size={18} aria-hidden className="shrink-0" />
        </button>
      </div>
      <p className="fb-label px-3.5 pb-2 !text-[11.5px]">Other kinds</p>
      <div className="grid grid-cols-2 border-t border-line">
        {others.map((kind) => (
          <button
            key={kind.value}
            type="button"
            title={kind.hint}
            data-slot="primary-action"
            data-tone="done"
            onClick={() => onSave(kind.value)}
            className="group flex min-h-[46px] items-center gap-2.5 border-b border-line px-3.5 text-left text-[13.5px] transition-colors odd:border-r hover:bg-white"
          >
            <span className="fb-wide grid h-[20px] min-w-[40px] place-items-center bg-ink px-1 text-[9.5px] leading-none tracking-normal text-white transition-colors group-hover:bg-accent-deep">
              {kind.ext}
            </span>
            <span className="min-w-0 truncate">{kind.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onMore}
        className="group flex h-12 w-full items-center justify-between px-3.5 text-[13.5px] font-medium transition-colors hover:bg-white"
      >
        Pages, file size and password
        <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-1" />
      </button>
    </div>
  );
}
