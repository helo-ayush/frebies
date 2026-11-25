"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Bold,
  BringToFront,
  ChevronDown,
  Copy,
  CopyPlus,
  Crop,
  FilePlus2,
  FlipHorizontal2,
  FlipVertical2,
  ImageUp,
  Italic,
  Layers2,
  Minus,
  PaintBucket,
  Pipette,
  Plus,
  RotateCcw,
  RotateCw,
  SendToBack,
  SquareDashed,
  Strikethrough,
  Trash2,
  Type,
  Underline,
} from "lucide-react";
import {
  LIBRARY,
  addUserFont,
  fontLabel,
  labelCss,
  isBold,
  isItalic,
  pdfFont,
  registerLibrary,
  userFontList,
  withEmphasis,
} from "./engine/fonts";
import { setSelection } from "./engine/text-dom";
import { objectBounds } from "./engine/matrix";
import {
  mixes,
  pageOf,
  type EditObject,
  type FieldObject,
  type ImageObject,
  type InkObject,
  type LinkObject,
  type MarkObject,
  type ShapeObject,
  type Style,
  type TextObject,
  type Tool,
} from "./model";
import { documentFonts, styleOfSelection, useEditor, type EditorStore } from "./store";
import { BarButton, BarText, ColorPick, MenuRow, NumberBox, Pop, Rule, Slider } from "./ui";

/** Puts the caret back in the text being edited, after a control had to take it. */
export function backToText(store: EditorStore) {
  const { editing, range } = store.view;
  if (!editing) return;
  const root = document.querySelector<HTMLElement>(`[data-text-box="${editing}"]`);
  if (!root) return;
  root.focus({ preventScroll: true });
  if (range) setSelection(root, range.from, range.to);
}

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];
const WIDTHS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12];
const MARKER_WIDTHS = [6, 10, 14, 18, 24, 32];

const ICON = { size: 17, strokeWidth: 1.8, "aria-hidden": true } as const;

// ---------------------------------------------------------------- fonts

function FontPick({ store, value, onChange }: { store: EditorStore; value: string; onChange: (id: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <Pop
        label="Font"
        width={276}
        button={(open, toggle, ref) => (
          <button
            ref={ref}
            type="button"
            aria-label={`Font: ${fontLabel(value)}`}
            aria-expanded={open}
            title="Font"
            data-slot="font-picker"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              registerLibrary();
              toggle();
            }}
            className="flex h-9 w-[168px] shrink-0 items-center justify-between gap-2 border border-line-strong bg-white px-2.5 text-left text-[14px] hover:border-ink"
          >
            <span className="truncate" style={labelCss(value)}>
              {fontLabel(value)}
            </span>
            <ChevronDown size={13} className="shrink-0" aria-hidden />
          </button>
        )}
      >
        {(close) => (
          <FontList
            store={store}
            value={value}
            onPick={(id) => (onChange(id), close())}
            onAdd={() => file.current?.click()}
            problem={problem}
          />
        )}
      </Pop>
      <input
        ref={file}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        className="hidden"
        aria-label="Add a font file"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (!picked) return;
          setProblem(null);
          void picked
            .arrayBuffer()
            .then((bytes) => addUserFont(picked.name.replace(/\.[^.]+$/, ""), bytes))
            .then((font) => onChange(font.id))
            .catch(() => setProblem(`${picked.name} is not a font this editor can use.`));
        }}
      />
    </>
  );
}

