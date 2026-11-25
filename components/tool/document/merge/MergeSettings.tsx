"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Field } from "@/components/tool/kit";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    <div className="space-y-6">
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
        <div className="space-y-3.5">
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
          <div className="mt-3.5 space-y-3.5">
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

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[12.5px] font-medium text-muted">Start at</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={settings.numberStart}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    onChange({
                      numberStart: Number.isFinite(next)
                        ? Math.max(0, Math.min(999, Math.round(next)))
                        : 1,
                    });
                  }}
                  className="mt-1.5 h-10 w-full rounded-[10px] border border-line bg-white px-3 text-[13px] tabular-nums text-ink outline-none transition-colors hover:border-[#cfc9bd] focus:border-ink"
                />
              </label>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-muted">Size</span>
                  <span className="text-[12px] tabular-nums text-faint">{settings.numberSize} pt</span>
                </div>
                <RailSlider
                  label="Page number size"
                  value={settings.numberSize}
                  min={8}
                  max={14}
                  onValueChange={(numberSize) => onChange({ numberSize })}
                  className="mt-2.5"
                />
              </div>
            </div>
          </div>
        )}
      </Field>

      <div>
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="merge-advanced-settings"
          data-slot="advanced-trigger"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[13px] font-semibold text-ink">Document details</span>
            {advancedModified && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                role="img"
                aria-label="Document details were changed"
              />
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[12px] text-faint">Title, author, metadata</span>
            <ChevronDown
              size={15}
              className={`text-faint transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </button>

        {advancedOpen && (
          <div id="merge-advanced-settings" className="mt-3 space-y-3.5">
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

            <button
              type="button"
              onClick={onReset}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line bg-white text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <RotateCcw size={13} aria-hidden />
              Reset all settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
