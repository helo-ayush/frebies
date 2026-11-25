"use client";

import { FileCog, Sparkles } from "lucide-react";
import { Field, Segmented } from "@/components/tool/kit";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { RailSwitch } from "@/components/tool/studio/RailSwitch";
import { RailCards, RailEnds, RailHint, RailLabel, RailPick } from "@/components/tool/studio/RailControls";
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
    <div className="space-y-7">
      <Field label="Paper size" hint={size.detail}>
        <RailCards
          label="Paper size"
          columns={3}
          value={settings.pageSize}
          options={PAGE_SIZES.map((option) => ({
            value: option.id,
            label: option.label,
            title: option.detail,
            icon: <PaperMiniature id={option.id} />,
          }))}
          onChange={(pageSize) => onPatch({ pageSize })}
        />
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
            <RailHint>Wide images get a landscape page, tall ones a portrait page.</RailHint>
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
          <RailHint>
            {settings.fit === "cover"
              ? "Fills the page and crops whatever hangs over the edge."
              : "Shows the whole image, with paper left around it."}
          </RailHint>
        </Field>
      )}

      <Field label="Paper color">
        <RailPick
          label="Paper color"
          columns={3}
          value={settings.background}
          options={PDF_BACKGROUNDS.map((background) => ({
            value: background.id,
            label: (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 border border-black/25"
                  style={{ background: background.value }}
                />
                {background.label}
              </>
            ),
          }))}
          onChange={(background) => onPatch({ background })}
        />
      </Field>

      <div>
        <RailSwitch
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

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
        <RailSection
          icon={FileCog}
          title="File name & quality"
          defaultOpen={false}
          aside={settings.grayscale ? "B&W" : `${settings.quality}%`}
        >
          <div className="space-y-5">
            <label className="block">
              <RailLabel>File name</RailLabel>
              <span className="relative block">
                <input
                  type="text"
                  value={settings.filename}
                  maxLength={60}
                  onChange={(event) => onPatch({ filename: event.target.value })}
                  placeholder="images"
                  className="h-11 w-full pl-3 pr-12 text-[15px]"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">
                  .pdf
                </span>
              </span>
            </label>

            <RailSwitch
              label="Black & white scan"
              description="Turns photos of contracts, receipts and notes into clean grayscale pages."
              checked={settings.grayscale}
              onChange={(checked) => onPatch({ grayscale: checked })}
            />

            <div>
              <RailLabel className="!mb-1" value={`${settings.quality}%`}>
                Image quality
              </RailLabel>
              <RailSlider
                label="PDF image quality"
                value={settings.quality}
                min={50}
                max={100}
                step={1}
                onValueChange={(quality) => onPatch({ quality })}
                className=""
              />
              <RailEnds left="Smaller file" right="Sharper print" />
              <RailPick
                className="mt-3"
                label="Quality presets"
                value={settings.quality}
                options={QUALITY_PRESETS}
                onChange={(quality) => onPatch({ quality })}
              />
            </div>
          </div>
        </RailSection>
      </div>
    </div>
  );
}

/** The sheet's own proportions, in whatever colour the cell gives it. */
function PaperMiniature({ id }: { id: PageSizeId }) {
  if (id === "fit") return <Sparkles size={17} aria-hidden />;

  const ratios: Record<string, number> = { a4: 210 / 297, letter: 8.5 / 11, a5: 148 / 210, legal: 8.5 / 14 };
  const ratio = ratios[id] ?? 0.707;
  const height = id === "a5" ? 18 : 22;
  const width = Math.max(12, Math.round(height * ratio));

  return (
    <span aria-hidden className="grid h-6 w-5 shrink-0 place-items-center">
      <span className="border-[1.5px] border-current" style={{ width: `${width}px`, height: `${height}px` }} />
    </span>
  );
}
