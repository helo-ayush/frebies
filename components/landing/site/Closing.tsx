"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { categories, tools, toolsForCategory } from "@/lib/registry/tools";
import { EASE, MaskBlock, MaskLines, Rule, Sq, roundPath, useSize } from "./kit";
import { LogoMark } from "./Nav";

const MachineFront = dynamic(() => import("./MachineCanvas").then((module) => module.MachineFront), { ssr: false });

const freeCount = tools.filter((tool) => tool.tier === "free").length;

/* ---------- Questions ---------- */

const FAQ = [
  {
    q: "Is it really free?",
    a: `Yes. The ${freeCount} everyday tools, including image conversion and compression, resizing, PDF merge and split, and audio conversion and trimming, are free, with no account, no watermark and no daily limit. Only the AI tools use credits.`,
  },
  {
    q: "Do my files get uploaded?",
    a: "Not by the free tools. They run in your browser, so the file stays on your device. AI tools send the file for processing and keep the result for 24 hours so you can download it, then delete it.",
  },
  {
    q: "Do I need an account?",
    a: "Only for the AI tools. Everything else works as soon as the page loads. Signing up gives you 25 credits.",
  },
  {
    q: "What does a credit buy?",
    a: "Each AI tool shows its cost on the run button before anything starts. If a run fails, the credits come back automatically.",
  },
  {
    q: "Will it work on my phone?",
    a: "Yes, every tool is built for touch and small screens. Very large files can hit your phone's memory limit, because the work happens on the phone.",
  },
];

