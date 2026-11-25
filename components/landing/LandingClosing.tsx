"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight, Check, ChevronDown, FileImage, MonitorSmartphone, Wand2 } from "lucide-react";
import { BrandMark } from "@/components/brand/Wordmark";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { categories, tools, toolsForCategory } from "@/lib/registry/tools";
import { Reveal, SectionHead } from "./ToolBento";
import { ToolSearch } from "./ToolSearch";

const freeTools = tools.filter((tool) => tool.tier === "free");
const creditTools = tools.filter((tool) => tool.tier === "credits");

/* ---------- Privacy: an exploded, isometric view of where a file lives ---------- */

const LAYERS = [
  {
    icon: FileImage,
    title: "Your file",
    copy: "Opened straight from your disk. Free tools read it in memory and never send it anywhere.",
  },
  {
    icon: Wand2,
    title: "The tool",
    copy: "Converters, compressors and PDF tools are code that runs inside the page you are looking at.",
  },
  {
    icon: MonitorSmartphone,
    title: "Your browser",
    copy: "The work happens on your own device, so it keeps going even if your connection drops.",
  },
];

function Slab({
  progress,
  depth,
  children,
  className,
}: {
  progress: MotionValue<number>;
  depth: number;
  children?: React.ReactNode;
  className: string;
}) {
  const z = useTransform(progress, [0.12, 0.62], [depth * 14, depth * 96], { clamp: true });
  return (
    <motion.div style={{ z }} className={`absolute inset-0 rounded-[26px] ${className}`}>
      {children}
    </motion.div>
  );
}

