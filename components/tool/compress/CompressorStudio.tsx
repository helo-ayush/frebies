"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  ImagePlus,
  Images,
  Percent,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { StudioRail } from "@/components/tool/studio/StudioRail";
import { CompressorControls } from "./CompressorControls";
import {
  DEFAULT_SETTINGS,
  MAX_FILES,
  estimateForItem,
  formatBytes,
  goalLabel,
  reductionPercent,
  type CompressItem,
  type CompressPreset,
  type CompressSettings,
} from "./model";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function CompressorStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const [items, setItems] = useState<CompressItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const itemsRef = useRef<CompressItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    },
    [],
  );

  function patchSettings(patch: Partial<CompressSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setPresetId(null);
    setNotice(null);
  }

  function applyPreset(preset: CompressPreset) {
    setSettings((current) => ({ ...current, ...preset.patch }));
    setPresetId(preset.id);
    setNotice(null);
  }

  function openPicker(replaceId?: string) {
    replaceIdRef.current = replaceId ?? null;
    inputRef.current?.click();
  }

  function acceptFiles(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? []);
    if (incoming.length === 0) return;
    setNotice(null);

    const replaceId = replaceIdRef.current;
    replaceIdRef.current = null;

    let baseItems = items;
    if (replaceId) {
      baseItems = items.filter((item) => item.id !== replaceId);
    }

    const remaining = MAX_FILES - baseItems.length;
    const accepted: CompressItem[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedOverflow = 0;

    for (const file of incoming) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        skippedType += 1;
        continue;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        skippedSize += 1;
        continue;
      }
      if (accepted.length >= remaining) {
        skippedOverflow += 1;
        continue;
      }

      idRef.current += 1;
      accepted.push({
        id: `compress-${idRef.current}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (accepted.length === 0) {
      setError(
        skippedType > 0
          ? "Choose JPG, PNG or WebP images."
          : skippedSize > 0
            ? `That image is larger than ${maxSizeMB} MB.`
            : `You can compress up to ${MAX_FILES} images at a time.`,
      );
      return;
    }

    if (replaceId) {
      const replaced = items.find((item) => item.id === replaceId);
      if (replaced) URL.revokeObjectURL(replaced.preview);
    }

    setItems([...baseItems, ...accepted]);
    setActiveId(accepted[0].id);

    const messages: string[] = [];
    if (skippedType > 0) {
      messages.push(
        `${skippedType} file${skippedType === 1 ? "" : "s"} skipped — use JPG, PNG or WebP.`,
      );
    }
    if (skippedSize > 0) {
      messages.push(
        `${skippedSize} file${skippedSize === 1 ? " was" : "s were"} over ${maxSizeMB} MB.`,
      );
    }
    if (skippedOverflow > 0) {
      messages.push(`Only ${MAX_FILES} images fit in one batch.`);
    }
    setError(messages.length > 0 ? messages.join(" ") : null);

    accepted.forEach((item) => {
      const image = new window.Image();
      image.onload = () => {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, width: image.naturalWidth, height: image.naturalHeight }
              : entry,
          ),
        );
      };
      image.src = item.preview;
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(event.target.files);
    event.target.value = "";
  }

  function removeItem(id: string) {
    const target = items.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    setActiveId((current) => (current === id ? next[0]?.id ?? null : current));
  }

  function clearAll() {
    items.forEach((item) => URL.revokeObjectURL(item.preview));
    setItems([]);
    setActiveId(null);
    setError(null);
    setNotice(null);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    replaceIdRef.current = null;
    acceptFiles(event.dataTransfer.files);
  }

  function handleCompress() {
    setNotice(
      items.length > 1
        ? `Preview only — the encoder is connected in the next build step. ${items.length} images are set to ${goalLabel(settings)}, and nothing leaves this device.`
        : `Preview only — the encoder is connected in the next build step. This image is set to ${goalLabel(settings)}, and nothing leaves this device.`,
    );
  }

  const activeItem = items.find((item) => item.id === activeId) ?? items[0] ?? null;
  const activeIndex = activeItem ? items.findIndex((item) => item.id === activeItem.id) : -1;
  const activeOutput = activeItem ? estimateForItem(activeItem, settings) : 0;
  const activeSavings = activeItem
    ? reductionPercent(activeItem.file.size, activeOutput)
    : 0;

  const totalOriginal = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalOutput = items.reduce((sum, item) => sum + estimateForItem(item, settings), 0);
  const totalSavings = reductionPercent(totalOriginal, totalOutput);
  const compressedWidth =
    totalOriginal > 0 ? Math.min(100, Math.max(3, (totalOutput / totalOriginal) * 100)) : 0;

  return (
    <section
      id="compressor"
      aria-label="Image compression studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/image/compress" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Compression studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Quality, percentage or an exact final size.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Target size={10} aria-hidden />
            {goalLabel(settings)}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Files stay local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[700px] lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {items.length === 0 ? (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[430px] flex-1 flex-col items-center justify-center rounded-[16px] border px-5 py-10 text-center transition-colors ${
                dragging
                  ? "border-[#b8a992] bg-[#f8f3ea]"
                  : "border-dashed border-[#d7d2c8] bg-[#fbfaf7]"
              }`}
            >
              <span className="relative grid h-[68px] w-[68px] place-items-center rounded-[20px] border border-white bg-white text-muted shadow-[0_10px_30px_rgba(71,54,35,0.07)]">
                <UploadCloud size={27} strokeWidth={1.4} aria-hidden />
                <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-[#fbfaf7] bg-[#c79862]" />
              </span>
              <p className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">
                Drop images to compress
              </p>
              <p className="mt-1.5 max-w-sm text-ui text-muted">
                One file or a full batch. Set a quality level, a percentage cut or an exact
                final size.
              </p>
              <button
                type="button"
                onClick={() => openPicker()}
                className={buttonClasses("primary", "md", "mt-5")}
              >
                Choose images
                <ArrowRightGlyph size={13} />
              </button>
              <p className="mt-4 text-micro text-faint">
                JPG, PNG or WebP · up to {maxSizeMB} MB each · {MAX_FILES} per batch
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#7c7469]">
                <ShieldCheck size={11} aria-hidden />
                Processed locally. Nothing is uploaded.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                  <Target size={10} aria-hidden />
                  Target size
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                  <Percent size={10} aria-hidden />
                  Percentage
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                  <Images size={10} aria-hidden />
                  Batch ready
                </span>
              </div>
            </div>
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-[360px] flex-1 flex-col rounded-[16px] border p-3 transition-colors ${
                dragging ? "border-[#b8a992] bg-[#f8f3ea]" : "border-line bg-[#f6f4f0]"
              }`}
            >
              <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#f1efeb] p-3">
                <span className="absolute left-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                  Source image
                </span>
                {activeItem?.width && activeItem.height ? (
                  <span className="absolute right-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                    {activeItem.width} × {activeItem.height}
                  </span>
                ) : null}
                {activeItem && (
                  <img
                    src={activeItem.preview}
                    alt={`Preview of ${activeItem.file.name}`}
                    className="max-h-[400px] max-w-full rounded-[8px] object-contain shadow-[0_10px_30px_rgba(45,35,22,0.08)]"
                  />
                )}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-white/70 bg-white/90 px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm backdrop-blur">
                  <TrendingDown
                    size={11}
                    className={activeSavings > 0 ? "text-[#3d6b4a]" : "text-faint"}
                    aria-hidden
                  />
                  <span className="tabular-nums">≈ {formatBytes(activeOutput)}</span>
                  {activeSavings > 0 && (
                    <span className="text-[#3d6b4a]">−{activeSavings}%</span>
                  )}
                </div>
              </div>

              {activeItem && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                    <ToolGlyph path="/image/compress" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">
                      {activeItem.file.name}
                    </p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(activeItem.file.size)}
                      {activeItem.width && activeItem.height
                        ? ` · ${activeItem.width} × ${activeItem.height}px`
                        : ""}
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
            <div className="mt-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
                  Batch · {items.length} images
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[10px] font-medium text-faint transition-colors hover:text-ink"
                >
                  Clear all
                </button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                {items.map((item, index) => {
                  const isActive = item.id === activeItem?.id;
                  const output = estimateForItem(item, settings);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      aria-pressed={isActive}
                      aria-label={`Edit ${item.file.name}`}
                      className={`relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[9px] border bg-white transition-colors ${
                        isActive
                          ? "border-ink ring-2 ring-ink/10"
                          : "border-line hover:border-[#cbc5b9]"
                      }`}
                    >
                      <img
                        src={item.preview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-1 pb-0.5 text-left text-[8px] font-medium tabular-nums text-white">
                        {formatBytes(output)}
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

          <SizeSummary
            original={totalOriginal}
            output={totalOutput}
            savings={totalSavings}
            compressedWidth={compressedWidth}
            count={items.length}
            formatLabel={settings.format === "auto" ? "Auto format" : settings.format.toUpperCase()}
            goal={goalLabel(settings)}
          />
        </div>

        <StudioRail label="Compression settings">
          <CompressorControls
            settings={settings}
            presetId={presetId}
            onPatch={patchSettings}
            onPreset={applyPreset}
            activeOriginal={activeItem?.file.size ?? null}
          />
        </StudioRail>
      </div>

      {notice && (
        <p
          role="status"
          className="border-t border-[#eadfce] bg-[#fdf9f2] px-4 py-2.5 text-micro leading-relaxed text-[#786344] sm:px-5"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-line bg-white px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <p className="flex items-center gap-1.5 text-micro text-faint">
          <ShieldCheck size={12} aria-hidden />
          Free · no upload · no watermark
        </p>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] tabular-nums text-faint sm:inline">
            {items.length > 0
              ? `${formatBytes(totalOutput)} · ${totalSavings > 0 ? `−${totalSavings}%` : "no saving"}`
              : "Add an image to start"}
          </span>
          <button
            type="button"
            onClick={handleCompress}
            disabled={items.length === 0}
            className={buttonClasses(
              "primary",
              "md",
              "w-full min-w-0 sm:w-auto sm:min-w-[150px]",
            )}
          >
            {items.length > 1 ? `Compress ${items.length} images` : "Compress image"}
            <ArrowRightGlyph size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}

function SizeSummary({
  original,
  output,
  savings,
  compressedWidth,
  count,
  formatLabel,
  goal,
}: {
  original: number;
  output: number;
  savings: number;
  compressedWidth: number;
  count: number;
  formatLabel: string;
  goal: string;
}) {
  if (count === 0) {
    return (
      <div className="mt-3 flex shrink-0 items-center justify-between gap-3 rounded-[13px] border border-dashed border-[#ddd8ce] bg-[#fbfaf7] px-3.5 py-3">
        <div>
          <p className="text-[11px] font-medium text-ink">No estimate yet</p>
          <p className="mt-0.5 text-[10px] text-faint">
            Add an image and the size ladder appears here.
          </p>
        </div>
        <TrendingDown size={16} className="shrink-0 text-[#c8c1b4]" aria-hidden />
      </div>
    );
  }

  const savingsLabel =
    savings > 0 ? `−${savings}%` : savings === 0 ? "No saving" : `+${Math.abs(savings)}%`;

  return (
    <div className="mt-3 shrink-0 rounded-[13px] border border-line bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
            {count > 1 ? "Estimated total" : "Estimated output"}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
              {formatBytes(output)}
            </span>
            <span className="text-[11px] text-faint">from {formatBytes(original)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-1 text-[10.5px] font-semibold tabular-nums ${
              savings > 0
                ? "bg-[#eef4ee] text-[#3d6b4a]"
                : savings === 0
                  ? "bg-[#f5f2ec] text-[#786344]"
                  : "bg-[#fdf1ee] text-[#a13d30]"
            }`}
          >
            {savingsLabel}
          </span>
          <span className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-muted">
            {formatLabel}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <SizeBar label="Original" value={formatBytes(original)} width={100} tone="track" />
        <SizeBar
          label="Compressed"
          value={formatBytes(output)}
          width={compressedWidth}
          tone="ink"
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 text-[10px] text-faint">
        <span>
          Saved {formatBytes(Math.max(0, original - output))}
          {count > 1 ? ` across ${count} images` : ""}
        </span>
        <span className="shrink-0 tabular-nums">Goal {goal}</span>
      </div>
    </div>
  );
}

function SizeBar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: string;
  width: number;
  tone: "track" | "ink";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[62px] shrink-0 text-[10px] text-faint">{label}</span>
      <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#f2efe9]">
        <span
          className={`block h-full rounded-full transition-[width] duration-150 ${
            tone === "ink" ? "bg-ink" : "bg-[#d8d2c6]"
          }`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-[54px] shrink-0 text-right text-[10px] font-medium tabular-nums text-ink">
        {value}
      </span>
    </div>
  );
}
