"use client";

import { useState, type CSSProperties } from "react";
import {
  ChevronDown,
  Check,
  FileText,
  FileCheck2,
  Layers3,
  SlidersHorizontal,
  Sparkles,
  Maximize2,
  Palette,
  Hash,
  FileCog,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
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
  type PageNumberPosition,
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
    <div className="space-y-4">
      {/* SECTION 1: Paper Format & Layout */}
      <RailSection
        icon={FileText}
        title="Paper & Layout"
        hint="Standard paper size, orientation and margins"
        defaultOpen={true}
        aside={
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink shadow-2xs">
            {size.label} · {settings.orientation === "auto" ? "Auto" : settings.orientation === "portrait" ? "Portrait" : "Landscape"}
          </span>
        }
      >
        <div className="space-y-4">
          {/* Paper Size Grid */}
          <div>
            <span className="block text-[11px] font-semibold text-ink mb-1.5">Paper format</span>
            <div className="grid grid-cols-2 gap-1.5">
              {PAGE_SIZES.map((option) => {
                const selected = settings.pageSize === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onPatch({ pageSize: option.id as PageSizeId })}
                    className={`flex items-center gap-2.5 rounded-[10px] border p-2 text-left transition-all ${
                      selected
                        ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                        : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                    } ${option.id === "fit" ? "col-span-2" : ""}`}
                  >
                    <div className="grid h-8 w-7 shrink-0 place-items-center rounded-[4px] border border-line bg-[#f8f6f2]">
                      <PaperMiniature id={option.id} active={selected} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold">{option.label}</span>
                        {selected && <Check size={11} strokeWidth={2.5} className="text-ink" />}
                      </div>
                      <span className="block text-[9.5px] text-faint leading-tight">{option.detail}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orientation Selector */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Orientation</span>
              <span className="text-[10px] text-faint">
                {settings.pageSize === "fit" ? "Follows source images" : "Page aspect ratio"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ORIENTATIONS.map((orientation) => {
                const selected = settings.orientation === orientation.id;
                return (
                  <button
                    key={orientation.id}
                    type="button"
                    onClick={() => onPatch({ orientation: orientation.id as PageOrientation })}
                    className={`flex flex-col items-center justify-center rounded-[9px] border py-2 text-center transition-all ${
                      selected
                        ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                        : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                    }`}
                  >
                    <span className="mb-1 text-[13px] leading-none">
                      {orientation.id === "auto" ? "⚡" : orientation.id === "portrait" ? "↕" : "↔"}
                    </span>
                    <span className="text-[11.5px] font-medium">{orientation.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Margins Selector with Visual Previews */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Page margin</span>
              <span className="text-[10px] text-faint font-medium tabular-nums">{margin.percent}% inset</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MARGINS.map((option) => {
                const selected = settings.margin === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onPatch({ margin: option.id as MarginId })}
                    className={`flex flex-col items-center justify-center rounded-[9px] border py-1.5 px-1 text-center transition-all ${
                      selected
                        ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                        : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                    }`}
                  >
                    <div className="mb-1 grid h-5 w-4 place-items-center rounded-[2px] border border-line bg-white">
                      <span
                        className="rounded-[1px] bg-ink/20 transition-all"
                        style={{
                          width: `${Math.max(4, 14 - option.percent)}px`,
                          height: `${Math.max(6, 18 - option.percent)}px`,
                        }}
                      />
                    </div>
                    <span className="text-[10.5px] font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Image Fit */}
          <div>
            <span className="block text-[11px] font-semibold text-ink mb-1.5">Image placement</span>
            <div className="grid grid-cols-3 gap-1.5">
              {PDF_FITS.map((fit) => {
                const selected = settings.fit === fit.id;
                return (
                  <button
                    key={fit.id}
                    type="button"
                    onClick={() => onPatch({ fit: fit.id as PdfFit })}
                    className={`rounded-[9px] border py-2 px-1 text-center transition-all ${
                      selected
                        ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                        : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                    }`}
                  >
                    <span className="block text-[11.5px] font-bold">{fit.label}</span>
                    <span className="mt-0.5 block text-[9px] text-faint leading-tight">
                      {fit.id === "contain" ? "Best fit" : fit.id === "cover" ? "Full bleed" : "Stretch"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </RailSection>

      {/* SECTION 2: Document Styling & Page Numbers */}
      <RailSection
        icon={Palette}
        title="Styling & Numbers"
        hint="Paper background color and page footer numbers"
        defaultOpen={true}
        aside={
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink shadow-2xs">
            {settings.pageNumbers ? "Numbered" : "No numbers"}
          </span>
        }
      >
        <div className="space-y-4">
          {/* Paper Background Color */}
          <div>
            <span className="block text-[11px] font-semibold text-ink mb-1.5">Paper color</span>
            <div className="grid grid-cols-3 gap-1.5">
              {PDF_BACKGROUNDS.map((bg) => {
                const selected = settings.background === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => onPatch({ background: bg.id })}
                    className={`flex items-center gap-2 rounded-[9px] border p-2 transition-all ${
                      selected
                        ? "border-ink bg-white text-ink shadow-xs ring-1 ring-ink/20 font-semibold"
                        : "border-line bg-white/70 text-muted hover:border-[#c8c2b7] hover:bg-white hover:text-ink"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/15 shadow-2xs"
                      style={{ background: bg.value }}
                    />
                    <span className="text-[11.5px] font-medium">{bg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Page Numbers Toggle */}
          <div className="rounded-[11px] border border-line bg-[#fbfaf8] p-3 space-y-3">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[12px] font-bold text-ink">Print page numbers</span>
                <span className="mt-0.5 block text-[10px] text-faint">
                  Stamp clean page numbers (e.g. 1 / {pageCount || 1}) on the footer
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.pageNumbers}
                onChange={(e) => onPatch({ pageNumbers: e.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4"
              />
            </label>

            {/* Page Number Position */}
            {settings.pageNumbers && (
              <div className="pt-2 border-t border-line/60">
                <span className="block text-[10.5px] font-medium text-muted mb-1.5">Number placement</span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "bottom-center", label: "Center" },
                      { id: "bottom-right", label: "Right" },
                      { id: "bottom-left", label: "Left" },
                    ] as { id: PageNumberPosition; label: string }[]
                  ).map((pos) => {
                    const selected = settings.pageNumberPosition === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => onPatch({ pageNumberPosition: pos.id })}
                        className={`rounded-[7px] border py-1 text-[10.5px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white shadow-2xs"
                            : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:text-ink"
                        }`}
                      >
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </RailSection>

      {/* SECTION 3: Document File & Filters */}
      <RailSection
        icon={FileCog}
        title="File & Scan Tuning"
        hint="File title, compression quality and B&W document scan mode"
        defaultOpen={false}
        aside={
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink shadow-2xs">
            {settings.grayscale ? "B&W Scan" : `${settings.quality}% quality`}
          </span>
        }
      >
        <div className="space-y-4">
          {/* File Name */}
          <div>
            <span className="block text-[11px] font-semibold text-ink mb-1.5">PDF document title</span>
            <div className="relative">
              <input
                type="text"
                value={settings.filename}
                maxLength={60}
                onChange={(e) => onPatch({ filename: e.target.value })}
                placeholder="my-document"
                className="h-9 w-full rounded-[9px] border border-line bg-white pl-3 pr-10 text-[12px] font-semibold text-ink shadow-2xs outline-none transition-colors focus:border-ink"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold text-faint">
                .pdf
              </span>
            </div>
          </div>

          {/* Black & White Document Scan Mode */}
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[11px] border border-line bg-[#fbfaf8] p-3 transition-colors hover:border-[#c8c2b7]">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                <ScanLine size={13} className="text-ink" />
                B&W Document Scan mode
              </span>
              <span className="mt-0.5 block text-[10px] text-faint leading-relaxed">
                Converts color photos to crisp black & white, ideal for contracts, receipts and notes.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.grayscale}
              onChange={(e) => onPatch({ grayscale: e.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4"
            />
          </label>

          {/* Quality Slider with Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Compression & visual quality</span>
              <span className="text-[11px] font-bold tabular-nums text-ink">{settings.quality}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={settings.quality}
              onChange={(e) => onPatch({ quality: Number(e.target.value) })}
              style={rangeFill(settings.quality, 50, 100)}
              className="range w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-faint tabular-nums">
              <span>Compact (email)</span>
              <span>Balanced</span>
              <span>Crisp print</span>
            </div>

            {/* Quick Quality Chips */}
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[
                { label: "Compact 65%", val: 65 },
                { label: "Balanced 82%", val: 82 },
                { label: "Crisp 92%", val: 92 },
              ].map((chip) => (
                <button
                  key={chip.val}
                  type="button"
                  onClick={() => onPatch({ quality: chip.val })}
                  className={`rounded-[7px] border py-1 text-[10.5px] font-medium transition-colors ${
                    settings.quality === chip.val
                      ? "border-ink bg-ink text-white shadow-2xs font-semibold"
                      : "border-line bg-white text-muted hover:border-[#c8c2b7] hover:text-ink"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </RailSection>

      {/* SECTION 4: Live PDF Document Stats Summary Card */}
      <div className="rounded-[14px] border border-line bg-white p-3.5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
              Document Specifications
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[24px] font-bold leading-none tabular-nums text-ink">
                {pageCount || 0}
              </span>
              <span className="text-[11px] font-medium text-muted">
                {pageCount === 1 ? "page document" : "pages document"}
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-line bg-[#f8f6f2] px-2.5 py-1 text-[10px] font-semibold text-ink">
            <Layers3 size={10} aria-hidden />
            {empty ? "Empty" : pageLabel(settings, aspect)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-2.5">
          <div className="rounded-[8px] bg-[#fcfbfa] p-2 border border-line/60">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
              Estimated PDF
            </p>
            <p className="mt-0.5 text-[12px] font-bold tabular-nums text-[#305e2b]">
              {pageCount ? `≈ ${formatBytes(estimate)}` : "—"}
            </p>
          </div>
          <div className="rounded-[8px] bg-[#fcfbfa] p-2 border border-line/60">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
              Source Images
            </p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink">
              {pageCount ? formatBytes(totalInput) : "—"}
            </p>
          </div>
        </div>

        <p className="mt-2.5 truncate text-[10.5px] font-medium text-faint flex items-center gap-1.5">
          <FileText size={11} className="shrink-0 text-muted" />
          <span className="truncate">{pdfFilename(settings.filename)}</span>
        </p>
      </div>
    </div>
  );
}

function PaperMiniature({ id, active }: { id: PageSizeId; active: boolean }) {
  if (id === "fit") {
    return <span className={`text-[11px] font-bold ${active ? "text-ink" : "text-faint"}`}>✦</span>;
  }
  const isA5 = id === "a5";
  const isLegal = id === "legal";
  return (
    <div
      className={`border rounded-[2px] transition-colors ${
        active ? "border-ink bg-ink/15" : "border-[#ccc6ba] bg-white"
      }`}
      style={{
        width: isA5 ? "12px" : "15px",
        height: isLegal ? "22px" : "19px",
      }}
    />
  );
}

function RailSection({
  icon: Icon,
  title,
  hint,
  defaultOpen = true,
  aside,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-2xs transition-colors">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-hover/50 rounded-[14px] transition-colors"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-line bg-[#f8f6f2] text-ink">
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold text-ink">{title}</p>
            {hint && <p className="truncate text-[10px] text-faint">{hint}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {aside}
          <ChevronDown
            size={13}
            className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && <div className="border-t border-line-soft p-3 pt-3.5">{children}</div>}
    </div>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
