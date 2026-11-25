"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cropPixels, cropRatioValue, type CropRatioId, type CropRect } from "./model";

type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  base: CropRect;
  containerWidth: number;
  containerHeight: number;
};

const CORNER_HANDLES: { mode: DragMode; label: string; className: string; cursor: string; bracket: string }[] = [
  {
    mode: "nw",
    label: "Resize top-left",
    className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
    bracket: "left-1/2 top-1/2 border-l-[4px] border-t-[4px] -translate-x-[3px] -translate-y-[3px]",
  },
  {
    mode: "ne",
    label: "Resize top-right",
    className: "left-full top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
    bracket: "right-1/2 top-1/2 border-r-[4px] border-t-[4px] translate-x-[3px] -translate-y-[3px]",
  },
  {
    mode: "sw",
    label: "Resize bottom-left",
    className: "left-0 top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
    bracket: "bottom-1/2 left-1/2 border-b-[4px] border-l-[4px] -translate-x-[3px] translate-y-[3px]",
  },
  {
    mode: "se",
    label: "Resize bottom-right",
    className: "left-full top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
    bracket: "bottom-1/2 right-1/2 border-b-[4px] border-r-[4px] translate-x-[3px] translate-y-[3px]",
  },
];

const EDGE_HANDLES: { mode: DragMode; label: string; className: string; cursor: string; isVertical: boolean }[] = [
  {
    mode: "n",
    label: "Resize top border",
    className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ns-resize",
    isVertical: false,
  },
  {
    mode: "s",
    label: "Resize bottom border",
    className: "left-1/2 top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ns-resize",
    isVertical: false,
  },
  {
    mode: "w",
    label: "Resize left border",
    className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ew-resize",
    isVertical: true,
  },
  {
    mode: "e",
    label: "Resize right border",
    className: "left-full top-1/2 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ew-resize",
    isVertical: true,
  },
];

