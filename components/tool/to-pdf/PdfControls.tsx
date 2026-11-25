"use client";

import { FileCog, Sparkles } from "lucide-react";
import { Switch } from "@/components/arc/switch/switch";
import { Field, Segmented } from "@/components/tool/kit";
import {
  RailSection,
  RAIL_CARD_ACTIVE,
  RAIL_CARD_IDLE,
} from "@/components/tool/studio/RailSection";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import {
  MARGINS,
  ORIENTATIONS,
  PAGE_SIZES,
  PDF_BACKGROUNDS,
  PDF_FITS,
  marginMeta,
  pageSizeMeta,
  type MarginId,
  type PageNumberPosition,
  type PageOrientation,
  type PageSizeId,
  type PdfFit,
  type PdfSettings,
} from "./model";

const SUB_LABEL = "block text-[13px] font-medium text-ink";
const CHIP_ON = "border-ink bg-ink text-white";
const CHIP_OFF = "border-line bg-white text-ink hover:border-[#cfc9bd]";

const ORIENTATION_OPTIONS: { value: PageOrientation; label: string }[] = ORIENTATIONS.map((option) => ({
  value: option.id,
  label: option.label,
}));

const MARGIN_OPTIONS: { value: MarginId; label: string }[] = MARGINS.map((option) => ({
  value: option.id,
  label: option.label,
}));

const FIT_OPTIONS: { value: PdfFit; label: string }[] = PDF_FITS.map((option) => ({
  value: option.id,
  label: option.label,
}));

const NUMBER_POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "bottom-left", label: "Left" },
  { value: "bottom-center", label: "Center" },
  { value: "bottom-right", label: "Right" },
];

const QUALITY_PRESETS = [
  { label: "Compact", value: 65 },
  { label: "Balanced", value: 82 },
  { label: "Crisp", value: 92 },
];

