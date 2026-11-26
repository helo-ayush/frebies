"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Copy, Download, FilePlus2, GripVertical, Plus, RotateCw, Trash2, X } from "lucide-react";
import { ObjectArt, placeCss } from "./Art";
import { DecorLayer } from "./Backdrop";
import { renderClear } from "./engine/render";
import { shownCss, track } from "./interact";
import { mixes, pageBox, shownSize, type EditObject, type Page } from "./model";
import { useEditor, type EditorStore } from "./store";
import { MenuRow, Pop } from "./ui";
import type { RenderQueue } from "@/components/tool/viewer/render-queue";

const WIDTH = 112;
const HEIGHT = 158;

const ThumbObject = memo(function ThumbObject({ store, id }: { store: EditorStore; id: string }) {
  const object = useEditor(store, (s) => s.doc.objects[id] as EditObject | undefined);
  if (!object || object.type === "link") return null;
  return (
    <div style={placeCss(object)}>
      <ObjectArt object={object} store={store} />
    </div>
  );
});

function ThumbArt({
  store,
  page,
  index,
  count,
  queue,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  queue: RenderQueue;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const key = useEditor(store, (s) => s.backdropKey(page));
  const size = shownSize(page);
  const scale = Math.min(WIDTH / size.w, HEIGHT / size.h);
  const { paper } = page;

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: "300px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let off = false;
    let stop: (() => void) | null = null;
    const timer = setTimeout(() => {
      void queue(async () => {
        if (off) return;
        const item = await store.backdrop(page).catch(() => null);
        if (off || !item || !canvas.current) return;
        const viewport = item.page.getViewport({ scale: scale * Math.min(2, window.devicePixelRatio || 1) });
        const bench = document.createElement("canvas");
        bench.width = Math.max(1, Math.round(viewport.width));
        bench.height = Math.max(1, Math.round(viewport.height));
        const task = paper ? renderClear(item.page, bench, viewport) : item.page.render({ canvas: bench, viewport });
        stop = () => task.cancel();
        try {
          await task.promise;
        } catch {
          return;
        }
        if (off || !canvas.current) return;
        canvas.current.width = bench.width;
        canvas.current.height = bench.height;
        canvas.current.getContext("2d")?.drawImage(bench, 0, 0);
      });
    }, 160);
    return () => {
      off = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [near, store, page, key, scale, queue, paper]);

  const box = pageBox(page);
  return (
    <span
      ref={holder}
      className="relative block overflow-hidden"
      style={{ width: size.w * scale, height: size.h * scale, background: paper ?? "#ffffff" }}
    >
      <span
        className="absolute left-0 top-0 block"
        style={{
          width: page.w,
          height: page.h,
          transformOrigin: "0 0",
          transform: shownCss(page, scale),
          clipPath: page.box
            ? `inset(${box.y}px ${page.w - box.x - box.w}px ${page.h - box.y - box.h}px ${box.x}px)`
            : undefined,
        }}
      >
        <canvas
          ref={canvas}
          aria-hidden
          className="absolute left-0 top-0 block"
          style={{ width: page.w, height: page.h }}
        />
        {near ? (
          <>
            {page.objects
              .filter((id) => !mixes(store.doc.objects[id]))
              .map((id) => (
                <ThumbObject key={id} store={store} id={id} />
              ))}
            <span className="absolute inset-0 block" style={{ mixBlendMode: "multiply" }}>
              {page.objects
                .filter((id) => mixes(store.doc.objects[id]))
                .map((id) => (
                  <ThumbObject key={id} store={store} id={id} />
                ))}
            </span>
            <DecorLayer store={store} page={page} index={index} count={count} />
          </>
        ) : null}
      </span>
    </span>
  );
}

const Tiny = ({
  label,
  onClick,
  children,
  danger,
  disabled,
  slot,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  slot?: string;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    data-slot={slot}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    onPointerDown={(event) => event.stopPropagation()}
    className={`grid h-7 w-7 place-items-center border-b border-line bg-panel text-ink last:border-b-0 disabled:opacity-30 ${danger ? "hover:bg-danger hover:text-white" : "hover:bg-ink hover:text-white"}`}
  >
    {children}
  </button>
);

/** Between two thumbnails: a page or a document can go right there. */
function Between({
  store,
  at,
  onAddFiles,
  children,
  className = "",
}: {
  store: EditorStore;
  at: number;
  onAddFiles: (at: number) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const key =
    "flex h-[26px] flex-1 items-center justify-center gap-1 border border-line-strong bg-panel text-[11.5px] font-medium leading-none hover:border-ink hover:bg-ink hover:text-white";
  return (
    <div data-between={at} className={`group/gap relative flex items-center ${className}`} style={{ width: WIDTH }}>
      {children}
      <div className="absolute inset-x-0 top-1/2 z-[2] flex -translate-y-1/2 gap-1 bg-canvas opacity-0 transition-opacity focus-within:opacity-100 group-hover/gap:opacity-100">
        <button
          type="button"
          data-sound="page"
          title="Add a blank page here"
          onClick={() => store.addBlank(at)}
          className={key}
        >
          <Plus size={12} aria-hidden />
          Page
        </button>
        <button
          type="button"
          title="Add a document here: PDF, Word, pictures and more"
          onClick={() => onAddFiles(at)}
          className={key}
        >
          <FilePlus2 size={12} aria-hidden />
          File
        </button>
      </div>
      {/* Fingers do not hover. */}
      <span className="ml-auto hidden [@media(hover:none)]:block">
        <Pop
          label="Add here"
          width={190}
          button={(open, toggle, ref) => (
            <button
              ref={ref}
              type="button"
              aria-label="Add here"
              aria-expanded={open}
              onClick={toggle}
              className="relative z-[3] grid h-8 w-8 place-items-center"
            >
              <Plus size={15} aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuRow
                label="Blank page"
                icon={<Plus size={16} aria-hidden />}
                sound="page"
                onClick={() => (store.addBlank(at), close())}
              />
              <MenuRow
                label="Document"
                icon={<FilePlus2 size={16} aria-hidden />}
                onClick={() => (onAddFiles(at), close())}
              />
            </>
          )}
        </Pop>
      </span>
    </div>
  );
}

const Thumb = memo(function Thumb({
  store,
  page,
  index: i,
  count,
  queue,
  lit,
  faded,
  onGrab,
  onPick,
  onAddFiles,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  queue: RenderQueue;
  lit: boolean;
  faded: boolean;
  onGrab: (event: ReactPointerEvent, id: string) => void;
  onPick: (id: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  onAddFiles: (at: number) => void;
}) {
  const active = useEditor(store, (s) => s.view.page === page.id);
  const marked = useEditor(store, (s) => s.view.marked.includes(page.id));
  const many = useEditor(store, (s) => s.view.marked.length > 1);
  return (
    <li data-thumb={page.id} className={`group relative ${faded ? "opacity-40" : ""}`}>
      {lit ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-[8px] z-[3] h-[3px] bg-accent" />
      ) : null}
      <div className="relative" style={{ width: WIDTH }}>
        <button
          type="button"
          aria-label={`Page ${i + 1}`}
          aria-current={active ? "page" : undefined}
          aria-pressed={many ? marked : undefined}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") onGrab(event, page.id);
          }}
          onClick={(event: ReactMouseEvent) => {
            // A mouse press was handled above; this is touch and the keyboard.
            if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === "touch")
              onPick(page.id, event);
          }}
          onKeyDown={(event) => {
            if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              store.movePages([page.id], event.key === "ArrowUp" ? i - 1 : i + 2);
            } else if (event.key === "Delete") {
              event.stopPropagation();
              store.deletePages(many && marked ? store.view.marked : [page.id]);
            } else if (event.key === " " && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onPick(page.id, event);
            }
          }}
          className={`relative block cursor-grab outline-offset-2 ${
            active || (many && marked)
              ? "shadow-[0_0_0_2px_#f2552c]"
              : "shadow-[0_0_0_1px_rgba(24,24,27,0.25)] hover:shadow-[0_0_0_2px_#1d1c1f]"
          }`}
        >
          <ThumbArt store={store} page={page} index={i} count={count} queue={queue} />
          {many && marked ? <span aria-hidden className="pointer-events-none absolute inset-0 bg-accent/25" /> : null}
        </button>
        <div
          className={`absolute right-0 top-0 flex flex-col border border-line-strong transition-opacity ${
            many ? "hidden" : active ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
          }`}
        >
          <Tiny label={`Turn page ${i + 1}`} onClick={() => store.rotatePages([page.id], 90)}>
            <RotateCw size={13} aria-hidden />
          </Tiny>
          <Tiny label={`Duplicate page ${i + 1}`} onClick={() => store.duplicatePages([page.id])}>
            <Copy size={13} aria-hidden />
          </Tiny>
          <Tiny
            label={`Delete page ${i + 1}`}
            danger
            disabled={count < 2}
            slot="page-remove"
            onClick={() => store.deletePages([page.id])}
          >
            <Trash2 size={13} aria-hidden />
          </Tiny>
        </div>
      </div>
      <Between store={store} at={i + 1} onAddFiles={onAddFiles} className="h-[42px]">
        <span
          className={`fb-num inline-block min-w-[22px] px-1.5 text-center text-[12.5px] leading-[20px] ${active ? "bg-accent-deep text-white" : "text-muted"}`}
        >
          {i + 1}
        </span>
        <span
          aria-hidden
          onPointerDown={(event) => onGrab(event, page.id)}
          className="relative z-[3] grid h-8 w-8 cursor-grab touch-none place-items-center text-muted [@media(hover:hover)]:hidden"
        >
          <GripVertical size={15} />
        </span>
      </Between>
    </li>
  );
});

