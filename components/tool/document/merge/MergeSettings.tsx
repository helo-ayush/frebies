"use client";

import { FileCog } from "lucide-react";
import { Field } from "@/components/tool/kit";
import { RailNumber, RailReset } from "@/components/tool/studio/RailControls";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailSlider } from "@/components/tool/studio/RailSlider";
import { SelectRow, TextRow, ToggleRow } from "../DocumentKit";
import {
  NUMBER_FORMAT_OPTIONS,
  NUMBER_POSITION_OPTIONS,
  type MergeSettings,
} from "./merge-model";

export function MergeSettings({
  settings,
  onChange,
  onReset,
  suggestion,
  totalPages,
  advancedModified,
}: {
  settings: MergeSettings;
  onChange: (patch: Partial<MergeSettings>) => void;
  onReset: () => void;
  suggestion: string;
  totalPages: number;
  advancedModified: boolean;
}) {
  const formatLabel =
    NUMBER_FORMAT_OPTIONS.find((option) => option.value === settings.numberFormat)?.label ?? "1, 2, 3";
  const positionLabel =
    NUMBER_POSITION_OPTIONS.find((option) => option.value === settings.numberPosition)?.label ??
    "Bottom center";
  const numberSample =
    settings.numberFormat === "page"
      ? `Page ${settings.numberStart}`
      : settings.numberFormat === "page-of"
        ? `${settings.numberStart} / ${totalPages || 12}`
        : String(settings.numberStart);

  return (
    <div className="space-y-7">
      <Field label="Output file">
        <TextRow
          label="File name"
          value={settings.filename}
          onChange={(filename) => onChange({ filename })}
          placeholder={suggestion}
          hint=".pdf is added automatically"
        />
      </Field>

      <Field label="Between documents">
        <div className="space-y-4">
          <ToggleRow
            label="Bookmark each document"
            description="Each file becomes a section in the PDF outline."
            checked={settings.bookmarks}
            onChange={(bookmarks) => onChange({ bookmarks })}
          />
          <ToggleRow
            label="Blank page between documents"
            description="Adds a separator page before each new file."
            checked={settings.blankPages}
            onChange={(blankPages) => onChange({ blankPages })}
          />
        </div>
      </Field>

      <Field label="Page numbers" hint={settings.pageNumbers ? `${numberSample} · ${positionLabel.toLowerCase()}` : undefined}>
        <ToggleRow
          label="Number every page"
          description="Counted across the whole merged document."
          checked={settings.pageNumbers}
          onChange={(pageNumbers) => onChange({ pageNumbers })}
        />

        {settings.pageNumbers && (
          <div className="mt-4 space-y-4">
            <SelectRow
              label="Format"
              options={NUMBER_FORMAT_OPTIONS.map((option) => option.label)}
              value={formatLabel}
              onChange={(label) => {
                const option = NUMBER_FORMAT_OPTIONS.find((entry) => entry.label === label);
                if (option) onChange({ numberFormat: option.value });
              }}
            />
            <SelectRow
              label="Position"
              options={NUMBER_POSITION_OPTIONS.map((option) => option.label)}
              value={positionLabel}
              onChange={(label) => {
                const option = NUMBER_POSITION_OPTIONS.find((entry) => entry.label === label);
                if (option) onChange({ numberPosition: option.value });
              }}
            />

            <div className="grid grid-cols-2 gap-4">
              <RailNumber
                label="Start at"
                unit=""
                min={0}
                max={999}
                value={settings.numberStart}
                onChange={(next) =>
                  onChange({
                    numberStart: Number.isFinite(next) ? Math.max(0, Math.min(999, Math.round(next))) : 1,
                  })
                }
              />
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted">Size</span>
                  <span className="fb-num text-[13px] text-faint">{settings.numberSize} pt</span>
                </div>
                <RailSlider
                  label="Page number size"
                  value={settings.numberSize}
                  min={8}
                  max={14}
                  onValueChange={(numberSize) => onChange({ numberSize })}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        )}
      </Field>

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
        <RailSection
          icon={FileCog}
          title="Document details"
          aside={advancedModified ? "Changed" : "Title, author"}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <TextRow
              label="Title"
              value={settings.title}
              onChange={(title) => onChange({ title })}
              placeholder="From the first PDF"
            />
            <TextRow
              label="Author"
              value={settings.author}
              onChange={(author) => onChange({ author })}
              placeholder="Optional"
            />
            <TextRow
              label="Subject"
              value={settings.subject}
              onChange={(subject) => onChange({ subject })}
              placeholder="Optional"
            />
            <ToggleRow
              label="Keep source metadata"
              description="Fill empty fields from the first PDF's details."
              checked={settings.keepMetadata}
              onChange={(keepMetadata) => onChange({ keepMetadata })}
            />
            <ToggleRow
              label="Optimize file structure"
              description="Trims overhead without touching quality."
              checked={settings.optimize}
              onChange={(optimize) => onChange({ optimize })}
            />
            <RailReset onClick={onReset} label="Reset all settings" />
          </div>
        </RailSection>
      </div>
    </div>
  );
}