/** Flat switch row: a label, an optional line of help, and the switch. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <button type="button" onClick={() => onChange(!checked)} className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{description}</span>
        ) : null}
      </button>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5 shrink-0" />
    </div>
  );
}

export function PdfControls({
  settings,
  onPatch,
  pageCount,
}: {
  settings: PdfSettings;
  onPatch: (patch: Partial<PdfSettings>) => void;
  pageCount: number;
}) {
  const margin = marginMeta(settings.margin);
  const size = pageSizeMeta(settings.pageSize);
  const fitsImage = settings.pageSize === "fit";

  return (
    <div className="space-y-6">
      <Field label="Paper size" hint={size.detail}>
        <div className="grid grid-cols-3 gap-2">
          {PAGE_SIZES.map((option) => {
            const selected = settings.pageSize === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                title={option.detail}
                onClick={() => onPatch({ pageSize: option.id as PageSizeId })}
                className={`flex h-12 items-center gap-2 rounded-[11px] border px-2.5 text-left text-[13px] font-medium text-ink transition-colors ${
                  selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                } ${option.id === "fit" ? "col-span-2" : ""}`}
              >
                <PaperMiniature id={option.id} active={selected} />
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {!fitsImage && (
        <Field label="Orientation">
          <Segmented
            label="Page orientation"
            options={ORIENTATION_OPTIONS}
            value={settings.orientation}
            onChange={(orientation) => onPatch({ orientation })}
          />
          {settings.orientation === "auto" ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
              Wide images get a landscape page, tall ones a portrait page.
            </p>
          ) : null}
        </Field>
      )}

      {!fitsImage && (
        <Field
          label="Margin"
          hint={settings.margin === "none" ? "Edge to edge" : `${margin.percent}% of the page`}
        >
          <Segmented
            label="Page margin"
            options={MARGIN_OPTIONS}
            value={settings.margin}
            onChange={(next) => onPatch({ margin: next })}
          />
        </Field>
      )}

      {!fitsImage && (
        <Field label="Image fit">
          <Segmented
            label="Image fit"
            options={FIT_OPTIONS}
            value={settings.fit}
            onChange={(fit) => onPatch({ fit })}
          />
          <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
            {settings.fit === "cover"
              ? "Fills the page and crops whatever hangs over the edge."
              : "Shows the whole image, with paper left around it."}
          </p>
        </Field>
      )}

      <Field label="Paper color">
        <div className="grid grid-cols-3 gap-2">
          {PDF_BACKGROUNDS.map((background) => {
            const selected = settings.background === background.id;
            return (
              <button
                key={background.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ background: background.id })}
                className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[11px] border text-[12.5px] font-medium text-ink transition-colors ${
                  selected ? RAIL_CARD_ACTIVE : RAIL_CARD_IDLE
                }`}
              >
                <span
                  aria-hidden
                  className="h-[18px] w-[18px] shrink-0 rounded-full border border-black/15"
                  style={{ background: background.value }}
                />
                {background.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div>
        <ToggleRow
          label="Page numbers"
          description={`Prints “1 / ${pageCount || 1}” at the bottom of every page.`}
          checked={settings.pageNumbers}
          onChange={(checked) => onPatch({ pageNumbers: checked })}
        />
        {settings.pageNumbers && (
          <Segmented
            label="Page number position"
            className="mt-3"
            options={NUMBER_POSITIONS}
            value={settings.pageNumberPosition}
            onChange={(pageNumberPosition) => onPatch({ pageNumberPosition })}
          />
        )}
      </div>

      <div className="border-t border-line-soft pt-4">
        <RailSection
          icon={FileCog}
          title="File name & quality"
          defaultOpen={false}
          aside={settings.grayscale ? "B&W" : `${settings.quality}%`}
        >
          <div className="space-y-5">
            <label className="block">
              <span className={SUB_LABEL}>File name</span>
              <span className="relative mt-2 block">
                <input
                  type="text"
                  value={settings.filename}
                  maxLength={60}
                  onChange={(event) => onPatch({ filename: event.target.value })}
                  placeholder="images"
                  className="h-11 w-full rounded-[10px] border border-line bg-white pl-3 pr-12 text-[14px] text-ink outline-none transition-colors hover:border-[#d8d3ca] focus:border-ink"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">
                  .pdf
                </span>
              </span>
            </label>

            <ToggleRow
              label="Black & white scan"
              description="Turns photos of contracts, receipts and notes into clean grayscale pages."
              checked={settings.grayscale}
              onChange={(checked) => onPatch({ grayscale: checked })}
            />

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className={SUB_LABEL}>Image quality</span>
                <span className="text-[13px] font-semibold tabular-nums text-ink">{settings.quality}%</span>
              </div>
              <RailSlider
                label="PDF image quality"
                value={settings.quality}
                min={50}
                max={100}
                step={1}
                onValueChange={(quality) => onPatch({ quality })}
                className="mt-2"
              />
              <div className="mt-1.5 flex justify-between text-[12px] text-faint">
                <span>Smaller file</span>
                <span>Sharper print</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {QUALITY_PRESETS.map((preset) => {
                  const selected = settings.quality === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPatch({ quality: preset.value })}
                      className={`h-9 rounded-[9px] border text-[12.5px] font-medium transition-colors ${
                        selected ? CHIP_ON : CHIP_OFF
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
    </div>
  );
}

function PaperMiniature({ id, active }: { id: PageSizeId; active: boolean }) {
  if (id === "fit") {
    return <Sparkles size={16} className={`shrink-0 ${active ? "text-ink" : "text-muted"}`} aria-hidden />;
  }

  const ratios: Record<string, number> = { a4: 210 / 297, letter: 8.5 / 11, a5: 148 / 210, legal: 8.5 / 14 };
  const ratio = ratios[id] ?? 0.707;
  const height = id === "a5" ? 18 : 22;
  const width = Math.max(12, Math.round(height * ratio));

  return (
    <span aria-hidden className="grid h-6 w-5 shrink-0 place-items-center">
      <span
        className={`rounded-[2px] border ${active ? "border-ink bg-ink/10" : "border-[#c6c0b4] bg-white"}`}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </span>
  );
}
