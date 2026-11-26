"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MessageSquare } from "lucide-react";
import type { EditObject, FieldObject, ImageObject, ShapeObject, TableObject, TextBody } from "./model";
import { dashArray } from "./model";
import { wordsBox } from "./engine/shape-text";
import { inkParts, markParts, pathParts, shapeParts, toSvg, type Painted } from "./engine/shapes";
import { layTable, tableLines, type TableLay } from "./engine/table";
import { bodyFonts, loadBody, showText } from "./engine/text-dom";
import type { EditorStore } from "./store";

/** How objects look. Used on the page and on its thumbnail. */

export function placeCss(object: EditObject): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "0 0",
    transform: `translate(${object.x}px, ${object.y}px) rotate(${object.angle}deg)`,
    opacity: object.opacity,
  };
}

const CAPS = ["butt", "round", "square"] as const;
const JOINS = ["miter", "round", "bevel"] as const;

export function Parts({ parts, w, h }: { parts: Painted[]; w: number; h: number }) {
  return (
    <svg width={Math.max(1, w)} height={Math.max(1, h)} className="block overflow-visible" aria-hidden>
      {parts.map((part, i) => (
        <path
          key={i}
          d={toSvg(part.path)}
          fill={part.fill ?? "none"}
          fillRule={part.evenOdd ? "evenodd" : undefined}
          stroke={part.stroke && part.width > 0 ? part.stroke : "none"}
          strokeWidth={part.width}
          strokeDasharray={part.dash.length > 0 ? part.dash.join(" ") : undefined}
          strokeLinecap={CAPS[part.cap]}
          strokeLinejoin={JOINS[part.join]}
        />
      ))}
    </svg>
  );
}

/** Brightness, contrast and colour, as the saved file has them too. */
export const lookFilter = (object: ImageObject): string | undefined =>
  object.look
    ? `brightness(${object.look.bright}) contrast(${object.look.contrast}) saturate(${object.look.color})`
    : undefined;

function ImageArt({ object, store }: { object: ImageObject; store: EditorStore }) {
  const asset = store.assets.get(object.asset);
  const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const frame = object.stroke && object.width ? object.width : 0;
  return (
    <span className="relative block" style={{ width: object.w, height: object.h }}>
      <span
        className="block overflow-hidden"
        style={{
          width: object.w,
          height: object.h,
          borderRadius: object.radius || undefined,
          filter: lookFilter(object),
          transform:
            object.flipX || object.flipY ? `scale(${object.flipX ? -1 : 1}, ${object.flipY ? -1 : 1})` : undefined,
        }}
      >
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt=""
            draggable={false}
            className="block max-w-none select-none"
            style={{
              width: object.w / crop.w,
              height: object.h / crop.h,
              marginLeft: (-crop.x * object.w) / crop.w,
              marginTop: (-crop.y * object.h) / crop.h,
            }}
          />
        ) : null}
      </span>
      {frame > 0 ? (
        <span
          className="pointer-events-none absolute"
          style={{
            inset: -frame / 2,
            borderRadius: object.radius ? object.radius + frame / 2 : undefined,
            border: `${frame}px solid ${object.stroke}`,
          }}
        />
      ) : null}
    </span>
  );
}

