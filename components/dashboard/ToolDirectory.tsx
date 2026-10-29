"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import { categories, tools, type CategorySlug } from "@/lib/registry/tools";
import { ToolCard } from "@/components/tools/ToolCard";

const tabs = [
  { id: "all", label: "All tools" },
  ...categories.map((category) => ({ id: category.slug, label: category.name })),
];

export function ToolDirectory({ category }: { category?: CategorySlug }) {
  const [tab, setTab] = useState<CategorySlug | "all">(category ?? "all");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"all" | "free" | "credits">("all");
  const [sort, setSort] = useState<"featured" | "name">("featured");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = tools.filter((tool) => {
      if (tab !== "all" && tool.category !== tab) return false;
      if (tier !== "all" && tool.tier !== tier) return false;
      if (
        normalized &&
        ![tool.name, tool.description, tool.tagline, ...tool.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      ) {
        return false;
      }
      return true;
    });

    return sort === "name"
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      : filtered;
  }, [query, sort, tab, tier]);

  function clearFilters() {
    setQuery("");
    setTier("all");
    setSort("featured");
  }

  return (
    <div>
      {!category && (
        <div
          role="group"
          aria-label="Filter tools by category"
          className="flex items-center gap-1 overflow-x-auto border-b border-line"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as CategorySlug | "all")}
              aria-pressed={tab === item.id}
              className={`relative shrink-0 px-3 py-2.5 text-ui font-medium transition-colors ${
                tab === item.id ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {item.label}
              {tab === item.id && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink"
                />
              )}
            </button>
          ))}
        </div>
      )}

      <div className={`${category ? "" : "mt-4"} flex flex-col gap-2 md:flex-row`}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search tools</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by tool, format or task…"
            className="h-10 w-full rounded-[10px] border border-line bg-white pl-9 pr-9 text-ui text-ink outline-none transition-colors placeholder:text-faint hover:border-[#d8d8d5] focus:border-[#bbbbb7]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear tool search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-faint hover:bg-hover hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <div className="flex gap-2">
          <label className="relative flex-1 md:flex-none">
            <span className="sr-only">Filter by price</span>
            <SlidersHorizontal
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <select
              value={tier}
              onChange={(event) => setTier(event.target.value as "all" | "free" | "credits")}
              className="h-10 w-full appearance-none rounded-[10px] border border-line bg-white pl-9 pr-8 text-ui font-medium text-ink outline-none hover:border-[#d8d8d5] md:w-[132px]"
            >
              <option value="all">All access</option>
              <option value="free">Free</option>
              <option value="credits">AI credits</option>
            </select>
          </label>

          <label className="relative flex-1 md:flex-none">
            <span className="sr-only">Sort tools</span>
            <ArrowDownUp
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "featured" | "name")}
              className="h-10 w-full appearance-none rounded-[10px] border border-line bg-white pl-9 pr-8 text-ui font-medium text-ink outline-none hover:border-[#d8d8d5] md:w-[140px]"
            >
              <option value="featured">Recommended</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-micro text-faint">
        <span>
          {visible.length} {visible.length === 1 ? "tool" : "tools"}
        </span>
        {(query || tier !== "all" || sort !== "featured") && (
          <button type="button" onClick={clearFilters} className="font-medium text-muted hover:text-ink">
            Reset filters
          </button>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((tool) => (
            <ToolCard key={tool.path} tool={tool} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-[14px] border border-dashed border-line bg-rail px-5 py-14 text-center">
          <p className="text-sm font-medium text-ink">No tools match those filters</p>
          <p className="mt-1 text-ui text-muted">Try another search or show all access types.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 rounded-lg border border-line bg-white px-3 py-2 text-ui font-medium hover:bg-hover"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
