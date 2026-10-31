"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { tools, liveTools } from "@/lib/registry/tools";
import { DottedGlowBackground } from "./aceternity/dotted-glow-background";
import { HoverBorderGradient } from "./aceternity/hover-border-gradient";
import { AnimatedGradientText } from "./magicui/animated-gradient-text";
import { BorderBeam } from "./magicui/border-beam";
import { BlurFade } from "./magicui/blur-fade";
import { NumberTicker } from "./magicui/number-ticker";
import { SparklesCore } from "./ui/sparkles";
import { Highlight } from "./ui/hero-highlight";
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
  { direction: -1, position: "left-1.5", Icon: ArrowLeft, label: "Previous tool" },
  { direction: 1, position: "right-1.5", Icon: ArrowRight, label: "Next tool" },
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
    <section className="relative mx-auto flex max-w-[1280px] flex-col justify-center px-5 pt-12 md:pt-16 lg:min-h-[100svh] lg:py-[clamp(2rem,5vh,4rem)]">
      <DottedGlowBackground
        className="inset-x-0 top-0 h-[620px] w-full [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_72%)]"
        gap={24}
        radius={1.1}
        opacity={0.55}
      />

      <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-10">
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
            lines={[
              "Every tool",
              "you need,",
              <>
                mostly <Highlight className="px-2 pb-1.5">free.</Highlight>
              </>,
            ]}
            className="text-[clamp(2.8rem,min(7vw,8.6vh),5.4rem)] leading-[1.02] tracking-[-0.04em]"
          />

          <BlurFade delay={0.35} duration={0.7} offset={10}>
            <p className="mt-6 max-w-lg text-lg leading-snug">
              A growing toolbox for creators, students and teams. Convert images, tidy PDFs,
              trim audio and bring in AI when a job needs more. Free for everyday work, with
              clear credit pricing when you need extra power.
            </p>
          </BlurFade>

          <BlurFade delay={0.45} duration={0.7} offset={8} className="mt-8 flex flex-wrap items-center gap-3 lg:mt-[clamp(1.5rem,3.5vh,2rem)]">
            <HoverBorderGradient
              as={Link}
              href="/dashboard"
              containerClassName="rounded-full"
              className="rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Get started free
            </HoverBorderGradient>
            <Btn dark={false} href="#tools">Browse tools</Btn>
          </BlurFade>

          <BlurFade delay={0.55} duration={0.7} offset={6} className="mt-7 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-line pt-5 text-[13px] text-muted lg:mt-[clamp(1.25rem,3vh,1.75rem)] lg:pt-[clamp(1rem,2.5vh,1.25rem)]">
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
        </div>

        <BlurFade delay={0.3} duration={0.8} offset={16} className="relative">
          <div className="relative overflow-hidden rounded-[28px] border border-line bg-card/60 p-2 shadow-[0_40px_100px_rgba(25,20,12,0.10)]">
            <BorderBeam
              size={220}
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
                  className={`relative rounded-[18px] py-3.5 text-[14px] transition-colors ${
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

            <div className="relative mt-3 h-[340px] overflow-hidden sm:h-[clamp(364px,42vh,420px)]">
              <SparklesCore
                id="hero-tool-sparkles"
                background="transparent"
                minSize={0.5}
                maxSize={1.4}
                particleDensity={24}
                speed={1.1}
                particleColor="#d98b63"
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              {items.map((item, index) => {
                const offset = ((index - active + count + half) % count) - half;
                return (
                  <motion.div
                    key={`${tab}-${index}`}
                    className="absolute left-1/2 top-2 -ml-[150px] w-[300px] text-center sm:-ml-[175px] sm:w-[350px]"
                    style={{ zIndex: offset === 0 ? 2 : 1 }}
                    initial={{ opacity: 0, scale: 0.85, x: offset * 260 }}
                    animate={{
                      opacity: offset === 0 ? 1 : 0.3,
                      scale: offset === 0 ? 1 : 0.8,
                      x: offset * 260,
                    }}
                    transition={{ duration: 0.9, ease }}
                  >
                    <motion.div
                      animate={offset === 0 ? { y: [0, -10, 0] } : { y: 0 }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Orb g={item.g} className="mx-auto h-56 w-56 sm:h-64 sm:w-64" />
                    </motion.div>
                    {offset === 0 && (
                      <>
                        <h3 className="mt-6 flex items-center justify-center gap-1 text-lg">
                          <Link href={item.href} className="inline-flex items-center gap-1 hover:underline">
                            {item.t}
                            <ArrowUpRight size={15} aria-hidden />
                          </Link>
                        </h3>
                        <p className="mx-auto mt-1.5 max-w-[250px] text-sm leading-snug text-muted">
                          {item.d}
                        </p>
                      </>
                    )}
                  </motion.div>
                );
              })}
              {ARROWS.map(({ direction, position, Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={() => setActive((current) => (current + direction + count) % count)}
                  className={`absolute top-[34%] z-10 grid h-9 w-9 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:bg-white ${position}`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
              {PILLS.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-full px-3 py-1.5 text-[13px] text-neutral-600 transition-colors hover:bg-white hover:text-ink"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
