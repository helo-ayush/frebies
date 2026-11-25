"use client";

import Link from "next/link";
import { useState } from "react";
import { BlockStage } from "@/components/site/blocks";
import { MaskLines, Sq } from "@/components/site/kit";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { Seam, seamLabel } from "@/components/ui/Seam";
import { categories, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";

/** A category on one screen: its blocks on the stage, its tools in the panel. */
export function CategoryIndex({
  slug,
  title,
  description,
}: {
  slug: CategorySlug;
  title: string;
  description: string;
}) {
  const [hovered, setHovered] = useState<Tool | null>(null);
  const list = toolsForCategory(slug);
  const number = categories.findIndex((category) => category.slug === slug) + 1;
  const free = list.filter((tool) => tool.tier === "free").length;

  return (
    <section
      aria-label={title}
      className="grid grid-cols-1 border-b border-line lg:min-h-[calc(100dvh-var(--fb-bar))] lg:grid-cols-[minmax(0,1fr)_minmax(340px,32%)]"
    >
      <div className="relative flex flex-col max-lg:order-2">
        <div className="fb-stage fb-corners relative h-[86vw] max-h-[520px] lg:h-auto lg:max-h-none lg:flex-1">
          <div className="absolute inset-0 p-4 lg:p-[clamp(16px,4vh,48px)]">
            <BlockStage slug={slug} hovered={hovered} onHover={setHovered} />
          </div>
        </div>
      </div>

      <div className="flex flex-col border-line bg-panel max-lg:order-1 lg:border-l">
        <div className="px-[clamp(18px,2.2vw,36px)] pb-7 pt-[clamp(22px,4vh,44px)]">
          <p className="flex items-center justify-between text-[13px] uppercase text-faint">
            <span className="flex items-center gap-3">
              <Sq />[0{number} // {slug}]
            </span>
            <span>
              {list.length} {list.length === 1 ? "tool" : "tools"}
              {free > 0 ? `, ${free} free` : ""}
            </span>
          </p>
          <MaskLines
            immediate
            as="h1"
            className="fb-wide mt-6 text-[clamp(30px,3.1vw,50px)]"
            lines={title.split(" ")}
          />
          <p className="mt-5 max-w-[420px] text-[15.5px] leading-[1.5] text-muted">{description}</p>
        </div>

        <ul className="border-t border-line">
          {list.map((tool) => (
            <li key={tool.path} className="border-b border-line">
              <Link
                href={tool.path}
                onPointerEnter={() => setHovered(tool)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(tool)}
                onBlur={() => setHovered(null)}
                className={`group flex min-h-[64px] items-center gap-4 px-[clamp(18px,2.2vw,36px)] py-3 transition-colors hover:bg-ink hover:text-white focus-visible:bg-ink focus-visible:text-white ${
                  hovered?.path === tool.path ? "bg-ink text-white" : ""
                }`}
              >
                <ToolGlyph
                  path={tool.path}
                  size={22}
                  className={`shrink-0 group-hover:text-accent ${hovered?.path === tool.path ? "text-accent" : "text-muted"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{tool.name}</span>
                  <span
                    className={`block truncate text-[13.5px] group-hover:text-white/60 ${
                      hovered?.path === tool.path ? "text-white/60" : "text-muted"
                    }`}
                  >
                    {tool.tagline}
                  </span>
                </span>
                <span
                  className={`flex items-center gap-2 text-[12.5px] uppercase group-hover:text-white/65 ${
                    hovered?.path === tool.path ? "text-white/65" : "text-faint"
                  }`}
                >
                  {seamLabel(tool)}
                  <Seam
                    tool={tool}
                    className={
                      tool.tier === "credits" ? (hovered?.path === tool.path ? "!bg-white/70" : "group-hover:!bg-white/70") : ""
                    }
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
