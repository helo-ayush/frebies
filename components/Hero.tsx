"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { tools, liveTools } from "@/lib/registry/tools";
import { DottedGlowBackground } from "./aceternity/dotted-glow-background";
import { HoverBorderGradient } from "./aceternity/hover-border-gradient";
import { AnimatedGradientText } from "./magicui/animated-gradient-text";
import { BorderBeam } from "./magicui/border-beam";
import { BlurFade } from "./magicui/blur-fade";
import { NumberTicker } from "./magicui/number-ticker";
import { Highlight } from "./ui/hero-highlight";
import { Btn, Words } from "./ui";

const PILLS = [
  ["Image converter", "/image/convert"],
  ["Image upscaler", "/image/upscaler"],
  ["Merge PDF", "/document/merge-pdf"],
  ["Compressor", "/image/compress"],
  ["OCR", "/document/ocr"],
  ["Background remover", "/image/remove-background"],
] as const;

export default function Hero({ figure }: { figure: ReactNode }) {
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

            <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                On-device engine
              </span>
              <span className="text-neutral-400">Hover or drag</span>
            </div>

            <div className="relative overflow-hidden rounded-[22px] bg-[#efeeea]">
              {figure}
            </div>

            <div className="grid grid-cols-2 gap-0.5 px-1 pb-1 pt-2 sm:grid-cols-3">
              {PILLS.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-full px-1 py-1.5 text-center text-[12px] leading-tight text-neutral-600 transition-colors hover:bg-white hover:text-ink sm:px-2"
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