function FontList({
  store,
  value,
  onPick,
  onAdd,
  problem,
}: {
  store: EditorStore;
  value: string;
  onPick: (id: string) => void;
  onAdd: () => void;
  problem: string | null;
}) {
  const own = documentFonts(store);
  const mine = userFontList();
  const here = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: "center" });
  }, []);
  const name = pdfFont(value)?.name;
  const row = (id: string, label: string, like?: string) => {
    const on = id === value || (name !== undefined && pdfFont(id)?.name === name);
    return (
      <button
        key={id}
        ref={on ? here : undefined}
        type="button"
        aria-pressed={on}
        data-sound="select"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(id)}
        className={`flex min-h-[38px] w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${on ? "bg-ink text-white" : "hover:bg-hover"}`}
      >
        <span className="truncate text-[16px] leading-tight" style={labelCss(id)}>
          {label}
        </span>
        {like ? <span className={`shrink-0 text-[11.5px] ${on ? "text-white/60" : "text-faint"}`}>{like}</span> : null}
      </button>
    );
  };
  const head = (text: string) => (
    <p className="sticky top-0 z-[1] border-y border-line bg-canvas px-3 py-1.5 text-[12px] uppercase text-muted first:border-t-0">
      {text}
    </p>
  );
  return (
    <div>
      {own.length > 0 ? (
        <>
          {head("In this PDF")}
          {own.map((font) => row(font.id, fontLabel(font.id)))}
        </>
      ) : null}
      {mine.length > 0 ? (
        <>
          {head("Yours")}
          {mine.map((font) => row(font.id, font.name))}
        </>
      ) : null}
      {(["Sans", "Serif", "Typewriter", "Handwriting", "Hindi"] as const).map((group) => (
        <div key={group}>
          {head(group)}
          {LIBRARY.filter((family) => family.group === group).map((family) => row(family.id, family.name, family.like))}
        </div>
      ))}
      <div className="sticky bottom-0 border-t border-ink bg-panel">
        {problem ? <p className="px-3 pt-2 text-[13px] text-danger">{problem}</p> : null}
        <MenuRow label="Add a font file" hint="TTF, OTF" icon={<Plus size={15} aria-hidden />} onClick={onAdd} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shared ends of the bar

function Opacity({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const value = objects[0]?.opacity ?? 1;
  return (
    <Pop
      label="See-through"
      width={216}
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          title="Opacity"
          aria-label={`Opacity ${Math.round(value * 100)}%`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className="fb-num flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] hover:bg-hover"
        >
          <Layers2 size={16} strokeWidth={1.8} aria-hidden />
          {Math.round(value * 100)}%
        </button>
      )}
    >
      {() => (
        <Slider
          label="Opacity"
          min={0.05}
          max={1}
          step={0.05}
          value={value}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) =>
            store.patchMany(
              objects.map((object) => object.id),
              () => ({ opacity }),
              "opacity",
            )
          }
        />
      )}
    </Pop>
  );
}

type Edge = "left" | "centre" | "right" | "top" | "middle" | "bottom";

function lineUp(store: EditorStore, objects: EditObject[], edge: Edge) {
  const page = pageOf(store.doc, objects[0].id);
  if (!page) return;
  const boxes = objects.map((object) => objectBounds(object));
  const area =
    objects.length === 1
      ? { x0: 0, y0: 0, x1: page.w, y1: page.h }
      : {
          x0: Math.min(...boxes.map((box) => box.x)),
          y0: Math.min(...boxes.map((box) => box.y)),
          x1: Math.max(...boxes.map((box) => box.x + box.w)),
          y1: Math.max(...boxes.map((box) => box.y + box.h)),
        };
  store.patchMany(
    objects.map((object) => object.id),
    (object) => {
      const box = objectBounds(object);
      switch (edge) {
        case "left":
          return { x: object.x + area.x0 - box.x };
        case "centre":
          return { x: object.x + (area.x0 + area.x1) / 2 - (box.x + box.w / 2) };
        case "right":
          return { x: object.x + area.x1 - (box.x + box.w) };
        case "top":
          return { y: object.y + area.y0 - box.y };
        case "middle":
          return { y: object.y + (area.y0 + area.y1) / 2 - (box.y + box.h / 2) };
        case "bottom":
          return { y: object.y + area.y1 - (box.y + box.h) };
      }
    },
  );
}

