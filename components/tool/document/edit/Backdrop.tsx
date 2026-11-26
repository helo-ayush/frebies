"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TextArt } from "./Art";
import { decorOf, decorStyles } from "./engine/decor";
import { loadFaces } from "./engine/fonts";
import { renderClear } from "./engine/render";
import type { Page } from "./model";
import { useEditor, type EditorStore } from "./store";
import type { RenderQueue } from "@/components/tool/viewer/render-queue";

/** The page's own drawing, without what was taken off it. */
export function Backdrop({
  store,
  page,
  zoom,
  queue,
  onKey,
}: {
  store: EditorStore;
  page: Page;
  zoom: number;
  queue: RenderQueue;
  onKey: (key: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = useEditor(store, (s) => s.backdropKey(page));
  const [sharp, setSharp] = useState(zoom);
  const drawn = useRef("");
  const report = useRef(onKey);
  report.current = onKey;
  const { paper } = page;

  useEffect(() => {
    const timer = setTimeout(() => setSharp(zoom), 140);
    return () => clearTimeout(timer);
  }, [zoom]);

  useEffect(() => {
    let off = false;
    let stop: (() => void) | null = null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(sharp * ratio, 5000 / Math.max(page.w, page.h), Math.sqrt(15e6 / (page.w * page.h)));
    const wanted = `${key}@${scale.toFixed(3)}@${paper ? "clear" : "white"}`;
    if (drawn.current === wanted) return;
    void queue(async () => {
      if (off) return;
      const item = await store.backdrop(page).catch(() => null);
      const canvas = ref.current;
      if (off || !canvas) return;
      if (item) {
        const viewport = item.page.getViewport({ scale });
        const bench = document.createElement("canvas");
        bench.width = Math.max(1, Math.round(viewport.width));
        bench.height = Math.max(1, Math.round(viewport.height));
        // 2: form fields are drawn by the editor, so they can be filled in.
        // On paper with a colour of its own the page lies on that.
        const task = paper
          ? renderClear(item.page, bench, viewport, { annotationMode: 2 })
          : item.page.render({ canvas: bench, viewport, annotationMode: 2 });
        stop = () => task.cancel();
        try {
          await task.promise;
        } catch {
          return;
        }
        if (off || !ref.current) return;
        canvas.width = bench.width;
        canvas.height = bench.height;
        canvas.getContext("2d")?.drawImage(bench, 0, 0);
        store.canvases.set(page.id, { canvas, scale });
      } else {
        canvas.width = canvas.width || 1;
      }
      drawn.current = wanted;
      report.current(key);
    });
    return () => {
      off = true;
      stop?.();
    };
  }, [store, page, key, sharp, queue, paper]);

  useEffect(
    () => () => {
      store.canvases.delete(page.id);
    },
    [store, page.id],
  );

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 block"
      style={{ width: page.w, height: page.h }}
    />
  );
}

/** Header, footer, page number and watermark. */
export function DecorLayer({
  store,
  page,
  index,
  count,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
}) {
  const decor = useEditor(store, (s) => s.doc.decor);
  const name = useEditor(store, (s) => s.name);
  const [tick, setTick] = useState(0);
  const fonts = decorStyles(decor)
    .map((style) => `${style.font}${style.bold}${style.italic}`)
    .join();
  useEffect(() => {
    if (!decor) return;
    let off = false;
    void loadFaces(decorStyles(decor)).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(
    () => (decor ? decorOf(store.doc, page, { index, count, name }, store.assets) : []),
    [decor, page, index, count, name, store, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0" aria-hidden>
      {items.map((item, i) => (
        <span
          key={i}
          className="absolute left-0 top-0 block"
          style={{
            transformOrigin: "0 0",
            transform: `translate(${item.x}px, ${item.y}px) rotate(${item.angle}deg)`,
            opacity: item.opacity,
          }}
        >
          {item.kind === "text" ? (
            <TextArt body={item.laid} wrap={item.laid.wrap} w={item.laid.w} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.assets.get(item.asset)?.url}
              alt=""
              className="block max-w-none"
              style={{ width: item.w, height: item.h }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
