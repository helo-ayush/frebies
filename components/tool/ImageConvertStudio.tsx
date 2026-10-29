"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, ChevronDown, ShieldCheck, UploadCloud, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import {
  ArrowRightGlyph,
  LockGlyph,
  ToolGlyph,
} from "@/components/icons/NavGlyph";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const formats = [
  { value: "PNG", hint: "Lossless", lossy: false },
  { value: "JPG", hint: "Universal", lossy: true },
  { value: "WebP", hint: "Modern", lossy: true },
  { value: "AVIF", hint: "Smallest", lossy: true },
  { value: "GIF", hint: "Indexed", lossy: false },
  { value: "BMP", hint: "Legacy", lossy: false },
  { value: "TIFF", hint: "Print", lossy: false },
  { value: "ICO", hint: "App icon", lossy: false },
  { value: "HEIC", hint: "Apple", lossy: true },
  { value: "JXL", hint: "Next-gen", lossy: true },
  { value: "TGA", hint: "Legacy", lossy: false },
  { value: "JP2", hint: "Archive", lossy: true },
] as const;

type OutputFormat = (typeof formats)[number]["value"];

export function ImageConvertStudio({
  path,
  maxSizeMB,
}: {
  path: string;
  maxSizeMB: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [format, setFormat] = useState<OutputFormat>("WebP");
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [quality, setQuality] = useState(90);
  const [preserveMetadata, setPreserveMetadata] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedFormat = formats.find((option) => option.value === format);
  const isLossy = selectedFormat?.lossy ?? false;
  const visibleFormats = showAllFormats ? formats : formats.slice(0, 3);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setDimensions(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    const image = new window.Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptFile(next: File | undefined) {
    if (!next) return;
    setNotice(null);

    if (!ALLOWED_TYPES.includes(next.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (next.size > maxSizeMB * 1024 * 1024) {
      setError(`That image is larger than ${maxSizeMB} MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setError(null);
    setFile(next);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  function handleConvert() {
    setNotice(
      `The studio is ready. The ${format} conversion engine is connected in the next build step.`,
    );
  }

  return (
    <section
      id="converter"
      aria-label="Image conversion studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-[#fdfdfc] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path={path} size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Conversion studio</h2>
            <p className="mt-0.5 text-micro text-faint">One image, one clean output.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" />
            Interface preview
          </span>
          <span className="hidden items-center gap-1.5 text-micro text-faint sm:flex">
            <LockGlyph size={11} />
            Your file stays local
          </span>
        </div>
      </div>

      <div className="grid lg:h-[560px] lg:grid-cols-[minmax(0,1fr)_350px]">
        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative flex flex-1 flex-col overflow-hidden rounded-[16px] border ${
              dragging
                ? "border-[#b8a992] bg-[#f8f3ea]"
                : file
                  ? "border-line bg-[#f6f4f0]"
                  : "border-dashed border-[#d7d2c8] bg-[#fbfaf7]"
            }`}
          >
            {file ? (
              <div className="flex h-full flex-col p-3 sm:p-4">
                <div className="relative flex min-h-[330px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#f1efeb] p-3">
                  <span
                    aria-hidden
                    className="absolute left-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur"
                  >
                    Source image
                  </span>
                  {preview && (
                    <img
                      src={preview}
                      alt="Selected image preview"
                      className="max-h-[320px] max-w-full rounded-[8px] object-contain shadow-[0_10px_30px_rgba(45,35,22,0.08)]"
                    />
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[11px] border border-line bg-white px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                    <ToolGlyph path={path} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-ink">{file.name}</p>
                    <p className="mt-0.5 text-micro text-faint">
                      {formatBytes(file.size)}
                      {dimensions ? ` · ${dimensions.width} × ${dimensions.height}px` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="h-8 rounded-lg border border-line bg-white px-2.5 text-micro font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    aria-label="Remove selected image"
                    className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[432px] flex-col items-center justify-center px-5 py-10 text-center">
                <span className="relative grid h-[68px] w-[68px] place-items-center rounded-[20px] border border-white bg-white text-muted shadow-[0_10px_30px_rgba(71,54,35,0.07)]">
                  <UploadCloud size={27} strokeWidth={1.4} />
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-[#fbfaf7] bg-[#c79862]" />
                </span>
                <p className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">
                  Drop your image here
                </p>
                <p className="mt-1.5 max-w-sm text-ui text-muted">
                  Drag a file into the studio or choose one from your device.
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={buttonClasses("primary", "md", "mt-5")}
                >
                  Choose image
                  <ArrowRightGlyph size={13} />
                </button>
                <p className="mt-4 text-micro text-faint">
                  JPG, PNG or WebP · up to {maxSizeMB} MB
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#7c7469]">
                  <ShieldCheck size={11} />
                  Previewed locally. Nothing is uploaded.
                </p>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              tabIndex={-1}
              aria-label="Choose image file"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 text-ui text-[#a13d30]">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <ShieldCheck size={12} />
              Free · No upload · No watermark
            </p>
            <button
              type="button"
              onClick={handleConvert}
              disabled={!file}
              className={buttonClasses("primary", "md", "min-w-[140px]")}
            >
              Convert image
              <ArrowRightGlyph size={13} />
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 rounded-[10px] border border-[#eadfce] bg-[#fdf9f2] px-3 py-2.5 text-micro leading-relaxed text-[#786344]"
            >
              {notice}
            </p>
          )}
        </div>

        <aside className="border-t border-line bg-[#fdfdfc] p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-medium text-ink">Output</h2>
            <span className="text-micro text-faint">Original dimensions</span>
          </div>

          <fieldset className="mt-4">
            <legend className="text-ui font-medium text-ink">Format</legend>
            <div id="converter-format-grid" className="mt-2 grid grid-cols-3 gap-2">
              {visibleFormats.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={format === option.value}
                  onClick={() => {
                    setFormat(option.value);
                    setNotice(null);
                  }}
                  className={`rounded-[10px] border px-2 py-3 text-center transition-colors ${
                    format === option.value
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-muted hover:border-[#d5d1c8] hover:text-ink"
                  }`}
                >
                  <span className="block text-[14px] font-medium">{option.value}</span>
                  <span className="mt-0.5 block text-[10px] text-faint">{option.hint}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-expanded={showAllFormats}
              aria-controls="converter-format-grid"
              onClick={() => setShowAllFormats((current) => !current)}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-micro font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              {showAllFormats ? "Show fewer formats" : `See ${formats.length - 3} more formats`}
              <ChevronDown
                size={12}
                className={`transition-transform ${showAllFormats ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {showAllFormats && (
              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Common raster formats. Final availability depends on the connected
                conversion engine.
              </p>
            )}
          </fieldset>

          <div className="mt-5">
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
              }}
              aria-label="Output quality"
              className="mt-3 h-1.5 w-full cursor-pointer accent-[#171717] disabled:cursor-not-allowed disabled:opacity-35"
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-faint">
              <span>Smaller file</span>
              <span>Better detail</span>
            </div>
            {!isLossy && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                {format} preserves the image without a quality tradeoff.
              </p>
            )}
          </div>

          <label className="mt-5 block">
            <span className="text-ui font-medium text-ink">Color profile</span>
            <span className="relative mt-2 block">
              <select
                defaultValue="Keep original"
                className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-3 pr-8 text-ui text-ink outline-none hover:border-[#d5d1c8]"
              >
                <option>Keep original</option>
                <option>sRGB</option>
                <option>Grayscale</option>
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden
              />
            </span>
          </label>

          <details className="group mt-5 overflow-hidden rounded-[11px] border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
              <span>
                <span className="block text-ui font-medium text-ink">Advanced output</span>
                <span className="mt-0.5 block text-[10.5px] text-faint">
                  Compression, color and rendering
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-faint">
                6 controls
                <ChevronDown
                  size={13}
                  className="transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>

            <div className="space-y-3.5 border-t border-line-soft bg-[#fdfdfc] p-3.5">
              <StudioSelect
                label="Compression effort"
                options={["Automatic", "Fast", "Balanced", "Maximum"]}
                defaultValue="Balanced"
              />

              <div className="grid grid-cols-2 gap-2">
                <StudioSelect
                  label="Chroma sampling"
                  options={["Auto", "4:4:4", "4:2:2", "4:2:0"]}
                />
                <StudioSelect
                  label="Bit depth"
                  options={["8-bit", "10-bit", "16-bit"]}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StudioSelect
                  label="Resolution"
                  options={["Original", "72 DPI", "150 DPI", "300 DPI", "600 DPI"]}
                />
                <StudioSelect
                  label="Background"
                  options={["Transparent", "White", "Black", "Custom"]}
                />
              </div>

              <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-line-soft pt-3.5">
                <span>
                  <span className="block text-ui font-medium text-ink">Progressive encoding</span>
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed text-faint">
                    Prepare the file for progressive loading where supported.
                  </span>
                </span>
                <input type="checkbox" className="peer sr-only" />
                <span
                  aria-hidden
                  className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4"
                />
              </label>

              <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                Advanced controls are saved with this workspace and applied when the
                encoding engine is connected.
              </p>
            </div>
          </details>

          <label className="mt-5 flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-ui font-medium text-ink">Preserve metadata</span>
              <span className="mt-1 block text-[10.5px] leading-relaxed text-faint">
                Keep camera and image details when supported.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preserveMetadata}
              onChange={(event) => setPreserveMetadata(event.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4"
            />
          </label>

          <div className="mt-5 rounded-[11px] border border-line bg-white p-3.5">
            <div className="flex items-center justify-between gap-3 text-micro">
              <span className="text-faint">Output format</span>
              <span className="font-medium text-ink">{format}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-micro">
              <span className="text-faint">Dimensions</span>
              <span className="font-medium text-ink">
                {dimensions ? `${dimensions.width} × ${dimensions.height}` : "Original"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-micro">
              <span className="text-faint">Metadata</span>
              <span className="flex items-center gap-1 font-medium text-ink">
                {preserveMetadata && <Check size={11} />}
                {preserveMetadata ? "Preserved" : "Removed"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function StudioSelect({
  label,
  options,
  defaultValue,
}: {
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-medium text-muted">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          defaultValue={defaultValue ?? options[0]}
          className="h-8 w-full appearance-none rounded-lg border border-line bg-white px-2.5 pr-7 text-[11.5px] text-ink outline-none hover:border-[#d5d1c8]"
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
          aria-hidden
        />
      </span>
    </label>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
