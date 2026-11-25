"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { tools, type Tool } from "@/lib/registry/tools";

const HAYSTACK = new Map<string, string>(
  tools.map((tool) => [
    tool.path,
    [tool.name, tool.shortName, tool.tagline, tool.category, ...tool.keywords, ...tool.limits.formats]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  ]),
);

/** Ranks tools for a free-text query such as "jpg to png" or "trim mp3". */
export function searchTools(query: string, limit = 5): Tool[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && token !== "to" && token !== "a" && token !== "the");
  if (tokens.length === 0) return [];

  return tools
    .map((tool) => {
      const text = HAYSTACK.get(tool.path) ?? "";
      const name = tool.name.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 6;
        else if (text.includes(token)) score += 2;
      }
      if (text.includes(tokens.join(" "))) score += 5;
      if (tool.status === "live") score += 0.5;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tool);
}

const PLACEHOLDERS = [
  "compress an image to 100 KB",
  "merge PDF files",
  "HEIC to JPG",
  "trim an MP3",
  "PDF to JPG",
  "resize to 1080 × 1080",
];

/**
 * The landing page's front door: type the job, press Enter, land in the tool.
 */
export function ToolSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState(0);

  const results = useMemo(() => searchTools(query), [query]);
  const open = focused && query.trim().length > 0;

  useEffect(() => setActive(0), [query]);

  // Rotate the example in the placeholder while the box is idle.
  useEffect(() => {
    if (query || focused) return;
    const timer = window.setInterval(() => setHint((value) => (value + 1) % PLACEHOLDERS.length), 2600);
    return () => window.clearInterval(timer);
  }, [query, focused]);

  // "/" focuses the search from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(tool: Tool | undefined) {
    if (tool) router.push(tool.path);
    else if (query.trim()) router.push("/dashboard#tools");
  }

  return (
    <div className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(results[active]);
        }}
        className={`flex h-[62px] items-center gap-3 rounded-[20px] border bg-white pl-5 pr-2 shadow-[0_24px_60px_-28px_rgba(15,15,16,0.35)] transition-[border-color,box-shadow] duration-200 ${
          focused ? "border-ink shadow-[0_24px_60px_-22px_rgba(229,94,64,0.35)]" : "border-line"
        }`}
      >
        <Search size={20} className="shrink-0 text-faint" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(results.length - 1, value + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="What do you need to do?"
          placeholder={`Try “${PLACEHOLDERS[hint]}”`}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <kbd className="hidden rounded-md border border-line bg-card px-1.5 py-0.5 text-[12px] text-faint sm:block">
          /
        </kbd>
        <button
          type="submit"
          className="inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[14.5px] font-semibold text-white transition-colors hover:bg-[#2a2a2b]"
        >
          <span className="hidden sm:inline">Open tool</span>
          <ArrowRight size={16} aria-hidden />
        </button>
      </form>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[18px] border border-line bg-white p-1.5 text-left shadow-pop"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-[14px] text-muted">
              No tool for that yet.{" "}
              <Link href="/dashboard#tools" className="font-medium text-ink underline underline-offset-2">
                Browse all {tools.length} tools
              </Link>
            </p>
          ) : (
            results.map((tool, index) => (
              <button
                key={tool.path}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(tool)}
                className={`flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors ${
                  index === active ? "bg-card" : ""
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-ink text-white">
                  <ToolGlyph path={tool.path} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold text-ink">{tool.name}</span>
                  <span className="block truncate text-[13px] text-muted">{tool.tagline}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    tool.tier === "free" ? "bg-success-soft text-success" : "bg-accent-soft text-accent-deep"
                  }`}
                >
                  {tool.tier === "free" ? "Free" : `${tool.creditCost} cr`}
                </span>
                {index === active && <CornerDownLeft size={15} className="shrink-0 text-faint" aria-hidden />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
