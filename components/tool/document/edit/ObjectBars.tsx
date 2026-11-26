"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  ImageUp,
  PaintBucket,
  Pipette,
  RotateCcw,
  RotateCw,
  Shapes,
  SquareDashed,
  SunMedium,
  Table2,
} from "lucide-react";
import { Parts } from "./Art";
import { Drop, Ends, Faces, Hint, ICON, WIDTHS, useFace } from "./BarParts";
import { ShapeGrid } from "./ShapeGrid";
import { TextControls } from "./TextBar";
import { shapeWords } from "./commands";
import { shapeParts } from "./engine/shapes";
import { gridOf } from "./engine/vectors";
import {
  dashArray,
  isCover,
  isLine,
  pageOf,
  type Dash,
  type EditObject,
  type FieldObject,
  type Head,
  type ImageObject,
  type InkObject,
  type LinkObject,
  type MarkObject,
  type NoteObject,
  type PathObject,
  type ShapeObject,
  type Tool,
} from "./model";
import { SYMBOLS, useEditor, type EditorStore } from "./store";
import { BarButton, BarText, ColorPick, MenuRow, NumberBox, Rule, Slider } from "./ui";

const MARKER_WIDTHS = [6, 10, 14, 18, 24, 32];

const quarter = (angle: number, by: number) => {
  const next = Math.round((angle + by) / 90) * 90;
  return ((((next + 180) % 360) + 360) % 360) - 180;
};

function Turns({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const first = objects[0];
  return (
    <>
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
    </>
  );
}

function Flips({ store, objects }: { store: EditorStore; objects: (ImageObject | ShapeObject | PathObject)[] }) {
  const ids = objects.map((object) => object.id);
  const flip = (side: "flipX" | "flipY") =>
    store.patchMany(ids, (object) => ({ [side]: !(object as ImageObject)[side] }) as Partial<EditObject>);
  return (
    <>
      <BarButton label="Mirror left to right" onClick={() => flip("flipX")}>
        <FlipHorizontal2 {...ICON} />
      </BarButton>
      <BarButton label="Mirror top to bottom" onClick={() => flip("flipY")}>
        <FlipVertical2 {...ICON} />
      </BarButton>
    </>
  );
}

function Sizes({ store, object, keep }: { store: EditorStore; object: EditObject; keep: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
      W
      <NumberBox
        label="Width in points"
        value={Math.round(object.w * 10) / 10}
        min={1}
        max={5000}
        width={50}
        onChange={(w) =>
          store.patch<EditObject>(
            object.id,
            { w, ...(keep ? { h: (object.h * w) / object.w } : {}) } as Partial<EditObject>,
            "size",
          )
        }
      />
      H
      <NumberBox
        label="Height in points"
        value={Math.round(object.h * 10) / 10}
        min={1}
        max={5000}
        width={50}
        onChange={(h) =>
          store.patch<EditObject>(
            object.id,
            { h, ...(keep ? { w: (object.w * h) / object.h } : {}) } as Partial<EditObject>,
            "size",
          )
        }
      />
    </span>
  );
}

const DASHES: readonly Dash[] = ["solid", "dash", "dot", "dashdot"];
const DASH_NAMES: Record<Dash, string> = { solid: "Solid", dash: "Dashes", dot: "Dots", dashdot: "Dashes and dots" };

export function DashPick({ value, onChange }: { value: Dash; onChange: (dash: Dash) => void }) {
  const art = (dash: Dash) => (
    <svg width="46" height="10" aria-hidden>
      <path
        d="M0 5H46"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dashArray(dash, 2).join(" ") || undefined}
      />
    </svg>
  );
  return (
    <Drop label="Kind of line" icon={art(value)} width={180}>
      {(close) =>
        DASHES.map((dash) => (
          <MenuRow
            key={dash}
            label={DASH_NAMES[dash]}
            icon={<span className="w-12">{art(dash)}</span>}
            active={dash === value}
            onClick={() => (onChange(dash), close())}
          />
        ))
      }
    </Drop>
  );
}