function Arrange({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const ids = objects.map((object) => object.id);
  const one = objects.length === 1;
  const edges: { edge: Edge; label: string; icon: ReactNode }[] = [
    { edge: "left", label: one ? "To the left edge" : "Line up left edges", icon: <AlignStartVertical {...ICON} /> },
    {
      edge: "centre",
      label: one ? "Centre across the page" : "Line up centres",
      icon: <AlignCenterVertical {...ICON} />,
    },
    { edge: "right", label: one ? "To the right edge" : "Line up right edges", icon: <AlignEndVertical {...ICON} /> },
    { edge: "top", label: one ? "To the top" : "Line up tops", icon: <AlignStartHorizontal {...ICON} /> },
    {
      edge: "middle",
      label: one ? "Centre down the page" : "Line up middles",
      icon: <AlignCenterHorizontal {...ICON} />,
    },
    { edge: "bottom", label: one ? "To the bottom" : "Line up bottoms", icon: <AlignEndHorizontal {...ICON} /> },
  ];
  return (
    <Pop
      label="Position"
      width={240}
      align="right"
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] font-medium hover:bg-hover"
        >
          Position
          <ChevronDown size={12} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuRow
            label="Bring to front"
            icon={<BringToFront {...ICON} />}
            onClick={() => (store.order(ids, "front"), close())}
          />
          <MenuRow
            label="Send to back"
            icon={<SendToBack {...ICON} />}
            onClick={() => (store.order(ids, "back"), close())}
          />
          <div className="grid grid-cols-6 border-t border-line p-1.5">
            {edges.map(({ edge, label, icon }) => (
              <BarButton key={edge} label={label} onClick={() => lineUp(store, objects, edge)}>
                {icon}
              </BarButton>
            ))}
          </div>
        </>
      )}
    </Pop>
  );
}

function Ends({ store, objects, plain = false }: { store: EditorStore; objects: EditObject[]; plain?: boolean }) {
  const ids = objects.map((object) => object.id);
  return (
    <>
      {plain ? null : (
        <>
          <Opacity store={store} objects={objects} />
          <Arrange store={store} objects={objects} />
        </>
      )}
      {/* Always in reach, however long the bar gets. */}
      <span className="sticky right-0 z-[1] flex shrink-0 items-center bg-panel">
        <Rule />
        <BarButton label="Duplicate" hint="Ctrl D" onClick={() => store.duplicate(ids)}>
          <CopyPlus {...ICON} />
        </BarButton>
        <BarButton
          label="Delete"
          hint="Del"
          slot="object-remove"
          onClick={() => store.remove(ids)}
          className="hover:!bg-danger hover:!text-white"
        >
          <Trash2 {...ICON} />
        </BarButton>
      </span>
    </>
  );
}

// ---------------------------------------------------------------- one bar per kind of thing

