"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { categories, tools, type CategorySlug } from "@/lib/registry/tools";
import { ToolCard, ToolRow } from "@/components/tools/ToolCard";

const tabs = [
  { id: "all", label: "All tools" },
  ...categories.map((category) => ({ id: category.slug, label: category.name })),
];

const tiers = [
  ["all", "All access", "All"],
  ["free", "Free", "Free"],
  ["credits", "AI credits", "AI"],
] as const;

type Tier = (typeof tiers)[number][0];

const views = [
  ["list", List, "List view"],
  ["grid", LayoutGrid, "Grid view"],
] as const;

export function ToolDirectory({ category }: { category?: CategorySlug }) {
  const [tab, setTab] = useState<CategorySlug | "all">(category ?? "all");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier>("all");
  const [sort, setSort] = useState<"featured" | "name">("featured");
  const [view, setView] = useState<"list" | "grid">("list");

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

  const filtered = query || tier !== "all" || sort !== "featured";

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
                <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className={`${category ? "" : "mt-4"} flex gap-2`}>
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
            className="h-10 w-full rounded-[10px] border border-line bg-white pl-9 pr-9 text-ui text-ink outline-none transition-colors placeholder:text-faint hover:border-[#d8d8d5] focus:border-[#bdbdb9]"
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

        <div
          role="group"
          aria-label="Choose view"
          className="flex h-10 shrink-0 items-center gap-0.5 rounded-[10px] border border-line p-0.5"
        >
          {views.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                view === id ? "bg-active text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Icon size={15} aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tiers.map(([id, label, shortLabel]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTier(id)}
            aria-pressed={tier === id}
            aria-label={label}
            className={`h-8 rounded-lg border px-3 text-ui font-medium transition-colors ${
              tier === id
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-muted hover:bg-hover hover:text-ink"
            }`}
          >
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <label className="ml-auto flex items-center gap-2 text-micro text-faint">
          <span className="hidden sm:inline">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "featured" | "name")}
            className="h-8 rounded-lg border border-line bg-white px-2 text-ui font-medium text-ink outline-none hover:border-[#d8d8d5]"
          >
            <option value="featured">Recommended</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between text-micro text-faint">
        <span>
          {visible.length} {visible.length === 1 ? "tool" : "tools"}
        </span>
        {filtered && (
          <button type="button" onClick={clearFilters} className="font-medium text-muted hover:text-ink">
            Reset filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line px-5 py-14 text-center">
          <p className="text-sm font-medium text-ink">No tools match those filters</p>
          <p className="mt-1 text-ui text-muted">Try another search or show all access types.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 h-8 rounded-lg border border-line bg-white px-3 text-ui font-medium hover:bg-hover"
          >
            Clear filters
          </button>
        </div>
      ) : view === "list" ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_16px] gap-4 border-b border-line-soft px-4 py-2.5 text-micro text-faint sm:grid">
            <span>Tool</span>
            <span>Type</span>
            <span>Access</span>
            <span />
          </div>
          <div className="divide-y divide-line-soft">
            {visible.map((tool) => (
              <ToolRow key={tool.path} tool={tool} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((tool) => (
            <ToolCard key={tool.path} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
