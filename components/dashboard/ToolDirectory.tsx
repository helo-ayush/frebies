"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { categories, tools, type CategorySlug } from "@/lib/registry/tools";
import { ToolCard } from "@/components/tools/ToolCard";

type Tier = "all" | "free" | "credits";

const TIERS: { value: Tier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "free", label: "Free" },
  { value: "credits", label: "AI" },
];

const pill = (active: boolean) =>
  `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors ${
    active ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-[#bdb6a8] hover:text-ink"
  }`;

/**
 * The tool grid: a search box, category pills and a Free / AI switch. With
 * `category` set it is scoped to one category and the pills are hidden.
 */
export function ToolDirectory({ category }: { category?: CategorySlug }) {
  const [tab, setTab] = useState<CategorySlug | "all">(category ?? "all");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier>("all");

  const visible = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tools.filter((tool) => {
      if (tab !== "all" && tool.category !== tab) return false;
      if (tier !== "all" && tool.tier !== tier) return false;
      if (tokens.length === 0) return true;
      const text = [tool.name, tool.description, tool.tagline, tool.category, ...tool.keywords, ...tool.limits.formats]
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [query, tab, tier]);

  const filtered = Boolean(query) || tier !== "all" || (!category && tab !== "all");

  function reset() {
    setQuery("");
    setTier("all");
    if (!category) setTab("all");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search tools</span>
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by tool, format or task…"
            className="h-12 w-full rounded-[14px] border border-line bg-white pl-11 pr-10 text-[15px] text-ink outline-none transition-colors placeholder:text-faint hover:border-[#cfc9bd] focus:border-ink"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear tool search"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-faint hover:bg-hover hover:text-ink"
            >
              <X size={15} />
            </button>
          )}
        </label>

        <div role="group" aria-label="Filter by price" className="flex h-12 items-center gap-1 rounded-[14px] bg-card p-1">
          {TIERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={tier === option.value}
              onClick={() => setTier(option.value)}
              className={`h-10 rounded-[11px] px-3.5 text-[13.5px] font-medium transition-colors ${
                tier === option.value
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.12)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!category && (
        <div role="group" aria-label="Filter tools by category" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")} className={pill(tab === "all")}>
            All tools
            <span className="tabular-nums opacity-60">{tools.length}</span>
          </button>
          {categories.map((item) => (
            <button
              key={item.slug}
              type="button"
              aria-pressed={tab === item.slug}
              onClick={() => setTab(item.slug)}
              className={pill(tab === item.slug)}
            >
              {item.name}
              <span className="tabular-nums opacity-60">
                {tools.filter((tool) => tool.category === item.slug).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[#d6d1c6] bg-white px-5 py-14 text-center">
          <p className="text-[16px] font-semibold text-ink">No tools match that</p>
          <p className="mt-1 text-[14px] text-muted">Try a format like “PDF” or a task like “compress”.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 h-10 rounded-[12px] border border-line bg-white px-4 text-[14px] font-medium text-ink hover:bg-hover"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((tool) => (
            <ToolCard key={tool.path} tool={tool} />
          ))}
        </div>
      )}

      {filtered && visible.length > 0 && (
        <p className="mt-4 text-[13px] text-faint">
          Showing {visible.length} of {tools.length} tools.{" "}
          <button type="button" onClick={reset} className="font-medium text-ink underline underline-offset-2">
            Show all
          </button>
        </p>
      )}
    </div>
  );
}
