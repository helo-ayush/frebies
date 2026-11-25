"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Image as ImageIcon, ImagePlus, Minimize2 } from "lucide-react";
import {
  ActionRow,
  FileRow,
  Note,
  PrimaryAction,
  QuickPick,
  SecondaryAction,
  StartOverAction,
  StudioFrame,
  StudioStage,
  ToolText,
} from "@/components/tool/kit";
import { Filmstrip } from "@/components/tool/viewer/Filmstrip";
import { ImageViewer, ViewTabs, type ViewMode } from "@/components/tool/viewer/ImageViewer";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import type { StudioImage } from "@/components/tool/studio/types";
import {
  ImageCompressSettings,
  DEFAULT_COMPRESS_SETTINGS,
  type CompressSettings,
} from "./ImageCompressSettings";
import { compressFile, type CompressOutcome, type CompressRequest } from "@/lib/image/compress";
import {
  FORMAT_LABEL,
  downloadAllAsZip,
  downloadBlob,
  formatBytes,
  outputFilename,
} from "@/lib/image/encode";
import {
  maxEdgeOf,
  reductionPercent,
  resolveOutputFormat,
  targetBytes,
  targetLabel,
} from "./model";

const MAX_FILES = 20;

function sourceFormat(file: File | undefined): string {
  if (!file) return "IMAGE";
  const ext = file.name.split(".").pop()?.toUpperCase();
  if (ext) return ext;
  const mime = file.type.split("/")[1]?.toUpperCase();
  return mime || "IMAGE";
}

type CompressorStudioResult = CompressOutcome & {
  previewUrl: string;
  name: string;
  /** The settings this file was made with. See `settingsKey` in the studio. */
  settingsKey: string;
};

function revokePreview(result: { previewUrl: string }) {
  if (result.previewUrl.startsWith("blob:")) URL.revokeObjectURL(result.previewUrl);
}

