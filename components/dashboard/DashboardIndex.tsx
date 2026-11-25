"use client";

import Link from "next/link";
import { useState } from "react";
import { BlockStage } from "@/components/site/blocks";
import { Arrow, MaskLines, Sq } from "@/components/site/kit";
import { ToolSearch } from "@/components/site/ToolSearch";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { Seam, seamLabel } from "@/components/ui/Seam";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";

type Filter = "all" | "free" | "ai";

const FILTERS: { value: Filter; label: string; count: number }[] = [
  { value: "all", label: "All", count: tools.length },
  { value: "free", label: "Free", count: tools.filter((tool) => tool.tier === "free").length },
  { value: "ai", label: "AI credits", count: tools.filter((tool) => tool.tier === "credits").length },
];

const matches = (tool: Tool, filter: Filter) =>
  filter === "all" || (filter === "free" ? tool.tier === "free" : tool.tier === "credits");

/**
 * The whole toolbox on one screen: type the job, or pick from the index. The
 * blocks on the right follow whatever row you are on.
 */
export function DashboardIndex() {
  const [slug, setSlug] = useState<CategorySlug>("image");
  const [hovered, setHovered] = useState<Tool | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div className="flex min-h-[calc(100dvh-var(--fb-bar))] flex-col">
      <section className="grid border-b border-line lg:grid-cols-[minmax(0,1fr)_34%]">
        <div className="relative z-10 flex flex-col justify-between gap-7 px-[var(--fb-pad)] pt-[clamp(26px,4.4vh,52px)] max-lg:pb-7 lg:pb-0 lg:pr-0">
          <h1 className="sr-only">All tools</h1>
          <div aria-hidden>
            <MaskLines
              immediate
              className="fb-wide text-[clamp(34px,min(5.6vw,9vh),82px)]"
              lines={["What needs", "doing?"]}
            />
          </div>
          <ToolSearch drop="down" label="Search 17 tools" className="w-full max-w-[720px] border border-line-strong" />
          <span aria-hidden className="hidden lg:block lg:h-[clamp(10px,3vh,34px)]" />
        </div>
        <div className="fb-stage fb-corners relative hidden min-h-[clamp(240px,36vh,360px)] border-l border-line lg:block">
          <div className="absolute inset-0 p-5">
            <BlockStage slug={slug} hovered={hovered} onHover={setHovered} />
          </div>
        </div>
      </section>

      <section id="tools" className="flex flex-1 scroll-mt-[var(--fb-bar)] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-[var(--fb-pad)] py-3">
          <p className="flex items-center gap-3 text-[14px] uppercase text-muted">
            <Sq />
            {hovered ? hovered.tagline : "Pick a tool to open it"}
          </p>
          <div role="group" aria-label="Show" className="flex">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`-ml-px flex h-9 items-center gap-2 border border-line-strong px-3.5 text-[13px] uppercase transition-colors first:ml-0 ${
                  filter === option.value ? "relative z-[1] border-ink bg-ink text-white" : "hover:bg-hover"
                }`}
              >
                {option.label}
                <span className="opacity-55">{option.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid flex-1 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category, index) => (
            <div
              key={category.slug}
              onPointerEnter={() => setSlug(category.slug)}
              onFocus={() => setSlug(category.slug)}
              className={`flex flex-col border-line max-lg:border-b sm:max-lg:odd:border-r lg:border-l lg:first:border-l-0 ${
                index === 0 ? "bg-panel/60" : ""
              }`}
            >
              <Link
                href={`/${category.slug}`}
                className="group flex items-center justify-between px-[clamp(14px,1.15vw,24px)] pb-3.5 pt-5 transition-colors hover:text-accent-deep"
              >
                <span className="fb-wide text-[21px] lg:max-xl:text-[18px]">{category.name}</span>
                <span className="flex items-center gap-3 text-[13px] text-faint">
                  <span className="lg:max-xl:sr-only">[0{index + 1}]</span>
                  <Arrow />
                </span>
              </Link>
              <ul>
                {toolsForCategory(category.slug).map((tool) => {
                  const dim = !matches(tool, filter);
                  return (
                    <li key={tool.path} className="border-t border-line last:border-b">
                      <Link
                        href={tool.path}
                        onPointerEnter={() => setHovered(tool)}
                        onPointerLeave={() => setHovered(null)}
                        onFocus={() => setHovered(tool)}
                        onBlur={() => setHovered(null)}
                        className={`group flex h-[52px] items-center gap-3 px-[clamp(14px,1.15vw,24px)] lg:[@media(max-height:800px)]:h-[43px] text-[14.5px] 2xl:text-[15.5px] transition-colors hover:bg-ink hover:text-white focus-visible:bg-ink focus-visible:text-white ${
                          dim ? "opacity-30" : ""
                        }`}
                      >
                        <ToolGlyph path={tool.path} size={20} className="shrink-0 text-muted group-hover:text-accent group-focus-visible:text-accent lg:max-xl:hidden" />
                        <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-[12px] uppercase text-faint group-hover:text-white/65 group-focus-visible:text-white/65">
                          <span className="lg:max-xl:sr-only">{seamLabel(tool)}</span>
                          <Seam tool={tool} className={tool.tier === "credits" ? "group-hover:!bg-white/70" : ""} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
