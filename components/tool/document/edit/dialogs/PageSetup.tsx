"use client";

import { useEffect, useState } from "react";
import { MarginArt, MarginBoxes } from "../MarginMenu";
import { MARGINS, PAPERS, UNITS, paperOf, sameMargin, type Unit } from "../engine/margins";
import { pageBox, shownSize, type Margin } from "../model";
import { filesOpen, resizePages, setMargin, type Reach } from "../pages";
import { useEditor, type EditorStore } from "../store";
import { NumberBox } from "../ui";
import { Choice, Part, Sheet } from "./Sheet";

const STANDARD: Margin = { top: 72, right: 72, bottom: 72, left: 72 };

type Size = { w: number; h: number };

/** Paper, the way it lies, and its own measures. */
function PaperFields({
  size,
  unit,
  onChange,
  onUnit,
}: {
  size: Size;
  unit: Unit;
  onChange: (size: Size) => void;
  onUnit: (unit: Unit) => void;
}) {
  const found = paperOf(size.w, size.h);
  const landscape = size.w > size.h;
  const { points, step, digits } = UNITS[unit];
  const length = (label: string, value: number, set: (value: number) => void) => (
    <label className="flex items-center gap-2 text-[13px]">
      {label}
      <NumberBox
        label={label}
        value={Number((value / points).toFixed(digits))}
        min={Math.round((36 / points) * 100) / 100}
        max={Math.round((5600 / points) * 100) / 100}
        step={step}
        width={58}
        onChange={(next) => set(next * points)}
      />
    </label>
  );
  return (
    <>
      <Choice
        label="Paper"
        value={found?.paper.id ?? "custom"}
        onChange={(id) => {
          const paper = PAPERS.find((item) => item.id === id);
          if (paper)
            onChange(
              landscape ? { w: Math.max(paper.w, paper.h), h: Math.min(paper.w, paper.h) } : { w: paper.w, h: paper.h },
            );
        }}
        options={[
          ...PAPERS.map((paper) => ({ value: paper.id, label: paper.label })),
          ...(found ? [] : [{ value: "custom", label: "Custom" }]),
        ]}
      />
      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Choice
          label="Which way it lies"
          value={landscape ? "landscape" : "portrait"}
          onChange={(way) => {
            if ((way === "landscape") !== landscape) onChange({ w: size.h, h: size.w });
          }}
          options={[
            { value: "portrait", label: "Upright" },
            { value: "landscape", label: "On its side" },
          ]}
        />
        {length("Width", size.w, (w) => onChange({ ...size, w }))}
        {length("Height", size.h, (h) => onChange({ ...size, h }))}
        <select
          aria-label="Unit"
          value={unit}
          onChange={(event) => onUnit(event.target.value as Unit)}
          className="fb-input !h-9 !w-[76px] !px-2.5 !text-[13.5px]"
        >
          {(Object.keys(UNITS) as Unit[]).map((item) => (
            <option key={item} value={item}>
              {UNITS[item].label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Margins: none, the usual ones, or any. */
function MarginFields({
  value,
  size,
  unit,
  onChange,
  onUnit,
}: {
  value: Margin | null;
  size: Size;
  unit: Unit;
  onChange: (margin: Margin | null) => void;
  onUnit: (unit: Unit) => void;
}) {
  const preset = MARGINS.find((item) => sameMargin(item.margin, value));
  const [custom, setCustom] = useState(!preset);
  const on = custom || !preset ? "custom" : preset.id;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MARGINS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={on === item.id}
            data-sound="select"
            onClick={() => {
              setCustom(false);
              onChange(item.margin);
            }}
            className={`flex items-center gap-2.5 border px-2.5 py-2 text-left ${on === item.id ? "fb-ed-tile-on" : "border-line-strong bg-white hover:border-ink"}`}
          >
            <MarginArt margin={item.margin} />
            <span className="text-[13.5px] leading-tight">{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={on === "custom"}
          data-sound="select"
          onClick={() => {
            setCustom(true);
            if (!value) onChange(STANDARD);
          }}
          className={`flex items-center gap-2.5 border px-2.5 py-2 text-left ${on === "custom" ? "fb-ed-tile-on" : "border-line-strong bg-white hover:border-ink"}`}
        >
          <MarginArt margin={value ?? STANDARD} />
          <span className="text-[13.5px] leading-tight">Custom</span>
        </button>
      </div>
      {on === "custom" && value ? (
        <div className="mt-3.5 max-w-[340px]">
          <MarginBoxes value={value} unit={unit} most={size} onChange={onChange} onUnit={onUnit} />
        </div>
      ) : preset && preset.margin ? (
        <p className="mt-2.5 text-[13px] text-muted">{preset.hint}</p>
      ) : null}
    </>
  );
}

/** How a page will look, small. */
function Sample({ size, margin }: { size: Size; margin: Margin | null }) {
  const k = Math.min(132 / size.w, 170 / size.h);
  const m = margin ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return (
    <div className="grid h-[190px] place-items-center bg-canvas">
      <div className="relative bg-white shadow-[0_0_0_1px_#a5a4a2]" style={{ width: size.w * k, height: size.h * k }}>
        {margin ? (
          <span
            className="absolute border border-dashed border-accent bg-accent/[0.06]"
            style={{ left: m.left * k, top: m.top * k, right: m.right * k, bottom: m.bottom * k }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A new document: its paper and its margins. */
export function NewDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const unit = useEditor(store, (s) => s.view.prefs.unit);
  const dirty = useEditor(store, (s) => s.view.dirty);
  const [size, setSize] = useState<Size>({ w: PAPERS[0].w, h: PAPERS[0].h });
  const [margin, setMarginValue] = useState<Margin | null>(null);
  const [count, setCount] = useState(1);
  const onUnit = (next: Unit) => store.setPrefs({ unit: next });
  return (
    <Sheet
      title="New document"
      open={open}
      onClose={onClose}
      width={760}
      foot={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[14px]">
            Pages
            <NumberBox
              label="How many pages"
              value={count}
              min={1}
              max={300}
              width={48}
              onChange={(value) => setCount(Math.round(value))}
            />
          </label>
          {dirty ? <p className="text-[13px] text-danger">The file that is open will be closed.</p> : null}
          <button
            type="button"
            onClick={() => {
              store.startBlank({ ...size, margin, count });
              onClose();
            }}
            className="fb-btn min-w-[180px]"
          >
            Create
          </button>
        </div>
      }
    >
      <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="sm:border-r sm:border-line">
          <Part title="Paper">
            <PaperFields size={size} unit={unit} onChange={setSize} onUnit={onUnit} />
          </Part>
          <Part title="Margins">
            <MarginFields value={margin} size={size} unit={unit} onChange={setMarginValue} onUnit={onUnit} />
          </Part>
        </div>
        <div className="hidden p-5 sm:block">
          <Sample size={size} margin={margin} />
          <p className="fb-num mt-3 text-center text-[12.5px] text-muted">
            {Number((size.w / UNITS[unit].points).toFixed(UNITS[unit].digits))} ×{" "}
            {Number((size.h / UNITS[unit].points).toFixed(UNITS[unit].digits))} {UNITS[unit].label}
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/** Paper size and margins of the pages that are there. */
export function SizeDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const unit = useEditor(store, (s) => s.view.prefs.unit);
  const page = useEditor(store, (s) => s.here);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [margin, setMarginValue] = useState<Margin | null>(null);
  const [reach, setReach] = useState<Reach>("all");
  useEffect(() => {
    if (!open || !page) return;
    setSize(shownSize(page));
    setMarginValue(page.margin ?? null);
    setReach(filesOpen(store) > 1 ? "file" : "all");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!page) return null;
  const onUnit = (next: Unit) => store.setPrefs({ unit: next });
  const now = shownSize(page);
  const resized = Math.abs(now.w - size.w) > 0.5 || Math.abs(now.h - size.h) > 0.5;
  const files = filesOpen(store);
  return (
    <Sheet
      title="Size and margins"
      open={open}
      onClose={onClose}
      width={680}
      foot={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Choice
            label="Which pages"
            value={reach}
            onChange={setReach}
            options={[
              {
                value: "page",
                label: store.view.marked.length > 1 ? `${store.view.marked.length} picked pages` : "This page",
              },
              ...(files > 1 ? [{ value: "file" as Reach, label: "Pages of this file" }] : []),
              { value: "all", label: "All pages" },
            ]}
          />
          <button
            type="button"
            onClick={() => {
              if (resized) resizePages(store, size, reach);
              if (!sameMargin(page.margin, margin, 0.4)) setMargin(store, margin, reach);
              onClose();
            }}
            className="fb-btn min-w-[160px]"
          >
            Apply
          </button>
        </div>
      }
    >
      <Part title="Paper">
        <PaperFields size={size} unit={unit} onChange={setSize} onUnit={onUnit} />
        {resized ? (
          <p className="mt-3 text-[13px] text-muted">What is on the pages keeps its size and stays in the middle.</p>
        ) : null}
      </Part>
      <Part title="Margins">
        <MarginFields
          key={String(open)}
          value={margin}
          size={size.w > 0 ? size : pageBox(page)}
          unit={unit}
          onChange={setMarginValue}
          onUnit={onUnit}
        />
      </Part>
    </Sheet>
  );
}