const HEADS: readonly Head[] = ["none", "arrow", "open", "dot", "bar", "diamond"];
const HEAD_NAMES: Record<Head, string> = {
  none: "Plain",
  arrow: "Arrow",
  open: "Open arrow",
  dot: "Dot",
  bar: "Bar",
  diamond: "Diamond",
};

function HeadPick({
  label,
  value,
  start,
  onChange,
}: {
  label: string;
  value: Head;
  start: boolean;
  onChange: (head: Head) => void;
}) {
  const art = (head: Head) => {
    const shape: ShapeObject = {
      id: "head",
      type: "shape",
      kind: "line",
      x: 0,
      y: 0,
      w: 34,
      h: 0,
      angle: 0,
      opacity: 1,
      stroke: "currentColor",
      fill: null,
      width: 1.6,
      dash: "solid",
      start: start ? head : "none",
      end: start ? "none" : head,
    };
    return (
      <span className="block pt-[1px]" style={{ width: 34, height: 12 }}>
        <span className="block translate-y-[5px]">
          <Parts parts={shapeParts(shape)} w={34} h={1} />
        </span>
      </span>
    );
  };
  return (
    <Drop label={label} icon={art(value)} width={180}>
      {(close) =>
        HEADS.map((head) => (
          <MenuRow
            key={head}
            label={HEAD_NAMES[head]}
            icon={<span className="w-10">{art(head)}</span>}
            active={head === value}
            onClick={() => (onChange(head), close())}
          />
        ))
      }
    </Drop>
  );
}

// ---------------------------------------------------------------- pictures

export function ImageBar({
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
  const look = first.look ?? { bright: 1, contrast: 1, color: 1 };
  const set = (patch: Partial<ImageObject>, key: string) =>
    store.patchMany(ids, () => patch as Partial<EditObject>, key);
  const setLook = (patch: Partial<typeof look>) => {
    const next = { ...look, ...patch };
    set({ look: next.bright === 1 && next.contrast === 1 && next.color === 1 ? undefined : next }, "picture-look");
  };
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
      <Flips store={store} objects={objects} />
      <Turns store={store} objects={objects} />
      <Rule />
      <Drop
        label="Light and colour"
        icon={<SunMedium {...ICON} />}
        text="Light"
        width={236}
        active={Boolean(first.look)}
      >
        {() => (
          <>
            <Slider
              label="Brightness"
              min={0.2}
              max={2}
              step={0.05}
              value={look.bright}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(bright) => setLook({ bright })}
            />
            <Slider
              label="Contrast"
              min={0.2}
              max={2}
              step={0.05}
              value={look.contrast}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(contrast) => setLook({ contrast })}
            />
            <Slider
              label="Colour"
              min={0}
              max={2}
              step={0.05}
              value={look.color}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(color) => setLook({ color })}
            />
            <MenuRow label="Black and white" onClick={() => setLook({ color: 0 })} />
            <MenuRow label="As it was" onClick={() => set({ look: undefined }, "picture-look")} />
          </>
        )}
      </Drop>
      <Drop
        label="Frame and corners"
        icon={<Frame {...ICON} />}
        text="Frame"
        width={236}
        active={Boolean(first.stroke && first.width) || Boolean(first.radius)}
      >
        {() => (
          <div>
            <span className="flex items-center gap-2 px-3 py-2 text-[13px]">
              <span className="flex-1">Frame</span>
              <ColorPick
                label="Frame colour"
                value={first.stroke ?? null}
                onChange={(stroke) => set({ stroke, width: first.width || 1.5 }, "frame")}
                onNone={() => set({ stroke: null }, "frame")}
              />
            </span>
            <Slider
              label="Thickness"
              min={0}
              max={20}
              step={0.5}
              value={first.width ?? 0}
              format={(v) => `${v} pt`}
              onChange={(width) => set({ width, stroke: first.stroke ?? "#1d1c1f" }, "frame")}
            />
            <Slider
              label="Round corners"
              min={0}
              max={Math.max(4, Math.round(Math.min(first.w, first.h) / 2))}
              step={1}
              value={Math.min(first.radius ?? 0, Math.min(first.w, first.h) / 2)}
              format={(v) => `${Math.round(v)} pt`}
              onChange={(radius) => set({ radius: radius || undefined }, "radius")}
            />
          </div>
        )}
      </Drop>
      {objects.length === 1 ? (
        <>
          <Rule />
          <Sizes store={store} object={first} keep />
        </>
      ) : null}
      <Ends store={store} objects={objects} />
    </>
  );
}