function TextBar({ store, objects }: { store: EditorStore; objects: TextObject[] }) {
  const view = useEditor(store, (s) => s.view);
  const look: Style = styleOfSelection(store) ?? view.prefs.text;
  const first = objects[0];
  const style = (patch: (style: Style) => Style, key: string | null = null) => {
    store.styleSelection(patch, key);
    requestAnimationFrame(() => backToText(store));
  };
  const tallest = first ? Math.max(...first.runs.map((run) => run.style.size), 1) : look.size;
  const spacing = first ? first.leading / tallest : 1.25;
  return (
    <>
      <FontPick
        store={store}
        value={look.font}
        onChange={(font) =>
          style((now) =>
            font.startsWith("pdf:")
              ? { ...now, font, bold: false, italic: false, tracking: 0 }
              : {
                  ...now,
                  font,
                  bold: isBold(now),
                  italic: isItalic(now),
                  tracking: now.font.startsWith("pdf:") ? 0 : now.tracking,
                },
          )
        }
      />
      <NumberBox
        label="Text size"
        value={Math.round(look.size * 10) / 10}
        min={2}
        max={400}
        width={48}
        presets={SIZES}
        onChange={(size) => style((now) => ({ ...now, size }), "size")}
        onDone={() => backToText(store)}
      />
      <Rule />
      <BarButton
        label="Bold"
        hint="Ctrl B"
        active={isBold(look)}
        onClick={() => style((now) => withEmphasis(now, { bold: !isBold(look) }))}
      >
        <Bold {...ICON} strokeWidth={2.2} />
      </BarButton>
      <BarButton
        label="Italic"
        hint="Ctrl I"
        active={isItalic(look)}
        onClick={() => style((now) => withEmphasis(now, { italic: !isItalic(look) }))}
      >
        <Italic {...ICON} />
      </BarButton>
      <BarButton
        label="Underline"
        hint="Ctrl U"
        active={look.underline}
        onClick={() => style((now) => ({ ...now, underline: !look.underline }))}
      >
        <Underline {...ICON} />
      </BarButton>
      <BarButton
        label="Strike through"
        active={look.strike}
        onClick={() => style((now) => ({ ...now, strike: !look.strike }))}
      >
        <Strikethrough {...ICON} />
      </BarButton>
      <ColorPick
        label="Text colour"
        value={look.color}
        icon={<Type size={16} strokeWidth={2} aria-hidden />}
        onChange={(color) => style((now) => ({ ...now, color }), "color")}
      />
      <Rule />
      {(
        [
          ["left", "Align left", AlignLeft],
          ["center", "Centre", AlignCenter],
          ["right", "Align right", AlignRight],
          ["justify", "Justify", AlignJustify],
        ] as const
      ).map(([align, label, Icon]) => (
        <BarButton
          key={align}
          label={label}
          disabled={!first}
          active={first?.align === align}
          onClick={() => store.textBlock({ align })}
        >
          <Icon {...ICON} />
        </BarButton>
      ))}
      <Pop
        label="Spacing"
        width={240}
        button={(open, toggle, ref) => (
          <button
            ref={ref}
            type="button"
            aria-expanded={open}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggle}
            className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] font-medium hover:bg-hover"
          >
            Spacing
            <ChevronDown size={12} aria-hidden />
          </button>
        )}
      >
        {() => (
          <>
            <Slider
              label="Between lines"
              min={0.8}
              max={3}
              step={0.05}
              value={Math.min(3, Math.max(0.8, spacing))}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => store.spaceLines(v)}
            />
            <Slider
              label="Between letters"
              min={-2}
              max={12}
              step={0.1}
              value={Math.min(12, Math.max(-2, look.tracking))}
              format={(v) => `${v.toFixed(1)} pt`}
              onChange={(tracking) => store.styleSelection((now) => ({ ...now, tracking }), "tracking")}
            />
            {first ? (
              <label className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={first.wrap}
                  onChange={(event) =>
                    store.textBlock((object) => ({ wrap: event.target.checked, w: Math.max(object.w, 20) }))
                  }
                  className="h-4 w-4 accent-[#1d1c1f]"
                />
                Wrap inside the box
              </label>
            ) : null}
          </>
        )}
      </Pop>
      {objects.length > 0 ? <Ends store={store} objects={objects} /> : null}
    </>
  );
}

