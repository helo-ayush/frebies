"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { tools, liveTools } from "@/lib/registry/tools";
import { AnimatedGradientText } from "./magicui/animated-gradient-text";
import { BorderBeam } from "./magicui/border-beam";
import { BlurFade } from "./magicui/blur-fade";
import { DotPattern } from "./magicui/dot-pattern";
import { NumberTicker } from "./magicui/number-ticker";
import { Btn, Orb, Words, ease, type G } from "./ui";

type HeroItem = { t: string; d: string; g: G; href: string };

const TABS: Record<string, HeroItem[]> = {
  Convert: [
    {
      t: "Images",
      d: "Change between JPG, PNG and WebP right in your browser.",
      g: "sun",
      href: "/image/convert",
    },
    {
      t: "PDF pages",
      d: "Turn selected PDF pages into clean, shareable JPG images.",
      g: "iris",
      href: "/document/pdf-to-jpg",
    },
    {
      t: "Audio",
      d: "Move between MP3, WAV, M4A and OGG without installing anything.",
      g: "ember",
      href: "/audio/convert",
    },
  ],
  Enhance: [
    {
      t: "Image upscaler",
      d: "Enlarge photos 2× or 4× with AI and clear credit pricing.",
      g: "iris",
      href: "/image/upscaler",
    },
    {
      t: "Background remover",
      d: "Make clean cut-outs from portraits, products and more.",
      g: "sun",
      href: "/image/remove-background",
    },
    {
      t: "Image compressor",
      d: "Shrink images while keeping the detail that matters.",
      g: "ember",
      href: "/image/compress",
    },
  ],
  Documents: [
    {
      t: "Merge PDFs",
      d: "Combine related documents in exactly the order you choose.",
      g: "ember",
      href: "/document/merge-pdf",
    },
    {
      t: "Split PDFs",
      d: "Pull out pages or break a long document into smaller files.",
      g: "sun",
      href: "/document/split-pdf",
    },
    {
      t: "OCR",
      d: "Turn scans and screenshots into text you can actually use.",
      g: "iris",
      href: "/document/ocr",
    },
  ],
};

const PILLS = [
  ["Image converter", "/image/convert"],
  ["Image upscaler", "/image/upscaler"],
  ["Merge PDF", "/document/merge-pdf"],
  ["Compressor", "/image/compress"],
  ["OCR", "/document/ocr"],
  ["Background remover", "/image/remove-background"],
] as const;

const ARROWS = [
  { direction: -1, position: "left-3 md:left-[22%]", Icon: ArrowLeft, label: "Previous tool" },
  { direction: 1, position: "right-3 md:right-[22%]", Icon: ArrowRight, label: "Next tool" },
];

