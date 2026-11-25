"use client";

import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { EditObject, ImageObject, InkObject, MarkObject, ShapeObject, TextObject } from "./model";
import { inkPath, outlineFill, shapeOutlines, toSvg } from "./engine/shapes";
import { loadFaces } from "./engine/fonts";
import { showText, stylesOf } from "./engine/text-dom";
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

function ShapeArt({ object }: { object: ShapeObject }) {
  return (
    <svg width={Math.max(1, object.w)} height={Math.max(1, object.h)} className="block overflow-visible" aria-hidden>
      {shapeOutlines(object).map((outline, i) => {
        const fill = outline.paint === "stroke" ? null : outlineFill(object);
        const stroke = outline.paint === "fill" ? null : object.stroke;
        const round = object.kind === "check" || object.kind === "cross";
        return (
          <path
            key={i}
            d={toSvg(outline.path)}
            fill={fill ?? "none"}
            stroke={stroke && object.width > 0 ? stroke : "none"}
            strokeWidth={object.width}
            strokeDasharray={object.dash ? `${object.width * 3} ${object.width * 2}` : undefined}
            strokeLinecap={round ? "round" : undefined}
            strokeLinejoin={round ? "round" : undefined}
          />
        );
      })}
    </svg>
  );
}

function InkArt({ object }: { object: InkObject }) {
  return (
    <svg width={Math.max(1, object.w)} height={Math.max(1, object.h)} className="block overflow-visible" aria-hidden>
      <path
        d={toSvg(inkPath(object))}
        fill="none"
        stroke={object.stroke}
        strokeWidth={object.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarkArt({ object }: { object: MarkObject }) {
  return (
    <svg width={Math.max(1, object.w)} height={Math.max(1, object.h)} className="block overflow-visible" aria-hidden>
      {object.rects.map(([x, y, w, h], i) =>
        object.kind === "highlight" ? (
          <rect key={i} x={x} y={y} width={w} height={h} fill={object.color} />
        ) : (
          <rect
            key={i}
            x={x}
            y={object.kind === "underline" ? y + h * 0.93 : y + h * 0.54}
            width={w}
            height={Math.max(0.6, h * 0.06)}
            fill={object.color}
          />
        ),
      )}
    </svg>
  );
}

function ImageArt({ object, store }: { object: ImageObject; store: EditorStore }) {
  const asset = store.assets.get(object.asset);
  const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return (
    <span
      className="block overflow-hidden"
      style={{
        width: object.w,
        height: object.h,
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
  );
}

/** Text that is only looked at. */
export function TextArt({ object }: { object: TextObject }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const { runs, align, leading, wrap, w, indent, hang } = object;
  useLayoutEffect(() => {
    if (ref.current) showText(ref.current, { runs, align, leading, wrap, w, indent, hang });
  }, [runs, align, leading, wrap, w, indent, hang, tick]);
  useLayoutEffect(() => {
    let off = false;
    void loadFaces(stylesOf(runs), runs.map((run) => run.text).join("")).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [runs]);
  return <div ref={ref} />;
}

export const ObjectArt = memo(function ObjectArt({ object, store }: { object: EditObject; store: EditorStore }) {
  switch (object.type) {
    case "text":
      return <TextArt object={object} />;
    case "image":
      return <ImageArt object={object} store={store} />;
    case "shape":
      return <ShapeArt object={object} />;
    case "ink":
      return <InkArt object={object} />;
    case "mark":
      return <MarkArt object={object} />;
    case "link":
      return null;
    case "field":
      return (
        <span className="block border border-[#a5a4a2] bg-white" style={{ width: object.w, height: object.h }}>
          <span className="block truncate px-1 text-[9px] leading-[1.6] text-[#85848a]">
            {object.kind === "check" ? "" : object.name}
          </span>
        </span>
      );
  }
});
