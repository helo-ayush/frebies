"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw, Settings2, ShieldCheck } from "lucide-react";
import {
  RailSection,
  SelectRow,
  TextRow,
  ToggleRow,
} from "../DocumentKit";
import { formatBytes } from "../model";
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
  itemCount,
  totalPages,
  totalSize,
  advancedModified,
}: {
  settings: MergeSettings;
  onChange: (patch: Partial<MergeSettings>) => void;
  onReset: () => void;
  suggestion: string;
  itemCount: number;
  totalPages: number;
  totalSize: number;
  advancedModified: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const formatLabel =
    NUMBER_FORMAT_OPTIONS.find((option) => option.value === settings.numberFormat)?.label ?? "1, 2, 3";
  const positionLabel =
    NUMBER_POSITION_OPTIONS.find((option) => option.value === settings.numberPosition)?.label ??
    "Bottom center";
  const advancedSummary = advancedModified
    ? "Custom details"
    : settings.optimize
      ? "Optimized"
      : "Original";

  return (
    <div className="space-y-5">
      <RailSection title="Output file" hint="PDF">
        <TextRow
          label="File name"
          value={settings.filename}
          onChange={(filename) => onChange({ filename })}
          placeholder={suggestion}
          hint=".pdf is added automatically"
        />
        <div className="rounded-[11px] border border-line bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[10.5px]">
            <span className="text-faint">Documents</span>
            <span className="font-medium tabular-nums text-ink">{itemCount}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[10.5px]">
            <span className="text-faint">Pages in output</span>
            <span className="font-medium tabular-nums text-ink">{totalPages}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[10.5px]">
            <span className="text-faint">Source size</span>
            <span className="font-medium tabular-nums text-ink">{formatBytes(totalSize)}</span>
          </div>
        </div>
      </RailSection>

      <RailSection
        title="Page numbers"
        hint={settings.pageNumbers ? "On" : "Off"}
        className="border-t border-line-soft pt-4"
      >
        <ToggleRow
          label="Number every page"
          description="Sequential numbers, counted after merging."
          checked={settings.pageNumbers}
          onChange={(pageNumbers) => onChange({ pageNumbers })}
        />

        {settings.pageNumbers && (
          <div className="space-y-3 pt-1">
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

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10.5px] font-medium text-muted">Start at</span>
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
                  className="mt-1.5 h-9 w-full rounded-[9px] border border-line bg-white px-2.5 text-[11.5px] tabular-nums text-ink outline-none hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
                />
              </label>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-muted">Size</span>
                  <span className="text-[9.5px] tabular-nums text-faint">
                    {settings.numberSize} pt
                  </span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={14}
                  step={1}
                  value={settings.numberSize}
                  onChange={(event) => onChange({ numberSize: Number(event.target.value) })}
                  aria-label="Page number size"
                  className="range mt-3.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-[#e6e1d7]"
                />
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-faint">
              Preview:{" "}
              <span className="font-medium text-muted">
                {settings.numberFormat === "page"
                  ? `Page ${settings.numberStart}`
                  : settings.numberFormat === "page-of"
                    ? `${settings.numberStart} / ${totalPages || 12}`
                    : settings.numberStart}
              </span>{" "}
              · {positionLabel.toLowerCase()}
            </p>
          </div>
        )}
      </RailSection>

      <RailSection title="Structure" hint="Optional" className="border-t border-line-soft pt-4">
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
      </RailSection>

      <div className="border-t border-line-soft pt-4">
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="merge-advanced-settings"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-[11px] border border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-[#d5d1c8]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Settings2 size={13} className="shrink-0 text-muted" aria-hidden />
            <span className="text-[11.5px] font-medium text-ink">Document details</span>
            {advancedModified && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-label="Document details were changed"
              />
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] text-faint">{advancedSummary}</span>
            <ChevronDown
              size={13}
              className={`text-faint transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </button>

        {advancedOpen && (
          <div id="merge-advanced-settings" className="mt-3 space-y-4">
            <div className="space-y-2.5">
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
            </div>

            <div className="space-y-3 border-t border-line-soft pt-4">
              <ToggleRow
                label="Keep source metadata"
                description="Fill empty fields from the first PDF's details."
                checked={settings.keepMetadata}
                onChange={(keepMetadata) => onChange({ keepMetadata })}
              />
              <ToggleRow
                label="Optimize file structure"
                description="Streams objects to trim overhead without touching quality."
                checked={settings.optimize}
                onChange={(optimize) => onChange({ optimize })}
              />
            </div>

            <button
              type="button"
              onClick={onReset}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[9px] border border-line bg-white text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden />
              Reset all settings
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-[10px] border border-line bg-[#fbfaf7] px-3 py-2.5 text-[10px] leading-relaxed text-muted">
        <ShieldCheck size={12} className="mt-0.5 shrink-0" aria-hidden />
        Everything is assembled in this tab. Nothing is uploaded, and no watermark is added.
      </div>
    </div>
  );
}
