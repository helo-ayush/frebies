"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { FindBar } from "./FindBar";
import { PageView } from "./PageView";
import { toPage } from "./interact";
import { shownSize, type Page } from "./model";
import { useEditor, type EditorStore } from "./store";
import { BarButton, MenuRow, Pop } from "./ui";
import type { RenderQueue } from "@/components/tool/viewer/render-queue";

const PT_TO_PX = 96 / 72;
const MIN = 0.15;
const MAX = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where dropped files will go. */
export type Place = { kind: "page"; page: Page; x: number; y: number; index: number } | { kind: "gap"; index: number };

/** What is being dragged in, as far as the browser tells before it lands. */
function carried(event: DragEvent): "pdf" | "image" | "both" | null {
  const { types, items } = event.dataTransfer;
  if (![...types].includes("Files")) return null;
  const kinds = [...items].filter((item) => item.kind === "file").map((item) => item.type);
  if (kinds.length > 0 && kinds.every((type) => type === "application/pdf")) return "pdf";
  if (kinds.length > 0 && kinds.every((type) => type.startsWith("image/"))) return "image";
  return "both";
}

const ICON = { size: 15, strokeWidth: 1.8, "aria-hidden": true } as const;

/** The pages, one under the other, with room to add more between them. */
export function Stage({
  store,
  queue,
  onAddFiles,
  onDropFiles,
}: {
  store: EditorStore;
  queue: RenderQueue;
  onAddFiles: (at: number) => void;
  onDropFiles: (files: File[], place: Place) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [drop, setDrop] = useState<{ place: Place; kind: "pdf" | "image" | "both" } | null>(null);
  const pages = useEditor(store, (s) => s.doc.pages);
  const zoom = useEditor(store, (s) => s.view.zoom);
  const fit = useEditor(store, (s) => s.view.fit);
  const goTo = useEditor(store, (s) => s.view.goTo);
  const find = useEditor(store, (s) => s.view.find.open);
  const busy = useEditor(store, (s) => s.view.busy);
  const tool = useEditor(store, (s) => s.view.tool);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    store.scroller = node;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (store.scroller === node) store.scroller = null;
    };
  }, [store]);

  // ------------------------------------------------------------ zoom
  const pad = box.w < 560 ? 10 : 34;
  const widest = pages.reduce((max, page) => Math.max(max, shownSize(page).w), 1);
  const tallest = pages.reduce((max, page) => Math.max(max, shownSize(page).h), 1);
  const wanted =
    box.w === 0
      ? null
      : fit === "width"
        ? clamp(Math.min(box.w - pad * 2, 980) / widest, MIN, MAX)
        : fit === "page"
          ? clamp(Math.min((box.h - 70) / tallest, (box.w - pad * 2) / widest), MIN, MAX)
          : null;

  useLayoutEffect(() => {
    if (wanted !== null && Math.abs(wanted - store.view.zoom) > 0.0005) store.setView({ zoom: wanted });
  }, [wanted, store]);

  // The same spot stays in view while the scale changes: the one under the pointer, or the middle.
  const last = useRef(zoom);
  const focus = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    const from = last.current;
    last.current = zoom;
    if (!node || from === zoom || box.w === 0) return;
    // At the very top, the top stays.
    if (!focus.current && node.scrollTop < 2) return;
    const at = focus.current ?? { x: node.clientWidth / 2, y: node.clientHeight / 2 };
    focus.current = null;
    const ratio = zoom / from;
    node.scrollTop = (node.scrollTop + at.y) * ratio - at.y;
    node.scrollLeft = (node.scrollLeft + at.x) * ratio - at.x;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = useCallback((next: number) => store.setView({ fit: null, zoom: clamp(next, MIN, MAX) }), [store]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      focus.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      zoomTo(store.view.zoom * Math.exp(-clamp(event.deltaY, -120, 120) * 0.0045));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [store, zoomTo]);

  // ------------------------------------------------------------ where we are
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const node = scroller.current;
      if (!node) return;
      const line = node.getBoundingClientRect().top + node.clientHeight * 0.4;
      const list = store.doc.pages;
      let low = 0;
      let high = list.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const rect = store.sheets.get(list[middle].id)?.getBoundingClientRect();
        if (rect && rect.top <= line) low = middle;
        else high = middle - 1;
      }
      const at = list[low]?.id;
      if (at && at !== store.view.page) store.setView({ page: at });
    });
  }, [store]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    if (!goTo) return;
    let tries = 0;
    let timer = 0;
    const go = () => {
      const node = scroller.current;
      const sheet = store.sheets.get(goTo.page);
      if (!node || !sheet) {
        if (tries++ < 10) timer = window.setTimeout(go, 30);
        return;
      }
      const rect = sheet.getBoundingClientRect();
      const top = rect.top - node.getBoundingClientRect().top + node.scrollTop;
      const { zoom: z } = store.view;
      // Far away is a jump; gliding past a hundred pages helps nobody.
      const glide = (to: number) =>
        node.scrollTo({ top: to, behavior: Math.abs(to - node.scrollTop) > node.clientHeight * 4 ? "auto" : "smooth" });
      if (goTo.box) {
        const y = top + goTo.box.y * z;
        const seen = y > node.scrollTop + 60 && y + goTo.box.h * z < node.scrollTop + node.clientHeight - 60;
        if (!seen) glide(y - node.clientHeight * 0.35);
      } else glide(top - 48);
      if (store.view.page !== goTo.page) store.setView({ page: goTo.page });
    };
    go();
    return () => clearTimeout(timer);
  }, [goTo, store]);

  // ------------------------------------------------------------ files dropped here
  const placeAt = (event: DragEvent): Place => {
    const list = store.doc.pages;
    for (let i = 0; i < list.length; i += 1) {
      const rect = store.sheets.get(list[i].id)?.getBoundingClientRect();
      if (!rect) continue;
      if (event.clientY < rect.top) return { kind: "gap", index: i };
      if (event.clientY <= rect.bottom) {
        const index = event.clientY < rect.top + rect.height / 2 ? i : i + 1;
        if (event.clientX >= rect.left && event.clientX <= rect.right)
          return { kind: "page", page: list[i], ...toPage(store, list[i], event.clientX, event.clientY), index };
        return { kind: "gap", index };
      }
    }
    return { kind: "gap", index: list.length };
  };

  const slot = drop && (drop.kind === "pdf" || drop.place.kind === "gap") ? drop.place.index : null;
  const percent = Math.round((zoom / PT_TO_PX) * 100);
  const narrow = box.w > 0 && box.w < 520;

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <div
        ref={scroller}
        data-slot="pdf-editor"
        tabIndex={-1}
        onScroll={onScroll}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLElement && !event.target.closest("[data-page], button, input, select, a"))
            store.select([]);
        }}
        onDragOver={(event) => {
          const kind = carried(event);
          if (!kind) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDrop({ place: placeAt(event), kind });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null);
        }}
        onDrop={(event) => {
          const files = [...event.dataTransfer.files];
          setDrop(null);
          if (files.length === 0) return;
          event.preventDefault();
          onDropFiles(files, placeAt(event));
        }}
        className={`fb-stage studio-main absolute inset-0 overflow-auto overscroll-contain outline-none focus-visible:outline-none ${tool === "select" ? "" : "select-none"}`}
      >
        <div className="mx-auto flex w-max min-w-full flex-col items-center px-2.5 pb-24 pt-1 sm:px-4">
          {box.w > 0
            ? pages.map((page, i) => (
                <PageItem
                  key={page.id}
                  store={store}
                  page={page}
                  index={i}
                  count={pages.length}
                  zoom={zoom}
                  queue={queue}
                  lit={slot === i}
                  aimed={Boolean(
                    drop && drop.kind !== "pdf" && drop.place.kind === "page" && drop.place.page.id === page.id,
                  )}
                  onAddFiles={onAddFiles}
                />
              ))
            : null}
          {box.w > 0 ? (
            <End
              store={store}
              width={Math.min(box.w - 24, widest * zoom)}
              lit={slot === pages.length}
              onAddFiles={onAddFiles}
            />
          ) : null}
        </div>
      </div>

      {drop ? (
        <p className="pointer-events-none absolute left-1/2 top-3 z-[7] -translate-x-1/2 whitespace-nowrap bg-ink px-4 py-2 text-[14px] font-medium text-white">
          {drop.kind === "pdf"
            ? slot === pages.length
              ? "Add its pages at the end"
              : `Add its pages before page ${(slot ?? 0) + 1}`
            : drop.place.kind === "page"
              ? "Put the picture here"
              : "Add as a new page"}
        </p>
      ) : null}

      {find ? <FindBar store={store} /> : null}

      {busy && !busy.label.startsWith("Saving") ? (
        <p
          role="status"
          className="absolute left-1/2 top-3 z-[6] flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap bg-ink px-4 py-2 text-[14px] text-white"
        >
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {busy.label}
        </p>
      ) : null}

      <PageNav store={store} />

      {/* Zoom */}
      <div
        role="group"
        aria-label="Zoom"
        className="absolute bottom-3 right-3 z-[3] flex border border-line-strong bg-panel"
      >
        <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom / 1.2)} className={NAV_KEY}>
          <Minus size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => zoomTo(PT_TO_PX)}
          title="Show actual size"
          aria-label={`Zoom ${percent}%. Show actual size`}
          className={`fb-num h-9 min-w-[56px] border-l border-line-strong px-2 text-[12.5px] font-medium transition-colors hover:bg-hover ${narrow ? "hidden" : ""}`}
        >
          {percent}%
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom * 1.2)} className={NAV_KEY}>
          <Plus size={14} aria-hidden />
        </button>
        {(["width", "page"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={fit === option}
            onClick={() => store.setView({ fit: option })}
            title={option === "width" ? "Fit the width" : "Fit the whole page"}
            className={`h-9 border-l border-line-strong px-3 text-[12.5px] font-medium uppercase transition-colors ${fit === option ? "bg-ink text-white" : "hover:bg-hover"} ${
              narrow && option === "page" ? "hidden" : ""
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

const NAV_KEY =
  "grid h-9 w-9 place-items-center border-l border-line-strong transition-colors first:border-l-0 hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-35";

function PageNav({ store }: { store: EditorStore }) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const current = useEditor(store, (s) => s.view.page);
  const [typed, setTyped] = useState<string | null>(null);
  const at = Math.max(
    0,
    pages.findIndex((page) => page.id === current),
  );
  const go = (index: number) => {
    const page = pages[clamp(index, 0, pages.length - 1)];
    if (page) store.show(page.id);
  };
  return (
    <div className="absolute bottom-3 left-3 z-[3] flex border border-line-strong bg-panel">
      <button
        type="button"
        aria-label="Previous page"
        disabled={at <= 0}
        onClick={() => go(at - 1)}
        className={NAV_KEY}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <label className="fb-num flex h-9 items-center border-l border-line-strong px-2.5 text-[12.5px]">
        <span className="sr-only">Page</span>
        <input
          inputMode="numeric"
          value={typed ?? String(at + 1)}
          onFocus={(event) => {
            setTyped(String(at + 1));
            event.currentTarget.select();
          }}
          onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
          onBlur={() => setTyped(null)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const next = Number.parseInt(typed ?? "", 10);
            if (Number.isFinite(next)) go(next - 1);
            event.currentTarget.blur();
          }}
          aria-label={`Page number, of ${pages.length}`}
          className="w-8 bg-transparent text-right font-semibold outline-none focus-visible:outline-none"
        />
        <span className="pl-1.5 text-muted">/ {pages.length}</span>
      </label>
      <button
        type="button"
        aria-label="Next page"
        disabled={at >= pages.length - 1}
        onClick={() => go(at + 1)}
        className={NAV_KEY}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}

/** One page with the key before it and the keys above it. Far from the screen it is only its size. */
const PageItem = memo(function PageItem({
  store,
  page,
  index,
  count,
  zoom,
  queue,
  lit,
  aimed,
  onAddFiles,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  zoom: number;
  queue: RenderQueue;
  lit: boolean;
  aimed: boolean;
  onAddFiles: (at: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const held = useEditor(
    store,
    (s) => s.view.selection.length > 0 && s.view.selection.some((id) => page.objects.includes(id)),
  );

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer = 0;
    // A page that only flies past is never built.
    const observer = new IntersectionObserver(
      (entries) => {
        const now = entries[entries.length - 1].isIntersecting;
        clearTimeout(timer);
        timer = window.setTimeout(() => setNear(now), now ? 90 : 400);
      },
      { root: store.scroller, rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [store]);

  const here = near || held;
  return (
    <div ref={root} className="flex flex-col items-center">
      {here || lit ? (
        <Gap store={store} index={index} lit={lit} first={index === 0} onAddFiles={onAddFiles} />
      ) : (
        <div className={index === 0 ? "h-4" : "h-14"} />
      )}
      {here ? (
        <PageHead store={store} page={page} index={index} count={count} width={shownSize(page).w * zoom} />
      ) : (
        <div className="h-10" />
      )}
      <div className="relative">
        <PageView store={store} page={page} number={index + 1} zoom={zoom} queue={queue} near={here} />
        {aimed ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] border-[3px] border-accent bg-accent/[0.06]"
          />
        ) : null}
      </div>
    </div>
  );
});

function AddMenu({
  store,
  index,
  onAddFiles,
  close,
}: {
  store: EditorStore;
  index: number;
  onAddFiles: (at: number) => void;
  close: () => void;
}) {
  return (
    <>
      <MenuRow
        label="Blank page"
        icon={<Plus size={16} aria-hidden />}
        sound="page"
        onClick={() => (store.addBlank(index), close())}
      />
      <MenuRow
        label="PDF or pictures"
        icon={<FilePlus2 size={16} aria-hidden />}
        onClick={() => (onAddFiles(index), close())}
      />
    </>
  );
}

/** Between two pages: one quiet key that adds a page right there. */
function Gap({
  store,
  index,
  lit,
  first,
  onAddFiles,
}: {
  store: EditorStore;
  index: number;
  lit: boolean;
  first: boolean;
  onAddFiles: (at: number) => void;
}) {
  return (
    <div className={`relative flex w-full items-center justify-center ${first ? "h-4" : "h-14"}`}>
      {lit ? <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-accent" /> : null}
      {first ? null : (
        <Pop
          label="Add a page here"
          width={210}
          button={(open, toggle, ref) => (
            <button
              ref={ref}
              type="button"
              aria-expanded={open}
              onClick={toggle}
              className={`flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors ${open ? "bg-ink text-white" : "text-muted hover:bg-ink hover:text-white"} ${lit ? "opacity-0" : ""}`}
            >
              <Plus size={14} aria-hidden />
              Add a page here
            </button>
          )}
        >
          {(close) => <AddMenu store={store} index={index} onAddFiles={onAddFiles} close={close} />}
        </Pop>
      )}
    </div>
  );
}

function PageHead({
  store,
  page,
  index,
  count,
  width,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  width: number;
}) {
  const on = useEditor(store, (s) => s.view.page === page.id);
  return (
    <div className="flex h-10 items-center justify-between" style={{ width: Math.max(width, 250) }}>
      <span className={`fb-num whitespace-nowrap text-[13px] ${on ? "font-medium" : "text-muted"}`}>
        Page {index + 1}
        <span className="text-faint"> of {count}</span>
      </span>
      <div
        role="group"
        aria-label={`Page ${index + 1}`}
        className={`flex transition-opacity ${on ? "" : "opacity-60 hover:opacity-100 focus-within:opacity-100"}`}
      >
        <BarButton
          label="Move up"
          disabled={index === 0}
          onClick={() => store.movePage(page.id, index - 1)}
          className="!h-8 !min-w-8"
        >
          <ArrowUp {...ICON} />
        </BarButton>
        <BarButton
          label="Move down"
          disabled={index === count - 1}
          onClick={() => store.movePage(page.id, index + 2)}
          className="!h-8 !min-w-8"
        >
          <ArrowDown {...ICON} />
        </BarButton>
        <BarButton label="Turn left" onClick={() => store.rotatePage(page.id, -90)} className="!h-8 !min-w-8">
          <RotateCcw {...ICON} />
        </BarButton>
        <BarButton label="Turn right" onClick={() => store.rotatePage(page.id, 90)} className="!h-8 !min-w-8">
          <RotateCw {...ICON} />
        </BarButton>
        <BarButton
          label="Duplicate this page"
          sound="page"
          onClick={() => store.duplicatePage(page.id)}
          className="!h-8 !min-w-8"
        >
          <Copy {...ICON} />
        </BarButton>
        <BarButton
          label="Delete this page"
          slot="page-remove"
          disabled={count < 2}
          onClick={() => store.deletePages([page.id])}
          className="!h-8 !min-w-8 hover:!bg-danger hover:!text-white"
        >
          <Trash2 {...ICON} />
        </BarButton>
      </div>
    </div>
  );
}

/** After the last page: more pages, or another file. */
function End({
  store,
  width,
  lit,
  onAddFiles,
}: {
  store: EditorStore;
  width: number;
  lit: boolean;
  onAddFiles: (at: number) => void;
}) {
  const count = useEditor(store, (s) => s.doc.pages.length);
  return (
    <div
      data-slot="add-pages"
      className={`mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border border-dashed px-5 py-5 transition-colors ${lit ? "border-accent bg-accent/[0.08]" : "border-line-strong bg-panel/60"}`}
      style={{ width: Math.max(width, 250) }}
    >
      <div>
        <p className="fb-wide text-[18px]">{lit ? "Let go" : "Add more pages"}</p>
        <p className="mt-2 text-[14px] text-muted">Drop another PDF or pictures here, or use the keys.</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          data-sound="page"
          onClick={() => store.addBlank()}
          className="inline-flex h-11 items-center gap-2 border border-line-strong bg-panel px-4 text-[14px] font-medium hover:border-ink hover:bg-ink hover:text-white"
        >
          <Plus size={16} aria-hidden />
          Blank page
        </button>
        <button
          type="button"
          onClick={() => onAddFiles(count)}
          className="inline-flex h-11 items-center gap-2 border border-line-strong bg-panel px-4 text-[14px] font-medium hover:border-ink hover:bg-ink hover:text-white"
        >
          <FilePlus2 size={16} aria-hidden />
          PDF or pictures
        </button>
      </div>
    </div>
  );
}
