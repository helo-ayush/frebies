"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampCropCenter,
  cropRect,
  drawRegion,
  transformImage,
  type Anchor,
  type FitMode,
  type Rect,
  type Size,
} from "@/lib/image/encode";

/** Decode an object URL once and keep the image element around. */
function useDecodedImage(src: string) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setSource(image);
    };
    image.onerror = () => {
      if (!cancelled) setSource(null);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return source;
}

/** Keep a canvas backing store in sync with its CSS box and redraw on resize. */
function useCanvasBox(draw: (canvas: HTMLCanvasElement, width: number, height: number) => void) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paint = useCallback(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const cssWidth = box.clientWidth;
    const cssHeight = box.clientHeight;
    if (!cssWidth || !cssHeight) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    draw(canvas, width, height);
  }, [draw]);

  useEffect(() => {
    const handle = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(handle);
  }, [paint]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => window.requestAnimationFrame(paint));
    observer.observe(box);
    return () => observer.disconnect();
  }, [paint]);

  return { boxRef, canvasRef, paint };
}

type CropStageProps = {
  src: string;
  ratio: number;
  zoom: number;
  centerX: number;
  centerY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  onPan: (center: { x: number; y: number }) => void;
};

/**
 * A real crop frame: the image is drawn through the same pipeline the export
 * uses, so the preview matches the download exactly. Drag the image to
 * reposition it; arrow keys nudge the crop.
 */
export function CropStage({
  src,
  ratio,
  zoom,
  centerX,
  centerY,
  rotation,
  flipX,
  flipY,
  onPan,
}: CropStageProps) {
  const source = useDecodedImage(src);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    centerX: number;
    centerY: number;
    frameWidth: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const transformed = useMemo(
    () => (source ? transformImage(source, { rotation, flipX, flipY }) : null),
    [source, rotation, flipX, flipY],
  );

  const draw = useCallback(
    (canvas: HTMLCanvasElement, width: number, height: number) => {
      if (!transformed) return;
      const rect = cropRect({
        width: transformed.width,
        height: transformed.height,
        ratio,
        zoom,
        centerX,
        centerY,
      });
      const rendered = drawRegion(transformed, rect, { width, height }, { fit: "stretch" });
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(rendered, 0, 0);
    },
    [centerX, centerY, ratio, transformed, zoom],
  );

  const { boxRef, canvasRef } = useCanvasBox(draw);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !transformed) return;
    const box = boxRef.current;
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerX,
      centerY,
      frameWidth: box.clientWidth || 1,
    };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !transformed || event.pointerId !== drag.pointerId) return;

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (deltaX === 0 && deltaY === 0) return;

    const rect = cropRect({
      width: transformed.width,
      height: transformed.height,
      ratio,
      zoom,
      centerX: drag.centerX,
      centerY: drag.centerY,
    });
    const sourcePerCss = rect.width / Math.max(1, drag.frameWidth);

    onPan(
      clampCropCenter({
        width: transformed.width,
        height: transformed.height,
        ratio,
        zoom,
        centerX: drag.centerX - (deltaX * sourcePerCss) / Math.max(1, transformed.width),
        centerY: drag.centerY - (deltaY * sourcePerCss) / Math.max(1, transformed.height),
      }),
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!transformed) return;
    const step = event.shiftKey ? 0.08 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onPan(
      clampCropCenter({
        width: transformed.width,
        height: transformed.height,
        ratio,
        zoom,
        centerX: centerX + move[0],
        centerY: centerY + move[1],
      }),
    );
  }

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="Crop frame. Drag the image to reposition the crop, or use the arrow keys."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={`relative h-full w-full touch-none select-none overflow-hidden rounded-[8px] border-2 border-white/90 bg-[#e9e5dd] shadow-[0_1px_6px_rgba(45,35,22,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" />
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
        <span className="absolute inset-y-0 right-1/3 w-px bg-white/45" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
        <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/45" />
      </span>
      <span className="pointer-events-none absolute left-2 top-2 rounded border border-white/60 bg-black/35 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur">
        {dragging ? "Moving crop" : "Drag to reposition"}
      </span>
    </div>
  );
}

type ResizePreviewProps = {
  src: string;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  crop: Rect | null;
  output: Size;
  fit: FitMode;
  background: string | null;
  anchor: Anchor;
};

/** Renders the exact export content (including padding) at preview size. */
export function ResizePreview({
  src,
  rotation,
  flipX,
  flipY,
  crop,
  output,
  fit,
  background,
  anchor,
}: ResizePreviewProps) {
  const source = useDecodedImage(src);
  const transformed = useMemo(
    () => (source ? transformImage(source, { rotation, flipX, flipY }) : null),
    [source, rotation, flipX, flipY],
  );

  const draw = useCallback(
    (canvas: HTMLCanvasElement, width: number, height: number) => {
      if (!transformed) return;
      const sourceRect: Rect = crop ?? {
        x: 0,
        y: 0,
        width: transformed.width,
        height: transformed.height,
      };
      const rendered = drawRegion(
        transformed,
        sourceRect,
        { width, height },
        { fit, background, anchor },
      );
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(rendered, 0, 0);
    },
    [anchor, background, crop, fit, transformed],
  );

  const { boxRef, canvasRef } = useCanvasBox(draw);

  return (
    <div
      ref={boxRef}
      className="relative h-full w-full overflow-hidden rounded-[8px] bg-[#e9e5dd]"
      style={{ background: background ?? undefined }}
      aria-hidden={output.width === 0}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
