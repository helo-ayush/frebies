"use client";

import { Check } from "lucide-react";

const LINE_WIDTHS = [92, 74, 86, 61, 90, 68, 82, 55, 87];
const ACCENTS = ["#c9bfe0", "#e6d3bd", "#c3d5c9", "#d9c9c3"];

/** A stylised PDF page used by the document previews. */
export function PagePaper({
  index,
  weight = 0,
  selected = false,
  onSelect,
  label,
  className = "",
}: {
  index: number;
  /** Varies the fake content so a grid does not look repetitive. */
  weight?: number;
  selected?: boolean;
  onSelect?: () => void;
  label?: string;
  className?: string;
}) {
  const accent = ACCENTS[(index - 1 + weight) % ACCENTS.length];
  const lines = 5 + ((index + weight) % 3);

  const paper = (
    <span
      className={`relative block w-full overflow-hidden rounded-[5px] border bg-white text-left shadow-[0_6px_16px_rgba(45,36,60,0.10)] transition-[border-color,box-shadow] ${
        selected ? "border-ink ring-2 ring-ink/15" : "border-[#e2dee8]"
      }`}
      style={{ aspectRatio: "1 / 1.32" }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} aria-hidden />
      <span className="flex h-full flex-col p-[9%]">
        <span className="flex items-center justify-between gap-1">
          <span className="h-[3px] w-[38%] rounded-full bg-[#c9c4d2]" />
          <span className="h-[3px] w-[16%] rounded-full bg-[#e4e0e9]" />
        </span>
        <span className="mt-[8%] block h-[5px] w-[64%] rounded-full bg-[#a9a3b6]" />
        <span className="mt-[5%] grid grid-cols-3 gap-[3%]">
          {[0, 1, 2].map((cell) => (
            <span key={cell} className="block" style={{ aspectRatio: "1 / 0.72" }}>
              <span className="block h-full w-full rounded-[2px]" style={{ background: accent, opacity: 0.55 }} />
            </span>
          ))}
        </span>
        <span className="mt-[8%] flex flex-col gap-[4.5%]">
          {Array.from({ length: lines }).map((_, line) => (
            <span
              key={line}
              className="block h-[2.5px] rounded-full bg-[#e6e2ec]"
              style={{ width: `${LINE_WIDTHS[(line + index) % LINE_WIDTHS.length]}%` }}
            />
          ))}
        </span>
        <span className="mt-auto flex items-center justify-between pt-[6%]">
          <span className="text-[7px] font-medium tabular-nums text-[#aaa4b8]">
            {label ?? `Page ${index}`}
          </span>
          <span className="h-[2px] w-[18%] rounded-full bg-[#ece9f1]" />
        </span>
      </span>

      {onSelect && (
        <span
          aria-hidden
          className={`absolute right-1.5 top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors ${
            selected
              ? "border-ink bg-ink text-white"
              : "border-[#d8d3e0] bg-white/95 text-transparent"
          }`}
        >
          <Check size={10} strokeWidth={3} />
        </span>
      )}
    </span>
  );

  if (!onSelect) return <span className={className}>{paper}</span>;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label ?? `Page ${index}`}
      className={`group block w-full rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${className}`}
    >
      {paper}
    </button>
  );
}

/** Grid of selectable pages with a scrollable viewport. */
export function PageGrid({
  count,
  selected,
  onToggle,
  columns = "grid-cols-4 sm:grid-cols-5",
  maxHeightClass = "max-h-[300px]",
  startIndex = 1,
  weight = 0,
}: {
  count: number;
  selected?: Set<number>;
  onToggle?: (page: number) => void;
  columns?: string;
  maxHeightClass?: string;
  startIndex?: number;
  weight?: number;
}) {
  const pages = Array.from({ length: Math.max(0, count) }, (_, index) => startIndex + index);
  if (pages.length === 0) return null;

  return (
    <div className={`-mx-1 overflow-y-auto px-1 pb-1 ${maxHeightClass}`}>
      <div className={`grid ${columns} gap-2`}>
        {pages.map((page) => (
          <PagePaper
            key={page}
            index={page}
            weight={weight}
            selected={selected?.has(page)}
            onSelect={onToggle ? () => onToggle(page) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** Small stacked-pages motif used in empty states and heroes. */
export function PaperStack({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`relative block h-[72px] w-[60px] ${className}`}>
      <span className="absolute left-3 top-0 h-[58px] w-[42px] -rotate-[8deg] rounded-[5px] border border-[#ded8e6] bg-white shadow-sm" />
      <span className="absolute left-1 top-2 h-[58px] w-[42px] rotate-[3deg] rounded-[5px] border border-[#d8d1e2] bg-white shadow-sm" />
      <span className="absolute left-2 top-1 grid h-[58px] w-[42px] place-items-center rounded-[5px] border border-[#d2cade] bg-white text-[#6b6384] shadow-[0_8px_16px_rgba(60,48,80,0.14)]">
        <span className="flex flex-col gap-1">
          <span className="block h-[2px] w-5 rounded-full bg-[#bdb6cc]" />
          <span className="block h-[2px] w-4 rounded-full bg-[#d8d2e4]" />
          <span className="block h-[2px] w-5 rounded-full bg-[#d8d2e4]" />
        </span>
      </span>
    </span>
  );
}
