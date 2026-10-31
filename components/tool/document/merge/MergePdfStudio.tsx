"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder } from "motion/react";
import {
  ArrowDownUp,
  Bookmark,
  Check,
  Download,
  Eye,
  FilePlus2,
  Layers3,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { StudioHeader } from "../DocumentKit";
import { PdfDropzone } from "../PdfDropzone";
import { fileStem, formatBytes } from "../model";
import { MergeCancelled, mergePdfs, type MergeOutcome } from "./merge-engine";
import { MergeDocRow } from "./MergeDocRow";
import { MergedPdfDialog } from "./MergedPdfDialog";
import { MergeSettings } from "./MergeSettings";
import {
  DEFAULT_MERGE_SETTINGS,
  mergeSignature,
  outputFileName,
  type MergeSettings as MergeSettingsValue,
} from "./merge-model";
import {
  MAX_MERGE_FILES,
  MAX_MERGE_TOTAL_MB,
  useMergeQueue,
} from "./useMergeQueue";

type Phase = "idle" | "running" | "done" | "error";

type MergeResult = {
  url: string;
  name: string;
  size: number;
  pageCount: number;
  bytes: Uint8Array;
};

export function MergePdfStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const queue = useMergeQueue({ maxFiles: MAX_MERGE_FILES, maxSizeMB });
  const [settings, setSettings] = useState<MergeSettingsValue>(DEFAULT_MERGE_SETTINGS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ value: 0, label: "Preparing…" });
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [ranSignature, setRanSignature] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const resultRef = useRef<MergeResult | null>(null);
  const runIdRef = useRef(0);
  const cancelledRef = useRef(false);

  resultRef.current = result;

  const busy = phase === "running";
  const readyCount = queue.sources.length;
  const suggestion = `${fileStem(queue.items[0]?.name ?? "documents")}-merged`;
  const outputName = outputFileName(settings.filename, suggestion);
  const blankPages = settings.blankPages ? Math.max(0, readyCount - 1) : 0;
  const projectedPages = queue.totalPages + blankPages;
  const signature = mergeSignature(settings, queue.sources);
  const stale = Boolean(result && ranSignature !== signature);
  const canRun = readyCount > 0 && !queue.reading && !busy;
  const advancedModified =
    Boolean(settings.title || settings.author || settings.subject) ||
    !settings.keepMetadata ||
    !settings.optimize;

  useEffect(
    () => () => {
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );

  useEffect(() => {
    if (queue.items.length > 0) return;
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = null;
    }
    setResult(null);
    setRanSignature(null);
    setPhase("idle");
    setRunError(null);
  }, [queue.items.length]);

  function revokeResult() {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = null;
    }
    setResult(null);
  }

  function patchSettings(patch: Partial<MergeSettingsValue>) {
    setSettings((current) => ({ ...current, ...patch }));
    setRunError(null);
  }

  function resetSettings() {
    setSettings(DEFAULT_MERGE_SETTINGS);
    setRunError(null);
  }

  function clearAll() {
    queue.clear();
    revokeResult();
    setRanSignature(null);
    setRunError(null);
    setPhase("idle");
    setProgress({ value: 0, label: "Preparing…" });
  }

  async function runMerge() {
    if (!canRun) return;
    setPhase("running");
    setRunError(null);
    setProgress({ value: 0, label: "Preparing…" });
    cancelledRef.current = false;
    const runId = ++runIdRef.current;
    const startedSignature = signature;

    try {
      const outcome: MergeOutcome = await mergePdfs(
        queue.sources,
        settings,
        (value, label) => {
          if (runIdRef.current === runId) setProgress({ value, label });
        },
        () => cancelledRef.current || runIdRef.current !== runId,
      );

      if (cancelledRef.current || runIdRef.current !== runId) return;

      const blob = new Blob([outcome.bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      revokeResult();
      const next: MergeResult = {
        url,
        name: outputName,
        size: blob.size,
        pageCount: outcome.pageCount,
        bytes: outcome.bytes,
      };
      resultRef.current = next;
      setResult(next);
      setRanSignature(startedSignature);
      setPhase("done");
      setProgress({ value: 1, label: "Done" });
    } catch (error) {
      if (
        error instanceof MergeCancelled ||
        cancelledRef.current ||
        runIdRef.current !== runId
      ) {
        setPhase("idle");
        setProgress({ value: 0, label: "Preparing…" });
        return;
      }
      setRunError(
        error instanceof Error ? error.message : "The PDF could not be merged. Try again.",
      );
      setPhase("error");
    }
  }

  function cancelRun() {
    cancelledRef.current = true;
    setPhase("idle");
    setProgress({ value: 0, label: "Preparing…" });
  }

  const toolButton =
    "inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40";

  return (
    <section
      id="merge-pdf"
      aria-label="Merge PDF studio"
      className="scroll-mt-20 rounded-[26px] border border-line bg-white"
    >
      <StudioHeader
        path="/document/merge-pdf"
        title="Merge studio"
        subtitle="Combine documents, choose pages and export one PDF."
        pills={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted">
              <Layers3 size={10} aria-hidden />
              {queue.items.length
                ? `${queue.items.length} file${queue.items.length === 1 ? "" : "s"} · ${projectedPages} page${projectedPages === 1 ? "" : "s"}`
                : "No documents"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe8e0] bg-[#f3f8f3] px-2.5 py-1 text-[10px] font-medium text-[#3f6b4f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4f8a63]" aria-hidden />
              Engine live
            </span>
          </>
        }
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
        <div className="studio-main flex min-h-0 min-w-0 flex-col p-4 sm:p-5 lg:min-h-[620px]">
          {queue.items.length === 0 ? (
            <PdfDropzone
              title="Drop PDFs to merge"
              description="Add two or more PDFs. Drag them into order, keep only the pages you need, then export one clean document."
              buttonLabel="Choose PDFs"
              limits={`PDF · up to ${maxSizeMB} MB each · ${MAX_MERGE_FILES} files · ${MAX_MERGE_TOTAL_MB} MB total`}
              note="Files are read locally. Nothing is uploaded."
              onChoose={() => queue.openPicker()}
              dragging={queue.dragging}
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
              minHeightClass="min-h-[420px]"
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <ArrowDownUp size={9} aria-hidden />
                    Drag to reorder
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Eye size={9} aria-hidden />
                    Real thumbnails
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Bookmark size={9} aria-hidden />
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
            <div
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
              className={`flex flex-col rounded-[16px] transition-shadow ${
                queue.dragging ? "ring-2 ring-[#b3a7ce]/60 ring-offset-4 ring-offset-white" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                    Merge order
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-muted">
                    {queue.items.length} file{queue.items.length === 1 ? "" : "s"} ·{" "}
                    {queue.totalPages} page{queue.totalPages === 1 ? "" : "s"} selected ·{" "}
                    {formatBytes(queue.totalSize)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => queue.reverse()}
                    disabled={busy || queue.items.length < 2}
                    className={toolButton}
                  >
                    <ArrowDownUp size={11} aria-hidden />
                    Reverse
                  </button>
                  <button
                    type="button"
                    onClick={() => queue.openPicker()}
                    disabled={busy || queue.items.length >= MAX_MERGE_FILES}
                    className={toolButton}
                  >
                    <Plus size={11} aria-hidden />
                    Add PDFs
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={busy}
                    className={toolButton}
                  >
                    <Trash2 size={11} aria-hidden />
                    Clear
                  </button>
                </div>
              </div>

              {queue.dragging && (
                <p className="mt-2 rounded-[9px] border border-dashed border-[#b3a7ce] bg-[#f6f2fb] px-3 py-2 text-center text-[10.5px] font-medium text-[#655f72]">
                  Drop PDFs to add them to the end of the list.
                </p>
              )}

              <Reorder.Group
                axis="y"
                values={queue.items}
                onReorder={queue.reorder}
                className="mt-3 space-y-2"
              >
                {queue.items.map((item, index) => (
                  <MergeDocRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={queue.items.length}
                    locked={busy}
                    onRangeChange={queue.setRange}
                    onRotationChange={queue.setRotation}
                    onMove={queue.move}
                    onRemove={queue.remove}
                  />
                ))}
              </Reorder.Group>

              {queue.items.length < MAX_MERGE_FILES && (
                <button
                  type="button"
                  onClick={() => queue.openPicker()}
                  disabled={busy}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-[#d5d0dd] bg-[#faf9fc] py-3 text-[11px] font-medium text-faint transition-colors hover:border-[#b8a992] hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                >
                  <FilePlus2 size={13} aria-hidden />
                  Add another PDF
                </button>
              )}
            </div>
          )}

          {queue.errors.length > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-[11px] border border-[#f0d8d1] bg-[#fdf4f1] px-3 py-2.5"
            >
              <div className="space-y-1.5">
                {queue.errors.map((message, index) => (
                  <p
                    key={`${message}-${index}`}
                    className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#a13d30]"
                  >
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
                    {message}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={queue.dismissErrors}
                className="mt-1.5 text-[10px] font-medium text-[#a13d30] underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {result && (
            <div className="mt-3 rounded-[16px] border border-[#dde8de] bg-[#f4f8f4] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#3f6b4f] text-white">
                    <Check size={13} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-ink">Merged — ready to download</p>
                    <p className="truncate text-[10px] text-faint">{result.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {stale && (
                    <span className="rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2 py-0.5 text-[9px] font-medium text-[#786344]">
                      Settings changed
                    </span>
                  )}
                  <span className="rounded-full border border-[#d7e3d8] bg-white px-2 py-0.5 text-[9.5px] font-medium tabular-nums text-[#3f6b4f]">
                    {result.pageCount} pages
                  </span>
                  <span className="rounded-full border border-[#d7e3d8] bg-white px-2 py-0.5 text-[9.5px] font-medium tabular-nums text-[#3f6b4f]">
                    {formatBytes(result.size)}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] leading-relaxed text-faint">
                  {stale
                    ? "Merge again to apply the latest order and settings."
                    : "Open the preview to check the page order before downloading."}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className={buttonClasses("secondary", "sm", "rounded-lg")}
                  >
                    <Eye size={12} aria-hidden />
                    Preview
                  </button>
                  <a
                    href={result.url}
                    download={result.name}
                    className={buttonClasses("primary", "sm", "rounded-lg")}
                  >
                    <Download size={12} aria-hidden />
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          )}

          <input
            ref={queue.inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            tabIndex={-1}
            aria-label="Choose PDFs"
            className="sr-only"
            onChange={queue.onPick}
          />

          {queue.items.length > 0 && (
            <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4">
              {busy ? (
                <div className="w-full">
                  <div className="flex items-center justify-between gap-3 text-micro">
                    <span className="flex min-w-0 items-center gap-2 truncate text-muted">
                      <Loader2 size={12} className="shrink-0 animate-spin text-accent" aria-hidden />
                      {progress.label}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-ink">
                      {Math.round(progress.value * 100)}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e9e4da]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.value * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.round(progress.value * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 text-micro text-faint">
                      <ShieldCheck size={12} aria-hidden />
                      Everything stays on this device
                    </p>
                    <button
                      type="button"
                      onClick={cancelRun}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-micro font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <X size={11} aria-hidden />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-micro text-faint">
                      <ShieldCheck size={12} aria-hidden />
                      Free · no upload · no watermark
                    </p>
                    <p className="max-w-[260px] truncate text-micro tabular-nums text-faint">
                      {outputName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-micro tabular-nums text-faint">
                      {queue.reading
                        ? "Reading documents…"
                        : `${readyCount} document${readyCount === 1 ? "" : "s"} → ${projectedPages} page${projectedPages === 1 ? "" : "s"}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => void runMerge()}
                      disabled={!canRun}
                      className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[150px]")}
                    >
                      {queue.reading
                        ? "Reading PDFs…"
                        : readyCount === 1
                          ? "Export PDF"
                          : `Merge ${readyCount} PDFs`}
                      <ArrowRightGlyph size={13} />
                    </button>
                  </div>
                </>
              )}

              {runError && (
                <p
                  role="alert"
                  className="rounded-[10px] border border-[#f0d8d1] bg-[#fdf4f1] px-3 py-2.5 text-micro leading-relaxed text-[#a13d30]"
                >
                  {runError}
                </p>
              )}
            </div>
          )}
        </div>

        <StudioRail label="Merge settings" sticky>
          <MergeSettings
            settings={settings}
            onChange={patchSettings}
            onReset={resetSettings}
            suggestion={suggestion}
            itemCount={queue.items.length}
            totalPages={projectedPages}
            totalSize={queue.totalSize}
            advancedModified={advancedModified}
          />
        </StudioRail>
      </div>

      <MergedPdfDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        bytes={result?.bytes ?? null}
        url={result?.url ?? null}
        name={result?.name ?? outputName}
        pageCount={result?.pageCount ?? projectedPages}
      />
    </section>
  );
}