export default function Hero() {
  const tabNames = Object.keys(TABS);
  const [tab, setTab] = useState(tabNames[0]);
  const [active, setActive] = useState(0);
  const items = TABS[tab];
  const count = items.length;
  const half = Math.floor(count / 2);

  useEffect(() => {
    const id = window.setInterval(() => setActive((current) => (current + 1) % count), 4500);
    return () => window.clearInterval(id);
  }, [count, tab, active]);

  return (
    <section className="relative mx-auto max-w-[1280px] px-5 pt-16 md:pt-28">
      <DotPattern
        aria-hidden
        width={22}
        height={22}
        cr={1}
        className="absolute inset-x-0 top-0 h-[560px] w-full opacity-70 [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_72%)]"
      />

      <div className="relative">
        <div className="grid gap-8 md:grid-cols-2 md:items-end">
          <div>
            <AnimatedGradientText
              speed={1.6}
              colorFrom="#8f8578"
              colorTo="#d98b63"
              className="mb-5 inline-block text-[12px] font-medium uppercase tracking-[0.18em]"
            >
              Free file tools, quietly powerful
            </AnimatedGradientText>
            <Words
              lines={["Every tool you need,", "mostly free."]}
              className="text-[clamp(2.8rem,7vw,5.4rem)] leading-[1.02] tracking-[-0.04em]"
            />
          </div>
          <BlurFade delay={0.35} duration={0.7} offset={10} className="md:ml-auto">
            <p className="max-w-xl text-lg leading-snug">
              A growing toolbox for creators, students and teams. Convert images, tidy PDFs,
              trim audio and bring in AI when a job needs more. Free for everyday work, with
              clear credit pricing when you need extra power.
            </p>
          </BlurFade>
        </div>

        <BlurFade delay={0.45} duration={0.7} offset={8} className="mt-8 flex flex-wrap gap-3">
          <Btn href="/dashboard">Get started free</Btn>
          <Btn dark={false} href="#tools">Browse tools</Btn>
        </BlurFade>

        <BlurFade delay={0.55} duration={0.7} offset={6} className="mt-7 flex flex-wrap items-baseline gap-x-7 gap-y-2 text-[13px] text-muted">
          <span className="inline-flex items-baseline gap-1.5">
            <NumberTicker value={tools.length} className="font-display text-[20px] font-semibold text-ink" />
            tools in the box
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <NumberTicker value={liveTools.length} className="font-display text-[20px] font-semibold text-ink" />
            ready on your device
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <NumberTicker value={0} className="font-display text-[20px] font-semibold text-ink" />
            uploads required
          </span>
        </BlurFade>

        <div className="relative mt-14 overflow-hidden rounded-[28px] border border-line bg-card/60 p-2">
          <BorderBeam
            size={190}
            duration={16}
            colorFrom="#e55e40"
            colorTo="#fda82b"
            className="opacity-70"
          />
        <div className="grid grid-cols-3 rounded-[22px] bg-[#eeedea] p-1">
          {tabNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setTab(name);
                setActive(0);
              }}
              aria-pressed={tab === name}
              className={`relative rounded-[18px] py-4 text-[15px] transition-colors ${
                tab === name ? "text-ink" : "text-neutral-500 hover:text-ink"
              }`}
            >
              {tab === name && (
                <motion.span
                  layoutId="hero-tab"
                  transition={{ duration: 0.4, ease }}
                  className="absolute inset-0 rounded-[18px] bg-white shadow-sm"
                />
              )}
              <span className="relative">{name}</span>
            </button>
          ))}
        </div>

        <div className="relative mt-6 h-[440px] overflow-hidden">
          {items.map((item, index) => {
            const offset = ((index - active + count + half) % count) - half;
            return (
              <motion.div
                key={`${tab}-${index}`}
                className="absolute left-1/2 top-4 -ml-[180px] w-[360px] text-center"
                initial={{ opacity: 0, scale: 0.85, x: offset * 400 }}
                animate={{ opacity: offset === 0 ? 1 : 0.5, scale: offset === 0 ? 1 : 0.78, x: offset * 400 }}
                transition={{ duration: 0.9, ease }}
              >
                <motion.div
                  animate={offset === 0 ? { y: [0, -10, 0] } : { y: 0 }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Orb g={item.g} className="mx-auto h-64 w-64 md:h-72 md:w-72" />
                </motion.div>
                <h3 className="mt-8 flex items-center justify-center gap-1 text-xl">
                  {offset === 0 ? (
                    <Link href={item.href} className="inline-flex items-center gap-1 hover:underline">
                      {item.t}
                      <ArrowUpRight size={16} aria-hidden />
                    </Link>
                  ) : (
                    item.t
                  )}
                </h3>
                <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-snug text-muted">
                  {item.d}
                </p>
              </motion.div>
            );
          })}
          {ARROWS.map(({ direction, position, Icon, label }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => setActive((current) => (current + direction + count) % count)}
              className={`absolute top-[36%] z-10 grid h-10 w-10 place-items-center rounded-full bg-white/80 backdrop-blur transition hover:bg-white ${position}`}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-2 md:px-14">
          <div className="flex flex-wrap gap-1 text-[15px]">
            {PILLS.map(([label, href], index) => (
              <Link
                key={label}
                href={href}
                className={`rounded-full px-4 py-2.5 transition-colors ${
                  index === 0
                    ? "border border-line bg-white"
                    : "text-neutral-600 hover:text-ink"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <Btn href="/dashboard">Get started</Btn>
        </div>
        </div>
      </div>
    </section>
  );
}
