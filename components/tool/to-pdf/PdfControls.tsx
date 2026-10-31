"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronDown,
  Check,
  FileText,
  FileCog,
  Layers3,
  Palette,
  ScanLine,
  Sparkles,
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

const FIELD_LABEL = "block text-[12px] font-medium text-ink";
const FIELD_META = "text-[11px] text-faint tabular-nums";
const CARD_IDLE =
  "border-line bg-white hover:border-[#cfc9bd] hover:bg-[#fdfdfc]";
const CARD_ACTIVE =
  "border-ink bg-[#fbfaf7] shadow-[inset_0_0_0_1px_#0f0f10]";

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
  const orientationText =
    settings.orientation === "auto"
      ? "Auto"
      : settings.orientation === "portrait"
        ? "Portrait"
        : "Landscape";

  return (
    <div className="space-y-3.5">
      {/* Document summary */}
      <div className="rounded-[16px] border border-line bg-white p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
              Your document
            </p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[26px] font-semibold leading-none tabular-nums text-ink">
                {pageCount || 0}
              </span>
              <span className="text-[12px] font-medium text-muted">
                {pageCount === 1 ? "page" : "pages"}
              </span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-ink">
            <Layers3 size={11} aria-hidden />
            {empty ? "Empty" : pageLabel(settings, aspect)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[10px] border border-line-soft bg-[#fbfaf8] px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
              Estimated PDF
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#305e2b]">
              {pageCount ? `≈ ${formatBytes(estimate)}` : "—"}
            </p>
          </div>
          <div className="rounded-[10px] border border-line-soft bg-[#fbfaf8] px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
              Source images
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">
              {pageCount ? formatBytes(totalInput) : "—"}
            </p>
          </div>
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 truncate text-[11.5px] font-medium text-faint">
          <FileText size={12} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{pdfFilename(settings.filename)}</span>
        </p>
      </div>

      <RailSection
        icon={FileText}
        title="Page setup"
        hint="Paper, orientation, margins and image fit"
        aside={`${size.label} · ${orientationText}`}
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={FIELD_LABEL}>Paper size</span>
              <span className={FIELD_META}>{size.detail}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAGE_SIZES.map((option) => {
                const selected = settings.pageSize === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ pageSize: option.id as PageSizeId })}
                    className={`flex min-h-[54px] items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left transition-colors ${
                      selected ? CARD_ACTIVE : CARD_IDLE
                    } ${option.id === "fit" ? "col-span-2" : ""}`}
                  >
                    <PaperMiniature id={option.id} active={selected} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                        {option.label}
                        {selected && <Check size={12} strokeWidth={2.5} aria-hidden />}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-faint">
                        {option.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {settings.pageSize !== "fit" && (
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={FIELD_LABEL}>Orientation</span>
                <span className={FIELD_META}>Auto follows the image</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ORIENTATIONS.map((option) => {
                  const selected = settings.orientation === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ orientation: option.id as PageOrientation })}
                      className={`flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-[11px] border py-2 transition-colors ${
                        selected ? CARD_ACTIVE : CARD_IDLE
                      }`}
                    >
                      <OrientationMiniature id={option.id} />
                      <span className="text-[11.5px] font-medium text-ink">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={FIELD_LABEL}>Page margin</span>
              <span className={FIELD_META}>
                {settings.pageSize === "fit" || settings.margin === "none"
                  ? "0% · full bleed"
                  : `${margin.percent}% inset`}
              </span>
            </div>

            {settings.pageSize === "fit" ? (
              <div className="rounded-[11px] border border-[#d9e3d5] bg-[#f4f8f2] px-3.5 py-3 text-[12px] font-medium text-[#305e2b]">
                Page matches each image, so there is no margin to set.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {MARGINS.map((option) => {
                  const selected = settings.margin === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ margin: option.id as MarginId })}
                      className={`flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-[11px] border py-2 transition-colors ${
                        selected ? CARD_ACTIVE : CARD_IDLE
                      }`}
                    >
                      <span className="grid h-6 w-[18px] place-items-center rounded-[2px] border border-line bg-white">
                        <span
                          className="rounded-[1px] bg-ink/15"
                          style={{
                            width: `${Math.max(5, 15 - option.percent)}px`,
                            height: `${Math.max(7, 19 - option.percent)}px`,
                          }}
                        />
                      </span>
                      <span className="text-[11px] font-medium text-ink">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={FIELD_LABEL}>Image fit</span>
              <span className={FIELD_META}>
                {PDF_FITS.find((fit) => fit.id === settings.fit)?.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PDF_FITS.map((fit) => {
                const selected = settings.fit === fit.id;
                return (
                  <button
                    key={fit.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ fit: fit.id as PdfFit })}
                    className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[11px] border px-2 py-2.5 transition-colors ${
                      selected ? CARD_ACTIVE : CARD_IDLE
                    }`}
                  >
                    <FitDiagram id={fit.id} />
                    <span className="text-[12px] font-medium text-ink">{fit.label}</span>
                    <span className="text-[10px] leading-tight text-faint">{fit.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </RailSection>

      <RailSection
        icon={Palette}
        title="Style & numbers"
        hint="Paper color and printed page numbers"
        aside={settings.pageNumbers ? "Numbered" : "No numbers"}
      >
        <div className="space-y-4">
          <div>
            <span className={FIELD_LABEL}>Paper color</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PDF_BACKGROUNDS.map((background) => {
                const selected = settings.background === background.id;
                return (
                  <button
                    key={background.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ background: background.id })}
                    className={`flex min-h-[42px] items-center gap-2 rounded-[10px] border px-2.5 transition-colors ${
                      selected ? CARD_ACTIVE : CARD_IDLE
                    }`}
                  >
                    <span
                      className="h-[18px] w-[18px] shrink-0 rounded-full border border-black/15"
                      style={{ background: background.value }}
                    />
                    <span className="truncate text-[11.5px] font-medium text-ink">
                      {background.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[12px] border border-line bg-[#fbfaf8] p-3.5">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">
                  Print page numbers
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                  Stamp 1 / {pageCount || 1} on each footer.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.pageNumbers}
                onChange={(event) => onPatch({ pageNumbers: event.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-[18px] peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
              />
            </label>

            {settings.pageNumbers && (
              <div className="mt-3 border-t border-line/70 pt-3">
                <span className="mb-2 block text-[11px] font-medium text-muted">Placement</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "bottom-left", label: "Left" },
                      { id: "bottom-center", label: "Center" },
                      { id: "bottom-right", label: "Right" },
                    ] as { id: PageNumberPosition; label: string }[]
                  ).map((position) => {
                    const selected = settings.pageNumberPosition === position.id;
                    return (
                      <button
                        key={position.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPatch({ pageNumberPosition: position.id })}
                        className={`h-8 rounded-[8px] border text-[11.5px] font-medium transition-colors ${
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                        }`}
                      >
                        {position.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </RailSection>

      <RailSection
        icon={FileCog}
        title="File & quality"
        hint="Document title, compression and scan mode"
        defaultOpen={false}
        aside={settings.grayscale ? "B&W scan" : `${settings.quality}%`}
      >
        <div className="space-y-4">
          <div>
            <span className={FIELD_LABEL}>PDF title</span>
            <div className="relative mt-2">
              <input
                type="text"
                value={settings.filename}
                maxLength={60}
                onChange={(event) => onPatch({ filename: event.target.value })}
                placeholder="my-document"
                aria-label="PDF document title"
                className="h-10 w-full rounded-[10px] border border-line bg-white pl-3 pr-12 text-[12.5px] font-medium text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-[#b8b2a7]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-faint">
                .pdf
              </span>
            </div>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[12px] border border-line bg-[#fbfaf8] p-3.5 transition-colors hover:border-[#cfc9bd]">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                <ScanLine size={13} aria-hidden />
                B&W document scan
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                Turns color photos into crisp black & white pages for contracts,
                receipts and notes.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.grayscale}
              onChange={(event) => onPatch({ grayscale: event.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-[18px] peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={FIELD_LABEL}>Quality</span>
              <span className="text-[12px] font-semibold tabular-nums text-ink">
                {settings.quality}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={settings.quality}
              onChange={(event) => onPatch({ quality: Number(event.target.value) })}
              style={rangeFill(settings.quality, 50, 100)}
              aria-label="PDF image quality"
              className="range w-full"
            />
            <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
              <span>Smaller file</span>
              <span>Crisp print</span>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {[
                { label: "Compact", value: 65 },
                { label: "Balanced", value: 82 },
                { label: "Crisp", value: 92 },
              ].map((preset) => {
                const selected = settings.quality === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ quality: preset.value })}
                    className={`h-8 rounded-[8px] border text-[11.5px] font-medium transition-colors ${
                      selected
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-muted hover:border-[#cfc9bd] hover:text-ink"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </RailSection>
    </div>
  );
}

function PaperMiniature({ id, active }: { id: PageSizeId; active: boolean }) {
  if (id === "fit") {
    return (
      <span
        aria-hidden
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border ${
          active ? "border-ink/25 bg-white" : "border-line bg-[#faf9f6]"
        }`}
      >
        <Sparkles size={14} className="text-ink" />
      </span>
    );
  }

  const ratios: Record<string, number> = { a4: 210 / 297, letter: 8.5 / 11, a5: 148 / 210, legal: 8.5 / 14 };
  const ratio = ratios[id] ?? 0.707;
  const height = 26;
  const width = Math.max(14, Math.round(height * ratio));

  return (
    <span
      aria-hidden
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border ${
        active ? "border-ink/25 bg-white" : "border-line bg-[#faf9f6]"
      }`}
    >
      <span
        className={`rounded-[2px] border ${
          active ? "border-ink bg-ink/10" : "border-[#c6c0b4] bg-white"
        }`}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </span>
  );
}

function OrientationMiniature({ id }: { id: PageOrientation }) {
  if (id === "auto") {
    return (
      <span aria-hidden className="relative block h-[22px] w-7">
        <span className="absolute left-0 top-0 h-[18px] w-[13px] rounded-[1.5px] border border-ink/35 bg-white" />
        <span className="absolute bottom-0 right-0 h-[13px] w-[18px] rounded-[1.5px] border border-ink/70 bg-white" />
      </span>
    );
  }

  const portrait = id === "portrait";
  return (
    <span
      aria-hidden
      className={`relative block rounded-[1.5px] border border-ink/70 bg-white ${
        portrait ? "h-[22px] w-[17px]" : "h-[17px] w-[22px]"
      }`}
    >
      <span className="absolute inset-x-[3px] top-[5px] space-y-[3px]">
        <span className="block h-px bg-ink/25" />
        <span className="block h-px bg-ink/25" />
        <span className="block h-px w-2/3 bg-ink/25" />
      </span>
    </span>
  );
}

function FitDiagram({ id }: { id: PdfFit }) {
  return (
    <span
      aria-hidden
      className="relative grid h-5 w-7 place-items-center overflow-hidden rounded-[2px] border border-dashed border-ink/35"
    >
      {id === "contain" && <span className="h-[11px] w-[17px] rounded-[1px] bg-ink/25" />}
      {id === "cover" && <span className="h-[22px] w-[26px] rounded-[1px] bg-ink/25" />}
    </span>
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
  hint: string;
  defaultOpen?: boolean;
  aside: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-white shadow-2xs">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-[#fbfaf8]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-line bg-[#faf9f6] text-ink">
          <Icon size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-faint">{hint}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-line bg-[#faf9f6] px-2 py-0.5 text-[10.5px] font-medium text-muted">
            {aside}
          </span>
          <ChevronDown
            size={14}
            aria-hidden
            className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && <div className="border-t border-line-soft p-4 pt-3.5">{children}</div>}
    </div>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}