export function PrivacySection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });
  const spin = useTransform(progress, [0, 1], [-48, -28]);
  const tilt = useTransform(progress, [0, 1], [62, 52]);
  const glow = useTransform(progress, [0.1, 0.6], [0.25, 0.9]);

  return (
    <section id="privacy" ref={ref} className="scroll-mt-24 px-3 sm:px-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] bg-ink text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_70%_50%,black,transparent_70%)]"
        />

        <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:px-10 lg:py-28">
          <div>
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#ff9d7c]">Privacy, built in</p>
              <h2 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1.03] tracking-[-0.04em]">
                The free tools never
                <br />
                see your files.
              </h2>
              <p className="mt-4 max-w-[480px] text-[17px] leading-relaxed text-white/65">
                {freeTools.length} of our tools run entirely in your browser. There is no upload step because there is
                no server involved.
              </p>
            </Reveal>

            <ol className="mt-9 space-y-3">
              {LAYERS.map((layer, index) => (
                <Reveal key={layer.title} delay={index * 0.08}>
                  <li className="flex gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-white/10 text-[#ffb59b]">
                      <layer.icon size={20} strokeWidth={1.6} aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-[16px] font-semibold">{layer.title}</h3>
                      <p className="mt-1 text-[14.5px] leading-relaxed text-white/60">{layer.copy}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={0.2}>
              <p className="mt-6 max-w-[480px] text-[14px] leading-relaxed text-white/50">
                AI tools are the exception: they need a model, so your file is sent for processing and the result is
                kept for 24 hours so you can download it, then deleted automatically.
              </p>
            </Reveal>
          </div>

          {/* Exploded isometric stack */}
          <div className="relative grid h-[420px] place-items-center [perspective:1500px] sm:h-[520px]">
            <motion.div
              aria-hidden
              style={{ opacity: glow }}
              className="absolute h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(229,94,64,0.55),transparent_64%)] blur-2xl"
            />
            <motion.div
              aria-hidden
              style={{ rotateX: tilt, rotateZ: spin, transformStyle: "preserve-3d" }}
              className="relative h-[230px] w-[230px] sm:h-[290px] sm:w-[290px]"
            >
              {/* Browser / device */}
              <Slab
                progress={progress}
                depth={0}
                className="border border-white/15 bg-[#1b1b20] shadow-[0_60px_80px_-20px_rgba(0,0,0,0.8)]"
              >
                <div className="absolute inset-4 rounded-[16px] border border-white/10 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
              </Slab>
              {/* The tool */}
              <Slab
                progress={progress}
                depth={1}
                className="border border-[#ff9d7c]/50 bg-[linear-gradient(135deg,rgba(233,98,63,0.92),rgba(253,168,43,0.85))] shadow-[0_30px_60px_-20px_rgba(229,94,64,0.7)]"
              >
                <div className="absolute inset-0 grid place-items-center">
                  <span className="h-24 w-24 rounded-full border-[10px] border-white/85 sm:h-28 sm:w-28" />
                </div>
                <span className="absolute left-5 top-5 h-2.5 w-14 rounded-full bg-white/70" />
                <span className="absolute bottom-5 right-5 h-2.5 w-20 rounded-full bg-white/50" />
              </Slab>
              {/* The file */}
              <Slab progress={progress} depth={2} className="border border-white bg-white shadow-[0_30px_50px_-18px_rgba(0,0,0,0.6)]">
                <div className="absolute inset-4 overflow-hidden rounded-[14px] bg-[linear-gradient(172deg,#fde3c4_0%,#f6b78d_50%,#e55e40_51%,#8d3520_100%)]">
                  <span className="absolute right-[16%] top-[14%] h-10 w-10 rounded-full bg-[#fff4dd]" />
                  <span className="absolute bottom-0 left-0 h-1/2 w-2/3 bg-[#22342d] [clip-path:polygon(0_100%,38%_18%,62%_56%,82%_32%,100%_100%)]" />
                </div>
              </Slab>
            </motion.div>

            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[13px] text-white/75 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              0 bytes uploaded by the free tools
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */

export function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-24 lg:py-32">
      <SectionHead
        align="center"
        eyebrow="Pricing"
        title="Free for everyday. Credits only for AI."
        copy="Start without an account. Sign in only when you want the AI tools, and get 25 credits on the house."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="flex h-full flex-col rounded-[30px] border border-line bg-white p-7 sm:p-9">
            <p className="text-[15px] font-semibold text-muted">Free</p>
            <p className="mt-4 font-display text-[64px] font-semibold leading-none tracking-[-0.05em] text-ink">
              ₹0 <span className="text-[18px] font-medium tracking-normal text-muted">forever</span>
            </p>
            <p className="mt-3 text-[16px] text-muted">Everyday tools with no card, no account and no watermark.</p>
            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {freeTools.map((tool) => (
                <li key={tool.path}>
                  <Link
                    href={tool.path}
                    className="group flex items-center gap-2.5 text-[15px] text-ink transition-colors hover:text-accent-deep"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <Check size={12} strokeWidth={3} aria-hidden />
                    </span>
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-9">
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-ink px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#2a2a2b]"
              >
                Start free
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative flex h-full flex-col overflow-hidden rounded-[30px] bg-ink p-7 text-white sm:p-9">
            <div
              aria-hidden
              className="absolute -right-24 -top-28 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_36%,#e55e40_70%,transparent_78%)] opacity-80 blur-[2px]"
            />
            <div className="relative flex h-full flex-col">
              <p className="text-[15px] font-semibold text-white/60">AI credits</p>
              <p className="mt-4 font-display text-[64px] font-semibold leading-none tracking-[-0.05em]">
                25 <span className="text-[18px] font-medium tracking-normal text-white/60">free credits to start</span>
              </p>
              <p className="mt-3 max-w-[420px] text-[16px] text-white/65">
                For the heavier jobs that need a model, not just a browser. The cost is on the button before you run.
              </p>
              <ul className="mt-7 space-y-2">
                {creditTools.map((tool) => (
                  <li key={tool.path}>
                    <Link
                      href={tool.path}
                      className="flex items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[15px] transition-colors hover:bg-white/[0.1]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <ToolGlyph path={tool.path} size={17} className="shrink-0 text-[#ffb59b]" />
                        <span className="truncate">{tool.name}</span>
                      </span>
                      <span className="shrink-0 text-[13.5px] tabular-nums text-white/55">
                        {tool.status === "soon"
                          ? "coming soon"
                          : `${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-9">
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-white px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-[#f3f1ec]"
                >
                  Claim 25 free credits
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

const FAQ = [
  {
    q: "Is frebies really free?",
    a: `Yes. ${freeTools.length} tools, including image conversion, compression, resizing, PDF merge and split, and audio conversion and trimming, are free with no account, no watermark and no daily limit. Only the AI tools use credits.`,
  },
  {
    q: "Do my files get uploaded?",
    a: "Not for the free tools. They run in your browser, so your files stay on your device. AI tools send the file for processing and keep the result for 24 hours so you can download it, then delete it.",
  },
  {
    q: "Do I need an account?",
    a: "Only for the AI tools. Everything else works the moment the page loads. Creating an account gives you 25 free credits.",
  },
  {
    q: "What do credits cost?",
    a: "Each AI tool shows its credit cost on the run button before anything starts, and a failed run is refunded automatically.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. Every tool is built for touch and small screens. Very large files may hit your phone's memory limit, since the work happens on the device.",
  },
];

export function FaqSection() {
  return (
    <section className="mx-auto max-w-[860px] px-5 pb-24 lg:pb-32">
      <SectionHead align="center" eyebrow="Questions" title="Good to know" />
      <Reveal className="mt-10 divide-y divide-line rounded-[26px] border border-line bg-white px-5 sm:px-7">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-ink">
              {item.q}
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card text-muted transition-transform duration-300 group-open:rotate-180">
                <ChevronDown size={16} aria-hidden />
              </span>
            </summary>
            <p className="mt-3 max-w-[680px] text-[15.5px] leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </Reveal>
    </section>
  );
}

/* ---------- Final call to action ---------- */

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const orb = useTransform(scrollYProgress, [0, 1], [-60, 40]);

  return (
    <section ref={ref} className="px-3 sm:px-5">
      <motion.div
        style={{ scale }}
        className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] border border-line bg-[#f6f1e7] px-6 py-20 text-center sm:py-28"
      >
        <motion.div
          aria-hidden
          style={{ y: orb, x: "-50%" }}
          className="absolute left-1/2 top-[-45%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#fff1d8_0%,#fdc98f_34%,#f08a5d_62%,transparent_72%)] opacity-90"
        />
        <div className="relative mx-auto max-w-[720px]">
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.6rem)] font-semibold leading-[1] tracking-[-0.045em] text-ink">
            What do you need
            <br />
            to get done?
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[17px] leading-relaxed text-[#6a6156]">
            Type the job and jump straight into the tool. No account, no install.
          </p>
          <ToolSearch className="mx-auto mt-9 max-w-[560px] text-left" />
        </div>
      </motion.div>
    </section>
  );
}

/* ---------- Footer ---------- */

export function LandingFooter() {
  return (
    <footer className="mx-auto max-w-[1240px] px-5 pb-10 pt-20">
      <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Link href="/" aria-label="frebies home" className="flex items-center gap-2">
            <BrandMark className="!h-[24px] !w-[24px] !rounded-[7px]" />
            <span className="font-display text-[20px] font-semibold tracking-[-0.04em] text-ink">frebies</span>
          </Link>
          <p className="mt-4 max-w-[240px] text-[15px] leading-relaxed text-muted">
            Every tool you need, mostly free.
          </p>
        </div>
        {categories.map((category) => (
          <div key={category.slug}>
            <Link href={`/${category.slug}`} className="text-[15px] font-semibold text-ink hover:underline">
              {category.name}
            </Link>
            <ul className="mt-4 space-y-2.5">
              {toolsForCategory(category.slug).map((tool) => (
                <li key={tool.path}>
                  <Link href={tool.path} className="text-[14.5px] text-muted transition-colors hover:text-ink">
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[14px] text-muted">
        <p>© 2026 frebies. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="hover:text-ink">
            All tools
          </Link>
          <Link href="/sign-in" className="hover:text-ink">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