export function CompressorStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    items,
    activeItem,
    setActiveId,
    openPicker,
    dragging,
    error,
    inputRef,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clearAll,
  } = useImageQueue({
    maxFiles: MAX_FILES,
    maxSizeMB,
    formatHint: "JPG, PNG, WebP, AVIF, HEIC or BMP",
  });

  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_COMPRESS_SETTINGS);
  const [viewMode, setViewMode] = useState<ViewMode>("after");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name?: string } | null>(null);
  const [results, setResults] = useState<Record<string, CompressorStudioResult>>({});

  const resultsRef = useRef<Record<string, CompressorStudioResult>>({});
  resultsRef.current = results;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(resultsRef.current).forEach((res) => {
        if (res.previewUrl && res.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(res.previewUrl);
        }
      });
    };
  }, []);

  function patchSettings(patch: Partial<CompressSettings>) {
    setSettings((curr) => ({ ...curr, ...patch }));
    setNotice(null);
  }

  function resetSettings() {
    setSettings(DEFAULT_COMPRESS_SETTINGS);
    setNotice(null);
  }

  const dimensions =
    activeItem?.width && activeItem.height
      ? { width: activeItem.width, height: activeItem.height }
      : null;

  // The one place the options for a compress call are built: the live preview,
  // the batch run and the ZIP download all go through `compressItem` below.
  const sharedOptions = {
    goal: settings.goal,
    quality: settings.quality,
    targetBytes: targetBytes(settings),
    percent: settings.percent,
    maxEdge: settings.resizeMode === "maxEdge" ? settings.maxEdgePx : maxEdgeOf(settings),
    scalePercent: settings.resizeMode === "scale" ? settings.scalePercent : undefined,
    customWidth: settings.resizeMode === "custom" ? settings.customWidth : undefined,
    customHeight: settings.resizeMode === "custom" ? settings.customHeight : undefined,
    keepOriginalIfLarger: settings.keepSmaller,
    sharpen: settings.sharpenAmount > 0 ? settings.sharpenAmount : settings.sharpen ? 0.3 : 0,
    grayscale: settings.grayscale,
  };

  function compressOptions(file: File): CompressRequest {
    const format = resolveOutputFormat(settings, file);
    return {
      ...sharedOptions,
      format,
      backgroundColor:
        !settings.preserveAlpha || format === "jpeg" ? settings.backgroundColor : null,
    };
  }

  // Everything a compress call reads, as one string. It is built from the same
  // object as the options, so the two cannot drift. A stored result only counts
  // while the key it was made with still matches, so nothing made with older
  // settings can be shown as ready or end up in a download.
  const settingsKey = JSON.stringify([
    sharedOptions,
    settings.format,
    settings.preserveAlpha,
    settings.backgroundColor,
  ]);
  const settingsKeyRef = useRef(settingsKey);
  settingsKeyRef.current = settingsKey;

  function currentResult(id: string): CompressorStudioResult | null {
    const res = results[id];
    return res && res.settingsKey === settingsKey ? res : null;
  }

  /** Made with the current settings: safe to download. */
  const activeResult = activeItem ? currentResult(activeItem.id) : null;
  /** What the preview draws: this image's last render, kept on screen while a new one is made. */
  const shownResult = activeItem ? (results[activeItem.id] ?? null) : null;

  // Settings changed (or another image came on screen): drop every result made
  // with other settings. Only the image on screen keeps its old render, purely
  // as a picture, until the live preview replaces it.
  useEffect(() => {
    const keepId = activeItem?.id;
    const staleIds = Object.entries(resultsRef.current)
      .filter(([id, res]) => res.settingsKey !== settingsKey && id !== keepId)
      .map(([id]) => id);
    if (staleIds.length === 0) return;
    staleIds.forEach((id) => revokePreview(resultsRef.current[id]));
    setResults((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([id, res]) => res.settingsKey === settingsKey || !staleIds.includes(id),
        ),
      ),
    );
  }, [settingsKey, activeItem?.id]);

  const origWidth = dimensions?.width || 1920;
  const origHeight = dimensions?.height || 1080;

  function handleCustomWidthChange(val: number) {
    const clamped = Math.max(16, val);
    patchSettings({ customWidth: clamped });
    if (settings.lockAspect && origWidth > 0) {
      const ratio = origHeight / origWidth;
      patchSettings({
        customWidth: clamped,
        customHeight: Math.max(16, Math.round(clamped * ratio)),
      });
    }
  }

  function handleCustomHeightChange(val: number) {
    const clamped = Math.max(16, val);
    patchSettings({ customHeight: clamped });
    if (settings.lockAspect && origHeight > 0) {
      const ratio = origWidth / origHeight;
      patchSettings({
        customHeight: clamped,
        customWidth: Math.max(16, Math.round(clamped * ratio)),
      });
    }
  }

  /** Compresses one image with the current settings. Every result is made here. */
  async function compressItem(item: StudioImage): Promise<CompressorStudioResult> {
    const outcome = await compressFile(item.file, compressOptions(item.file));
    return {
      ...outcome,
      previewUrl: URL.createObjectURL(outcome.blob),
      name: outputFilename(
        item.file.name,
        outcome.format,
        outcome.keptOriginal ? "-original" : "-compressed",
      ),
      settingsKey,
    };
  }

  /**
   * A result for every queued image, made with the settings in force when this
   * is called. Stored results are reused only if they match those settings;
   * anything missing or outdated is compressed again.
   */
  async function gatherResults(
    onStep?: (index: number, item: StudioImage) => void,
  ): Promise<CompressorStudioResult[]> {
    const runKey = settingsKey;
    const fresh: Record<string, CompressorStudioResult> = {};
    const outputs: CompressorStudioResult[] = [];

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        onStep?.(i, item);

        const existing: CompressorStudioResult | undefined = resultsRef.current[item.id];
        let entry = existing && existing.settingsKey === runKey ? existing : null;
        if (!entry) {
          entry = await compressItem(item);
          fresh[item.id] = entry;
        }
        outputs.push(entry);
      }
    } catch (thrown) {
      Object.values(fresh).forEach(revokePreview);
      throw thrown;
    }

    if (Object.keys(fresh).length > 0) {
      if (settingsKeyRef.current !== runKey) {
        // The settings moved on mid-run: hand the files back, but do not keep them.
        Object.values(fresh).forEach(revokePreview);
      } else {
        setResults((prev) => {
          for (const [id, entry] of Object.entries(fresh)) {
            const old = prev[id];
            if (old && old !== entry) revokePreview(old);
          }
          return { ...prev, ...fresh };
        });
      }
    }

    return outputs;
  }

  // Real-time live compression for active item
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }

    // Nothing to do without an image, or when it already has a result for these settings.
    if (!activeItem || resultsRef.current[activeItem.id]?.settingsKey === settingsKey) {
      setPreviewBusy(false);
      return;
    }

    let cancelled = false;
    setPreviewBusy(true);

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const entry = await compressItem(activeItem);
        // Superseded by newer settings or another image while it was encoding.
        if (cancelled) {
          revokePreview(entry);
          return;
        }
        setResults((prev) => {
          const old = prev[activeItem.id];
          if (old && old !== entry) revokePreview(old);
          return { ...prev, [activeItem.id]: entry };
        });
      } catch (err) {
        console.error("Live compression preview failed:", err);
        // No result could be made for these settings: stop showing the outdated one.
        if (!cancelled) {
          setResults((prev) => {
            const old = prev[activeItem.id];
            if (!old || old.settingsKey === settingsKey) return prev;
            revokePreview(old);
            const next = { ...prev };
            delete next[activeItem.id];
            return next;
          });
        }
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
    // `settingsKey` covers every setting the compress call reads.
  }, [activeItem?.id, activeItem?.file, settingsKey]);

  async function saveZip(outputs: CompressorStudioResult[]) {
    await downloadAllAsZip(
      outputs.map((res) => ({ blob: res.blob, name: res.name })),
      "frebies-compressed.zip",
    );
    setNoticeTone("success");
    setNotice(`Saved ZIP with ${outputs.length} compressed files.`);
  }

  // Handle batch compression / download
  async function handleCompressAll() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setProgress({ current: 0, total: items.length });

    try {
      const outputs = await gatherResults((index, item) =>
        setProgress({ current: index + 1, total: items.length, name: item.file.name }),
      );

      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
        setNoticeTone("success");
        setNotice(`Saved ${outputs[0].name} (${formatBytes(outputs[0].bytes)}).`);
      } else if (outputs.length > 1) {
        await saveZip(outputs);
      }
    } catch (thrown) {
      setNoticeTone("error");
      setNotice(thrown instanceof Error ? thrown.message : "An error occurred during compression.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleDownloadZip() {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await saveZip(await gatherResults());
    } catch (err) {
      setNoticeTone("error");
      setNotice("Could not generate ZIP archive. Please download files individually.");
    } finally {
      setBusy(false);
    }
  }

  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalOutputBytes = items.reduce((sum, item) => {
    return sum + (currentResult(item.id)?.bytes ?? item.file.size);
  }, 0);
  const totalSavings = totalInputBytes > 0 ? reductionPercent(totalInputBytes, totalOutputBytes) : 0;

  const count = items.length;
  const isBatch = count > 1;
  /** Every image in the queue has a compressed file waiting. */
  const ready =
    count > 0 && items.every((item) => currentResult(item.id)) && Boolean(activeResult);
  /** A batch run is in flight (as opposed to a ZIP being packed for download). */
  const compressing = busy && progress !== null;
  const activeSavings = shownResult
    ? reductionPercent(shownResult.originalBytes, shownResult.bytes)
    : 0;
  const resized = Boolean(
    shownResult &&
      dimensions &&
      (shownResult.width !== dimensions.width || shownResult.height !== dimensions.height),
  );

  const goalPhrase =
    settings.goal === "target"
      ? targetBytes(settings) > 0
        ? ` to ${targetLabel(settings)}`
        : ""
      : settings.goal === "percent"
        ? ` by ${settings.percent}%`
        : ` at ${settings.quality}% quality`;

  function startOver() {
    clearAll();
    setNotice(null);
  }

  const fileButtons = (
    <>
      {/* A batch has its own add key at the end of the strip. */}
      {isBatch ? null : (
        <SecondaryAction onClick={() => openPicker()} icon={<ImagePlus size={13} aria-hidden />}>
          Add images
        </SecondaryAction>
      )}
      <StartOverAction onClick={startOver} />
    </>
  );
  // On phones the dock keeps only the big button; these two sit under the file instead.
  const fileActions = count > 0 ? <ActionRow className="max-lg:hidden">{fileButtons}</ActionRow> : null;

  const quick = (
    <QuickPick
      label="Maximum file size"
      value={settings.goal === "target" ? `${settings.targetValue} ${settings.targetUnit}` : null}
      options={["50 KB", "100 KB", "200 KB", "500 KB", "1 MB", "2 MB"].map((value) => ({ value, label: value }))}
      onChange={(value) => {
        const [targetValue, targetUnit] = value.split(" ");
        patchSettings({ goal: "target", targetValue, targetUnit: targetUnit as CompressSettings["targetUnit"] });
      }}
    />
  );

  const action =
    ready && activeResult && !compressing ? (
      <>
        {quick}
        <PrimaryAction
          tone="success"
          label={
            isBatch
              ? `Download ${count} images (ZIP)`
              : `Download ${FORMAT_LABEL[activeResult.format]} · ${formatBytes(activeResult.bytes)}`
          }
          busyLabel="Preparing ZIP…"
          icon={<Download size={16} aria-hidden />}
          busy={busy}
          onClick={isBatch ? handleDownloadZip : handleCompressAll}
          hint={
            isBatch
              ? `${totalSavings > 0 ? `${totalSavings}% smaller · ` : ""}${formatBytes(totalInputBytes)} → ${formatBytes(totalOutputBytes)}`
              : activeResult.keptOriginal
                ? "Already as small as it gets, so this is the original"
                : `${activeSavings > 0 ? `${activeSavings}% smaller · ` : ""}was ${formatBytes(activeResult.originalBytes)}`
          }
        />
        {fileActions}
      </>
    ) : (
      <>
        {quick}
        <PrimaryAction
          label={
            count === 0
              ? "Compress images"
              : isBatch
                ? `Compress ${count} images${goalPhrase}`
                : `Compress${goalPhrase}`
          }
          busyLabel={
            progress ? `Compressing ${progress.current} of ${progress.total}…` : "Compressing…"
          }
          icon={<Minimize2 size={16} aria-hidden />}
          busy={busy || (count === 1 && previewBusy)}
          progress={
            busy && progress ? Math.max(0, (progress.current - 0.5) / progress.total) : undefined
          }
          disabled={count === 0}
          onClick={handleCompressAll}
          hint={
            count === 0
              ? "Add images to get started"
              : isBatch
                ? "Saves everything as one ZIP"
                : undefined
          }
        />
        {fileActions}
      </>
    );

  return (
    <StudioFrame id="compressor" label="Image compression studio">
      <StudioStage flush>
        {count === 0 || !activeItem ? (
          <StudioDropzone
            title="Drop images to compress"
            description={`Hit an exact file size, pick a quality, or cut a percentage. One image or a batch of ${MAX_FILES}.`}
            buttonLabel="Choose images"
            limits={`JPG, PNG, WebP, AVIF, HEIC, BMP · up to ${maxSizeMB} MB each`}
            onChoose={() => openPicker()}
            dragging={dragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            chips={
              <>
                <StudioChip>Exact KB or MB target</StudioChip>
                <StudioChip>Quality slider</StudioChip>
                <StudioChip>Batch to ZIP</StudioChip>
              </>
            }
          />
        ) : (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <FileRow
              flush
              className="border-b border-line"
              icon={<ImageIcon size={17} aria-hidden />}
              name={activeItem.file.name}
              meta={
                <>
                  {formatBytes(activeItem.file.size)}
                  {dimensions ? ` · ${dimensions.width} × ${dimensions.height} px` : ""}
                  {shownResult && resized ? ` → ${shownResult.width} × ${shownResult.height} px` : ""}
                </>
              }
              onReplace={() => openPicker(activeItem.id)}
              onRemove={() => removeItem(activeItem.id)}
            >
              {shownResult ? (
                <ViewTabs mode={viewMode} onChange={setViewMode} afterLabel="Compressed" />
              ) : null}
              {isBatch && activeResult ? (
                <ToolText
                  onClick={() => downloadBlob(activeResult.blob, activeResult.name)}
                  title={`Download ${activeResult.name} (${formatBytes(activeResult.bytes)})`}
                  icon={<Download size={14} aria-hidden />}
                  compact
                >
                  Save this one
                </ToolText>
              ) : null}
            </FileRow>

            <ImageViewer
              title={activeItem.file.name}
              before={{
                src: activeItem.preview,
                width: dimensions?.width ?? shownResult?.width ?? 1,
                height: dimensions?.height ?? shownResult?.height ?? 1,
                label: "Original",
                note: formatBytes(activeItem.file.size),
                alt: `Original ${activeItem.file.name}`,
              }}
              after={
                shownResult
                  ? {
                      src: shownResult.previewUrl,
                      width: shownResult.width,
                      height: shownResult.height,
                      label: FORMAT_LABEL[shownResult.format],
                      note: formatBytes(shownResult.bytes),
                      alt: `Compressed ${activeItem.file.name}`,
                    }
                  : null
              }
              mode={viewMode}
              onModeChange={setViewMode}
              busy={previewBusy || compressing}
              busyLabel={compressing && progress ? `${progress.current} of ${progress.total}` : "Compressing"}
              dragging={dragging}
              dropLabel="Drop to add"
            />

            {isBatch ? (
              <Filmstrip
                label="Images in this batch"
                addLabel="Add more images"
                activeId={activeItem.id}
                onSelect={setActiveId}
                onRemove={removeItem}
                onAdd={() => openPicker()}
                items={items.map((item) => {
                  const made = currentResult(item.id);
                  return {
                    id: item.id,
                    name: item.file.name,
                    src: made ? made.previewUrl : item.preview,
                    done: Boolean(made),
                    badge: made
                      ? `−${Math.max(0, reductionPercent(made.originalBytes, made.bytes))}%`
                      : sourceFormat(item.file),
                    title: `${item.file.name} · ${formatBytes(item.file.size)}${made ? ` → ${formatBytes(made.bytes)}` : ""}`,
                  };
                })}
              />
            ) : null}

            <div className="flex shrink-0 gap-2 border-t border-line bg-panel p-3 lg:hidden [&>*]:flex-1">{fileButtons}</div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/bmp,.jpg,.jpeg,.png,.webp,.avif,.heic,.bmp"
          multiple
          tabIndex={-1}
          aria-label="Choose images"
          className="sr-only"
          onChange={onPick}
        />

        <span
          aria-hidden
          className="hidden"
          data-success={noticeTone === "success" ? notice : undefined}
          data-error={error ?? (noticeTone === "error" ? notice : undefined)}
        />

        {error ? <Note tone="error" className="m-3 shrink-0">{error}</Note> : null}
        {notice && noticeTone === "error" ? (
          <Note tone="error" className="m-3 shrink-0">
            {notice}
          </Note>
        ) : null}
        <p role="status" className="sr-only">
          {noticeTone === "success" ? notice : ""}
        </p>
      </StudioStage>

      <ImageCompressSettings
        action={action}
        settings={settings}
        dimensions={dimensions}
        originalBytes={activeItem ? activeItem.file.size : null}
        hasImage={Boolean(activeItem)}
        onPatch={patchSettings}
        onCustomWidth={handleCustomWidthChange}
        onCustomHeight={handleCustomHeightChange}
        onReset={resetSettings}
      />
    </StudioFrame>
  );
}