/** Words that are only looked at. */
export function TextArt({ body, wrap, w, max }: { body: TextBody; wrap: boolean; w: number; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const { runs, paras, align, leading } = body;
  useLayoutEffect(() => {
    if (ref.current) showText(ref.current, { runs, paras, align, leading, wrap, w: wrap ? w : 0, max });
  }, [runs, paras, align, leading, wrap, w, max, tick]);
  useEffect(() => {
    let off = false;
    void loadBody({ runs, paras }).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [bodyFonts({ runs, paras })]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="select-none" />;
}

/** The box behind a text. */
export const TextBack = ({ object }: { object: Extract<EditObject, { type: "text" }> }) =>
  object.fill ? (
    <span
      aria-hidden
      className="pointer-events-none absolute -z-[1]"
      style={{ inset: -(object.pad ?? 0), background: object.fill }}
    />
  ) : null;

/** Lines and fills of a table. */
export function TableArt({ table, lay }: { table: TableObject; lay: TableLay }) {
  const lines = useMemo(() => tableLines(table, lay), [table, lay]);
  return (
    <>
      {lay.cells.map(({ r, c, cell, box }) =>
        cell.fill ? (
          <span
            key={`${r},${c}`}
            className="pointer-events-none absolute block"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h, background: cell.fill }}
          />
        ) : null,
      )}
      <svg
        width={Math.max(1, lay.w)}
        height={Math.max(1, lay.h)}
        className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible"
        aria-hidden
      >
        {lines.map((line, i) => (
          <path
            key={i}
            d={`M${line.x0} ${line.y0}L${line.x1} ${line.y1}`}
            stroke={line.edge.color}
            strokeWidth={line.edge.width}
            strokeDasharray={dashArray(line.edge.dash, line.edge.width).join(" ") || undefined}
            strokeLinecap={line.edge.dash === "solid" ? "square" : "butt"}
          />
        ))}
      </svg>
    </>
  );
}

/** Measures a table again once its fonts are there. */
export function useTableLay(table: TableObject): TableLay {
  const [tick, setTick] = useState(0);
  const fonts = table.cells.map((row) => row.map((cell) => (cell.covered ? "" : bodyFonts(cell))).join("|")).join("|");
  const cells = useRef(table.cells);
  cells.current = table.cells;
  useEffect(() => {
    let off = false;
    const words = cells.current.flatMap((row) => row.filter((cell) => !cell.covered));
    void Promise.all(words.map((cell) => loadBody(cell))).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [fonts]);
  return useMemo(() => layTable(table), [table, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

function StillTable({ table }: { table: TableObject }) {
  const lay = useTableLay(table);
  return (
    <span className="relative block" style={{ width: lay.w, height: lay.h }}>
      <TableArt table={table} lay={lay} />
      {lay.cells.map(({ r, c, cell, inner }) => (
        <span key={`${r},${c}`} className="absolute block" style={{ left: inner.x, top: inner.y }}>
          <TextArt body={cell} wrap w={inner.w} />
        </span>
      ))}
    </span>
  );
}

function StillWords({ shape }: { shape: ShapeObject }) {
  const [, setTick] = useState(0);
  const { text } = shape;
  const fonts = text ? bodyFonts(text) : "";
  useEffect(() => {
    if (!text) return;
    let off = false;
    void loadBody(text).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!text) return null;
  const box = wordsBox(shape, text);
  return (
    <span className="absolute block" style={{ left: box.x, top: box.y }}>
      <TextArt body={text} wrap w={box.w} />
    </span>
  );
}

const FIELD_NAMES: Record<FieldObject["kind"], string> = {
  text: "Text",
  multiline: "Notes",
  check: "",
  list: "List",
  radio: "",
  sign: "Sign here",
};

function FieldArt({ object }: { object: FieldObject }) {
  const round = object.kind === "radio";
  return (
    <span
      className={`grid place-items-center overflow-hidden border ${object.kind === "sign" ? "border-accent-deep bg-[#fdeee8]" : "border-[#8fb3c9] bg-[#eef6fa]"}`}
      style={{ width: object.w, height: object.h, borderRadius: round ? "50%" : undefined }}
    >
      {object.kind === "check" || round ? null : (
        <span
          className="max-w-full truncate px-1 text-[#57565c]"
          style={{ fontSize: Math.max(6, Math.min(10, object.h * 0.5)) }}
        >
          {object.name || FIELD_NAMES[object.kind]}
          {object.required ? " *" : ""}
        </span>
      )}
    </span>
  );
}

export const ObjectArt = memo(function ObjectArt({ object, store }: { object: EditObject; store: EditorStore }) {
  switch (object.type) {
    case "text":
      return (
        <span className="relative z-0 block">
          <TextBack object={object} />
          <TextArt body={object} wrap={object.wrap} w={object.w} max={object.max} />
        </span>
      );
    case "image":
      return <ImageArt object={object} store={store} />;
    case "shape":
      return (
        <span className="relative block" style={{ width: object.w, height: object.h }}>
          <Parts parts={shapeParts(object)} w={object.w} h={object.h} />
          <StillWords shape={object} />
        </span>
      );
    case "path":
      return <Parts parts={pathParts(object)} w={object.w} h={object.h} />;
    case "ink":
      return <Parts parts={inkParts(object)} w={object.w} h={object.h} />;
    case "mark":
      return <Parts parts={markParts(object)} w={object.w} h={object.h} />;
    case "table":
      return <StillTable table={object} />;
    case "field":
      return <FieldArt object={object} />;
    case "note":
      return <NoteArt color={object.color} />;
    case "link":
      return null;
  }
});

export const NoteArt = ({ color, size = 20 }: { color: string; size?: number }) => (
  <span
    className="grid place-items-center border border-ink text-ink"
    style={{ width: size, height: size, background: color }}
  >
    <MessageSquare size={size * 0.62} strokeWidth={2} aria-hidden />
  </span>
);
