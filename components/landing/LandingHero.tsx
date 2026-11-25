"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { tools } from "@/lib/registry/tools";
import { ToolSearch } from "./ToolSearch";

const HeroScene = dynamic(() => import("./HeroScene").then((module) => module.HeroScene), {
  ssr: false,
});

const EASE = [0.22, 1, 0.36, 1] as const;

const POPULAR = [
  "/image/compress",
  "/image/convert",
  "/document/merge-pdf",
  "/document/pdf-to-jpg",
  "/audio/trim",
  "/image/resize",
];

const freeCount = tools.filter((tool) => tool.tier === "free").length;

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.12em]">
      <motion.span
        className="block"
        initial={{ y: "108%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.95, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    progressRef.current = value;
  });

  const copyY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const glowScale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);

  const popular = POPULAR.map((path) => tools.find((tool) => tool.path === path)).filter(
    (tool): tool is (typeof tools)[number] => Boolean(tool),
  );

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 [background-image:radial-gradient(#dcd7cc_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
        <motion.div
          style={{ scale: glowScale }}
          className="absolute right-[-12%] top-[4%] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(253,168,43,0.30)_0%,rgba(229,94,64,0.20)_38%,transparent_68%)] blur-2xl"
        />
        <div className="absolute left-[-14%] top-[38%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,92,214,0.12)_0%,transparent_66%)] blur-2xl" />
      </div>

      <div className="mx-auto grid max-w-[1240px] items-center gap-6 px-5 pb-16 pt-[112px] lg:min-h-[100svh] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-4 lg:pb-20 lg:pt-[96px]">
        <motion.div style={{ y: copyY, opacity: copyOpacity }} className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full border border-line bg-white/80 py-1 pl-1 pr-3.5 text-[13px] font-medium text-muted backdrop-blur transition-colors hover:border-[#cfc9bd] hover:text-ink"
            >
              <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-white">
                {tools.length} tools
              </span>
              {freeCount} of them free, no account needed
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </motion.div>

          <h1 className="mt-6 font-display text-[clamp(2.9rem,7.2vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
            <Line delay={0.05}>Every tool</Line>
            <Line delay={0.13}>you need,</Line>
            <Line delay={0.21}>
              mostly{" "}
              <span className="relative inline-block">
                <span className="relative z-10 bg-[linear-gradient(100deg,#e55e40_10%,#fda82b_95%)] bg-clip-text text-transparent">
                  free.
                </span>
                <motion.svg
                  aria-hidden
                  viewBox="0 0 220 18"
                  preserveAspectRatio="none"
                  className="absolute -bottom-[0.06em] left-0 h-[0.16em] w-full"
                >
                  <motion.path
                    d="M3 12 C 50 2, 110 16, 217 6"
                    fill="none"
                    stroke="#e55e40"
                    strokeWidth="5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, delay: 0.95, ease: EASE }}
                  />
                </motion.svg>
              </span>
            </Line>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.42, ease: EASE }}
            className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-muted sm:text-[18px]"
          >
            Convert images, tidy PDFs, cut audio and dub video. Most of it runs right in your browser, so your
            files never leave your device.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.54, ease: EASE }}
            className="mt-8 max-w-[560px]"
          >
            <ToolSearch />

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-faint">Popular:</span>
              {popular.map((tool) => (
                <Link
                  key={tool.path}
                  href={tool.path}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 text-[13px] font-medium text-ink backdrop-blur transition-colors hover:border-ink"
                >
                  <ToolGlyph path={tool.path} size={14} className="text-muted" />
                  {tool.name}
                </Link>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: sceneY }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.3, delay: 0.25, ease: EASE }}
          className="relative h-[380px] sm:h-[460px] lg:h-[680px] lg:w-[128%] lg:-translate-x-[6%]"
        >
          <HeroScene progressRef={progressRef} className="absolute inset-0" />
          <div
            aria-hidden
            className="absolute bottom-[6%] left-1/2 h-10 w-[46%] -translate-x-1/2 rounded-[50%] bg-ink/25 blur-2xl"
          />
        </motion.div>
      </div>

      <motion.div
        aria-hidden
        style={{ opacity: copyOpacity }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-faint lg:flex"
      >
        Scroll
        <span className="relative h-9 w-[22px] rounded-full border border-[#cfc9bd]">
          <motion.span
            className="absolute left-[calc(50%-3px)] top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
            animate={{ y: [0, 14, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>
    </section>
  );
}
