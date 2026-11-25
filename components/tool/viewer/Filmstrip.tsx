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
    const start = node.offsetLeft - 16;
    const end = node.offsetLeft + node.offsetWidth + 16;
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
    <div className={`flex shrink-0 items-stretch border-t border-line bg-panel ${className}`}>
      <ul
        ref={listRef}
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative flex min-w-0 flex-1 gap-3 overflow-x-auto px-3 pb-2 pt-3 sm:gap-3.5 sm:px-4"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} data-frame={item.id} data-active={active} className="group relative w-[84px] shrink-0 sm:w-[96px]">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                data-slot="queue-item"
                aria-current={active ? "true" : undefined}
                aria-label={`Show ${item.name}`}
                title={item.title ?? item.name}
                className="block w-full focus-visible:outline-none"
              >
                <span
                  className={`fb-checker relative block h-[56px] w-full overflow-hidden transition-shadow group-focus-within:ring-2 group-focus-within:ring-accent group-focus-within:ring-offset-2 group-focus-within:ring-offset-panel ${
                    active
                      ? "shadow-[0_0_0_2px_#f4f4f1,0_0_0_4px_#1d1c1f]"
                      : "shadow-[0_0_0_1px_#cfcfcb] group-hover:shadow-[0_0_0_1px_#1d1c1f]"
                  }`}
                >
                  {item.src ? (
                    <img src={item.src} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-faint">{item.placeholder}</span>
                  )}
                </span>
                <span
                  className={`fb-num mt-2 flex h-4 items-center gap-1.5 text-[12px] leading-none ${
                    active ? "font-semibold text-ink" : "text-faint"
                  }`}
                >
                  <span className="truncate">{item.badge}</span>
                  {item.done ? <Check size={12} strokeWidth={2.6} className="ml-auto shrink-0 text-accent-deep" aria-label="Done" /> : null}
                </span>
              </button>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.name}`}
                  data-slot="queue-remove"
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center bg-ink text-white opacity-0 transition hover:bg-accent-deep focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X size={12} aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {onAdd ? (
        <div className="shrink-0 border-l border-line px-3 pt-3 sm:px-4">
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel}
            title={addLabel}
            className="grid h-[56px] w-[56px] place-items-center border border-dashed border-line-strong text-muted transition-colors hover:border-solid hover:border-ink hover:bg-ink hover:text-white sm:w-[72px]"
          >
            <Plus size={19} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
