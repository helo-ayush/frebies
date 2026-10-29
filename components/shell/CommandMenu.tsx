"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, LayoutGrid, Lock } from "lucide-react";
import { categories, getCategory, tools } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowRightGlyph,
  CloseGlyph,
  SearchGlyph,
  ToolGlyph,
} from "@/components/icons/NavGlyph";

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setQuery("");
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const normalized = query.trim().toLowerCase();

  const pageResults = useMemo(() => {
    const pages = [
      { label: "Home", path: "/dashboard" },
      ...categories.map((category) => ({ label: category.name, path: `/${category.slug}` })),
    ];
    if (!normalized) return pages;
    return pages.filter((page) => page.label.toLowerCase().includes(normalized));
  }, [normalized]);

  const toolResults = useMemo(() => {
    if (!normalized) return tools;
    return tools.filter((tool) =>
      [tool.name, tool.tagline, tool.category, ...tool.keywords]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [normalized]);

  function go(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label="Search tools"
      className="m-auto w-[min(600px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.16)]"
    >
      <div className="group flex items-center gap-2.5 border-b border-line-soft bg-[linear-gradient(180deg,#ffffff_0%,#fdfdfc_100%)] px-4 transition-colors focus-within:border-[#dcd7ce]">
        <SearchGlyph
          size={18}
          className="shrink-0 text-faint transition-colors group-focus-within:text-ink"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every tool…"
          aria-label="Search tools or pages"
          className="h-14 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <CloseGlyph size={16} />
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2">
        {pageResults.length > 0 && (
          <div>
            <p className="px-2 py-1.5 text-micro font-medium text-faint">Pages</p>
            {pageResults.map((page) => {
              const PageIcon =
                page.path === "/dashboard"
                  ? Home
                  : getCategory(page.path.slice(1))?.icon ?? LayoutGrid;

              return (
                <button
                  key={page.path}
                  type="button"
                  onClick={() => go(page.path)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-rail">
                    <PageIcon size={14} className="text-ink" aria-hidden />
                  </span>
                  <span className="text-ui font-medium">{page.label}</span>
                  <ArrowRightGlyph size={13} className="ml-auto text-faint" />
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-2 py-1.5 text-micro font-medium text-faint">Tools</p>

        {toolResults.map((tool) => {
          return (
            <button
              key={tool.path}
              type="button"
              onClick={() => go(tool.path)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-rail text-[#686864]">
                <ToolGlyph path={tool.path} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-ui font-medium">
                  {tool.name}
                  {tool.tier === "credits" && (
                    <Lock size={10} className="text-faint" aria-hidden />
                  )}
                </span>
                <span className="block truncate text-micro text-faint">{tool.tagline}</span>
              </span>
              {tool.status === "soon" ? (
                <Badge tone="soon">Preview</Badge>
              ) : (
                <ArrowRightGlyph size={14} className="shrink-0 text-faint" />
              )}
            </button>
          );
        })}

        {toolResults.length === 0 && pageResults.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-ink">No matching tools</p>
            <p className="mt-1 text-ui text-faint">Try a format, file type or task.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line-soft bg-rail px-4 py-2.5 text-micro text-faint">
        <span>{tools.length} tool workspaces</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}
