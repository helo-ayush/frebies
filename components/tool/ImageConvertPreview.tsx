"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ImageConvertPreview({ maxSizeMB }: { maxSizeMB: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [format, setFormat] = useState("png");
  const [quality, setQuality] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFiles(files: FileList | null) {
    const next = files?.[0];
    if (!next) return;

    if (!ALLOWED_TYPES.includes(next.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      setNotice(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (next.size > maxSizeMB * 1024 * 1024) {
      setError(`That file is larger than ${maxSizeMB} MB.`);
      setNotice(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setError(null);
    setNotice(null);
    setFile(next);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-4 lg:p-5">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
            className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[#dcdcda] bg-[#fcfcfb] px-5 py-8 text-center"
          >
            {file ? (
              <>
                {preview && (
                  // Blob URLs cannot go through next/image without a custom loader.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Selected image preview"
                    className="max-h-[170px] w-auto rounded-lg border border-line object-contain"
                  />
                )}
                <p className="mt-3 max-w-full truncate text-sm font-medium text-ink">
                  {file.name}
                </p>
                <p className="mt-0.5 text-micro text-faint">
                  {formatBytes(file.size)} · {file.type.replace("image/", "").toUpperCase()}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className={buttonClasses("secondary", "sm")}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    className={buttonClasses("ghost", "sm")}
                  >
                    <X size={13} aria-hidden />
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white">
                  <UploadCloud size={20} strokeWidth={1.5} className="text-muted" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">Drop an image here</p>
                <p className="mt-1 text-ui text-muted">
                  JPG, PNG or WebP · up to {maxSizeMB} MB
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={buttonClasses("secondary", "sm", "mt-4")}
                >
                  Choose image
                </button>
                <p className="mt-3 text-micro text-faint">Your file never leaves this device.</p>
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              tabIndex={-1}
              aria-label="Choose image file"
              className="sr-only"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 text-ui text-[#b42318]">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
            <p className="text-micro text-faint">Free · No upload · No watermark</p>
            <button
              type="button"
              disabled={!file}
              onClick={() =>
                setNotice(
                  "The layout and input flow are ready. The conversion engine is connected in Phase 1.",
                )
              }
              className={buttonClasses("primary", "md")}
            >
              Convert image
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-3 rounded-lg border border-[#f3d9b1] bg-[#fff8ec] px-3 py-2 text-micro leading-relaxed text-[#7a4a0a]"
            >
              {notice}
            </p>
          )}
        </div>

        <aside className="border-t border-line bg-white p-4 lg:border-l lg:border-t-0 lg:p-5">
          <h2 className="text-ui font-semibold text-ink">Output</h2>

          <div className="mt-4 space-y-5">
            <label className="block">
              <span className="text-ui font-medium text-ink">Format</span>
              <select
                value={format}
                onChange={(event) => {
                  setFormat(event.target.value);
                  setNotice(null);
                }}
                className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-ui text-ink outline-none focus:border-accent"
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="webp">WebP</option>
              </select>
            </label>

            <div>
              <div className="flex items-center justify-between text-ui">
                <span className="font-medium text-ink">Quality</span>
                <span className="tabular-nums text-faint">{quality}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                disabled={format === "png"}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="mt-2 w-full accent-[#e55e40] disabled:opacity-40"
                aria-label="Output quality"
              />
              <div className="mt-1 flex justify-between text-micro text-faint">
                <span>Smaller file</span>
                <span>Better quality</span>
              </div>
              {format === "png" && (
                <p className="mt-2 text-micro text-faint">
                  PNG is lossless, so quality does not apply.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-line bg-rail p-3">
              <p className="text-micro leading-relaxed text-muted">
                Output keeps the original dimensions. Conversion runs on your device.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