// ---------------------------------------------------------------- shapes, lines and drawings

export function ShapeBar({ store, objects, tool }: { store: EditorStore; objects: ShapeObject[]; tool: Tool }) {
  const prefs = useEditor(store, (s) => s.view.prefs);
  const editing = useEditor(store, (s) => s.view.editing);
  const first = objects[0];
  const ids = objects.map((object) => object.id);
  const [face, setFace] = useFace<"shape" | "text">(first && editing === first.id ? "text" : "shape");
  const kind = first?.kind ?? (tool.startsWith("shape:") ? tool.slice(6) : tool);

  if (first ? isCover(first) : tool === "whiteout" || tool === "redact") {
    const redact = kind === "redact";
    return (
      <>
        {first || redact ? null : (
          <BarText
            label="Match the page"
            active={prefs.white === null}
            icon={<Pipette {...ICON} />}
            onClick={() => store.setPrefs({ white: null })}
          />
        )}
        {redact && !first ? null : (
          <ColorPick
            label="Cover colour"
            icon={<PaintBucket {...ICON} />}
            value={first ? first.fill : prefs.white}
            onChange={(fill) => {
              if (ids.length === 0) store.setPrefs({ white: fill });
              else store.patchMany(ids, () => ({ fill }) as Partial<EditObject>, "fill");
            }}
          />
        )}
        <Hint>
          {redact
            ? "Drag over what must not be read, or click a line. Words and pictures under it are really taken out of the file."
            : "Drag over anything to cover it, or click a line. Words underneath are taken out of the file."}
        </Hint>
        {ids.length > 0 ? <Ends store={store} objects={objects} plain /> : null}
      </>
    );
  }

  const symbol = SYMBOLS.has(kind);
  const line = first ? isLine(first) : kind === "line" || kind === "arrow";
  const look = first
    ? { stroke: first.stroke, fill: first.fill, width: first.width, dash: first.dash }
    : symbol
      ? { stroke: prefs.symbol, fill: null, width: 2, dash: "solid" as Dash }
      : line
        ? { stroke: prefs.line.stroke, fill: null, width: prefs.line.width, dash: prefs.line.dash }
        : prefs.shape;
  const set = (patch: Partial<typeof look>, key: string) => {
    // What was picked out of the file does not change how new things look.
    const own = !first || !first.ops;
    if (symbol) {
      if (own && patch.stroke) store.setPrefs({ symbol: patch.stroke });
    } else if (line) {
      if (own) store.setPrefs({ line: { ...prefs.line, ...patch, stroke: patch.stroke ?? prefs.line.stroke } });
    } else if (own) store.setPrefs({ shape: { ...prefs.shape, ...patch } });
    if (ids.length > 0) store.patchMany(ids, () => patch as Partial<EditObject>, key);
  };
  const heads = (patch: { start?: Head; end?: Head }) => {
    store.setPrefs({ line: { ...prefs.line, ...patch } });
    if (ids.length > 0) store.patchMany(ids, () => patch as Partial<EditObject>);
  };
  const words = first && objects.length === 1 && !line && !symbol;

  return (
    <>
      {words ? (
        <Faces
          value={face}
          onChange={(next) => {
            setFace(next);
            if (next === "text" && editing !== first.id) shapeWords(store, first.id);
          }}
          options={[
            { value: "shape", label: "Shape" },
            { value: "text", label: "Text" },
          ]}
        />
      ) : null}
      {words && face === "text" && first.text ? (
        <>
          <TextControls store={store} objects={[first]} />
          <Drop label="Where the words stand" text="Place" width={190}>
            {(close) =>
              (["top", "middle", "bottom"] as const).map((valign) => (
                <MenuRow
                  key={valign}
                  label={{ top: "At the top", middle: "In the middle", bottom: "At the bottom" }[valign]}
                  active={first.text?.valign === valign}
                  onClick={() => {
                    store.patch<ShapeObject>(first.id, (object) =>
                      object.text ? { text: { ...object.text, valign } } : {},
                    );
                    close();
                  }}
                />
              ))
            }
          </Drop>
          <Ends store={store} objects={objects} plain />
        </>
      ) : (
        <>
          <ColorPick
            label={symbol ? "Colour" : line ? "Line colour" : "Outline colour"}
            icon={<SquareDashed {...ICON} />}
            value={look.stroke}
            onChange={(stroke) => set({ stroke, width: look.width || 1.5 }, "stroke")}
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
              min={0}
              max={60}
              step={0.5}
              width={44}
              presets={symbol ? undefined : WIDTHS}
              suffix="pt"
              onChange={(width) =>
                set({ width, ...(line || symbol || look.stroke ? {} : { stroke: "#1d1c1f" }) }, "width")
              }
            />
          )}
          {symbol ? null : <DashPick value={look.dash} onChange={(dash) => set({ dash }, "dash")} />}
          {line ? (
            <>
              <HeadPick
                label="Start of the line"
                start
                value={first ? (first.start ?? "none") : prefs.line.start}
                onChange={(start) => heads({ start })}
              />
              <HeadPick
                label="End of the line"
                start={false}
                value={
                  first
                    ? (first.end ?? (first.kind === "arrow" ? "arrow" : "none"))
                    : kind === "arrow" && prefs.line.end === "none"
                      ? "arrow"
                      : prefs.line.end
                }
                onChange={(end) => heads({ end })}
              />
              {first ? (
                <BarButton
                  label="Turn the line round"
                  onClick={() =>
                    store.patchMany(ids, (object) => ({ back: !(object as ShapeObject).back }) as Partial<EditObject>)
                  }
                >
                  <ArrowLeftRight {...ICON} />
                </BarButton>
              ) : null}
            </>
          ) : null}
          {first && !line && !symbol ? (
            <>
              <Rule />
              <Drop label="Another shape" icon={<Shapes {...ICON} />} text="Change" width={330}>
                {(close) => (
                  <ShapeGrid
                    onPick={(next) => {
                      store.patchMany(ids, () => ({ kind: next, adj: undefined }) as Partial<EditObject>);
                      close();
                    }}
                  />
                )}
              </Drop>
              <Flips store={store} objects={objects} />
              <Turns store={store} objects={objects} />
              {objects.length === 1 ? <Sizes store={store} object={first} keep={false} /> : null}
            </>
          ) : null}
          {first ? <TableOffer store={store} objects={objects} /> : null}
          {ids.length > 0 ? (
            <Ends store={store} objects={objects} />
          ) : (
            <Hint>
              {symbol ? "Click where it goes." : "Drag on the page to draw it, or click. Hold Shift to keep it even."}
            </Hint>
          )}
        </>
      )}
    </>
  );
}