function ImageBar({
  store,
  objects,
  onReplace,
}: {
  store: EditorStore;
  objects: ImageObject[];
  onReplace: (id: string) => void;
}) {
  const crop = useEditor(store, (s) => s.view.crop);
  const first = objects[0];
  const ids = objects.map((object) => object.id);
  return (
    <>
      <BarText
        label="Replace"
        icon={<ImageUp {...ICON} />}
        onClick={() => onReplace(first.id)}
        disabled={objects.length > 1}
      />
      <BarButton
        label={crop ? "Finish cropping" : "Crop"}
        active={crop === first.id}
        disabled={objects.length > 1}
        onClick={() => store.setView({ crop: crop ? null : first.id })}
      >
        <Crop {...ICON} />
      </BarButton>
      <BarButton
        label="Mirror left to right"
        onClick={() =>
          store.patchMany(ids, (object) => ({ flipX: !(object as ImageObject).flipX }) as Partial<EditObject>)
        }
      >
        <FlipHorizontal2 {...ICON} />
      </BarButton>
      <BarButton
        label="Mirror top to bottom"
        onClick={() =>
          store.patchMany(ids, (object) => ({ flipY: !(object as ImageObject).flipY }) as Partial<EditObject>)
        }
      >
        <FlipVertical2 {...ICON} />
      </BarButton>
      <BarButton
        label="Turn left"
        disabled={objects.length > 1}
        onClick={() => store.rotateObject(first.id, quarter(first.angle, -90))}
      >
        <RotateCcw {...ICON} />
      </BarButton>
      <BarButton
        label="Turn right"
        disabled={objects.length > 1}
        onClick={() => store.rotateObject(first.id, quarter(first.angle, 90))}
      >
        <RotateCw {...ICON} />
      </BarButton>
      {objects.length === 1 ? (
        <>
          <Rule />
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
            W
            <NumberBox
              label="Width in points"
              value={Math.round(first.w)}
              min={3}
              max={5000}
              width={48}
              onChange={(w) => store.patch<ImageObject>(first.id, { w, h: (first.h * w) / first.w }, "picture-size")}
            />
            H
            <NumberBox
              label="Height in points"
              value={Math.round(first.h)}
              min={3}
              max={5000}
              width={48}
              onChange={(h) => store.patch<ImageObject>(first.id, { h, w: (first.w * h) / first.h }, "picture-size")}
            />
          </span>
        </>
      ) : null}
      <Ends store={store} objects={objects} />
    </>
  );
}

const quarter = (angle: number, by: number) => {
  const next = Math.round((angle + by) / 90) * 90;
  return ((((next + 180) % 360) + 360) % 360) - 180;
};

function ShapeBar({ store, objects, tool }: { store: EditorStore; objects: ShapeObject[]; tool: Tool }) {
  const prefs = useEditor(store, (s) => s.view.prefs);
  const first = objects[0];
  const kind = first?.kind ?? tool;
  const ids = objects.map((object) => object.id);
  const white = kind === "whiteout";
  const symbol = kind === "check" || kind === "cross" || kind === "dot";
  const line = kind === "line" || kind === "arrow";

  if (white) {
    return (
      <>
        {first ? null : (
          <BarText
            label="Match the page"
            active={prefs.white === null}
            icon={<Pipette {...ICON} />}
            onClick={() => store.setPrefs({ white: null })}
          />
        )}
        <ColorPick
          label="Cover colour"
          icon={<PaintBucket {...ICON} />}
          value={first ? first.fill : prefs.white}
          onChange={(fill) => {
            if (ids.length === 0) store.setPrefs({ white: fill });
            else store.patchMany(ids, () => ({ fill }) as Partial<EditObject>, "fill");
          }}
        />
        <Hint>Drag over anything to cover it. Words underneath are taken out of the file.</Hint>
        {ids.length > 0 ? <Ends store={store} objects={objects} plain /> : null}
      </>
    );
  }
  const look = first
    ? { stroke: first.stroke, fill: first.fill, width: first.width, dash: first.dash }
    : symbol
      ? { stroke: prefs.symbol, fill: null, width: 2, dash: false }
      : prefs.shape;
  const set = (patch: Partial<typeof look>, key: string) => {
    if (symbol && patch.stroke) store.setPrefs({ symbol: patch.stroke });
    else if (!symbol) store.setPrefs({ shape: { ...prefs.shape, ...patch } });
    if (ids.length > 0) store.patchMany(ids, () => patch as Partial<EditObject>, key);
  };
  return (
    <>
      <ColorPick
        label={symbol ? "Colour" : "Outline colour"}
        icon={<SquareDashed {...ICON} />}
        value={look.stroke}
        onChange={(stroke) => set({ stroke }, "stroke")}
        onNone={symbol || line ? undefined : () => set({ stroke: null }, "stroke")}
      />
      {symbol || line ? null : (
        <ColorPick
          label="Fill colour"
          icon={<PaintBucket {...ICON} />}
          value={look.fill}
          onChange={(fill) => set({ fill }, "fill")}
          onNone={() => set({ fill: null }, "fill")}
        />
      )}
      {kind === "dot" ? null : (
        <NumberBox
          label="Line thickness"
          value={look.width}
          min={0.2}
          max={60}
          step={0.5}
          width={44}
          presets={symbol ? undefined : WIDTHS}
          suffix="pt"
          onChange={(width) => set({ width }, "width")}
        />
      )}
      {symbol ? null : (
        <BarButton label="Dashed line" active={look.dash} onClick={() => set({ dash: !look.dash }, "dash")}>
          <Minus {...ICON} strokeDasharray="4 3" />
        </BarButton>
      )}
      {ids.length > 0 ? (
        <Ends store={store} objects={objects} />
      ) : (
        <Hint>{symbol ? "Click where it goes." : "Drag on the page to draw it. Hold Shift to keep it even."}</Hint>
      )}
    </>
  );
}