/** Every page, small: pick one or several, drag them to reorder, or drop files between. */
export function PageRail({
  store,
  queue,
  onAddFiles,
  onDropFiles,
  onExtract,
  onClose,
  className = "",
}: {
  store: EditorStore;
  queue: RenderQueue;
  onAddFiles: (at: number) => void;
  onDropFiles: (files: File[], at: number) => void;
  /** Saves some pages as a PDF of their own. */
  onExtract: (ids: string[]) => void;
  onClose: () => void;
  className?: string;
}) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const current = useEditor(store, (s) => s.view.page);
  const marked = useEditor(store, (s) => s.view.marked);
  const list = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [dragged, setDragged] = useState<string[]>([]);

  // Follow the page being worked on.
  useEffect(() => {
    if (!current || dragged.length > 0) return;
    const node = list.current?.querySelector<HTMLElement>(`[data-thumb="${current}"]`);
    const box = list.current;
    if (!node || !box) return;
    const top = node.offsetTop - box.scrollTop;
    if (top < 20 || top + node.offsetHeight > box.clientHeight - 20)
      box.scrollTo({ top: node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2, behavior: "smooth" });
  }, [current, dragged]);

  const closing = useRef(onClose);
  closing.current = onClose;
  const anchor = useRef<string | null>(null);
  const pick = useCallback(
    (id: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
      const all = store.doc.pages;
      const { marked: now, page } = store.view;
      if (event.ctrlKey || event.metaKey) {
        const base = now.length > 0 ? now : page ? [page] : [];
        const next = base.includes(id) ? base.filter((one) => one !== id) : [...base, id];
        anchor.current = id;
        store.setView({ marked: next.length > 1 ? next : [], page: next.includes(id) ? id : (next[0] ?? id) });
        return;
      }
      if (event.shiftKey) {
        const from = all.findIndex((item) => item.id === (anchor.current ?? page));
        const to = all.findIndex((item) => item.id === id);
        if (from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          store.setView({ marked: b > a ? all.slice(a, b + 1).map((item) => item.id) : [] });
          return;
        }
      }
      anchor.current = id;
      if (now.length > 0) store.setView({ marked: [] });
      store.show(id);
      // Over the page on small screens: out of the way once a page is picked.
      if (window.matchMedia("(max-width: 1023px)").matches) closing.current();
    },
    [store],
  );

  const slotAt = useCallback((clientY: number) => {
    const nodes = [...(list.current?.querySelectorAll<HTMLElement>("[data-thumb]") ?? [])];
    const before = nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return before < 0 ? nodes.length : before;
  }, []);

  const startDrag = useCallback(
    (event: ReactPointerEvent, id: string) => {
      if (event.button !== 0) return;
      const from = event.clientY;
      const keys = { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey };
      let moving = false;
      let slot: number | null = null;
      let ids: string[] = [id];
      track(
        event,
        (next) => {
          if (!moving && Math.abs(next.clientY - from) < 6) return;
          if (!moving) {
            moving = true;
            const { marked: now } = store.view;
            ids = now.includes(id)
              ? store.doc.pages.filter((page) => now.includes(page.id)).map((page) => page.id)
              : [id];
            setDragged(ids);
          }
          const box = list.current?.getBoundingClientRect();
          if (box && list.current) {
            if (next.clientY < box.top + 46) list.current.scrollTop -= 14;
            if (next.clientY > box.bottom - 46) list.current.scrollTop += 14;
          }
          slot = slotAt(next.clientY);
          setDrop(slot);
        },
        (_, cancelled) => {
          setDragged([]);
          setDrop(null);
          if (!moving) {
            if (!cancelled) pick(id, keys);
            return;
          }
          if (slot !== null && !cancelled) store.movePages(ids, slot);
        },
      );
    },
    [pick, slotAt, store],
  );

  const carries = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");
  const many = marked.length > 1;
  const inOrder = () => store.doc.pages.filter((page) => marked.includes(page.id)).map((page) => page.id);

  return (
    <aside
      aria-label="Pages"
      className={`flex min-h-0 w-[164px] shrink-0 flex-col border-r border-line bg-canvas ${className}`}
      onDragOver={(event) => {
        if (!carries(event)) return;
        event.preventDefault();
        setDrop(slotAt(event.clientY));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files];
        const at = slotAt(event.clientY);
        setDrop(null);
        if (files.length === 0) return;
        event.preventDefault();
        onDropFiles(files, at);
      }}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 lg:hidden">
        <span className="text-[13.5px] font-medium">Pages</span>
        <button
          type="button"
          aria-label="Close pages"
          data-slot="viewer-close"
          onClick={onClose}
          className="grid h-11 w-11 place-items-center"
        >
          <X size={17} aria-hidden />
        </button>
      </div>
      <div ref={list} className="studio-main relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
        <Between store={store} at={0} onAddFiles={onAddFiles} className="h-[30px]" />
        <ol className="flex flex-col">
          {pages.map((page, i) => (
            <Thumb
              key={page.id}
              store={store}
              page={page}
              index={i}
              count={pages.length}
              queue={queue}
              lit={drop === i}
              faded={dragged.includes(page.id)}
              onGrab={startDrag}
              onPick={pick}
              onAddFiles={onAddFiles}
            />
          ))}
        </ol>
        <div className="relative h-1">
          {drop === pages.length ? <span aria-hidden className="absolute inset-x-0 -top-1 h-[3px] bg-accent" /> : null}
        </div>
      </div>
      {many ? (
        <div className="shrink-0 border-t border-ink bg-panel">
          <p className="flex items-center justify-between pl-3 text-[12.5px]">
            <span className="fb-num">{marked.length} pages</span>
            <button
              type="button"
              onClick={() => store.setView({ marked: [] })}
              className="h-9 px-3 text-muted hover:text-ink"
            >
              Clear
            </button>
          </p>
          <div className="grid grid-cols-4 border-t border-line">
            {(
              [
                ["Turn these pages", RotateCw, () => store.rotatePages(marked, 90)],
                ["Duplicate these pages", Copy, () => store.duplicatePages(inOrder())],
                ["Save these pages as a PDF", Download, () => onExtract(inOrder())],
                ["Delete these pages", Trash2, () => store.deletePages(marked)],
              ] as const
            ).map(([label, Icon, run]) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                onClick={run}
                className={`grid h-10 place-items-center border-l border-line first:border-l-0 ${label.startsWith("Delete") ? "hover:bg-danger hover:text-white" : "hover:bg-ink hover:text-white"}`}
              >
                <Icon size={15} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="shrink-0 border-t border-line">
        <Pop
          label="Add pages"
          width={220}
          button={(open, toggle, ref) => (
            <button
              ref={ref}
              type="button"
              aria-expanded={open}
              onClick={toggle}
              className="flex h-11 w-full items-center justify-center gap-2 text-[13.5px] font-medium hover:bg-ink hover:text-white"
            >
              <Plus size={16} aria-hidden />
              Add pages
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuRow
                label="Blank page"
                icon={<Plus size={16} aria-hidden />}
                sound="page"
                onClick={() => (store.addBlank(), close())}
              />
              <MenuRow
                label="Document"
                hint="PDF, Word…"
                icon={<FilePlus2 size={16} aria-hidden />}
                onClick={() => (onAddFiles(pages.length), close())}
              />
            </>
          )}
        </Pop>
      </div>
    </aside>
  );
}
