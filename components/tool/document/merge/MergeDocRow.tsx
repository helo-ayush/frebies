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
import { ToolIcon, ToolText, Segmented } from "@/components/tool/kit";
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
      whileDrag={{ scale: 1.01, zIndex: 5 }}
      className="relative list-none border-b border-line bg-panel"
    >
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`Drag ${item.name} to reorder`}
          disabled={locked}
          onPointerDown={(event) => {
            if (!locked) controls.start(event);
          }}
          className="flex w-[52px] shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-2 border-r border-line transition-colors hover:bg-ink hover:text-white active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="fb-num text-[13px] font-semibold">{String(index + 1).padStart(2, "0")}</span>
          <GripVertical size={16} aria-hidden />
        </button>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 py-3 pl-3 pr-3 sm:pl-4">
          <span className="relative block h-[84px] w-[62px] shrink-0 overflow-hidden bg-white shadow-[0_0_0_1px_rgba(24,24,27,0.2),4px_4px_0_rgba(24,24,27,0.08)]">
            {item.thumbnail ? (
              <img src={item.thumbnail.dataUrl} alt="" draggable={false} className="h-full w-full object-contain" />
            ) : (
              <span className="fb-hatch grid h-full w-full place-items-center text-[12px] font-semibold text-faint">PDF</span>
            )}
            {reading || item.thumbnailState === "loading" ? (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 size={16} className="animate-spin text-accent-deep" aria-hidden />
              </span>
            ) : null}
          </span>

          <div className="min-w-[130px] flex-1">
            <p className="truncate text-[15px] font-semibold">{item.name}</p>
            <p className="fb-num mt-1 truncate text-[13.5px] text-muted">{summary}</p>
            {!reading && !allSelected ? (
              <p className="fb-num mt-1 truncate text-[13.5px] font-medium text-accent-deep">
                Pages {rangeLabel(item.pages)}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 [&>*]:-ml-px">
            <ToolIcon
              label={`Move ${item.name} earlier`}
              onClick={() => onMove(item.id, -1)}
              disabled={locked || reading || index === 0}
            >
              <ArrowUp size={15} aria-hidden />
            </ToolIcon>
            <ToolIcon
              label={`Move ${item.name} later`}
              onClick={() => onMove(item.id, 1)}
              disabled={locked || reading || index === total - 1}
            >
              <ArrowDown size={15} aria-hidden />
            </ToolIcon>
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              disabled={reading || locked}
              aria-expanded={expanded}
              data-slot="row-trigger"
              aria-label={expanded ? `Hide options for ${item.name}` : `Show options for ${item.name}`}
              title="Pages and rotation"
              className={`inline-flex h-9 items-center gap-1.5 border px-2.5 text-[12.5px] font-medium uppercase transition-colors disabled:pointer-events-none disabled:opacity-35 ${
                expanded ? "relative z-[1] border-ink bg-ink text-white" : "border-line-strong bg-panel hover:bg-hover"
              }`}
            >
              <span className="max-sm:sr-only">Pages</span>
              <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <ToolIcon label={`Remove ${item.name}`} slot="doc-remove" onClick={() => onRemove(item.id)} disabled={locked}>
              <X size={16} aria-hidden />
            </ToolIcon>
          </div>
        </div>
      </div>

      {expanded && !reading && (
        <div className="grid gap-x-6 gap-y-4 border-t border-line bg-canvas px-4 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:pl-[68px]">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`range-${item.id}`} className="text-[14px] font-medium">
                Pages to keep
              </label>
              <span className="fb-num text-[13px] text-faint">
                {item.pages.length} of {item.pageCount}
              </span>
            </div>
            <div className="mt-2 flex items-stretch [&>*]:-ml-px">
              <input
                id={`range-${item.id}`}
                value={item.range}
                onChange={(event) => onRangeChange(item.id, event.target.value)}
                disabled={locked}
                placeholder="1-3, 5"
                spellCheck={false}
                inputMode="text"
                aria-describedby={`range-hint-${item.id}`}
                className={`fb-input fb-num !h-9 min-w-0 flex-1 ${rangeInvalid ? "!border-danger" : ""}`}
              />
              <ToolText
                disabled={locked}
                onClick={() => onRangeChange(item.id, item.pageCount === 1 ? "1" : `1-${item.pageCount}`)}
              >
                All
              </ToolText>
              <ToolText disabled={locked || item.pageCount < 2} onClick={() => onRangeChange(item.id, odds)}>
                Odd
              </ToolText>
              <ToolText
                disabled={locked || !evens || item.pageCount < 2}
                onClick={() => onRangeChange(item.id, evens)}
              >
                Even
              </ToolText>
            </div>
            <p
              id={`range-hint-${item.id}`}
              className={`mt-2 text-[13px] ${rangeInvalid ? "text-danger" : "text-muted"}`}
            >
              {rangeInvalid ? "Enter page numbers like 1-3, 6." : "Ranges and single pages, separated by commas."}
            </p>
          </div>

          <div>
            <span className="text-[14px] font-medium">Rotate pages</span>
            <Segmented
              label={`Rotate pages of ${item.name}`}
              className="mt-2 [&>button]:h-[34px]"
              disabled={locked}
              options={ROTATIONS.map((angle) => ({ value: String(angle), label: `${angle}°` }))}
              value={String(item.rotation)}
              onChange={(angle) => onRotationChange(item.id, Number(angle))}
            />
            <p className="mt-2 text-[13px] text-muted">Added to each page&apos;s own rotation.</p>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}
