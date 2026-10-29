"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Images,
  ImagePlus,
  Loader2,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioDropzone, StudioChip } from "@/components/tool/studio/StudioDropzone";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import {
  FORMAT_LABEL,
  canvasToBlob,
  downloadBlob,
  drawRegion,
  loadImageFile,
  outputFilename,
  supportedFormats,
  type EncodeFormat,
} from "@/lib/image/encode";

const MAX_FILES = 10;

const FORMAT_META: Record<EncodeFormat, { hint: string; lossy: boolean }> = {
  png: { hint: "Lossless", lossy: false },
  jpeg: { hint: "Universal", lossy: true },
  webp: { hint: "Modern", lossy: true },
  avif: { hint: "Smallest", lossy: true },
};

type Converted = { blob: Blob; name: string; bytes: number; width: number; height: number };

export function ImageConvertStudio({
  path,
  maxSizeMB,
}: {
  path: string;
  maxSizeMB: number;
}) {
  const {
    items,
    activeItem,
    activeIndex,
    error,
    dragging,
    setActiveId,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
    clearAll,
  } = useImageQueue({ maxFiles: MAX_FILES, maxSizeMB, formatHint: "JPG, PNG or WebP" });

  const [available, setAvailable] = useState<EncodeFormat[]>(["png", "jpeg", "webp"]);
  const [format, setFormat] = useState<EncodeFormat>("webp");
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [quality, setQuality] = useState(90);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, Converted>>({});

  useEffect(() => {
    const list = supportedFormats();
    setAvailable(list);
    setFormat((current) => (list.includes(current) ? current : list[0] ?? "jpeg"));
  }, []);

  const isLossy = FORMAT_META[format]?.lossy ?? true;
  const visibleFormats = showAllFormats ? available : available.slice(0, 3);
  const dimensions =
    activeItem?.width && activeItem.height
      ? { width: activeItem.width, height: activeItem.height }
      : null;
  const totalInput = items.reduce((sum, item) => sum + item.file.size, 0);
  const settled = items.filter((item) => results[item.id]);
  const allSettled = items.length > 0 && settled.length === items.length;

  useEffect(() => {
    setNotice(null);
    setResults({});
  }, [items.length]);

  async function handleConvert() {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    setResults({});

    try {
      for (const item of items) {
        const image = await loadImageFile(item.file);
        const width = image.naturalWidth || item.width || 1;
        const height = image.naturalHeight || item.height || 1;
        const canvas = drawRegion(
          image,
          { x: 0, y: 0, width, height },
          { width, height },
          { fit: "stretch", background: format === "jpeg" ? "#ffffff" : null },
        );
        const blob = await canvasToBlob(canvas, format, quality / 100);
        const name = outputFilename(item.file.name, format);
        setResults((current) => ({
          ...current,
          [item.id]: { blob, name, bytes: blob.size, width: canvas.width, height: canvas.height },
        }));

        if (items.length === 1) {
          downloadBlob(blob, name);
          setNotice(
            `Saved ${name} · ${canvas.width} × ${canvas.height} px · ${formatBytes(
              blob.size,
            )}. Nothing left your device.`,
          );
        }
      }

      if (items.length > 1) {
        setNotice(
          `Converted ${items.length} images to ${FORMAT_LABEL[format]}. Download each file below — nothing left your device.`,
        );
      }
    } catch (thrown) {
      setNotice(
        thrown instanceof Error ? thrown.message : "This image could not be converted.",
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadAll() {
    items.forEach((item, index) => {
      const result = results[item.id];
      if (!result) return;
      window.setTimeout(() => downloadBlob(result.blob, result.name), index * 250);
    });
  }

  function chooseFormat(next: EncodeFormat) {
    setFormat(next);
    setNotice(null);
    setResults({});
  }

  return (
    <section
      id="converter"
      aria-label="Image conversion studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path={path} size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Conversion studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              One image or a batch, one clean output each.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Images size={10} aria-hidden />
            {items.length > 1 ? `${items.length} images` : `To ${FORMAT_LABEL[format]}`}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#d9e3d5] bg-[#f4f8f2] px-2.5 py-1 text-[10px] font-medium text-[#4a6b47]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5f8a56]" aria-hidden />
            Ready · on device
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Your files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[640px] lg:grid-cols-[minmax(0,1fr)_350px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <StudioDropzone
              title="Drop your images here"
              description="Convert one image or a whole batch. JPG, PNG and WebP are read locally, so your files never leave this device."
              buttonLabel="Choose images"
              limits={`JPG, PNG or WebP · up to ${maxSizeMB} MB each · ${MAX_FILES} per batch`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <StudioChip icon={<Images size={10} aria-hidden />}>Batch up to {MAX_FILES}</StudioChip>
                  <StudioChip icon={<Check size={10} aria-hidden />}>Keeps dimensions</StudioChip>
                </>
              }
            />
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[300px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#f1efeb] p-3">
                <span className="absolute left-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                  Source image
                </span>
                {dimensions && (
                  <span className="absolute right-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                    {dimensions.width} × {dimensions.height}
                  </span>
                )}
                {activeItem && (
                  <img
                    src={activeItem.preview}
                    alt={`Preview of ${activeItem.file.name}`}
                    className="max-h-[380px] max-w-full rounded-[8px] object-contain shadow-[0_10px_30px_rgba(45,35,22,0.08)]"
                  />
                )}
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/90 px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm backdrop-blur">
                  <ArrowRightGlyph size={11} aria-hidden />
                  <span className="tabular-nums">{FORMAT_LABEL[format]}</span>
                </span>
              </div>

              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                    <ToolGlyph path={path} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">
                      {activeItem.file.name}
                    </p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(activeItem.file.size)}
                      {dimensions ? ` · ${dimensions.width} × ${dimensions.height}px` : ""}
                      {items.length > 1 ? ` · ${activeIndex + 1} of ${items.length}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPicker()}
                    aria-label="Add more images"
                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    <ImagePlus size={11} aria-hidden />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker(activeItem.id)}
                    className="hidden h-7 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink sm:block"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(activeItem.id)}
                    aria-label={`Remove ${activeItem.file.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={13} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            tabIndex={-1}
            aria-label="Choose images"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {items.length > 1 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                  Batch · {items.length} images
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearAll();
                    setNotice(null);
                    setResults({});
                  }}
                  className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                >
                  Clear all
                </button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                {items.map((item, index) => {
                  const isActive = item.id === activeItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      aria-pressed={isActive}
                      aria-label={`Edit ${item.file.name}`}
                      title={item.file.name}
                      className={`relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[9px] border bg-white transition-colors ${
                        isActive
                          ? "border-ink ring-2 ring-ink/10"
                          : "border-line hover:border-[#cbc5b9]"
                      }`}
                    >
                      <img src={item.preview} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-1 pb-0.5 text-left text-[8px] font-medium text-white">
                        {results[item.id] ? formatBytes(results[item.id].bytes) : sourceFormat(item.file)}
                      </span>
                      <span className="absolute left-1 top-1 grid h-[14px] w-[14px] place-items-center rounded-full bg-white/90 text-[8px] font-semibold text-ink">
                        {index + 1}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => openPicker()}
                  aria-label="Add more images"
                  className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-[9px] border border-dashed border-[#d7d2c8] text-faint transition-colors hover:border-[#b8a992] hover:text-ink"
                >
                  <Plus size={15} aria-hidden />
                </button>
              </div>
            </div>
          )}

          {settled.length > 0 && items.length > 1 && (
            <div className="mt-3 rounded-[13px] border border-[#d9e3d5] bg-[#f6faf4] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-[#4a6b47]">
                  {settled.length} of {items.length} converted
                </p>
                <button
                  type="button"
                  onClick={downloadAll}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3d5c3a] transition-colors hover:underline"
                >
                  <Download size={10} aria-hidden />
                  Download all
                </button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {items.map((item) => {
                  const result = results[item.id];
                  if (!result) return null;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-[#dbe6d6] bg-white px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-ink">
                        {result.name}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-faint">
                        {formatBytes(item.file.size)} → {formatBytes(result.bytes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadBlob(result.blob, result.name)}
                        aria-label={`Download ${result.name}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#dbe6d6] bg-white text-[#3d5c3a] transition-colors hover:bg-[#eef4ec]"
                      >
                        <Download size={11} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} aria-hidden />
              Free · No upload · No watermark
            </p>
            <div className="flex items-center gap-2">
              {allSettled && items.length > 1 && (
                <button
                  type="button"
                  onClick={downloadAll}
                  className={buttonClasses("secondary", "md", "w-full sm:w-auto")}
                >
                  <Download size={13} aria-hidden />
                  Download all
                </button>
              )}
              <button
                type="button"
                onClick={handleConvert}
                disabled={!activeItem || busy}
                className={buttonClasses("primary", "md", "w-full min-w-0 sm:w-auto sm:min-w-[140px]")}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    Converting…
                  </>
                ) : (
                  <>
                    {items.length > 1 ? `Convert ${items.length} images` : "Convert image"}
                    <ArrowRightGlyph size={13} />
                  </>
                )}
              </button>
            </div>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 shrink-0 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <StudioRail label="Conversion settings">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-medium text-ink">Output</h2>
              <span className="text-micro text-faint">
                {items.length > 1 ? `Applies to ${items.length} images` : "Original dimensions"}
              </span>
            </div>

            <fieldset>
              <legend className="text-ui font-medium text-ink">Format</legend>
              <div id="converter-format-grid" className="mt-2 grid grid-cols-3 gap-2">
                {visibleFormats.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={format === option}
                    onClick={() => chooseFormat(option)}
                    className={`rounded-[10px] border px-2 py-3 text-center transition-colors ${
                      format === option
                        ? "border-ink bg-rail text-ink"
                        : "border-line bg-white text-muted hover:border-[#d5d1c8] hover:text-ink"
                    }`}
                  >
                    <span className="block text-[14px] font-medium">{FORMAT_LABEL[option]}</span>
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {FORMAT_META[option].hint}
                    </span>
                  </button>
                ))}
              </div>

              {available.length > 3 && (
                <button
                  type="button"
                  aria-expanded={showAllFormats}
                  aria-controls="converter-format-grid"
                  onClick={() => setShowAllFormats((current) => !current)}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-micro font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  {showAllFormats ? "Show fewer formats" : `See ${available.length - 3} more format`}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${showAllFormats ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              )}

              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Only formats this browser can encode are shown. PNG and WebP keep
                transparency; JPG flattens it onto white.
              </p>
            </fieldset>

            <div>
              <div className="flex items-center justify-between text-ui">
                <span className="font-medium text-ink">Quality</span>
                <span className="text-micro tabular-nums text-faint">
                  {isLossy ? `${quality}%` : "Lossless"}
                </span>
              </div>
              <input
                type="range"
                min={40}
                max={100}
                value={isLossy ? quality : 100}
                disabled={!isLossy}
                onChange={(event) => {
                  setQuality(Number(event.target.value));
                  setNotice(null);
                  setResults({});
                }}
                aria-label="Output quality"
                aria-valuetext={isLossy ? `${quality} percent quality` : "Lossless output"}
                className="mt-3 h-1.5 w-full cursor-pointer accent-[#171717] disabled:cursor-not-allowed disabled:opacity-35"
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-faint">
                <span>Smaller file</span>
                <span>Better detail</span>
              </div>
              {!isLossy && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                  {FORMAT_LABEL[format]} preserves the image without a quality tradeoff.
                </p>
              )}
            </div>

            <div className="rounded-[11px] border border-line bg-white p-3.5">
              <div className="flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Output format</span>
                <span className="font-medium text-ink">{FORMAT_LABEL[format]}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Dimensions</span>
                <span className="font-medium text-ink">
                  {dimensions ? `${dimensions.width} × ${dimensions.height}` : "Original"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Files</span>
                <span className="font-medium tabular-nums text-ink">
                  {items.length > 1 ? `${items.length} · ${formatBytes(totalInput)}` : "1"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-micro">
                <span className="text-faint">Metadata</span>
                <span className="flex items-center gap-1 font-medium text-ink">
                  <Check size={11} aria-hidden />
                  Stripped
                </span>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              Batch conversion keeps one output per input at the original dimensions.
              Metadata is not copied, and nothing is uploaded.
            </p>
          </div>
        </StudioRail>
      </div>
    </section>
  );
}

function sourceFormat(file: File) {
  if (file.type === "image/jpeg") return "JPG";
  if (file.type === "image/png") return "PNG";
  if (file.type === "image/webp") return "WebP";
  return "IMG";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
