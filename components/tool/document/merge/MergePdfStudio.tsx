"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, motion } from "motion/react";
import { ArrowDownUp, Download, Eye, FilePlus2, Layers3, Trash2, X } from "lucide-react";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import {
  ActionRow,
  Chip,
  DownloadAction,
  Note,
  PrimaryAction,
  ResultCard,
  STAGE_LABEL,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
} from "@/components/tool/kit";
import { DropChip } from "@/components/tool/kit/Dropzone";
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
import { MAX_MERGE_FILES, useMergeQueue } from "./useMergeQueue";

type Phase = "idle" | "running" | "done" | "error";

type MergeResult = {
  url: string;
  name: string;
  size: number;
  pageCount: number;
  bytes: Uint8Array;
};

const TOOL_BUTTON =
  "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

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

  const fileCount = queue.items.length;
  const fresh = result && !stale ? result : null;
  const mergeLabel = queue.reading
    ? "Reading PDFs…"
    : readyCount === 0
      ? "Merge PDFs"
      : readyCount === 1
        ? `Export PDF · ${plural(projectedPages, "page")}`
        : `Merge ${readyCount} PDFs · ${plural(projectedPages, "page")}`;
  const mergeHint = busy ? (
    <span className="max-w-full truncate">{progress.label}</span>
  ) : fileCount === 0 ? (
    "Add PDFs to get started"
  ) : queue.reading ? (
    "Reading documents…"
  ) : (
    <span className="max-w-full truncate">Saves as {outputName}</span>
  );

  return (
    <>
      <StudioFrame id="merge-pdf" label="Merge PDF studio">
        <StudioStage>
          <span
            aria-hidden
            className="hidden"
            data-success={fresh ? `merged-${runIdRef.current}` : undefined}
            data-error={runError ?? (queue.errors.length ? queue.errors.join(" · ") : undefined)}
          />

          {fileCount === 0 ? (
            <PdfDropzone
              title="Drop PDFs to merge"
              description="Add two or more PDFs, drag them into order and export one document."
              buttonLabel="Choose PDFs"
              limits={`PDF · up to ${maxSizeMB} MB each · ${MAX_MERGE_FILES} files`}
              onChoose={() => queue.openPicker()}
              dragging={queue.dragging}
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
              chips={
                <>
                  <DropChip>Drag to reorder</DropChip>
                  <DropChip>Pick pages per file</DropChip>
                  <DropChip>Bookmarks and page numbers</DropChip>
                </>
              }
            />
          ) : (
            <div
              className="flex min-h-0 flex-1 flex-col gap-3"
              onDragOver={queue.onDragOver}
              onDragLeave={queue.onDragLeave}
              onDrop={queue.onDrop}
            >
              {fresh ? (
                <ResultCard
                  title={`${fresh.name} is ready`}
                  meta={`${plural(fresh.pageCount, "page")} · ${formatBytes(fresh.size)}`}
                >
                  <a
                    href={fresh.url}
                    download={fresh.name}
                    className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-success px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
                  >
                    <Download size={15} aria-hidden />
                    Download
                  </a>
                </ResultCard>
              ) : result ? (
                <Note tone="warn" className="shrink-0">
                  The order or settings changed after the last merge. Merge again to update the file, or{" "}
                  <a
                    href={result.url}
                    download={result.name}
                    className="font-medium underline underline-offset-2"
                  >
                    download the earlier version
                  </a>
                  .
                </Note>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <span className={STAGE_LABEL}>Drag to set the merge order</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => queue.reverse()}
                    disabled={busy || fileCount < 2}
                    className={TOOL_BUTTON}
                  >
                    <ArrowDownUp size={13} aria-hidden />
                    Reverse
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={busy}
                    data-variant="destructive"
                    className={TOOL_BUTTON}
                  >
                    <Trash2 size={13} aria-hidden />
                    Clear
                  </button>
                  <Chip>
                    {plural(fileCount, "file")} · {plural(queue.totalPages, "page")} ·{" "}
                    {formatBytes(queue.totalSize)}
                  </Chip>
                </div>
              </div>

              <motion.div
                layoutScroll
                className={`studio-main min-h-0 flex-1 rounded-[16px] transition-shadow lg:-mx-1.5 lg:overflow-y-auto lg:overflow-x-hidden lg:px-1.5 ${
                  queue.dragging ? "ring-2 ring-accent/50 ring-offset-4 ring-offset-paper" : ""
                }`}
              >
                <Reorder.Group
                  axis="y"
                  values={queue.items}
                  onReorder={queue.reorder}
                  className="space-y-2"
                >
                  {queue.items.map((item, index) => (
                    <MergeDocRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={fileCount}
                      locked={busy}
                      onRangeChange={queue.setRange}
                      onRotationChange={queue.setRotation}
                      onMove={queue.move}
                      onRemove={queue.remove}
                    />
                  ))}
                </Reorder.Group>

                {fileCount < MAX_MERGE_FILES && (
                  <button
                    type="button"
                    onClick={() => queue.openPicker()}
                    disabled={busy}
                    className={`mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed text-[13.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                      queue.dragging
                        ? "border-accent bg-accent-soft text-accent-deep"
                        : "border-[#d6d1c6] bg-white text-muted hover:border-[#b9b2a4] hover:text-ink"
                    }`}
                  >
                    <FilePlus2 size={16} aria-hidden />
                    {queue.dragging ? "Drop to add to the end" : "Add another PDF"}
                  </button>
                )}
              </motion.div>
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

          {queue.errors.length > 0 && (
            <Note tone="error" className="mt-3 shrink-0">
              {queue.errors.map((message, index) => (
                <span key={`${message}-${index}`} className="block">
                  {message}
                </span>
              ))}
              <button
                type="button"
                onClick={queue.dismissErrors}
                className="mt-1 font-medium underline underline-offset-2"
              >
                Dismiss
              </button>
            </Note>
          )}

          {runError && (
            <Note tone="error" className="mt-3 shrink-0">
              {runError}
            </Note>
          )}
        </StudioStage>

        <StudioRail
          label="Merge settings"
          action={
            fresh ? (
              <>
                <DownloadAction
                  label="Download merged PDF"
                  href={fresh.url}
                  filename={fresh.name}
                  hint={`${plural(fresh.pageCount, "page")} · ${formatBytes(fresh.size)} · no watermark`}
                />
                <ActionRow>
                  <SecondaryAction
                    onClick={() => setPreviewOpen(true)}
                    icon={<Eye size={13} aria-hidden />}
                  >
                    Preview
                  </SecondaryAction>
                  <StartOverAction onClick={clearAll} />
                </ActionRow>
              </>
            ) : (
              <>
                <PrimaryAction
                  label={mergeLabel}
                  busyLabel="Merging…"
                  icon={<Layers3 size={16} aria-hidden />}
                  busy={busy}
                  progress={progress.value}
                  disabled={!canRun}
                  onClick={() => void runMerge()}
                  hint={mergeHint}
                />
                {busy ? (
                  <ActionRow>
                    <SecondaryAction onClick={cancelRun} icon={<X size={13} aria-hidden />}>
                      Cancel
                    </SecondaryAction>
                  </ActionRow>
                ) : null}
              </>
            )
          }
        >
          <MergeSettings
            settings={settings}
            onChange={patchSettings}
            onReset={resetSettings}
            suggestion={suggestion}
            totalPages={projectedPages}
            advancedModified={advancedModified}
          />
        </StudioRail>
      </StudioFrame>

      <MergedPdfDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        bytes={result?.bytes ?? null}
        url={result?.url ?? null}
        name={result?.name ?? outputName}
        pageCount={result?.pageCount ?? projectedPages}
      />
    </>
  );
}
