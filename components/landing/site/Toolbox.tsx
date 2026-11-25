"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";
import { BlockStage } from "@/components/site/blocks";
import { Arrow, EASE, MaskLines, Sq, useMedia } from "@/components/site/kit";
import { seamLabel } from "@/components/ui/Seam";

const COPY: Record<CategorySlug, { title: string[]; body: string }> = {
  image: {
    title: ["Smaller,", "sharper, or a", "new format."],
    body: "Change the format, hit an exact file size, crop to a ratio or bundle a batch into one PDF.",
  },
  document: {
    title: ["Put PDFs", "together. Take", "them apart."],
    body: "Merge in any order, pull out the pages you need, or turn every page into an image.",
  },
  audio: {
    title: ["Cut it.", "Convert it.", "Give it a voice."],
    body: "Trim on the waveform and change formats for free. AI tools speak a script or lift the vocals out of a song.",
  },
  video: {
    title: ["Same speaker,", "new language."],
    body: "Transcribe, translate and dub up to two hours of video. The video stays with you; only its audio is sent.",
  },
};

export function Toolbox() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<Tool | null>(null);
  const pinned = useMedia("(min-width: 1024px)");

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!pinned) return;
    const next = Math.min(categories.length - 1, Math.max(0, Math.floor(value * categories.length)));
    setActive((current) => {
      if (current !== next) setHovered(null);
      return next;
    });
  });

  function choose(index: number) {
    setHovered(null);
    const node = ref.current;
    if (!pinned || !node) {
      setActive(index);
      return;
    }
    const run = node.offsetHeight - window.innerHeight;
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (run * (index + 0.4)) / categories.length, behavior: "smooth" });
  }

  const category = categories[active];
  const list = toolsForCategory(category.slug);
  const free = list.filter((tool) => tool.tier === "free").length;
  const copy = COPY[category.slug];
  const panelKey = hovered?.path ?? category.slug;

  return (
    <section id="tools" ref={ref} aria-label="Tools" className="relative border-t border-[var(--fb-line)] lg:h-[380vh]">
      <div className="lg:sticky lg:top-0 lg:flex lg:h-[100svh] lg:min-h-[620px] lg:flex-col lg:overflow-clip lg:pt-[var(--fb-nav)]">
        <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[21.5%_minmax(0,1fr)_26%]">
          {/* Tabs */}
          <div className="flex flex-col border-[var(--fb-line)] lg:border-r">
            <div role="tablist" aria-label="Tool categories" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1">
              {categories.map((item, index) => {
                const on = index === active;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => choose(index)}
                    className={`group relative flex h-[68px] items-center justify-between overflow-hidden border-b border-[var(--fb-line)] pl-8 pr-4 text-left text-[13px] uppercase sm:text-[15px] transition-colors duration-300 lg:h-[min(84px,10.5svh)] lg:pl-[62px] ${
                      on ? "text-white" : "hover:text-[var(--fb-coral)]"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="fb-tab"
                        className="absolute inset-0 bg-[var(--fb-ink-2)]"
                        transition={{ duration: 0.5, ease: EASE }}
                      >
                        <span className="absolute inset-y-0 left-4 w-[2px] bg-[var(--fb-coral)] lg:left-[34px]" />
                      </motion.span>
                    )}
                    <span className="relative">
                      [0{index + 1} // {item.name}]
                    </span>
                    <span className={`relative text-[13px] ${on ? "text-white/55" : "text-[var(--fb-muted)]"}`}>
                      {toolsForCategory(item.slug).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto hidden px-[var(--fb-pad)] pb-9 lg:block lg:pl-[62px]">
              <p className="fb-label">The seam tells you</p>
              <ul className="mt-3 space-y-2 text-[14.5px]">
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[var(--fb-coral)]" /> Free
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[var(--fb-ink)]" /> Uses AI credits
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[#b9b8b5]" /> Preview, not running yet
                </li>
              </ul>
            </div>
          </div>

          {/* Stage */}
          <div className="relative h-[92vw] max-h-[640px] min-h-0 overflow-hidden bg-[linear-gradient(180deg,var(--fb-bg),var(--fb-tint))] lg:h-auto lg:max-h-none">
            <div className="absolute inset-0 p-3 lg:p-6">
              <BlockStage slug={category.slug} hovered={hovered} onHover={setHovered} />
            </div>
          </div>

          {/* Detail */}
          <div className="flex flex-col border-[var(--fb-line)] lg:border-l">
            <div className="hidden flex-1 flex-col justify-between border-b border-[var(--fb-line)] px-9 py-8 lg:flex lg:min-h-0">
              <p className="fb-wide text-[26px]">
                0{active + 1}
                <span className="ml-1.5 text-[14px] text-[var(--fb-muted)]">/ 0{categories.length}</span>
              </p>
              <p className="flex items-center gap-4">
                <span className="fb-label">
                  {list.length} {list.length === 1 ? "tool" : "tools"}
                </span>
                <span className="h-px flex-1 bg-[var(--fb-line-strong)]" />
                <span className="fb-label">{free > 0 ? `${free} free` : "AI credits"}</span>
              </p>
            </div>
            <div className="flex min-h-[300px] flex-col bg-[var(--fb-panel)] px-[var(--fb-pad)] py-9 lg:h-[62%] lg:px-9">
              <Sq />
              <AnimatePresence mode="wait">
                <motion.div
                  key={panelKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="mt-auto pt-10"
                  aria-live="polite"
                >
                  {hovered ? (
                    <>
                      <p className="fb-label mb-3">{seamLabel(hovered)}</p>
                      <MaskLines immediate as="h3" className="fb-wide fb-sub" lines={[hovered.name]} />
                      <span aria-hidden className="mt-6 block h-px w-11 bg-[var(--fb-line-strong)]" />
                      <p className="fb-body mt-6">{hovered.tagline}</p>
                      <p className="mt-8 text-[14px] font-semibold uppercase text-[var(--fb-coral)]">Click the block to open it</p>
                    </>
                  ) : (
                    <>
                      <MaskLines immediate as="h3" className="fb-wide fb-sub" lines={copy.title} />
                      <span aria-hidden className="mt-6 block h-px w-11 bg-[var(--fb-line-strong)]" />
                      <p className="fb-body mt-6">{copy.body}</p>
                      <Link href={`/${category.slug}`} className="fb-link mt-8">
                        {category.title}
                        <Arrow />
                      </Link>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only">{tools.length} tools in total.</p>
    </section>
  );
}
