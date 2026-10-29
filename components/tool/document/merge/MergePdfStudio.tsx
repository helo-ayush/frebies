"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  Files,
  Layers3,
  Plus,
  ShieldCheck,
  TriangleAlert,
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
import { PagePaper } from "../PagePreview";
import { PdfDropzone } from "../PdfDropzone";
import { formatBytes, fileStem } from "../model";
import { usePdfQueue } from "../usePdfQueue";

const MAX_FILES = 8;

const COMPRESSION = ["None", "Balanced", "Strong"] as const;
type Compression = (typeof COMPRESSION)[number];

const COMPRESSION_FACTOR: Record<Compression, number> = {
  None: 0.96,
  Balanced: 0.74,
  Strong: 0.56,
};

export function MergePdfStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    items,
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
    moveItem,
    reverseItems,
  } = usePdfQueue({ maxFiles: MAX_FILES, maxSizeMB });

  const [compression, setCompression] = useState<Compression>("Balanced");
  const [filename, setFilename] = useState("");
  const [bookmarks, setBookmarks] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(false);
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const totalPages = items.reduce((sum, item) => sum + item.pages, 0);
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  const estimated = Math.round(totalSize * COMPRESSION_FACTOR[compression]);
  const outputName = `${filename.trim() || `${fileStem(items[0]?.name ?? "documents")}-merged`}.pdf`;

  function patch() {
    setNotice(null);
  }

  const previewPages = items.flatMap((item, itemIndex) =>
    Array.from({ length: Math.min(item.pages, 2) }, (_, pageIndex) => ({
      key: `${item.id}-${pageIndex}`,
      page: pageIndex + 1,
      document: itemIndex + 1,
      name: item.name,
      weight: itemIndex + pageIndex,
    })),
  );
  const hiddenPages = totalPages - previewPages.length;

  function handleMerge() {
    setNotice(
      `The ${outputName} draft is ready — ${items.length} documents and ${totalPages} pages in this order. PDF assembly is connected in the next build step, and nothing leaves this device.`,
    );
  }

  return (
    <section
      id="merge-pdf"
      aria-label="Merge PDF studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/merge-pdf"
        title="Merge studio"
        subtitle="Combine documents in the order you choose."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <Layers3 size={10} aria-hidden />
              {items.length ? `${items.length} files · ${totalPages} pages` : "No documents"}
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
          {items.length === 0 ? (
            <PdfDropzone
              title="Drop PDFs to merge"
              description="Add two or more PDFs. Arrange the order, then export one clean document with every page kept."
              buttonLabel="Choose PDFs"
              limits={`PDF · up to ${maxSizeMB} MB each · ${MAX_FILES} files`}
              note="Files are read locally. Nothing is uploaded."
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <ArrowUp size={9} aria-hidden />
                    <ArrowDown size={9} aria-hidden />
                    Reorder documents
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Layers3 size={9} aria-hidden />
                    Bookmarks
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
                    Merged preview
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        reverseItems();
                        patch();
                      }}
                      disabled={items.length < 2}
                      className="text-[10px] font-medium text-faint transition-colors hover:text-ink disabled:opacity-40"
                    >
                      Reverse order
                    </button>
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-ink transition-colors hover:opacity-70"
                    >
                      <Plus size={10} aria-hidden />
                      Add
                    </button>
                  </div>
                </div>

                <div className="studio-rail mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {previewPages.map((page) => (
                      <div key={page.key} className="space-y-1">
                        <PagePaper index={page.page} weight={page.weight} />
                        <p className="truncate text-[8.5px] text-faint">
                          Doc {page.document} · p{page.page}
                        </p>
                      </div>
                    ))}
                    {hiddenPages > 0 && (
                      <div className="grid place-items-center rounded-[5px] border border-dashed border-[#d6d0dc] bg-white/60 p-2 text-center">
                        <div>
                          <p className="font-display text-[16px] font-semibold tabular-nums text-ink">
                            +{hiddenPages}
                          </p>
                          <p className="mt-0.5 text-[8px] leading-tight text-faint">more pages</p>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openPicker()}
                      className="grid min-h-[104px] place-items-center rounded-[6px] border border-dashed border-[#d7d2c8] bg-white/40 text-faint transition-colors hover:border-[#b8a992] hover:text-ink"
                      aria-label="Add another PDF"
                    >
                      <span className="flex flex-col items-center gap-1">
                        <FilePlus2 size={15} aria-hidden />
                        <span className="text-[8.5px] font-medium">Add PDF</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 shrink-0 rounded-[13px] border border-line bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                    Documents · merge order
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clear();
                      setNotice(null);
                    }}
                    className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                  >
                    Clear all
                  </button>
                </div>

                <ul className="studio-rail mt-2 max-h-[176px] space-y-1.5 overflow-y-auto pr-0.5">
                  {items.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-[9px] border border-line-soft bg-[#fdfdfc] px-2.5 py-1.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold tabular-nums text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-ink">{item.name}</p>
                        <p className="mt-0.5 text-[10px] text-faint">
                          {formatBytes(item.size)} · {item.pages} page{item.pages === 1 ? "" : "s"}
                          {item.pages === 1 && reading ? " (reading…)" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${item.name} earlier`}
                        className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={index === items.length - 1}
                        aria-label={`Move ${item.name} later`}
                        className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink"
                      >
                        <Plus size={12} className="rotate-45" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 shrink-0 rounded-[13px] border border-line bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                      Output
                    </p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                        {formatBytes(estimated)}
                      </span>
                      <span className="text-[10px] text-faint">from {formatBytes(totalSize)}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-faint">{outputName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {totalPages} pages
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
                      {compression}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            tabIndex={-1}
            aria-label="Choose PDFs"
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
            label={items.length > 1 ? `Merge ${items.length} PDFs` : "Merge PDFs"}
            hint={
              <>
                <ShieldCheck size={12} aria-hidden />
                Free · no upload · no watermark
              </>
            }
            disabled={items.length < 2}
            onAction={handleMerge}
          >
            <span className="hidden text-[10.5px] tabular-nums text-faint sm:inline">
              {items.length < 2 ? "Add at least two PDFs" : `${totalPages} pages`}
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

        <StudioRail label="Merge settings">
          <div className="space-y-5">
            <RailSection title="Output file" hint="PDF">
              <TextRow
                label="File name"
                value={filename}
                onChange={(value) => {
                  setFilename(value);
                  patch();
                }}
                placeholder="documents-merged"
                hint=".pdf is added automatically"
              />
              <SelectRow
                label="Compression"
                options={[...COMPRESSION]}
                value={compression}
                onChange={(value) => {
                  setCompression(value as Compression);
                  patch();
                }}
              />
            </RailSection>

            <RailSection title="Pages" hint="Optional" className="border-t border-line-soft pt-4">
              <ToggleRow
                label="Add a bookmark per document"
                description="Each source file becomes a section in the PDF outline."
                checked={bookmarks}
                onChange={(checked) => {
                  setBookmarks(checked);
                  patch();
                }}
              />
              <ToggleRow
                label="Page numbers"
                description="Stamp a small sequential number on every page."
                checked={pageNumbers}
                onChange={(checked) => {
                  setPageNumbers(checked);
                  patch();
                }}
              />
              <ToggleRow
                label="Keep document metadata"
                description="Preserve titles, authors and creation dates."
                checked={keepMetadata}
                onChange={(checked) => {
                  setKeepMetadata(checked);
                  patch();
                }}
              />
            </RailSection>

            <PreviewNote>
              Merging runs entirely on your device once the PDF engine is connected.
              Page counts and the size estimate come from the files you added.
            </PreviewNote>

            <div className="flex items-start gap-2 rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              <Files size={12} className="mt-0.5 shrink-0" aria-hidden />
              Order matters: move a document up or down in the list to change where its
              pages land in the final file.
            </div>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}