function InkBar({ store, objects, marker }: { store: EditorStore; objects: InkObject[]; marker: boolean }) {
  const prefs = useEditor(store, (s) => s.view.prefs);
  const look = objects[0] ? { color: objects[0].stroke, width: objects[0].width } : marker ? prefs.marker : prefs.pen;
  const ids = objects.map((object) => object.id);
  const set = (patch: Partial<typeof look>, key: string) => {
    if (marker) store.setPrefs({ marker: { ...prefs.marker, ...patch } });
    else store.setPrefs({ pen: { ...prefs.pen, ...patch } });
    if (ids.length > 0)
      store.patchMany(
        ids,
        () =>
          ({
            ...(patch.color ? { stroke: patch.color } : {}),
            ...(patch.width ? { width: patch.width } : {}),
          }) as Partial<EditObject>,
        key,
      );
  };
  return (
    <>
      <ColorPick label="Line colour" value={look.color} onChange={(color) => set({ color }, "ink-color")} />
      <NumberBox
        label="Line thickness"
        value={look.width}
        min={0.3}
        max={80}
        step={0.5}
        width={44}
        presets={marker ? MARKER_WIDTHS : WIDTHS}
        suffix="pt"
        onChange={(width) => set({ width }, "ink-width")}
      />
      {ids.length > 0 ? (
        <Ends store={store} objects={objects} />
      ) : (
        <Hint>Draw on the page. Hold Shift for a straight line.</Hint>
      )}
    </>
  );
}

function MarkBar({ store, objects, kind }: { store: EditorStore; objects: MarkObject[]; kind: MarkObject["kind"] }) {
  const prefs = useEditor(store, (s) => s.view.prefs);
  const ids = objects.map((object) => object.id);
  const color = objects[0]?.color ?? prefs.mark[kind];
  return (
    <>
      <ColorPick
        label="Colour"
        value={color}
        onChange={(next) => {
          store.setPrefs({ mark: { ...prefs.mark, [kind]: next } });
          if (ids.length > 0) store.patchMany(ids, () => ({ color: next }) as Partial<EditObject>, "mark-color");
        }}
      />
      {ids.length > 0 ? <Ends store={store} objects={objects} /> : <Hint>Drag across the words to mark.</Hint>}
    </>
  );
}

