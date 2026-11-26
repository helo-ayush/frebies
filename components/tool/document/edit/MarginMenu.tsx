"use client";

import { useState } from "react";
import { Check, SquareDashed } from "lucide-react";
import { Drop, Head, ICON } from "./BarParts";
import { MARGINS, UNITS, marginText, presetOf, sameMargin, type Unit } from "./engine/margins";
import { pageBox, type Margin } from "./model";
import { fileMargins, filesOpen, setMargin, type Reach } from "./pages";
import { useEditor, type EditorStore } from "./store";
import { MenuRow, NumberBox } from "./ui";

const SIDES = ["top", "bottom", "left", "right"] as const;
const SIDE_NAMES = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

/** Four lengths, in the unit the visitor uses. */
export function MarginBoxes({
  value,
  unit,
  most,
  onChange,
  onUnit,
}: {
  value: Margin;
  unit: Unit;
  most: { w: number; h: number };
  onChange: (margin: Margin) => void;
  onUnit: (unit: Unit) => void;
}) {
  const { points, step, digits } = UNITS[unit];
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {SIDES.map((side) => {
          const limit = ((side === "top" || side === "bottom" ? most.h : most.w) * 0.45) / points;
          return (
            <label key={side} className="flex items-center justify-between gap-2 text-[13px]">
              {SIDE_NAMES[side]}
              <NumberBox
                label={`${SIDE_NAMES[side]} margin`}
                value={Number((value[side] / points).toFixed(digits))}
                min={0}
                max={Math.round(limit * 100) / 100}
                step={step}
                width={54}
                onChange={(next) => onChange({ ...value, [side]: next * points })}
              />
            </label>
          );
        })}
      </div>
      <div role="group" aria-label="Unit" className="mt-3 flex border border-line-strong">
        {(Object.keys(UNITS) as Unit[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={unit === item}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onUnit(item)}
            className={`h-8 flex-1 border-l border-line-strong text-[12.5px] first:border-l-0 ${unit === item ? "bg-ink text-white" : "bg-white hover:bg-hover"}`}
          >
            {UNITS[item].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Margins of the page: none, the usual ones, the file's own, or any. */
export function MarginMenu({ store }: { store: EditorStore }) {
  const page = useEditor(store, (s) => s.here);
  const pages = useEditor(store, (s) => s.doc.pages);
  const unit = useEditor(store, (s) => s.view.prefs.unit);
  const show = useEditor(store, (s) => s.view.prefs.margins);
  const [reach, setReach] = useState<Reach>("file");
  const [custom, setCustom] = useState(false);
  if (!page) return null;
  const preset = presetOf(page.margin);
  const files = filesOpen(store);
  const box = pageBox(page);
  const label = page.margin ? (preset?.label ?? "Custom") : "None";
  const mixed = !pages.every((item) => sameMargin(item.margin, page.margin));
  const reaches: { value: Reach; label: string }[] = [
    { value: "page", label: "This page" },
    { value: "file", label: files > 1 ? "Its file" : "All pages" },
    ...(files > 1 ? [{ value: "all" as Reach, label: "All pages" }] : []),
  ];
  return (
    <Drop label="Margins" icon={<SquareDashed {...ICON} />} text={`Margins: ${label}`} width={290}>
      {(close) => (
        <div>
          <div role="group" aria-label="Which pages" className="flex border-b border-line">
            {reaches.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={reach === item.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setReach(item.value)}
                className={`h-9 flex-1 border-l border-line text-[12.5px] font-medium first:border-l-0 ${reach === item.value ? "bg-ink text-white" : "hover:bg-hover"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {mixed ? (
            <p className="border-b border-line bg-accent-soft px-3 py-2 text-[12.5px] leading-snug">
              Pages here have different margins: every file keeps its own until you change it.
            </p>
          ) : null}
          {MARGINS.map((item) => {
            const on = sameMargin(item.margin, page.margin ?? null);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                data-sound="select"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMargin(store, item.margin, reach);
                  close();
                }}
                className={`flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left ${on ? "bg-ink text-white" : "hover:bg-hover"}`}
              >
                <MarginArt margin={item.margin} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-tight">{item.label}</span>
                  <span className={`block truncate text-[12px] leading-tight ${on ? "text-white/65" : "text-muted"}`}>
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
          {page.source !== null ? (
            <MenuRow
              label="As in the file"
              onClick={() => {
                void fileMargins(store, reach === "page" ? "page" : reach);
                close();
              }}
            />
          ) : null}
          <button
            type="button"
            aria-expanded={custom}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setCustom((value) => !value)}
            className={`flex min-h-[42px] w-full items-center justify-between border-b border-line px-3 text-left text-[14px] ${!preset && page.margin ? "bg-ink text-white" : "hover:bg-hover"}`}
          >
            Custom
            <span
              className={`fb-num truncate pl-3 text-[12px] ${!preset && page.margin ? "text-white/65" : "text-muted"}`}
            >
              {page.margin ? marginText(page.margin, unit) : ""}
            </span>
          </button>
          {custom || (!preset && page.margin) ? (
            <div className="border-b border-line p-3">
              <MarginBoxes
                value={page.margin ?? { top: 72, right: 72, bottom: 72, left: 72 }}
                unit={unit}
                most={box}
                onUnit={(next) => store.setPrefs({ unit: next })}
                onChange={(margin) => setMargin(store, margin, reach)}
              />
            </div>
          ) : null}
          <Head>On screen</Head>
          <MenuRow
            label="Show margin lines"
            icon={show ? <Check {...ICON} /> : <span />}
            onClick={() => store.setPrefs({ margins: !show })}
          />
        </div>
      )}
    </Drop>
  );
}

export function MarginArt({ margin }: { margin: Margin | null }) {
  const k = 26 / 595;
  const m = margin ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return (
    <svg width="26" height="36" viewBox="0 0 26 36" className="shrink-0 bg-white text-ink" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="35" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <rect
        x={Math.max(1.5, m.left * k)}
        y={Math.max(1.5, m.top * k)}
        width={Math.max(4, 26 - Math.max(1.5, m.left * k) - Math.max(1.5, m.right * k))}
        height={Math.max(4, 36 - Math.max(1.5, m.top * k) - Math.max(1.5, m.bottom * k))}
        fill="#f2552c"
        fillOpacity="0.28"
      />
    </svg>
  );
}