export function CropCanvas({
  src,
  naturalWidth,
  naturalHeight,
  crop,
  ratioId,
  stageWidth,
  stageHeight,
  onChange,
  className = "",
}: {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropRect;
  ratioId: CropRatioId;
  stageWidth?: number;
  stageHeight?: number;
  onChange: (crop: CropRect) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const imageAspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  const ratio = cropRatioValue(ratioId);
  const normRatio = ratio ? ratio / imageAspect : null;
  const pixels = cropPixels(crop, naturalWidth || 1, naturalHeight || 1);

  // Exact pixel size fit within stage viewport so vertical and horizontal images scale cleanly
  const cropScale =
    stageWidth && stageHeight && naturalWidth && naturalHeight
      ? Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight)
      : null;
  const containerW = cropScale ? Math.round(naturalWidth * cropScale) : undefined;
  const containerH = cropScale ? Math.round(naturalHeight * cropScale) : undefined;

  // Drag start handler for borders, corners and the move area
  function startDrag(event: ReactPointerEvent<HTMLElement>, mode: DragMode) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    event.preventDefault();
    event.stopPropagation();
    container.setPointerCapture(event.pointerId);

    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      base: crop,
      containerWidth: rect.width,
      containerHeight: rect.height,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();

    const dx = (event.clientX - drag.startX) / drag.containerWidth;
    const dy = (event.clientY - drag.startY) / drag.containerHeight;

    const next = calculateNextCrop(drag.base, drag.mode, dx, dy, normRatio, drag.containerWidth, drag.containerHeight);
    onChange(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (containerRef.current?.hasPointerCapture(event.pointerId)) {
      containerRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();

    onChange({
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    });
  }

  // Safe percentage boundaries for CSS
  const leftPct = `${clamp(crop.x * 100, 0, 100)}%`;
  const topPct = `${clamp(crop.y * 100, 0, 100)}%`;
  const widthPct = `${clamp(crop.width * 100, 1, 100)}%`;
  const heightPct = `${clamp(crop.height * 100, 1, 100)}%`;
  const bottomPct = `${clamp((1 - (crop.y + crop.height)) * 100, 0, 100)}%`;
  const rightPct = `${clamp((1 - (crop.x + crop.width)) * 100, 0, 100)}%`;

  return (
    <div className={`relative flex h-full min-h-0 w-full select-none items-center justify-center ${className}`}>
      {/* The picture, at exactly the size it fits the stage */}
      <div
        ref={containerRef}
        style={{
          width: containerW ? `${containerW}px` : undefined,
          height: containerH ? `${containerH}px` : undefined,
          aspectRatio: !containerW && naturalWidth && naturalHeight ? `${naturalWidth} / ${naturalHeight}` : undefined,
          maxWidth: "100%",
          maxHeight: "100%",
        }}
        className="fb-checker relative shrink-0 touch-none select-none shadow-[0_0_0_1px_rgba(24,24,27,0.22)]"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <img
          src={src}
          alt="Crop stage"
          draggable={false}
          className="pointer-events-none block h-full w-full select-none object-fill"
        />

        {/* Everything outside the crop, dimmed */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-x-0 top-0 bg-ink/65" style={{ height: topPct }} />
          <div className="absolute inset-x-0 bottom-0 bg-ink/65" style={{ height: bottomPct }} />
          <div className="absolute left-0 bg-ink/65" style={{ top: topPct, height: heightPct, width: leftPct }} />
          <div className="absolute right-0 bg-ink/65" style={{ top: topPct, height: heightPct, width: rightPct }} />
        </div>

        {/* The crop */}
        <div
          role="group"
          aria-label={`Crop box: ${pixels.width} by ${pixels.height} pixels. Arrow keys move it.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="group absolute z-20 select-none outline-none"
          style={{ left: leftPct, top: topPct, width: widthPct, height: heightPct }}
        >
          <div className="pointer-events-none absolute inset-0 border border-white shadow-[0_0_0_1px_rgba(29,28,31,0.7)] group-focus-visible:border-accent" />

          {/* Thirds */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
            <span className="absolute inset-y-0 right-1/3 w-px bg-white/45" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
            <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/45" />
          </div>

          {/* Move */}
          <div
            className="absolute inset-0 z-10 cursor-move"
            onPointerDown={(e) => startDrag(e, "move")}
            title="Drag to move the crop"
          />

          {/* Size tag */}
          <div className="fb-num pointer-events-none absolute left-0 top-0 z-30 flex h-7 select-none items-center gap-2 whitespace-nowrap bg-accent-deep px-2.5 text-[12px] font-semibold leading-none text-white">
            <span>
              {pixels.width} × {pixels.height}
            </span>
            {ratioId !== "free" ? <span className="font-normal text-white/80">{ratioId}</span> : null}
          </div>

          {/* Sides */}
          <div
            className="absolute inset-x-3 -top-2 z-20 h-4 cursor-ns-resize"
            title="Drag top border"
            onPointerDown={(e) => startDrag(e, "n")}
          />
          <div
            className="absolute inset-x-3 -bottom-2 z-20 h-4 cursor-ns-resize"
            title="Drag bottom border"
            onPointerDown={(e) => startDrag(e, "s")}
          />
          <div
            className="absolute inset-y-3 -left-2 z-20 w-4 cursor-ew-resize"
            title="Drag left border"
            onPointerDown={(e) => startDrag(e, "w")}
          />
          <div
            className="absolute inset-y-3 -right-2 z-20 w-4 cursor-ew-resize"
            title="Drag right border"
            onPointerDown={(e) => startDrag(e, "e")}
          />

          {/* Corners */}
          {CORNER_HANDLES.map((corner) => (
            <div
              key={corner.mode}
              className={`absolute z-30 h-11 w-11 touch-none ${corner.className} ${corner.cursor}`}
              onPointerDown={(e) => startDrag(e, corner.mode)}
              title={corner.label}
            >
              <span className={`absolute h-[22px] w-[22px] border-accent ${corner.bracket}`} />
            </div>
          ))}

          {/* Side grips */}
          {EDGE_HANDLES.map((edge) => (
            <div
              key={edge.mode}
              className={`absolute z-30 grid touch-none place-items-center ${
                edge.isVertical ? "h-11 w-8" : "h-8 w-11"
              } ${edge.className} ${edge.cursor}`}
              onPointerDown={(e) => startDrag(e, edge.mode)}
              title={edge.label}
            >
              <div className={`bg-accent ${edge.isVertical ? "h-7 w-[4px]" : "h-[4px] w-7"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculates next crop coordinates during drag.
 * Fully supports both Free-form (drag any border/corner freely) and Fixed Ratio (1:1, 16:9, etc.).
 */
function calculateNextCrop(
  base: CropRect,
  mode: DragMode,
  dx: number,
  dy: number,
  normRatio: number | null,
  containerW: number,
  containerH: number,
): CropRect {
  // Move Entire Box
  if (mode === "move") {
    return {
      ...base,
      x: clamp(base.x + dx, 0, 1 - base.width),
      y: clamp(base.y + dy, 0, 1 - base.height),
    };
  }

  const minW = Math.max(0.03, 24 / containerW);
  const minH = Math.max(0.03, 24 / containerH);

  // -------------------------------------------------------------
  // 1. FREE-FORM DRAGGING (normRatio === null)
  // -------------------------------------------------------------
  if (!normRatio) {
    let left = base.x;
    let top = base.y;
    let right = base.x + base.width;
    let bottom = base.y + base.height;

    if (mode.includes("w")) left = clamp(base.x + dx, 0, right - minW);
    if (mode.includes("e")) right = clamp(base.x + base.width + dx, left + minW, 1);
    if (mode.includes("n")) top = clamp(base.y + dy, 0, bottom - minH);
    if (mode.includes("s")) bottom = clamp(base.y + base.height + dy, top + minH, 1);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  // -------------------------------------------------------------
  // 2. FIXED RATIO DRAGGING (normRatio !== null)
  // -------------------------------------------------------------
  // When an edge is dragged (n, s, e, w) in fixed ratio mode:
  if (mode === "e" || mode === "w") {
    const isW = mode === "w";
    const anchorX = isW ? base.x + base.width : base.x;
    const desiredW = isW ? base.width - dx : base.width + dx;
    const maxW = Math.min(isW ? anchorX : 1 - anchorX, normRatio);
    const newW = clamp(desiredW, Math.max(minW, minH * normRatio), maxW);
    const newH = newW / normRatio;
    const centerY = base.y + base.height / 2;
    const newY = clamp(centerY - newH / 2, 0, 1 - newH);
    const newX = isW ? anchorX - newW : anchorX;
    return { x: newX, y: newY, width: newW, height: newH };
  }

  if (mode === "n" || mode === "s") {
    const isN = mode === "n";
    const anchorY = isN ? base.y + base.height : base.y;
    const desiredH = isN ? base.height - dy : base.height + dy;
    const maxH = Math.min(isN ? anchorY : 1 - anchorY, 1 / normRatio);
    const newH = clamp(desiredH, Math.max(minH, minW / normRatio), maxH);
    const newW = newH * normRatio;
    const centerX = base.x + base.width / 2;
    const newX = clamp(centerX - newW / 2, 0, 1 - newW);
    const newY = isN ? anchorY - newH : anchorY;
    return { x: newX, y: newY, width: newW, height: newH };
  }

  // Corner Dragging in Fixed Ratio (nw, ne, sw, se)
  const isWest = mode.includes("w");
  const isNorth = mode.includes("n");
  const anchorX = isWest ? base.x + base.width : base.x;
  const anchorY = isNorth ? base.y + base.height : base.y;

  const desiredW = isWest ? base.width - dx : base.width + dx;
  const desiredFromH = (isNorth ? base.height - dy : base.height + dy) * normRatio;
  const chosenW = Math.max(desiredW, desiredFromH);

  const maxW = Math.min(
    isWest ? anchorX : 1 - anchorX,
    (isNorth ? anchorY : 1 - anchorY) * normRatio,
  );
  const effectiveMinW = Math.max(minW, minH * normRatio);
  const newWidth = clamp(chosenW, effectiveMinW, Math.max(effectiveMinW, maxW));
  const newHeight = newWidth / normRatio;

  const x = isWest ? anchorX - newWidth : anchorX;
  const y = isNorth ? anchorY - newHeight : anchorY;

  return {
    x: clamp(x, 0, 1 - newWidth),
    y: clamp(y, 0, 1 - newHeight),
    width: newWidth,
    height: newHeight,
  };
}
