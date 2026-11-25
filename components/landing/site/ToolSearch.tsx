"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { tools, type Tool } from "@/lib/registry/tools";
import { Arrow } from "./kit";

const HAYSTACK = new Map<string, string>(
  tools.map((tool) => [
    tool.path,
    [tool.name, tool.shortName, tool.tagline, tool.category, ...tool.keywords, ...tool.limits.formats]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  ]),
);

const STOP = new Set(["to", "a", "an", "the", "my", "into", "file"]);

/** Ranks tools for a free-text query such as "jpg to png" or "trim mp3". */
export function searchTools(query: string, limit = 5): Tool[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOP.has(token));
  if (tokens.length === 0) return [];

  return tools
    .map((tool) => {
      const text = HAYSTACK.get(tool.path) ?? "";
      const name = tool.name.toLowerCase();
      let score = 0;
      let hits = 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 6;
        else if (text.includes(token)) score += 2;
        else continue;
        hits += 1;
      }
      // Someone typing "heic to jpg" wants the tool that covers both words.
      score *= hits / tokens.length;
      if (text.includes(query.trim().toLowerCase())) score += 8;
      if (tool.status === "live") score += 0.5;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tool);
}

const PLACEHOLDERS = ["Compress to 100 KB", "Merge PDFs", "HEIC to JPG", "Trim an MP3", "PDF to JPG"];

/** Type the job, press Enter, land in the tool. `drop` picks which way results open. */
export function ToolSearch({
  drop = "up",
  className = "",
  hotkey = false,
}: {
  drop?: "up" | "down";
  className?: string;
  /** Only one instance per page should answer "/". */
  hotkey?: boolean;
}) {
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

  useEffect(() => {
    if (query || focused) return;
    const timer = window.setInterval(() => setHint((value) => (value + 1) % PLACEHOLDERS.length), 2600);
    return () => window.clearInterval(timer);
  }, [query, focused]);

  useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkey]);

  function go(tool: Tool | undefined) {
    if (tool) router.push(tool.path);
    else if (query.trim()) router.push("/dashboard#tools");
    else inputRef.current?.focus();
  }

  return (
    <div className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(results[active]);
        }}
        className="flex h-full min-h-[76px] items-stretch bg-[var(--lp-panel)]"
      >
        <button
          type="submit"
          aria-label="Open tool"
          className="group grid w-[76px] shrink-0 place-items-center bg-[var(--lp-coral)] text-white transition-colors hover:bg-[var(--lp-ink)] lg:w-[92px]"
        >
          <span className="transition-transform duration-300 group-hover:translate-x-1">
            <Arrow size={20} />
          </span>
        </button>
        <label className="flex min-w-0 flex-1 flex-col justify-center px-5">
          <span className="lp-label !text-[12px]">What needs doing?</span>
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
            placeholder={PLACEHOLDERS[hint]}
            className="mt-0.5 w-full bg-transparent text-[17px] font-medium text-[var(--lp-ink)] outline-none placeholder:text-[#8d8c90] focus-visible:outline-none"
          />
        </label>
      </form>

      {open && (
        <div
          id={listId}
          role="listbox"
          className={`absolute inset-x-0 z-40 border border-[var(--lp-line)] bg-[var(--lp-panel)] ${
            drop === "up" ? "bottom-full" : "top-full"
          }`}
        >
          {results.length === 0 ? (
            <p className="px-5 py-5 text-[15px] text-[var(--lp-muted)]">
              No tool for that yet.{" "}
              <Link href="/dashboard#tools" className="font-semibold text-[var(--lp-ink)] underline underline-offset-4">
                See all {tools.length}
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
                className={`flex w-full items-center gap-3.5 border-b border-[var(--lp-line)] px-5 py-3 text-left last:border-b-0 ${
                  index === active ? "bg-[var(--lp-ink)] text-white" : ""
                }`}
              >
                <ToolGlyph path={tool.path} size={20} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{tool.name}</span>
                  <span className={`block truncate text-[13px] ${index === active ? "text-white/60" : "text-[var(--lp-muted)]"}`}>
                    {tool.tagline}
                  </span>
                </span>
                <span className={`lp-label !text-[12px] ${index === active ? "!text-white/70" : ""}`}>
                  {tool.status === "soon"
                    ? "Preview"
                    : tool.tier === "free"
                      ? "Free"
                      : `${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
