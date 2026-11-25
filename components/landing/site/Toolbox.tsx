"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";
import { Arrow, EASE, MaskLines, Sq, useMedia } from "./kit";

const COPY: Record<CategorySlug, { title: string[]; body: string }> = {
  image: {
    title: ["Smaller,", "sharper, or a", "new format."],
    body: "Convert between twelve formats, hit an exact file size, crop to a ratio or bundle a batch into one PDF.",
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

/** What each block says on its lid. */
const LID: Record<string, string[]> = {
  "/image/convert": ["Convert"],
  "/image/compress": ["Compress"],
  "/image/resize": ["Resize"],
  "/image/to-pdf": ["To PDF"],
  "/image/upscaler": ["Upscale"],
  "/image/remove-background": ["Cut out"],
  "/document/merge-pdf": ["Merge"],
  "/document/split-pdf": ["Split"],
  "/document/pdf-to-jpg": ["PDF to", "JPG"],
  "/document/ocr": ["OCR"],
  "/document/ai-editor": ["AI edit"],
  "/audio/convert": ["Convert"],
  "/audio/trim": ["Trim"],
  "/audio/text-to-speech": ["To", "speech"],
  "/audio/speech-to-text": ["To text"],
  "/audio/vocal-remover": ["Vocals"],
  "/video/dubbing": ["Dub"],
};

type Point = { x: number; y: number };

const CX = 500;
const CY = 356;

function layout(count: number): Point[] {
  if (count === 1) return [{ x: CX, y: CY - 70 }];
  if (count === 5) {
    return [
      { x: CX - 186, y: CY - 156 },
      { x: CX + 186, y: CY - 156 },
      { x: CX, y: CY },
      { x: CX - 186, y: CY + 156 },
      { x: CX + 186, y: CY + 156 },
    ];
  }
  // Isometric lattice, three by two.
  return Array.from({ length: count }, (_, index) => {
    const i = index % 3;
    const j = Math.floor(index / 3);
    return { x: CX - 82 + (i - j) * 164, y: CY + (i + j - 1.5) * 94.6 };
  }).sort((a, b) => a.y - b.y);
}

/** Floor-level route between two blocks that only turns along the iso axes. */
function route(a: Point, b: Point, drop: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const along = dx / (2 * 0.866) + dy;
  const corner = { x: a.x + along * 0.866, y: a.y + along * 0.5 };
  return `M${a.x} ${a.y + drop} L${corner.x} ${corner.y + drop} L${b.x} ${b.y + drop}`;
}

const HW = 122; // half width of a block
const HH = 70.5; // half depth
const LIDH = 40;
const GAP = 9;
const BASE = 46;

function Block({
  tool,
  at,
  index,
  hot,
  onHover,
}: {
  tool: Tool;
  at: Point;
  index: number;
  hot: boolean;
  onHover: (tool: Tool | null) => void;
}) {
  const label = LID[tool.path] ?? [tool.name];
  const free = tool.tier === "free";
  const soon = tool.status === "soon";
  const seam = free ? "var(--lp-coral)" : soon ? "#b9b8b5" : "var(--lp-ink)";
  const stroke = "rgba(29,28,31,0.62)";
  const left = (y: number, h: number) => `M${-HW} ${y} L0 ${HH + y} L0 ${HH + y + h} L${-HW} ${y + h}Z`;
  const right = (y: number, h: number) => `M${HW} ${y} L0 ${HH + y} L0 ${HH + y + h} L${HW} ${y + h}Z`;
  const top = (y: number) => `M0 ${-HH + y} L${HW} ${y} L0 ${HH + y} L${-HW} ${y}Z`;

  return (
    <motion.g
      initial={{ x: at.x, y: at.y - 70, opacity: 0 }}
      animate={{ x: at.x, y: at.y, opacity: 1 }}
      exit={{ y: at.y + 46, opacity: 0, transition: { duration: 0.22, delay: index * 0.02 } }}
      transition={{ duration: 0.75, delay: index * 0.06, ease: EASE, opacity: { duration: 0.35 } }}
    >
      <Link
        href={tool.path}
        aria-label={`${tool.name}. ${tool.tagline}`}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(tool)}
        onBlur={() => onHover(null)}
        className="cursor-pointer outline-none"
      >
        {/* base */}
        <path d={left(LIDH + GAP, BASE)} fill="#dededa" stroke={stroke} />
        <path d={right(LIDH + GAP, BASE)} fill="#e9e9e5" stroke={stroke} />
        <path d={`M-96 ${LIDH + GAP + 36} l34 19.6 v13 l-34 -19.6z`} fill="none" stroke="rgba(29,28,31,.22)" />
        <path d={`M42 ${LIDH + GAP + 57} l26 -15 v11 l-26 15z`} fill="none" stroke="rgba(29,28,31,.22)" />
        {/* seam and the coral bed the lid lifts off */}
        <path d={left(LIDH, GAP)} fill={seam} />
        <path d={right(LIDH, GAP)} fill={seam} />
        <path d={top(LIDH)} fill={seam} />
        {/* lid */}
        <motion.g animate={{ y: hot ? -30 : 0 }} transition={{ type: "spring", stiffness: 320, damping: 24 }}>
          <path d={left(0, LIDH)} fill="#e6e6e2" stroke={stroke} />
          <path d={right(0, LIDH)} fill="#efefec" stroke={stroke} />
          <path d={top(0)} fill={hot ? "#ffffff" : "#f8f8f5"} stroke={stroke} />
          <circle cx={0} cy={-HH + 7} r={1.8} fill="#1d1c1f" />
          <circle cx={HW - 11} cy={0} r={1.8} fill="#1d1c1f" />
          <circle cx={-HW + 11} cy={0} r={1.8} fill="#1d1c1f" />
          <g transform="matrix(0.866 0.5 -0.866 0.5 0 0)" className="lp-wide" fill={hot ? "var(--lp-coral)" : "#343337"}>
            {label.map((line, row) => (
              <text
                key={line}
                textAnchor="middle"
                x={0}
                y={7 + (row - (label.length - 1) / 2) * 21}
                fontSize={label.length > 1 ? 19 : Math.min(25, 138 / line.length)}
              >
                {line}
              </text>
            ))}
            {[0, 1, 2, 3].map((bar) => (
              <path
                key={bar}
                d={`M${20 + bar * 9} 60 h5 l-7 -9 h-5z`}
                fill={free ? "var(--lp-coral)" : "rgba(29,28,31,.3)"}
                opacity={bar === 3 ? 1 : 0.4 + bar * 0.15}
              />
            ))}
          </g>
        </motion.g>
      </Link>
    </motion.g>
  );
}

/** The one-tool category: the block opened into the layers it works on. */
function DubBlock({ tool, hot, onHover }: { tool: Tool; hot: boolean; onHover: (tool: Tool | null) => void }) {
  const W = 190;
  const D = 110;
  const layers = [
    { label: "Dub", note: "New voice", h: 34, fill: "#f8f8f5", tone: "#e6e6e2" },
    { label: "", note: "Subtitles", h: 22, fill: "#f2552c", tone: "#d9471f" },
    { label: "", note: "Music and room sound", h: 34, fill: "#f1f1ee", tone: "#dededa" },
    { label: "", note: "Your video, untouched", h: 46, fill: "#2a292d", tone: "#1d1c1f" },
  ];
  const spread = hot ? 92 : 74;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <Link
        href={tool.path}
        aria-label={`${tool.name}. ${tool.tagline}`}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(tool)}
        onBlur={() => onHover(null)}
        className="cursor-pointer outline-none"
      >
        {[...layers].reverse().map((layer, reversed) => {
          const index = layers.length - 1 - reversed;
          return (
            <motion.g
              key={layer.note}
              initial={{ x: CX - 118, y: CY - 150 }}
              animate={{ x: CX - 118, y: CY - 150 + index * spread }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              <path d={`M${-W} 0 L0 ${D} L0 ${D + layer.h} L${-W} ${layer.h}Z`} fill={layer.tone} stroke="rgba(29,28,31,.55)" />
              <path d={`M${W} 0 L0 ${D} L0 ${D + layer.h} L${W} ${layer.h}Z`} fill={layer.fill} stroke="rgba(29,28,31,.55)" />
              <path d={`M0 ${-D} L${W} 0 L0 ${D} L${-W} 0Z`} fill={layer.fill} stroke="rgba(29,28,31,.55)" />
              {layer.label && (
                <g transform="matrix(0.866 0.5 -0.866 0.5 0 0)" className="lp-wide" fill="#343337">
                  <text textAnchor="middle" y={16} fontSize={54}>
                    {layer.label}
                  </text>
                </g>
              )}
              <path d={`M${W} ${layer.h / 2} h58`} stroke="rgba(29,28,31,.4)" />
              <rect x={W + 56} y={layer.h / 2 - 4} width={8} height={8} fill="var(--lp-coral)" />
              <text x={W + 74} y={layer.h / 2 + 5} fontSize={15} fill="#4d4c51" style={{ textTransform: "uppercase" }}>
                {layer.note}
              </text>
            </motion.g>
          );
        })}
      </Link>
    </motion.g>
  );
}

