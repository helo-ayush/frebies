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

const CORNER_HANDLES: { mode: DragMode; label: string; className: string; cursor: string }[] = [
  {
    mode: "nw",
    label: "Resize top-left",
    className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
  },
  {
    mode: "ne",
    label: "Resize top-right",
    className: "left-full top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
  },
  {
    mode: "sw",
    label: "Resize bottom-left",
    className: "left-0 top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
  },
  {
    mode: "se",
    label: "Resize bottom-right",
    className: "left-full top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
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

const RATIO_OPTIONS: { id: CropRatioId; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "3:2", label: "3:2" },
];

export function CropCanvas({
  src,
  naturalWidth,
  naturalHeight,
  crop,
  ratioId,
  onChange,
  onRatioChange,
  onReset,
  className = "",
}: {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropRect;
  ratioId: CropRatioId;
  onChange: (crop: CropRect) => void;
  onRatioChange?: (ratio: CropRatioId) => void;
  onReset?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const imageAspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  const ratio = cropRatioValue(ratioId);
  const normRatio = ratio ? ratio / imageAspect : null;
  const pixels = cropPixels(crop, naturalWidth || 1, naturalHeight || 1);

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
    <div className={`relative flex flex-col items-center justify-center w-full h-full min-h-0 p-1 select-none ${className}`}>
      {/* Top Floating Quick Ratio Bar */}
      {onRatioChange && (
        <div className="z-30 mb-2 flex flex-wrap items-center gap-1 rounded-full border border-line bg-white/95 p-1 shadow-xs backdrop-blur-sm">
          {RATIO_OPTIONS.map((opt) => {
            const active = ratioId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onRatioChange(opt.id)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  active ? "bg-ink font-semibold text-white shadow-2xs" : "text-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="ml-1 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-medium text-muted hover:border-[#c8c2b7] hover:text-ink"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Main Image Stage Box: Relative container wrapping the image exactly */}
      <div
        ref={containerRef}
        style={naturalWidth && naturalHeight ? { aspectRatio: `${naturalWidth} / ${naturalHeight}` } : undefined}
        className="relative touch-none select-none overflow-hidden rounded-[4px] shadow-md border border-black/15 max-h-[min(540px,calc(100%-44px))] max-w-full"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {/* Source Image */}
        <img
          src={src}
          alt="Crop stage"
          draggable={false}
          className="h-full w-full object-fill block select-none pointer-events-none"
        />

        {/* Dark Dimming Backdrop: 4 rects surrounding the bright crop box */}
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none z-10">
          {/* Top dark area */}
          <div
            className="absolute inset-x-0 top-0 bg-black/55 backdrop-blur-[0.5px]"
            style={{ height: topPct }}
          />
          {/* Bottom dark area */}
          <div
            className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur-[0.5px]"
            style={{ height: bottomPct }}
          />
          {/* Left dark area */}
          <div
            className="absolute left-0 bg-black/55 backdrop-blur-[0.5px]"
            style={{ top: topPct, height: heightPct, width: leftPct }}
          />
          {/* Right dark area */}
          <div
            className="absolute right-0 bg-black/55 backdrop-blur-[0.5px]"
            style={{ top: topPct, height: heightPct, width: rightPct }}
          />
        </div>

        {/* The Bright Crop Box Overlay */}
        <div
          role="group"
          aria-label={`Crop box: ${pixels.width} by ${pixels.height} pixels`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="absolute z-20 outline-none select-none"
          style={{
            left: leftPct,
            top: topPct,
            width: widthPct,
            height: heightPct,
          }}
        >
          {/* Visual Outline: Crisp 1.5px white border with subtle dark shadow */}
          <div className="absolute inset-0 border-[1.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] pointer-events-none" />

          {/* Rule of Thirds Grid */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/40 shadow-[0_0_1px_rgba(0,0,0,0.5)]" />
            <span className="absolute inset-y-0 right-1/3 w-px bg-white/40 shadow-[0_0_1px_rgba(0,0,0,0.5)]" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/40 shadow-[0_0_1px_rgba(0,0,0,0.5)]" />
            <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/40 shadow-[0_0_1px_rgba(0,0,0,0.5)]" />
          </div>

          {/* Draggable Inner Move Area */}
          <div
            className="absolute inset-0 cursor-move z-10"
            onPointerDown={(e) => startDrag(e, "move")}
            title="Click and drag to move crop box"
          />

          {/* Floating Dimension & Ratio Badge */}
          <div className="pointer-events-none absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/75 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-xs backdrop-blur-xs select-none">
            <span>{pixels.width} × {pixels.height} px</span>
            <span className="text-white/60">·</span>
            <span className="uppercase text-[9px] text-white/80">{ratioId === "free" ? "Free" : ratioId}</span>
          </div>

          {/* ========================================================================= */}
          {/* MANUAL BORDER DRAG HIT AREAS (Active border lines for dragging from edges) */}
          {/* ========================================================================= */}
          {/* Top Border Hit Area */}
          <div
            className="absolute -top-2 inset-x-3 h-4 cursor-ns-resize z-20"
            title="Drag top border"
            onPointerDown={(e) => startDrag(e, "n")}
          />
          {/* Bottom Border Hit Area */}
          <div
            className="absolute -bottom-2 inset-x-3 h-4 cursor-ns-resize z-20"
            title="Drag bottom border"
            onPointerDown={(e) => startDrag(e, "s")}
          />
          {/* Left Border Hit Area */}
          <div
            className="absolute -left-2 inset-y-3 w-4 cursor-ew-resize z-20"
            title="Drag left border"
            onPointerDown={(e) => startDrag(e, "w")}
          />
          {/* Right Border Hit Area */}
          <div
            className="absolute -right-2 inset-y-3 w-4 cursor-ew-resize z-20"
            title="Drag right border"
            onPointerDown={(e) => startDrag(e, "e")}
          />

          {/* ========================================================================= */}
          {/* 4 CORNER HANDLES (Large hit areas with distinct L-brackets / corner blocks) */}
          {/* ========================================================================= */}
          {CORNER_HANDLES.map((corner) => (
            <div
              key={corner.mode}
              className={`absolute grid h-7 w-7 place-items-center touch-none z-30 ${corner.className} ${corner.cursor}`}
              onPointerDown={(e) => startDrag(e, corner.mode)}
              title={corner.label}
            >
              {/* Corner L-bracket styling */}
              <div
                className={`h-3 w-3 border-white border-2 shadow-[0_0_2px_rgba(0,0,0,0.85)] bg-white ${
                  corner.mode === "nw"
                    ? "rounded-tl-xs"
                    : corner.mode === "ne"
                      ? "rounded-tr-xs"
                      : corner.mode === "sw"
                        ? "rounded-bl-xs"
                        : "rounded-br-xs"
                }`}
              />
            </div>
          ))}

          {/* ========================================================================= */}
          {/* 4 EDGE MIDPOINT GRAB PILLS */}
          {/* ========================================================================= */}
          {EDGE_HANDLES.map((edge) => (
            <div
              key={edge.mode}
              className={`absolute grid place-items-center touch-none z-30 ${
                edge.isVertical ? "h-8 w-5" : "h-5 w-8"
              } ${edge.className} ${edge.cursor}`}
              onPointerDown={(e) => startDrag(e, edge.mode)}
              title={edge.label}
            >
              <div
                className={`rounded-full border border-black/70 bg-white shadow-md ${
                  edge.isVertical ? "h-5 w-2" : "h-2 w-5"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="mt-2 text-center text-[10.5px] text-faint">
        Drag borders or handles to resize · Drag center to reposition
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
