"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { formatBytes, pagesOf, parseRanges, rangeLabel } from "../model";
import type { MergeQueueItem } from "./useMergeQueue";

const ROTATIONS = [0, 90, 180, 270];

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

  const iconButton =
    "grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.012 }}
      className="relative list-none rounded-[14px] border border-line bg-white shadow-[0_1px_0_rgba(15,15,16,0.03)]"
    >
      <div className="flex items-start gap-2 p-2.5 sm:gap-3 sm:p-3">
        <button
          type="button"
          aria-label={`Drag ${item.name} to reorder`}
          disabled={locked}
          onPointerDown={(event) => {
            if (!locked) controls.start(event);
          }}
          className="mt-0.5 grid h-7 w-4 shrink-0 touch-none place-items-center rounded text-[#b3ad9f] transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <GripVertical size={14} aria-hidden />
        </button>

        <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold tabular-nums text-white">
          {index + 1}
        </span>

        <span className="relative mt-0.5 block h-[62px] w-[46px] shrink-0 overflow-hidden rounded-[5px] border border-line bg-[#f6f4f0] sm:h-[74px] sm:w-[54px]">
          {item.thumbnail ? (
            <img
              src={item.thumbnail.dataUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-[8px] font-semibold uppercase tracking-[0.08em] text-[#a49d8f]">
              PDF
            </span>
          )}
          {reading || item.thumbnailState === "loading" ? (
            <span className="absolute inset-0 grid place-items-center bg-white/60">
              <Loader2 size={13} className="animate-spin text-accent" aria-hidden />
            </span>
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-ink">{item.name}</p>
          <p className="mt-1 text-[10px] tabular-nums text-faint">
            {reading
              ? "Reading pages…"
              : `${item.pageCount} page${item.pageCount === 1 ? "" : "s"} · ${formatBytes(item.size)}`}
          </p>
          {!reading && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${
                  allSelected
                    ? "bg-[#f4f2ed] text-muted"
                    : "bg-[#fdf4e9] text-[#8a6636]"
                }`}
              >
                {allSelected ? "All pages" : `${item.pages.length} selected`}
              </span>
              {!allSelected && (
                <span className="max-w-[150px] truncate text-[9.5px] tabular-nums text-faint">
                  {rangeLabel(item.pages)}
                </span>
              )}
              {item.rotation !== 0 && (
                <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted">
                  {item.rotation}°
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 content-start gap-0.5 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => onMove(item.id, -1)}
            disabled={locked || reading || index === 0}
            aria-label={`Move ${item.name} earlier`}
            className={iconButton}
          >
            <ArrowUp size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(item.id, 1)}
            disabled={locked || reading || index === total - 1}
            aria-label={`Move ${item.name} later`}
            className={iconButton}
          >
            <ArrowDown size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            disabled={reading || locked}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide options for ${item.name}` : `Show options for ${item.name}`}
            className={iconButton}
          >
            <ChevronDown
              size={13}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={locked}
            aria-label={`Remove ${item.name}`}
            className={iconButton}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </div>

      {expanded && !reading && (
        <div className="border-t border-line-soft px-3 pb-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_188px]">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={`range-${item.id}`}
                  className="text-[10.5px] font-medium text-muted"
                >
                  Pages to keep
                </label>
                <span className="text-[9.5px] tabular-nums text-faint">
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
                  className={`h-8 min-w-0 flex-1 rounded-[8px] border bg-white px-2.5 text-[11.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-faint/70 ${
                    rangeInvalid
                      ? "border-[#d6a090] focus:border-[#c07b63]"
                      : "border-line hover:border-[#d5d1c8] focus:border-[#bbb6ab]"
                  }`}
                />
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onRangeChange(item.id, item.pageCount === 1 ? "1" : `1-${item.pageCount}`)
                  }
                  className="h-8 shrink-0 rounded-[7px] border border-line bg-white px-2 text-[10px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  All
                </button>
                <button
                  type="button"
                  disabled={locked || item.pageCount < 2}
                  onClick={() => onRangeChange(item.id, odds)}
                  className="h-8 shrink-0 rounded-[7px] border border-line bg-white px-2 text-[10px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  Odd
                </button>
                <button
                  type="button"
                  disabled={locked || !evens || item.pageCount < 2}
                  onClick={() => onRangeChange(item.id, evens)}
                  className="h-8 shrink-0 rounded-[7px] border border-line bg-white px-2 text-[10px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  Even
                </button>
              </div>
              <p
                className={`mt-1 text-[9.5px] leading-relaxed ${
                  rangeInvalid ? "text-[#a13d30]" : "text-faint"
                }`}
              >
                {rangeInvalid
                  ? "Enter page numbers like 1-3, 6."
                  : "Comma-separated pages and ranges. Pages keep their original size."}
              </p>
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-muted">
                <RotateCw size={11} aria-hidden />
                Rotate pages
              </span>
              <div className="mt-1.5 grid grid-cols-4 overflow-hidden rounded-[8px] border border-line">
                {ROTATIONS.map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    disabled={locked}
                    aria-pressed={item.rotation === angle}
                    onClick={() => onRotationChange(item.id, angle)}
                    className={`h-8 text-[10.5px] font-medium tabular-nums transition-colors disabled:opacity-40 ${
                      item.rotation === angle
                        ? "bg-ink text-white"
                        : "bg-white text-muted hover:text-ink"
                    }`}
                  >
                    {angle}°
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[9.5px] leading-relaxed text-faint">
                Adds to the page&apos;s own rotation.
              </p>
            </div>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}