function Stage({ slug, hovered, onHover }: { slug: CategorySlug; hovered: Tool | null; onHover: (tool: Tool | null) => void }) {
  const list = toolsForCategory(slug);
  const spots = layout(list.length);
  const drop = LIDH + GAP + BASE;

  return (
    <svg viewBox="112 34 776 742" className="h-full w-full overflow-visible" role="group" aria-label="Tools in this category">
      <defs>
        <pattern id="lp-floor" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <path d="M0 4.5H9" stroke="#f2552c" strokeWidth="0.8" opacity="0.55" />
        </pattern>
      </defs>
      <AnimatePresence mode="wait">
        <motion.g key={slug} initial="off" animate="on" exit={{ opacity: 1, transition: { duration: 0.3 } }}>
          <motion.path
            d={`M${CX} ${CY + drop - 206} L${CX + 358} ${CY + drop} L${CX} ${CY + drop + 206} L${CX - 358} ${CY + drop}Z`}
            fill="url(#lp-floor)"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.8, ease: EASE }}
            style={{ transformOrigin: `${CX}px ${CY + drop}px` }}
          />
          {spots.slice(1).map((spot, index) => (
            <motion.path
              key={index}
              d={route(spots[index], spot, drop)}
              fill="none"
              stroke="var(--lp-coral)"
              strokeWidth={1.6}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.7, delay: 0.35 + index * 0.12, ease: "easeInOut" }}
            />
          ))}
          {list.length === 1 ? (
            <DubBlock tool={list[0]} hot={hovered?.path === list[0].path} onHover={onHover} />
          ) : (
            list.map((tool, index) => (
              <Block
                key={tool.path}
                tool={tool}
                at={spots[index]}
                index={index}
                hot={hovered?.path === tool.path}
                onHover={onHover}
              />
            ))
          )}
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

