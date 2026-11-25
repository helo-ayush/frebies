"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";

export type FilmItem = {
  id: string;
  name: string;
  src?: string | null;
  /** Corner note: a format or a saving. */
  badge?: ReactNode;
  /** This one has a finished result. */
  done?: boolean;
  /** Drawn while there is no picture yet. */
  placeholder?: ReactNode;
  title?: string;
};

/** Row of frames under the viewer: pick, remove and add files in a batch. */
export function Filmstrip({
  items,
  activeId,
  onSelect,
  onRemove,
  onAdd,
  label = "Files in this batch",
  addLabel = "Add more files",
  className = "",
}: {
  items: readonly FilmItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  label?: string;
  addLabel?: string;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);

  // Keep the chosen frame in sight without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const node = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !node) return;
    const start = node.offsetLeft;
    const end = start + node.offsetWidth;
    if (start < list.scrollLeft) list.scrollTo({ left: start, behavior: "smooth" });
    else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: end - list.clientWidth, behavior: "smooth" });
    }
  }, [activeId]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const at = items.findIndex((item) => item.id === activeId);
    const next = items[at + (event.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-frame="${CSS.escape(next.id)}"] [data-slot="queue-item"]`)
      ?.focus({ preventScroll: true });
  }

  return (
    <div className={`flex shrink-0 border-t border-line bg-panel ${className}`}>
      <ul
        ref={listRef}
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative flex min-w-0 flex-1 overflow-x-auto"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li
              key={item.id}
              data-frame={item.id}
              data-active={active}
              className="group relative h-[84px] w-[108px] shrink-0 border-r border-line"
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                data-slot="queue-item"
                aria-current={active ? "true" : undefined}
                aria-label={`Show ${item.name}`}
                title={item.title ?? item.name}
                className="fb-checker relative block h-full w-full overflow-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                {item.src ? (
                  <img
                    src={item.src}
                    alt=""
                    draggable={false}
                    className={`h-full w-full object-cover transition-opacity ${
                      active ? "" : "opacity-70 group-hover:opacity-100"
                    }`}
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-faint">{item.placeholder}</span>
                )}
                {active ? (
                  <span aria-hidden className="absolute inset-0 shadow-[inset_0_0_0_2px_#1d1c1f,inset_0_6px_0_#f2552c]" />
                ) : null}
                {item.badge ? (
                  <span className="fb-num absolute bottom-0 left-0 bg-ink px-1.5 py-[4px] text-[11px] font-semibold uppercase leading-none text-white">
                    {item.badge}
                  </span>
                ) : null}
                {item.done ? (
                  <span className="absolute bottom-0 right-0 grid h-[19px] w-[19px] place-items-center bg-accent-deep text-white">
                    <Check size={11} strokeWidth={3.2} aria-hidden />
                  </span>
                ) : null}
              </button>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.name}`}
                  data-slot="queue-remove"
                  className="absolute right-0 top-0 grid h-7 w-7 place-items-center bg-ink text-white opacity-0 transition hover:bg-accent-deep focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X size={13} aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="grid h-[84px] w-[84px] shrink-0 place-items-center border-l border-line bg-panel transition-colors hover:bg-ink hover:text-white"
        >
          <Plus size={20} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