/** Lines picked out of the file that make a table can become one. */
export function TableOffer({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const first = objects[0];
  const page = first?.ops ? pageOf(store.doc, first.id) : null;
  if (!page || page.source === null || first.type === "image" || first.type === "text") return null;
  const units = store.drawingOf(page.id, first);
  if (units.length < 4 || !gridOf(units)) return null;
  return (
    <>
      <Rule />
      <BarText
        label="Edit as a table"
        icon={<Table2 {...ICON} />}
        onClick={() =>
          void store.openTable(page.id, units).then((id) => {
            if (!id) store.say("These lines do not make a table that can be read.");
          })
        }
      />
    </>
  );
}

export function PathBar({ store, objects }: { store: EditorStore; objects: PathObject[] }) {
  const first = objects[0];
  const ids = objects.map((object) => object.id);
  const set = (patch: Partial<PathObject>, key: string) =>
    store.patchMany(ids, () => patch as Partial<EditObject>, key);
  return (
    <>
      <ColorPick
        label="Outline colour"
        icon={<SquareDashed {...ICON} />}
        value={first.stroke}
        onChange={(stroke) => set({ stroke, width: first.width || 1 }, "stroke")}
        onNone={() => set({ stroke: null }, "stroke")}
      />
      <ColorPick
        label="Fill colour"
        icon={<PaintBucket {...ICON} />}
        value={first.fill}
        onChange={(fill) => set({ fill }, "fill")}
        onNone={() => set({ fill: null }, "fill")}
      />
      <NumberBox
        label="Line thickness"
        value={Math.round(first.width * 100) / 100}
        min={0}
        max={60}
        step={0.5}
        width={44}
        presets={WIDTHS}
        suffix="pt"
        onChange={(width) => set({ width, stroke: first.stroke ?? "#1d1c1f" }, "width")}
      />
      <Rule />
      <Flips store={store} objects={objects} />
      <Turns store={store} objects={objects} />
      {objects.length === 1 ? <Sizes store={store} object={first} keep={false} /> : null}
      <TableOffer store={store} objects={objects} />
      <Ends store={store} objects={objects} />
    </>
  );
}

export function InkBar({ store, objects, marker }: { store: EditorStore; objects: InkObject[]; marker: boolean }) {
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

export function MarkBar({
  store,
  objects,
  kind,
}: {
  store: EditorStore;
  objects: MarkObject[];
  kind: MarkObject["kind"];
}) {
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

// ---------------------------------------------------------------- links, fields and comments

export function LinkBar({ store, object }: { store: EditorStore; object: LinkObject }) {
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

export function FieldBar({ store, object }: { store: EditorStore; object: FieldObject }) {
  const [list, setList] = useState<string | null>(null);
  return (
    <>
      <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
        {object.kind === "radio" ? "Question" : "Name"}
        <input
          type="text"
          value={object.name}
          onChange={(event) => store.patch<FieldObject>(object.id, { name: event.target.value }, `name:${object.id}`)}
          className="fb-input !h-9 !w-[150px] !px-2.5 !text-[13.5px]"
        />
      </label>
      {object.kind === "radio" ? (
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
          Answer
          <input
            type="text"
            value={object.value ?? ""}
            onChange={(event) =>
              store.patch<FieldObject>(object.id, { value: event.target.value }, `answer:${object.id}`)
            }
            className="fb-input !h-9 !w-[130px] !px-2.5 !text-[13.5px]"
          />
        </label>
      ) : null}
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
      ) : null}
      {object.kind === "sign" ? null : (
        <label className="flex shrink-0 items-center gap-2 px-1 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(object.required)}
            onChange={(event) => store.patch<FieldObject>(object.id, { required: event.target.checked || undefined })}
            className="h-4 w-4 accent-[#1d1c1f]"
          />
          Has to be filled in
        </label>
      )}
      <Hint>
        {object.kind === "radio"
          ? "Buttons with the same question belong together."
          : object.kind === "sign"
            ? "A place to sign, in programs that sign PDFs."
            : "People can fill this in after you save the PDF."}
      </Hint>
      <Ends store={store} objects={[object]} plain />
    </>
  );
}

const NOTE_COLORS = ["#ffd23f", "#f9b8a5", "#b7e08a", "#a9d8f5", "#d9c2f5"];

export function NoteBar({ store, objects }: { store: EditorStore; objects: NoteObject[] }) {
  const color = objects[0]?.color ?? store.view.prefs.note;
  const ids = objects.map((object) => object.id);
  return (
    <>
      {NOTE_COLORS.map((item) => (
        <button
          key={item}
          type="button"
          aria-label={`Comment colour ${item}`}
          aria-pressed={color === item}
          onClick={() => {
            store.setPrefs({ note: item });
            if (ids.length > 0) store.patchMany(ids, () => ({ color: item }) as Partial<EditObject>);
          }}
          className={`h-7 w-7 shrink-0 border-2 ${color === item ? "border-ink" : "border-transparent"}`}
        >
          <span className="block h-full w-full border border-ink/30" style={{ background: item }} />
        </button>
      ))}
      {ids.length > 0 ? <Ends store={store} objects={objects} plain /> : <Hint>Click where the comment belongs.</Hint>}
    </>
  );
}
