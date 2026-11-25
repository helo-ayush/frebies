"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Copy, FilePlus2, GripVertical, Plus, RotateCw, Trash2, X } from "lucide-react";
import { ObjectArt, placeCss } from "./Art";
import { track } from "./interact";
import { mixes, shownSize, type EditObject, type Page } from "./model";
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

function ThumbArt({ store, page, queue }: { store: EditorStore; page: Page; queue: RenderQueue }) {
  const holder = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const key = useEditor(store, (s) => s.backdropKey(page));
  const size = shownSize(page);
  const scale = Math.min(WIDTH / size.w, HEIGHT / size.h);

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
        const task = item.page.render({ canvas: bench, viewport });
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
  }, [near, store, page, key, scale, queue]);

  const turned =
    page.rotate === 90
      ? `translate(${page.h * scale}px, 0) rotate(90deg) `
      : page.rotate === 180
        ? `translate(${page.w * scale}px, ${page.h * scale}px) rotate(180deg) `
        : page.rotate === 270
          ? `translate(0, ${page.w * scale}px) rotate(270deg) `
          : "";
  return (
    <span
      ref={holder}
      className="relative block overflow-hidden bg-white"
      style={{ width: size.w * scale, height: size.h * scale }}
    >
      <span
        className="absolute left-0 top-0 block"
        style={{ width: page.w, height: page.h, transformOrigin: "0 0", transform: `${turned}scale(${scale})` }}
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
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  queue: RenderQueue;
  lit: boolean;
  faded: boolean;
  onGrab: (event: ReactPointerEvent, id: string) => void;
  onPick: (id: string) => void;
}) {
  const active = useEditor(store, (s) => s.view.page === page.id);
  return (
    <li data-thumb={page.id} className={`group relative ${faded ? "opacity-40" : ""}`}>
      {lit ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-[10px] h-[3px] bg-accent" />
      ) : null}
      <button
        type="button"
        aria-label={`Page ${i + 1}`}
        aria-current={active ? "page" : undefined}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") onGrab(event, page.id);
        }}
        onClick={(event) => {
          // A mouse press was handled above; this is touch and the keyboard.
          if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === "touch") onPick(page.id);
        }}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            store.movePage(page.id, event.key === "ArrowUp" ? i - 1 : i + 2);
          } else if (event.key === "Delete") store.deletePages([page.id]);
        }}
        className={`block cursor-grab outline-offset-2 ${active ? "shadow-[0_0_0_2px_#f2552c]" : "shadow-[0_0_0_1px_rgba(24,24,27,0.25)] hover:shadow-[0_0_0_2px_#1d1c1f]"}`}
      >
        <ThumbArt store={store} page={page} queue={queue} />
      </button>
      <div className="mt-1.5 flex items-center justify-between" style={{ width: WIDTH }}>
        <span
          className={`fb-num inline-block min-w-[22px] px-1.5 text-center text-[12.5px] leading-[20px] ${active ? "bg-accent-deep text-white" : "text-muted"}`}
        >
          {i + 1}
        </span>
        <span
          aria-hidden
          onPointerDown={(event) => onGrab(event, page.id)}
          className="grid h-7 w-8 cursor-grab touch-none place-items-center text-muted [@media(hover:hover)]:hidden"
        >
          <GripVertical size={15} />
        </span>
      </div>
      <div
        className={`absolute right-0 top-0 flex flex-col border border-line-strong transition-opacity ${active ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"}`}
      >
        <Tiny label={`Turn page ${i + 1}`} onClick={() => store.rotatePage(page.id, 90)}>
          <RotateCw size={13} aria-hidden />
        </Tiny>
        <Tiny label={`Duplicate page ${i + 1}`} onClick={() => store.duplicatePage(page.id)}>
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
    </li>
  );
});

/** Every page, small: pick one, drag it to reorder, or drop files between. */
export function PageRail({
  store,
  queue,
  onAddFiles,
  onDropFiles,
  onClose,
  className = "",
}: {
  store: EditorStore;
  queue: RenderQueue;
  onAddFiles: (at: number) => void;
  onDropFiles: (files: File[], at: number) => void;
  onClose: () => void;
  className?: string;
}) {
  const pages = useEditor(store, (s) => s.doc.pages);
  const current = useEditor(store, (s) => s.view.page);
  const list = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);

  // Follow the page being worked on.
  useEffect(() => {
    if (!current || dragged) return;
    const node = list.current?.querySelector<HTMLElement>(`[data-thumb="${current}"]`);
    const box = list.current;
    if (!node || !box) return;
    const top = node.offsetTop - box.scrollTop;
    if (top < 20 || top + node.offsetHeight > box.clientHeight - 20)
      box.scrollTo({ top: node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2, behavior: "smooth" });
  }, [current, dragged]);

  const closing = useRef(onClose);
  closing.current = onClose;
  const pick = useCallback(
    (id: string) => {
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
      let moving = false;
      let slot: number | null = null;
      track(
        event,
        (next) => {
          if (!moving && Math.abs(next.clientY - from) < 6) return;
          if (!moving) {
            moving = true;
            setDragged(id);
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
          setDragged(null);
          setDrop(null);
          if (!moving) {
            if (!cancelled) pick(id);
            return;
          }
          if (slot !== null && !cancelled) store.movePage(id, slot);
        },
      );
    },
    [pick, slotAt, store],
  );

  const carries = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

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
      <div ref={list} className="studio-main relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <ol className="flex flex-col gap-4">
          {pages.map((page, i) => (
            <Thumb
              key={page.id}
              store={store}
              page={page}
              index={i}
              count={pages.length}
              queue={queue}
              lit={drop === i}
              faded={dragged === page.id}
              onGrab={startDrag}
              onPick={pick}
            />
          ))}
        </ol>
        <div className="relative h-1">
          {drop === pages.length ? <span aria-hidden className="absolute inset-x-0 top-2 h-[3px] bg-accent" /> : null}
        </div>
      </div>
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
                label="PDF or pictures"
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
