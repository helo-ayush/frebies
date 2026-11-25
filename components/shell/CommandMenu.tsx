"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToolGlyph, SearchGlyph, CloseGlyph } from "@/components/icons/NavGlyph";
import { Arrow } from "@/components/site/kit";
import { Seam, seamLabel } from "@/components/ui/Seam";
import { categories, tools, type Tool } from "@/lib/registry/tools";
import { searchTools } from "@/lib/search/tools";

type Row = { kind: "tool"; tool: Tool } | { kind: "page"; label: string; path: string };

const PAGES: Row[] = [
  { kind: "page", label: "All tools", path: "/dashboard" },
  ...categories.map((category): Row => ({ kind: "page", label: category.title, path: `/${category.slug}` })),
];

/** Ctrl K. Type the job, arrow to the tool, Enter to open it. */
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [...tools.map((tool): Row => ({ kind: "tool", tool })), ...PAGES];
    const ranked = searchTools(text, 12).map((tool): Row => ({ kind: "tool", tool }));
    const pages = PAGES.filter((page) => page.kind === "page" && page.label.toLowerCase().includes(text));
    return [...ranked, ...pages];
  }, [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(row: Row | undefined) {
    if (!row) return;
    onClose();
    router.push(row.kind === "tool" ? row.tool.path : row.path);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label="Search tools"
      className="command-overlay mx-auto mb-auto mt-[min(12vh,110px)] w-[min(680px,calc(100vw-24px))] overflow-hidden border-0 bg-panel p-0 text-ink shadow-pop"
    >
      <div className="flex h-16 items-stretch border-b border-line">
        <span className="grid w-16 shrink-0 place-items-center bg-accent-deep text-white">
          <SearchGlyph size={20} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(rows.length - 1, value + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(rows[active]);
            }
          }}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={rows.length > 0 ? `${listId}-${active}` : undefined}
          aria-label="Search tools or pages"
          placeholder="What needs doing?"
          className="h-full w-full bg-transparent px-5 text-[18px] font-medium outline-none placeholder:text-[#85848a] focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          data-slot="dialog-close"
          className="grid w-14 shrink-0 place-items-center text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <CloseGlyph size={18} />
        </button>
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="studio-rail max-h-[min(58vh,520px)] overflow-y-auto">
        {rows.map((row, index) => {
          const on = index === active;
          const key = row.kind === "tool" ? row.tool.path : `page-${row.path}`;
          return (
            <button
              key={key}
              id={`${listId}-${index}`}
              data-row={index}
              type="button"
              role="option"
              aria-selected={on}
              onPointerMove={() => setActive(index)}
              onClick={() => go(row)}
              className={`command-option flex w-full items-center gap-4 border-b border-line px-5 py-3 text-left last:border-b-0 ${
                on ? "bg-ink text-white" : ""
              }`}
            >
              {row.kind === "tool" ? (
                <>
                  <ToolGlyph path={row.tool.path} size={20} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{row.tool.name}</span>
                    <span className={`block truncate text-[13px] ${on ? "text-white/60" : "text-muted"}`}>{row.tool.tagline}</span>
                  </span>
                  <span className={`flex items-center gap-2 text-[12.5px] uppercase ${on ? "text-white/70" : "text-muted"}`}>
                    <Seam tool={row.tool} className={on && row.tool.tier === "credits" ? "!bg-white/70" : ""} />
                    {seamLabel(row.tool)}
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden className="grid w-5 place-items-center">
                    <span className={`h-2 w-2 ${on ? "bg-accent" : "bg-line-strong"}`} />
                  </span>
                  <span className="flex-1 text-[15px] font-semibold">{row.label}</span>
                  <Arrow />
                </>
              )}
            </button>
          );
        })}

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="fb-wide text-[20px]">No tool for that yet</p>
            <p className="mt-2 text-[14px] text-muted">Try a format, a file type or the job itself.</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px] uppercase text-faint max-sm:hidden">
        <span>Arrows to move, Enter to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}