function LinkBar({ store, object }: { store: EditorStore; object: LinkObject }) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const input = useRef<HTMLInputElement>(null);
  const toPage = object.page !== undefined;
  useEffect(() => {
    if (!toPage && object.url === "") input.current?.focus();
  }, [object.id, toPage]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <select
        aria-label="Where the link goes"
        value={toPage ? "page" : "url"}
        onChange={(event) =>
          store.patch<LinkObject>(
            object.id,
            event.target.value === "page" ? { page: pages[0]?.id, url: "" } : { page: undefined },
          )
        }
        className="fb-input !h-9 !w-[132px] shrink-0 !px-2.5 !text-[13.5px]"
      >
        <option value="url">Web or email</option>
        <option value="page">A page here</option>
      </select>
      {toPage ? (
        <select
          aria-label="Page"
          value={object.page}
          onChange={(event) => store.patch<LinkObject>(object.id, { page: event.target.value })}
          className="fb-input !h-9 !w-[120px] shrink-0 !px-2.5 !text-[13.5px]"
        >
          {pages.map((page, i) => (
            <option key={page.id} value={page.id}>
              Page {i + 1}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={input}
          type="text"
          inputMode="url"
          aria-label="Link address"
          placeholder="example.com, name@example.com or a phone number"
          value={object.url}
          onChange={(event) => store.patch<LinkObject>(object.id, { url: event.target.value }, `url:${object.id}`)}
          onKeyDown={(event) => {
            if (event.key === "Enter") store.select([]);
          }}
          className="fb-input !h-9 min-w-[220px] max-w-[420px] !px-2.5 !text-[13.5px]"
        />
      )}
      <Ends store={store} objects={[object]} plain />
    </>
  );
}

function FieldBar({ store, object }: { store: EditorStore; object: FieldObject }) {
  const [list, setList] = useState<string | null>(null);
  return (
    <>
      <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
        Name
        <input
          type="text"
          value={object.name}
          onChange={(event) => store.patch<FieldObject>(object.id, { name: event.target.value }, `name:${object.id}`)}
          className="fb-input !h-9 !w-[150px] !px-2.5 !text-[13.5px]"
        />
      </label>
      {object.kind === "list" ? (
        <label className="flex min-w-[240px] flex-1 items-center gap-2 text-[13px] text-muted">
          Choices
          <input
            type="text"
            value={list ?? object.options.join(", ")}
            onChange={(event) => {
              setList(event.target.value);
              store.patch<FieldObject>(
                object.id,
                {
                  options: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                },
                `options:${object.id}`,
              );
            }}
            onBlur={() => setList(null)}
            placeholder="First, second, third"
            className="fb-input !h-9 max-w-[420px] !px-2.5 !text-[13.5px]"
          />
        </label>
      ) : (
        <Hint>People can fill this in after you download the PDF.</Hint>
      )}
      <Ends store={store} objects={[object]} plain />
    </>
  );
}

const Hint = ({ children }: { children: ReactNode }) => (
  <span className="shrink-0 whitespace-nowrap px-2 text-[13px] text-muted">{children}</span>
);

function PageBar({ store, onAddFiles }: { store: EditorStore; onAddFiles: (at: number) => void }) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const current = useEditor(store, (s) => s.view.page);
  const at = Math.max(
    0,
    pages.findIndex((page) => page.id === current),
  );
  const page = pages[at];
  if (!page) return null;
  return (
    <>
      <span className="fb-num shrink-0 whitespace-nowrap px-2 text-[13px]">
        Page {at + 1} <span className="text-faint">of {pages.length}</span>
      </span>
      <Rule />
      <BarButton label="Turn the page left" onClick={() => store.rotatePage(page.id, -90)}>
        <RotateCcw {...ICON} />
      </BarButton>
      <BarButton label="Turn the page right" onClick={() => store.rotatePage(page.id, 90)}>
        <RotateCw {...ICON} />
      </BarButton>
      <BarButton label="Duplicate the page" sound="page" onClick={() => store.duplicatePage(page.id)}>
        <Copy {...ICON} />
      </BarButton>
      <BarButton
        label="Delete the page"
        slot="page-remove"
        disabled={pages.length < 2}
        onClick={() => store.deletePages([page.id])}
        className="hover:!bg-danger hover:!text-white"
      >
        <Trash2 {...ICON} />
      </BarButton>
      <Rule />
      <BarText label="Blank page" icon={<Plus {...ICON} />} sound="page" onClick={() => store.addBlank(at + 1)} />
      <BarText label="Add a PDF" icon={<FilePlus2 {...ICON} />} onClick={() => onAddFiles(at + 1)} />
      <span className="ml-auto hidden shrink-0 whitespace-nowrap pl-4 pr-2 text-[13px] text-muted min-[1180px]:block">
        Click any text to change it, drag it to move it
      </span>
    </>
  );
}

/** The second row: whatever can be done with what is selected. */
export function FormatBar({
  store,
  onReplaceImage,
  onAddFiles,
}: {
  store: EditorStore;
  onReplaceImage: (id: string) => void;
  onAddFiles: (at: number) => void;
}) {
  const tool = useEditor(store, (s) => s.view.tool);
  const selection = useEditor(store, (s) => s.view.selection);
  const all = useEditor(store, (s) => s.doc.objects);
  const objects = selection.map((id) => all[id]).filter((object): object is EditObject => Boolean(object));
  const kinds = new Set(objects.map((object) => object.type));
  const first = objects[0];

  let bar: ReactNode;
  if (objects.length > 0 && kinds.size === 1) {
    switch (first.type) {
      case "text":
        bar = <TextBar store={store} objects={objects as TextObject[]} />;
        break;
      case "image":
        bar = <ImageBar store={store} objects={objects as ImageObject[]} onReplace={onReplaceImage} />;
        break;
      case "shape":
        bar = <ShapeBar store={store} objects={objects as ShapeObject[]} tool={tool} />;
        break;
      case "ink":
        bar = <InkBar store={store} objects={objects as InkObject[]} marker={mixes(first)} />;
        break;
      case "mark":
        bar = <MarkBar store={store} objects={objects as MarkObject[]} kind={first.kind} />;
        break;
      case "link":
        bar =
          objects.length === 1 ? (
            <LinkBar store={store} object={first} />
          ) : (
            <Ends store={store} objects={objects} plain />
          );
        break;
      case "field":
        bar =
          objects.length === 1 ? (
            <FieldBar key={first.id} store={store} object={first} />
          ) : (
            <Ends store={store} objects={objects} plain />
          );
        break;
    }
  } else if (objects.length > 0) {
    bar = (
      <>
        <span className="fb-num shrink-0 px-2 text-[13px]">{objects.length} selected</span>
        <Ends store={store} objects={objects} />
      </>
    );
  } else if (tool === "text")
    bar = (
      <>
        <TextBar store={store} objects={[]} />
        <Hint>Click where the text goes.</Hint>
      </>
    );
  else if (tool === "pen" || tool === "marker") bar = <InkBar store={store} objects={[]} marker={tool === "marker"} />;
  else if (tool === "highlight" || tool === "underline" || tool === "strike")
    bar = <MarkBar store={store} objects={[]} kind={tool} />;
  else if (tool === "link")
    bar = <Hint>Drag a box around what should be clickable. Existing links are outlined: click one to change it.</Hint>;
  else if (tool.startsWith("field-")) bar = <Hint>Click or drag where the field goes.</Hint>;
  else if (tool !== "select") bar = <ShapeBar store={store} objects={[]} tool={tool} />;
  else bar = <PageBar store={store} onAddFiles={onAddFiles} />;

  return (
    <div
      data-slot="format-bar"
      className="flex min-h-[50px] shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden"
    >
      {bar}
    </div>
  );
}
