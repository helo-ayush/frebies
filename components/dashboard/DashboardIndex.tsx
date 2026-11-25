"use client";

import Link from "next/link";
import { useState } from "react";
import { BlockStage, IsoBlock } from "@/components/site/blocks";
import { Arrow, MaskLines, useMedia } from "@/components/site/kit";
import { ToolSearch } from "@/components/site/ToolSearch";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { seamColor, seamLabel } from "@/components/ui/Seam";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";

type Filter = "all" | "free" | "ai";

const FILTERS: { value: Filter; label: string; count: number }[] = [
  { value: "all", label: "All", count: tools.length },
  { value: "free", label: "Free", count: tools.filter((tool) => tool.tier === "free").length },
  { value: "ai", label: "AI credits", count: tools.filter((tool) => tool.tier === "credits").length },
];

const matches = (tool: Tool, filter: Filter) =>
  filter === "all" || (filter === "free" ? tool.tier === "free" : tool.tier === "credits");

/** What each card says. Short enough to fit without being cut. */
const LINE: Record<string, string> = {
  "/image/convert": "JPG, PNG, WebP, HEIC and more",
  "/image/compress": "Hit an exact file size",
  "/image/resize": "Exact pixels, or crop to a shape",
  "/image/to-pdf": "Photos into one clean PDF",
  "/image/upscaler": "2× or 4× larger, still sharp",
  "/image/remove-background": "Lift the subject off the photo",
  "/document/merge-pdf": "Several PDFs into one",
  "/document/split-pdf": "Pull out pages or ranges",
  "/document/pdf-to-jpg": "Pages as JPG, PNG or WebP",
  "/document/ocr": "Scans into text you can copy",
  "/document/ai-editor": "Describe the edit you want",
  "/audio/convert": "MP3, WAV, M4A and OGG",
  "/audio/trim": "Cut to the exact moment",
  "/audio/text-to-speech": "Natural voices from your script",
  "/audio/speech-to-text": "Recordings into a transcript",
  "/audio/vocal-remover": "Vocals and music, pulled apart",
  "/video/dubbing": "Your video in a new language",
};

/** Three shelves of six: video has one tool, so it stands with audio. */
const SHELVES: CategorySlug[][] = [["image"], ["document"], ["audio", "video"]];

/**
 * The whole toolbox on one screen: type the job, or take a card. The block on
 * the right follows whatever card you are on.
 */
export function DashboardIndex() {
  const [slug, setSlug] = useState<CategorySlug>("image");
  const [hovered, setHovered] = useState<Tool | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Short windows give the height to the cards and keep one block as the picture.
  const tall = useMedia("(min-height: 900px)");

  const hover = (tool: Tool | null) => {
    setHovered(tool);
    if (tool) setSlug(tool.category);
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--fb-bar))] flex-col">
      <section className="grid border-b border-line lg:grid-cols-[minmax(0,1fr)_clamp(220px,25%,400px)]">
        <div className="relative z-10 flex flex-col justify-center gap-[clamp(18px,2.7vh,32px)] px-[var(--fb-pad)] py-[clamp(24px,3.6vh,52px)]">
          <h1 className="sr-only">All tools</h1>
          <div aria-hidden>
            <MaskLines
              immediate
              className="fb-wide text-[clamp(36px,10.4vw,60px)] sm:hidden"
              lines={["What needs", "doing?"]}
            />
            <MaskLines
              immediate
              className="fb-wide text-[clamp(32px,min(3.4vw,7.4vh),76px)] max-sm:hidden"
              lines={["What needs doing?"]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
            <ToolSearch
              drop="down"
              label={`Search ${tools.length} tools`}
              className="w-full border border-line-strong sm:max-w-[560px] sm:flex-1 sm:basis-[400px]"
            />
            <div role="group" aria-label="Show" className="-mx-3 flex flex-wrap gap-x-1 xl:mx-0">
              {FILTERS.map((option) => {
                const on = filter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(option.value)}
                    className={`relative flex h-11 items-center gap-2 px-3 text-[14px] transition-colors ${
                      on ? "font-semibold" : "text-muted hover:text-ink"
                    }`}
                  >
                    {option.label}
                    <span className="fb-num text-[13px] font-normal text-faint">{option.count}</span>
                    <span
                      aria-hidden
                      className={`absolute inset-x-3 bottom-1 h-[2px] origin-left bg-accent transition-transform duration-200 ${
                        on ? "" : "scale-x-0"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className={`fb-stage relative hidden border-l border-line lg:block ${tall ? "min-h-[300px]" : ""}`}>
          {tall ? (
            <div className="absolute inset-0 p-5">
              <BlockStage slug={slug} hovered={hovered} onHover={hover} />
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center p-4">
              <IsoBlock
                path={(hovered ?? tools[0]).path}
                seam={seamColor(hovered ?? tools[0])}
                open={Boolean(hovered)}
                className="h-full max-h-[170px] w-auto"
              />
            </div>
          )}
        </div>
      </section>

      <section
        id="tools"
        aria-label="Tools"
        className="fb-shelves flex-1 scroll-mt-[var(--fb-bar)] px-[var(--fb-pad)] py-[clamp(20px,2.9vh,40px)]"
      >
        <div className="fb-shelf-list">
          {SHELVES.map((slugs) => (
            <div key={slugs.join()} className="fb-shelf">
              <div className="fb-shelf-name">
                {slugs.map((name) => {
                  const at = categories.findIndex((item) => item.slug === name);
                  return (
                    <Link
                      key={name}
                      href={`/${name}`}
                      className="fb-shelf-title group transition-colors hover:text-accent-deep"
                    >
                      <span className="fb-num text-[12.5px] text-faint">0{at + 1}</span>
                      <span className="flex items-center gap-2 text-[15px] font-semibold">
                        {categories[at].name}
                        <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-lg:opacity-100">
                          <Arrow size={13} />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              <ul className="fb-shelf-cards">
                {slugs.flatMap(toolsForCategory).map((tool) => (
                  <li key={tool.path} className="min-w-0">
                    <ToolCard tool={tool} dim={!matches(tool, filter)} onHover={hover} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** A tool as a file with its corner folded: the fold's colour is the price. */
function ToolCard({ tool, dim, onHover }: { tool: Tool; dim: boolean; onHover: (tool: Tool | null) => void }) {
  return (
    <Link
      href={tool.path}
      onPointerEnter={() => onHover(tool)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(tool)}
      onBlur={() => onHover(null)}
      className={`fb-card group ${dim ? "opacity-30" : ""}`}
      style={{ ["--fold" as string]: seamColor(tool) }}
    >
      <span className="flex items-start justify-between gap-3">
        <ToolGlyph path={tool.path} size={24} className="shrink-0 transition-colors group-hover:text-accent group-focus-visible:text-accent" />
        <span className="pr-5 pt-0.5 text-[12.5px] text-faint transition-colors group-hover:text-white/60 group-focus-visible:text-white/60">
          {seamLabel(tool)}
        </span>
      </span>
      <span className="mt-auto block pt-3">
        <span className="block text-[15px] font-semibold leading-tight">{tool.name}</span>
        <span className="mt-1 line-clamp-2 min-h-[35px] text-[13px] leading-[1.35] text-muted transition-colors group-hover:text-white/65 group-focus-visible:text-white/65">
          {LINE[tool.path] ?? tool.tagline}
        </span>
      </span>
    </Link>
  );
}
