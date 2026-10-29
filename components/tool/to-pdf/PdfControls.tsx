"use client";

import type { CSSProperties } from "react";
import { ChevronDown, FileText, Layers3 } from "lucide-react";
import {
  MARGINS,
  ORIENTATIONS,
  PAGE_SIZES,
  PDF_BACKGROUNDS,
  PDF_FITS,
  formatBytes,
  marginMeta,
  pageLabel,
  pageSizeMeta,
  pdfFilename,
  type MarginId,
  type PageOrientation,
  type PageSizeId,
  type PdfFit,
  type PdfSettings,
} from "./model";

export function PdfControls({
  settings,
  onPatch,
  pageCount,
  totalInput,
  estimate,
  aspect,
  empty,
}: {
  settings: PdfSettings;
  onPatch: (patch: Partial<PdfSettings>) => void;
  pageCount: number;
  totalInput: number;
  estimate: number;
  aspect: number;
  empty: boolean;
}) {
  const margin = marginMeta(settings.margin);
  const size = pageSizeMeta(settings.pageSize);

  return (
    <div className="space-y-5">
      <section aria-labelledby="pdf-page-setup">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="pdf-page-setup" className="text-ui font-semibold text-ink">
            Page setup
          </h3>
          <span className="text-[10px] tabular-nums text-faint">
            {pageCount ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "Empty document"}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {PAGE_SIZES.map((option) => {
            const selected = settings.pageSize === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onPatch({ pageSize: option.id as PageSizeId })}
                aria-pressed={selected}
                className={`rounded-[9px] border px-2 py-2 text-left transition-colors ${
                  selected
                    ? "border-ink bg-rail text-ink"
                    : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                } ${option.id === "fit" ? "col-span-2" : ""}`}
              >
                <span className="block text-[11.5px] font-medium">{option.label}</span>
                <span className="mt-0.5 block text-[9px] text-faint">{option.detail}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10.5px] font-medium text-muted">Orientation</span>
            <span className="text-[10px] text-faint">
              {settings.pageSize === "fit" ? "Follows image" : "Auto uses image shape"}
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="Page orientation"
            className="mt-1.5 grid grid-cols-3 gap-1 rounded-[9px] border border-line bg-[#f4f2ed] p-1"
          >
            {ORIENTATIONS.map((orientation) => (
              <label key={orientation.id} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="pdf-orientation"
                  value={orientation.id}
                  checked={settings.orientation === orientation.id}
                  onChange={() => onPatch({ orientation: orientation.id as PageOrientation })}
                  className="peer sr-only"
                />
                <span className="block rounded-[6px] py-1.5 text-center text-[10.5px] font-medium text-muted transition-colors peer-checked:bg-white peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgba(15,15,16,0.08)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                  {orientation.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10.5px] font-medium text-muted">Margin</span>
            <span className="text-[10px] text-faint">{margin.percent}%</span>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {MARGINS.map((option) => {
              const selected = settings.margin === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPatch({ margin: option.id as MarginId })}
                  aria-pressed={selected}
                  className={`h-7 rounded-[7px] border text-[10px] font-medium transition-colors ${
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <span className="text-[10.5px] font-medium text-muted">Image fit</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {PDF_FITS.map((fit) => {
              const selected = settings.fit === fit.id;
              return (
                <button
                  key={fit.id}
                  type="button"
                  onClick={() => onPatch({ fit: fit.id as PdfFit })}
                  aria-pressed={selected}
                  title={fit.hint}
                  className={`rounded-[7px] border py-1.5 text-[10px] font-medium transition-colors ${
                    selected
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  {fit.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 min-h-[24px] text-[10px] leading-relaxed text-faint">
            {PDF_FITS.find((fit) => fit.id === settings.fit)?.hint}
          </p>
        </div>

        <div className="mt-1">
          <span className="text-[10.5px] font-medium text-muted">Page background</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {PDF_BACKGROUNDS.map((background) => {
              const selected = settings.background === background.id;
              return (
                <button
                  key={background.id}
                  type="button"
                  onClick={() => onPatch({ background: background.id })}
                  aria-pressed={selected}
                  className={`flex items-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    selected
                      ? "border-ink bg-rail text-ink"
                      : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
                  }`}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-[4px] border border-[#d8d5cf]"
                    style={{ background: background.value }}
                  />
                  {background.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="pdf-document" className="border-t border-line-soft pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="pdf-document" className="text-ui font-semibold text-ink">
            Document
          </h3>
          <span className="text-[10px] text-faint">{size.label}</span>
        </div>

        <label className="mt-2 block">
          <span className="text-[10.5px] font-medium text-muted">File name</span>
          <span className="relative mt-1 block">
            <input
              type="text"
              value={settings.filename}
              maxLength={48}
              onChange={(event) => onPatch({ filename: event.target.value })}
              placeholder="images"
              className="h-9 w-full rounded-[9px] border border-line bg-white pl-2.5 pr-10 text-[12px] text-ink outline-none transition-colors focus:border-[#c3beb4]"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">
              .pdf
            </span>
          </span>
        </label>

        <div className="mt-3">
          <div className="flex items-center justify-between text-ui">
            <span className="font-medium text-ink">Image quality</span>
            <span className="text-micro tabular-nums text-faint">{settings.quality}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={1}
            value={settings.quality}
            onChange={(event) => onPatch({ quality: Number(event.target.value) })}
            aria-label="Image quality inside the PDF"
            aria-valuetext={`${settings.quality} percent image quality`}
            style={rangeFill(settings.quality, 50, 100)}
            className="range mt-2"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>Smaller PDF</span>
            <span>Better detail</span>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[11.5px] font-medium text-ink">Optimize images</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">
              Re-encode each image so the PDF stays compact.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.optimize}
            onChange={(event) => onPatch({ optimize: event.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          />
        </label>
      </section>

      <details className="group overflow-hidden rounded-[11px] border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
            <FileText size={12} className="text-muted" aria-hidden />
            Advanced
          </span>
          <span className="flex items-center gap-1 text-[10px] text-faint">
            2 controls
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="space-y-3 border-t border-line-soft bg-[#fdfdfc] p-3">
          <ToggleRow
            label="Page numbers"
            description="Print a page number at the bottom of each page."
            checked={settings.pageNumbers}
            onChange={(checked) => onPatch({ pageNumbers: checked })}
          />
          <ToggleRow
            label="Keep image metadata"
            description="Carry camera details into the PDF where supported."
            checked={settings.keepMetadata}
            onChange={(checked) => onPatch({ keepMetadata: checked })}
          />
        </div>
      </details>

      <div className="rounded-[12px] border border-line bg-white p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
              Document
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-display text-[22px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
                {pageCount || 0}
              </span>
              <span className="text-[10.5px] text-faint">
                {pageCount === 1 ? "page" : "pages"}
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[9.5px] font-medium text-muted">
            <Layers3 size={9} aria-hidden />
            {empty ? "Empty" : pageLabel(settings, aspect)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-2.5">
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">
              Estimated PDF
            </p>
            <p className="mt-0.5 text-[11.5px] font-medium tabular-nums text-ink">
              {pageCount ? `≈ ${formatBytes(estimate)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-faint">
              Source images
            </p>
            <p className="mt-0.5 text-[11.5px] font-medium tabular-nums text-ink">
              {pageCount ? formatBytes(totalInput) : "—"}
            </p>
          </div>
        </div>

        <p className="mt-2.5 truncate text-[10px] text-faint">{pdfFilename(settings.filename)}</p>
      </div>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        {empty
          ? "Add at least one image to build a document."
          : "The PDF engine applies these settings in the next build step. Page sizes and size estimates are approximate."}
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
