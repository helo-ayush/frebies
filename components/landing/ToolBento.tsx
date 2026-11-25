"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Play } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  copy,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-[720px] text-center" : "max-w-[720px]"}>
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent-deep">{eyebrow}</p>
      <h2 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1.03] tracking-[-0.04em] text-ink">
        {title}
      </h2>
      {copy ? <p className="mt-4 text-[17px] leading-relaxed text-muted">{copy}</p> : null}
    </Reveal>
  );
}

/* ---------- Illustrations ---------- */

/** Before / after photo with a divider that sweeps back and forth. */
function ImageArt() {
  return (
    <div className="relative h-full min-h-[240px] overflow-hidden rounded-[20px] border border-black/5">
      <div className="absolute inset-0 bg-[linear-gradient(172deg,#fde3c4_0%,#f6b78d_48%,#e55e40_49%,#8d3520_100%)]" />
      <div className="absolute right-[16%] top-[14%] h-20 w-20 rounded-full bg-[#fff4dd]" />
      <div className="absolute bottom-0 left-0 h-[52%] w-[64%] bg-[#22342d] [clip-path:polygon(0_100%,34%_14%,58%_58%,80%_30%,100%_100%)]" />

      {/* "before": the same scene, soft and blocky */}
      <motion.div
        className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white"
        animate={{ width: ["72%", "26%", "72%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 w-[100vw] max-w-none backdrop-blur-[5px] backdrop-saturate-[0.6]" />
        <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[12px] font-semibold text-white">
          PNG · 4.2 MB
        </span>
      </motion.div>
      <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[12px] font-semibold text-ink">
        WebP · 1.1 MB
      </span>
      <span className="absolute bottom-3 right-3 rounded-full bg-success px-2.5 py-1 text-[12px] font-semibold text-white">
        −74%
      </span>
    </div>
  );
}

/** Three sheets in CSS 3D that fan apart, then settle back into one stack. */
function DocumentArt() {
  return (
    <div className="grid h-full min-h-[200px] place-items-center [perspective:900px]">
      <div className="relative h-[150px] w-[120px] [transform-style:preserve-3d] [transform:rotateX(52deg)_rotateZ(-32deg)]">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className="absolute inset-0 rounded-[8px] border border-[#ddd8cf] bg-white p-3 shadow-[0_14px_30px_-14px_rgba(15,15,16,0.4)]"
            animate={{
              z: [index * 10, index * 46, index * 10],
              x: [0, (index - 1) * 34, 0],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: index * 0.08 }}
          >
            <span
              className="block h-2 w-10 rounded-full"
              style={{ background: ["#d0453f", "#e89a1c", "#2f6fb5"][index] }}
            />
            {[86, 70, 80, 56, 74].map((width, line) => (
              <span
                key={line}
                className="mt-2 block h-1.5 rounded-full bg-[#e7e3da]"
                style={{ width: `${width}%` }}
              />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const WAVE = Array.from({ length: 44 }, (_, index) => 22 + Math.abs(Math.sin(index * 0.62) * 54) + ((index * 13) % 17));

/** Waveform with a trim selection that slides along it. */
function AudioArt() {
  return (
    <div className="relative flex h-full min-h-[150px] items-center gap-[3px] overflow-hidden rounded-[20px] bg-[#16161a] px-5">
      <motion.div
        className="absolute inset-y-4 rounded-[10px] border-x-[3px] border-accent bg-accent/15"
        animate={{ left: ["12%", "46%", "12%"], width: ["34%", "40%", "34%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      {WAVE.map((height, index) => (
        <motion.span
          key={index}
          className="relative w-full rounded-full bg-white/80"
          animate={{ height: [`${height * 0.55}%`, `${height}%`, `${height * 0.55}%`] }}
          transition={{ duration: 1.6 + (index % 5) * 0.22, repeat: Infinity, ease: "easeInOut", delay: index * 0.03 }}
        />
      ))}
    </div>
  );
}

const SUBTITLES = [
  { lang: "EN", text: "Welcome back to the channel." },
  { lang: "HI", text: "चैनल पर आपका फिर से स्वागत है।" },
  { lang: "ES", text: "Bienvenidos de nuevo al canal." },
  { lang: "JA", text: "チャンネルへようこそ。" },
];

/** A player whose subtitle line is re-dubbed into another language every few seconds. */
function VideoArt() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % SUBTITLES.length), 2400);
    return () => window.clearInterval(timer);
  }, []);
  const line = SUBTITLES[index];

  return (
    <div className="relative h-full min-h-[150px] overflow-hidden rounded-[20px] bg-[linear-gradient(140deg,#3b2a55_0%,#1b1b24_60%)]">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,#e55e40,transparent_68%)] opacity-70" />
      <span className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur">
        <Play size={16} fill="currentColor" aria-hidden />
      </span>
      <div className="absolute inset-x-4 bottom-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={line.lang}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="inline-flex max-w-full items-center gap-2 rounded-[10px] bg-black/60 px-3 py-2 text-[13.5px] font-medium text-white backdrop-blur"
          >
            <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold">{line.lang}</span>
            <span className="truncate">{line.text}</span>
          </motion.div>
        </AnimatePresence>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/20">
          <motion.span
            className="block h-full rounded-full bg-white"
            animate={{ width: ["8%", "92%"] }}
            transition={{ duration: 9.6, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
    </div>
  );
}

const ART: Record<CategorySlug, () => ReactNode> = {
  image: ImageArt,
  document: DocumentArt,
  audio: AudioArt,
  video: VideoArt,
};

const SPAN: Record<CategorySlug, string> = {
  image: "lg:col-span-7",
  document: "lg:col-span-5",
  audio: "lg:col-span-5",
  video: "lg:col-span-7",
};

function ToolPill({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.path}
      className="group/pill inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13.5px] font-medium text-ink transition-colors hover:border-ink"
    >
      <ToolGlyph path={tool.path} size={15} className="text-muted transition-colors group-hover/pill:text-ink" />
      {tool.name}
      {tool.tier === "credits" && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Uses credits" />}
    </Link>
  );
}

export function ToolBento() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section id="tools" ref={ref} className="relative mx-auto max-w-[1240px] scroll-mt-24 px-5 py-24 lg:py-32">
      <motion.div
        aria-hidden
        style={{ y: drift }}
        className="pointer-events-none absolute -right-20 top-10 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(229,94,64,0.12),transparent_66%)]"
      />

      <SectionHead
        eyebrow="The toolbox"
        title={
          <>
            Four kinds of files.
            <br />
            One calm place to fix them.
          </>
        }
        copy="Every tool opens straight into its workspace. No sign-up wall, no upsell page in between."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        {categories.map((category, index) => {
          const Art = ART[category.slug];
          const list = toolsForCategory(category.slug);
          const wide = category.slug === "image" || category.slug === "video";
          return (
            <Reveal key={category.slug} delay={index * 0.06} className={SPAN[category.slug]}>
              <article className="group flex h-full flex-col overflow-hidden rounded-[30px] border border-line bg-white p-5 transition-shadow duration-500 hover:shadow-[0_40px_80px_-50px_rgba(15,15,16,0.45)] sm:p-6">
                <div className={`grid flex-1 gap-5 ${wide ? "sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`}>
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-[26px] font-semibold tracking-[-0.03em] text-ink">
                        {category.name}
                      </h3>
                      <Link
                        href={`/${category.slug}`}
                        aria-label={`All ${category.title.toLowerCase()}`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:bg-ink hover:text-white"
                      >
                        <ArrowUpRight size={16} aria-hidden />
                      </Link>
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{category.description}</p>
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {list.map((tool) => (
                        <ToolPill key={tool.path} tool={tool} />
                      ))}
                    </div>
                  </div>
                  <div className={wide ? "min-h-[220px]" : "mt-1 h-[190px]"}>
                    <Art />
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line bg-white px-5 py-4">
        <p className="text-[15px] text-muted">
          <span className="font-semibold text-ink">{tools.length} tools</span> and counting. A coral dot means the
          tool uses AI credits; everything else is free.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a2b]"
        >
          See every tool
          <ArrowUpRight size={15} aria-hidden />
        </Link>
      </Reveal>
    </section>
  );
}

const FORMATS = ["JPG", "PNG", "WebP", "AVIF", "HEIC", "SVG", "PDF", "TIFF", "GIF", "ICO", "MP3", "WAV", "M4A", "OGG", "MP4", "MOV", "WebM", "SRT"];

/** Two rows of formats sliding in opposite directions, pushed along by the scroll. */
export function FormatMarquee() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rowA = useTransform(scrollYProgress, [0, 1], ["0%", "-22%"]);
  const rowB = useTransform(scrollYProgress, [0, 1], ["-22%", "0%"]);

  const row = (key: string) =>
    [...FORMATS, ...FORMATS].map((format, index) => (
      <span
        key={`${key}-${index}`}
        className={`font-display text-[clamp(2.4rem,6vw,4.6rem)] font-semibold leading-none tracking-[-0.04em] ${
          index % 3 === 1 ? "text-ink" : "text-transparent [-webkit-text-stroke:1.2px_#cfc9bd]"
        }`}
      >
        {format}
      </span>
    ));

  return (
    <div ref={ref} aria-hidden className="overflow-clip border-y border-line bg-white py-9">
      <motion.div style={{ x: rowA }} className="flex w-max gap-10 whitespace-nowrap pl-5">
        {row("a")}
      </motion.div>
      <motion.div style={{ x: rowB }} className="mt-4 flex w-max gap-10 whitespace-nowrap pl-5">
        {row("b").reverse()}
      </motion.div>
    </div>
  );
}