const priceOf = (tool: Tool) =>
  tool.status === "soon"
    ? "Preview"
    : tool.tier === "free"
      ? "Free"
      : `${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"}`;

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
    <section id="tools" ref={ref} aria-label="Tools" className="relative border-t border-[var(--lp-line)] lg:h-[380vh]">
      <div className="lg:sticky lg:top-0 lg:flex lg:h-[100svh] lg:min-h-[620px] lg:flex-col lg:overflow-clip lg:pt-[var(--lp-nav)]">
        <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[21.5%_minmax(0,1fr)_26%]">
          {/* Tabs */}
          <div className="flex flex-col border-[var(--lp-line)] lg:border-r">
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
                    className={`group relative flex h-[68px] items-center justify-between overflow-hidden border-b border-[var(--lp-line)] pl-8 pr-4 text-left text-[13px] uppercase sm:text-[15px] transition-colors duration-300 lg:h-[min(84px,10.5svh)] lg:pl-[62px] ${
                      on ? "text-white" : "hover:text-[var(--lp-coral)]"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="lp-tab"
                        className="absolute inset-0 bg-[var(--lp-ink-2)]"
                        transition={{ duration: 0.5, ease: EASE }}
                      >
                        <span className="absolute inset-y-0 left-4 w-[2px] bg-[var(--lp-coral)] lg:left-[34px]" />
                      </motion.span>
                    )}
                    <span className="relative">
                      [0{index + 1} // {item.name}]
                    </span>
                    <span className={`relative text-[13px] ${on ? "text-white/55" : "text-[var(--lp-muted)]"}`}>
                      {toolsForCategory(item.slug).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto hidden px-[var(--lp-pad)] pb-9 lg:block lg:pl-[62px]">
              <p className="lp-label">The seam tells you</p>
              <ul className="mt-3 space-y-2 text-[14.5px]">
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[var(--lp-coral)]" /> Free
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[var(--lp-ink)]" /> Uses AI credits
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-[6px] w-7 bg-[#b9b8b5]" /> Preview, not running yet
                </li>
              </ul>
            </div>
          </div>

          {/* Stage */}
          <div className="relative h-[92vw] max-h-[640px] min-h-0 overflow-hidden bg-[linear-gradient(180deg,var(--lp-bg),var(--lp-tint))] lg:h-auto lg:max-h-none">
            <div className="absolute inset-0 p-3 lg:p-6">
              <Stage slug={category.slug} hovered={hovered} onHover={setHovered} />
            </div>
          </div>

          {/* Detail */}
          <div className="flex flex-col border-[var(--lp-line)] lg:border-l">
            <div className="hidden flex-1 flex-col justify-between border-b border-[var(--lp-line)] px-9 py-8 lg:flex lg:min-h-0">
              <p className="lp-wide text-[26px]">
                0{active + 1}
                <span className="ml-1.5 text-[14px] text-[var(--lp-muted)]">/ 0{categories.length}</span>
              </p>
              <p className="flex items-center gap-4">
                <span className="lp-label">
                  {list.length} {list.length === 1 ? "tool" : "tools"}
                </span>
                <span className="h-px flex-1 bg-[var(--lp-line-strong)]" />
                <span className="lp-label">{free > 0 ? `${free} free` : "AI credits"}</span>
              </p>
            </div>
            <div className="flex min-h-[300px] flex-col bg-[var(--lp-panel)] px-[var(--lp-pad)] py-9 lg:h-[62%] lg:px-9">
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
                      <p className="lp-label mb-3">{priceOf(hovered)}</p>
                      <MaskLines immediate as="h3" className="lp-wide lp-sub" lines={[hovered.name]} />
                      <span aria-hidden className="mt-6 block h-px w-11 bg-[var(--lp-line-strong)]" />
                      <p className="lp-body mt-6">{hovered.tagline}</p>
                      <p className="mt-8 text-[14px] font-semibold uppercase text-[var(--lp-coral)]">Click the block to open it</p>
                    </>
                  ) : (
                    <>
                      <MaskLines immediate as="h3" className="lp-wide lp-sub" lines={copy.title} />
                      <span aria-hidden className="mt-6 block h-px w-11 bg-[var(--lp-line-strong)]" />
                      <p className="lp-body mt-6">{copy.body}</p>
                      <Link href={`/${category.slug}`} className="lp-link mt-8">
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
