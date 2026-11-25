"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Loader2,
  X,
} from "lucide-react";
import { formatBytes, pagesOf, parseRanges, rangeLabel } from "../model";
import type { MergeQueueItem } from "./useMergeQueue";

const ROTATIONS = [0, 90, 180, 270];

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30";
const QUICK_BUTTON =
  "h-9 shrink-0 rounded-[9px] border border-line bg-white px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:border-[#cfc9bd] hover:text-ink disabled:pointer-events-none disabled:opacity-40";
const OPTION_LABEL = "text-[12.5px] font-medium text-muted";

export function MergeDocRow({
  item,
  index,
  total,
  locked,
  onRangeChange,
  onRotationChange,
  onMove,
  onRemove,
}: {
  item: MergeQueueItem;
  index: number;
  total: number;
  locked: boolean;
  onRangeChange: (id: string, value: string) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const controls = useDragControls();
  const [expanded, setExpanded] = useState(false);
  const reading = item.status === "reading";

  const parsed = reading ? [] : parseRanges(item.range, item.pageCount);
  const rangeInvalid = !reading && parsed.length === 0;
  const allSelected = !reading && item.pages.length === item.pageCount;
  const odds = rangeLabel(pagesOf(item.pageCount).filter((page) => page % 2 === 1));
  const evens = rangeLabel(pagesOf(item.pageCount).filter((page) => page % 2 === 0));

  const summary = reading
    ? "Reading pages…"
    : [
        allSelected
          ? `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`
          : `${item.pages.length} of ${item.pageCount} pages`,
        formatBytes(item.size),
        item.rotation !== 0 ? `rotated ${item.rotation}°` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.012 }}
      className="relative list-none rounded-[14px] border border-line bg-white"
    >
      <div className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
        <button
          type="button"
          aria-label={`Drag ${item.name} to reorder`}
          disabled={locked}
          onPointerDown={(event) => {
            if (!locked) controls.start(event);
          }}
          className="grid h-10 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-[#b3ad9f] transition-colors hover:text-ink active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
        >
          <GripVertical size={16} aria-hidden />
        </button>

        <span className="relative block h-[62px] w-[46px] shrink-0 overflow-hidden rounded-[6px] border border-line bg-card sm:h-[74px] sm:w-[54px]">
          {item.thumbnail ? (
            <img
              src={item.thumbnail.dataUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              PDF
            </span>
          )}
          {reading || item.thumbnailState === "loading" ? (
            <span className="absolute inset-0 grid place-items-center bg-white/60">
              <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
            </span>
          ) : null}
          <span className="absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-semibold tabular-nums text-white">
            {index + 1}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{item.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-faint">{summary}</p>
          {!reading && !allSelected ? (
            <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-accent-deep">
              Pages {rangeLabel(item.pages)}
            </p>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-0.5 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => onMove(item.id, -1)}
            disabled={locked || reading || index === 0}
            aria-label={`Move ${item.name} earlier`}
            className={ICON_BUTTON}
          >
            <ArrowUp size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(item.id, 1)}
            disabled={locked || reading || index === total - 1}
            aria-label={`Move ${item.name} later`}
            className={ICON_BUTTON}
          >
            <ArrowDown size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            disabled={reading || locked}
            aria-expanded={expanded}
            data-slot="row-trigger"
            aria-label={expanded ? `Hide options for ${item.name}` : `Show options for ${item.name}`}
            title="Pages and rotation"
            className={ICON_BUTTON}
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={locked}
            aria-label={`Remove ${item.name}`}
            data-slot="doc-remove"
            className={ICON_BUTTON}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      {expanded && !reading && (
        <div className="grid gap-4 border-t border-line-soft px-3 pb-3.5 pt-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`range-${item.id}`} className={OPTION_LABEL}>
                Pages to keep
              </label>
              <span className="text-[12px] tabular-nums text-faint">
                {item.pages.length} of {item.pageCount}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                id={`range-${item.id}`}
                value={item.range}
                onChange={(event) => onRangeChange(item.id, event.target.value)}
                disabled={locked}
                placeholder="1-3, 5"
                spellCheck={false}
                inputMode="text"
                aria-describedby={`range-hint-${item.id}`}
                className={`h-9 min-w-0 flex-1 rounded-[9px] border bg-white px-2.5 text-[13px] tabular-nums text-ink outline-none transition-colors placeholder:text-faint ${
                  rangeInvalid
                    ? "border-danger/50 focus:border-danger"
                    : "border-line hover:border-[#cfc9bd] focus:border-ink"
                }`}
              />
              <button
                type="button"
                disabled={locked}
                onClick={() =>
                  onRangeChange(item.id, item.pageCount === 1 ? "1" : `1-${item.pageCount}`)
                }
                className={QUICK_BUTTON}
              >
                All
              </button>
              <button
                type="button"
                disabled={locked || item.pageCount < 2}
                onClick={() => onRangeChange(item.id, odds)}
                className={QUICK_BUTTON}
              >
                Odd
              </button>
              <button
                type="button"
                disabled={locked || !evens || item.pageCount < 2}
                onClick={() => onRangeChange(item.id, evens)}
                className={QUICK_BUTTON}
              >
                Even
              </button>
            </div>
            <p
              id={`range-hint-${item.id}`}
              className={`mt-1.5 text-[12px] leading-relaxed ${rangeInvalid ? "text-danger" : "text-faint"}`}
            >
              {rangeInvalid
                ? "Enter page numbers like 1-3, 6."
                : "Ranges and single pages, separated by commas."}
            </p>
          </div>

          <div>
            <span className={OPTION_LABEL}>Rotate pages</span>
            <div
              role="group"
              aria-label={`Rotate pages of ${item.name}`}
              className="mt-1.5 grid grid-cols-4 gap-1 rounded-[11px] bg-card p-1"
            >
              {ROTATIONS.map((angle) => (
                <button
                  key={angle}
                  type="button"
                  disabled={locked}
                  aria-pressed={item.rotation === angle}
                  onClick={() => onRotationChange(item.id, angle)}
                  className={`h-7 rounded-[8px] text-[12.5px] font-medium tabular-nums transition-colors disabled:opacity-40 ${
                    item.rotation === angle
                      ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {angle}°
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
              Added to each page&apos;s own rotation.
            </p>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}