export function Questions() {
  return (
    <section id="faq" aria-label="Questions" className="relative scroll-mt-[var(--lp-nav)] px-[var(--lp-pad)] py-[clamp(80px,9vw,150px)]">
      <div className="grid gap-y-10 md:grid-cols-[38%_minmax(0,1fr)]">
        <MaskLines as="h2" className="lp-wide lp-title" lines={["Before", "you ask"]} />
        <div className="border-t border-[var(--lp-line-strong)]">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-[var(--lp-line)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-medium transition-colors hover:text-[var(--lp-coral)] md:text-[20px]">
                {item.q}
                <span className="lp-plus grid h-9 w-9 shrink-0 place-items-center bg-[var(--lp-panel)] text-[var(--lp-ink)] transition-all duration-300">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 13 13" stroke="currentColor" strokeWidth="1.6">
                    <path d="M6.5 0v13M0 6.5h13" />
                  </svg>
                </span>
              </summary>
              <p className="lp-body max-w-[640px] pb-8">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final call to action ---------- */

/** A wire through points given as percentages of the section. */
function Wire({
  points,
  size,
  progress,
  range,
  coral = false,
}: {
  points: [number, number][];
  size: { width: number; height: number };
  progress: MotionValue<number>;
  range: [number, number];
  coral?: boolean;
}) {
  const pathLength = useTransform(progress, range, [0, 1]);
  const d = roundPath(
    points.map(([x, y]) => [Math.round((x / 100) * size.width), Math.round((y / 100) * size.height)]),
    coral ? 16 : 12,
  );
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={coral ? "var(--lp-coral)" : "rgba(29,28,31,.5)"}
      strokeWidth={coral ? 2 : 1.4}
      style={{ pathLength }}
    />
  );
}

function Pin({ left, top, label, coral = false, side = "right" }: { left: string; top: string; label?: string; coral?: boolean; side?: "right" | "above" }) {
  return (
    <span className="absolute hidden md:block" style={{ left, top }}>
      <span className={`absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 ${coral ? "bg-[var(--lp-coral)]" : "bg-[var(--lp-ink)]"}`} />
      {label && (
        <span
          className={`lp-label absolute whitespace-nowrap !text-[12px] ${
            side === "above" ? "bottom-3 left-0 -translate-x-1/2" : "left-4 top-0 -translate-y-1/2"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function Closing() {
  const ref = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const size = useSize(stageRef);
  const [live, setLive] = useState(false);
  const [held, setHeld] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "start -40%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4 });
  useMotionValueEvent(progress, "change", (value) => setLive(value > 0.86));
  const lit = live || held;

  return (
    <div ref={ref} className="relative h-[150svh]">
      <section ref={stageRef} aria-label="Get started" className="sticky top-0 h-[100svh] min-h-[600px] overflow-clip border-t border-[var(--lp-line)] pt-[var(--lp-nav)]">
        <Rule vertical className="bottom-0 left-[var(--lp-pad)] top-0" />
        <Rule vertical className="bottom-0 right-[var(--lp-pad)] top-0" />
        <Rule vertical className="bottom-0 left-[25%] top-0 hidden md:block" />
        <Rule vertical className="bottom-0 right-[25%] top-0 hidden md:block" />
        <div aria-hidden className="lp-hatch absolute left-[calc(25%-120px)] top-[14%] hidden h-[26%] w-[120px] opacity-70 md:block" />
        <div aria-hidden className="lp-hatch absolute right-[calc(25%-120px)] top-[14%] hidden h-[20%] w-[120px] opacity-70 md:block" />
        <div aria-hidden className="absolute inset-x-[var(--lp-pad)] top-[73%] h-[6%] bg-[var(--lp-panel)]" />
        <p className="lp-label absolute left-[var(--lp-pad)] top-[76%] hidden w-[calc(25%-var(--lp-pad))] -translate-y-1/2 text-center md:block">
          {freeCount} free tools
        </p>
        <p className="lp-label absolute right-[var(--lp-pad)] top-[76%] hidden w-[calc(25%-var(--lp-pad))] -translate-y-1/2 text-center md:block">
          No account
        </p>

        {/* Wiring, drawn in real pixels so the dash maths holds at every size */}
        {size.width > 0 && (
          <svg aria-hidden width={size.width} height={size.height} className="absolute inset-0 hidden md:block">
            <Wire size={size} progress={progress} range={[0, 0.3]} points={[[2, 21.1], [21.6, 21.1], [21.6, 36.6], [25, 36.6]]} />
            <Wire size={size} progress={progress} range={[0.04, 0.32]} points={[[2, 28.7], [19, 28.7], [19, 40], [25, 40]]} />
            <Wire size={size} progress={progress} range={[0.08, 0.34]} points={[[2, 36.2], [16.3, 36.2], [16.3, 43.4], [25, 43.4]]} />
            <Wire size={size} progress={progress} range={[0, 0.3]} points={[[98, 21.1], [88.7, 21.1], [88.7, 25.6], [75, 25.6]]} />
            <Wire size={size} progress={progress} range={[0.05, 0.34]} points={[[84, 25.6], [84, 38.9], [98, 38.9]]} />
            <Wire coral size={size} progress={progress} range={[0.2, 0.62]} points={[[8.3, 52.2], [30.3, 52.2], [30.3, 76], [46, 76]]} />
            <Wire coral size={size} progress={progress} range={[0.6, 0.9]} points={[[54, 76], [69.9, 76], [69.9, 46.7], [87.1, 46.7], [87.1, 59.4]]} />
          </svg>
        )}
        <Pin left="13.5%" top="21.1%" label="HEIC" side="above" />
        <Pin left="13.5%" top="28.7%" label="PDF" side="above" />
        <Pin left="13.5%" top="36.2%" label="WAV" side="above" />
        <Pin left="93%" top="21.1%" label="JPG" side="above" />
        <Pin left="93%" top="38.9%" label="MP3" side="above" />
        <Pin left="8.3%" top="52.2%" coral label="Your file" side="above" />
        <motion.span
          aria-hidden
          className="absolute left-[87.1%] top-[60.6%] hidden -translate-x-1/2 items-center md:flex"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: live ? 1 : 0, scale: live ? 1 : 0.6 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <span className="grid h-[26px] w-[26px] place-items-center border-2 border-[var(--lp-coral)]">
            <span className="lp-sq lp-blink !h-[10px] !w-[10px]" />
          </span>
          <span className="lp-label absolute left-9 whitespace-nowrap !text-[12px]">File, fixed</span>
        </motion.span>

        <div className="relative z-10 mx-auto flex flex-col items-center px-[var(--lp-pad)] pt-[7svh] text-center">
          <MaskLines as="h2" className="lp-wide lp-title !text-[clamp(28px,min(4.05vw,8.2svh),70px)]" lines={["Too big?", "Wrong format?"]} />
          <MaskBlock className="mt-[3svh]" delay={0.14}>
            <p className="lp-body">There is a button for that.</p>
          </MaskBlock>
          <MaskBlock className="mt-[3svh]" delay={0.2}>
            <Link
              href="/dashboard"
              data-lit={lit}
              onPointerEnter={() => setHeld(true)}
              onPointerLeave={() => setHeld(false)}
              className="lp-btn lp-ear !h-[54px] !px-12"
            >
              Open the tools
            </Link>
          </MaskBlock>
        </div>

        <MachineFront
          pressed={lit}
          className="absolute bottom-0 left-1/2 h-[min(54svh,max(64vw,430px))] w-[min(100vw,1000px)] -translate-x-1/2"
        />
      </section>
    </div>
  );
}

/* ---------- Footer ---------- */

export function Footer() {
  return (
    <footer className="relative z-20 bg-[var(--lp-bg)] px-[clamp(8px,2.1vw,34px)] pb-[clamp(8px,2.1vw,34px)] pt-0">
      <div className="lp-ear relative overflow-hidden bg-[#1f1e21] text-white" style={{ ["--ear" as string]: "clamp(34px,4.4vw,66px)" }}>
        <div className="flex items-center gap-4 px-[clamp(20px,3vw,44px)] pb-10 pt-11">
          <LogoMark invert size={38} />
          <p className="lp-wide text-[clamp(18px,1.9vw,30px)] leading-[1.1]">
            Every tool you need,
            <br />
            mostly free.
          </p>
        </div>

        <div className="grid border-t border-white/10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 px-[clamp(20px,3vw,44px)] py-11 md:grid-cols-4">
            {categories.map((category) => (
              <div key={category.slug}>
                <Link href={`/${category.slug}`} className="lp-label !text-white/45 hover:!text-white">
                  {category.name}
                </Link>
                <ul className="mt-5 space-y-3">
                  {toolsForCategory(category.slug).map((tool) => (
                    <li key={tool.path}>
                      <Link href={tool.path} className="text-[15.5px] text-white/85 transition-colors hover:text-[var(--lp-coral)]">
                        {tool.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-between gap-10 border-white/10 px-[clamp(20px,3vw,44px)] py-11 max-lg:border-t lg:border-l lg:px-8">
            <div>
              <p className="lp-label !text-white/45">Your files</p>
              <p className="mt-5 text-[15.5px] leading-[1.5] text-white/75">
                Free tools run in your browser. AI results are kept for 24 hours, then deleted.
              </p>
            </div>
            <ul className="space-y-3 text-[15.5px]">
              <li>
                <Link href="/dashboard" className="text-white/85 hover:text-[var(--lp-coral)]">
                  All {tools.length} tools
                </Link>
              </li>
              <li>
                <Link href="/sign-in" className="text-white/85 hover:text-[var(--lp-coral)]">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/sign-up" className="text-white/85 hover:text-[var(--lp-coral)]">
                  Create account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <motion.p
          aria-hidden
          className="lp-wide flex justify-center overflow-hidden px-2 pt-2 text-[18.4vw] lowercase !leading-[0.92] !tracking-[-0.05em] text-[#39383c]"
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ staggerChildren: 0.05 }}
        >
          {"frebies".split("").map((letter, index) => (
            <motion.span
              key={index}
              className="inline-block transition-colors duration-300 hover:text-[var(--lp-coral)]"
              variants={{ hidden: { y: "105%" }, shown: { y: 0, transition: { duration: 0.9, ease: EASE } } }}
            >
              {letter}
            </motion.span>
          ))}
        </motion.p>

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#1f1e21] px-[clamp(20px,3vw,44px)] py-6 text-[14px] text-white/50">
          <p>© 2026 frebies</p>
          <p className="flex items-center gap-2.5">
            <Sq className="!h-2 !w-2" />
            Made for the small jobs
          </p>
        </div>
      </div>
    </footer>
  );
}
