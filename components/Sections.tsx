"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  Check,
  Crop,
  Eraser,
  FileText,
  Image as ImageIcon,
  Layers,
  Minimize2,
  Play,
  Repeat,
  ScanText,
  Sparkles,
  Type,
  UploadCloud,
  AudioLines,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Navbar";
import { EncryptedText } from "./aceternity/encrypted-text";
import { FlipWords } from "./aceternity/flip-words";
import { HoverBorderGradient } from "./aceternity/hover-border-gradient";
import { PointerHighlight } from "./aceternity/pointer-highlight";
import { Spotlight } from "./aceternity/spotlight";
import { AnimatedGradientText } from "./magicui/animated-gradient-text";
import { BorderBeam } from "./magicui/border-beam";
import { DotPattern } from "./magicui/dot-pattern";
import { Marquee as MagicMarquee } from "./magicui/marquee";
import { NumberTicker } from "./magicui/number-ticker";
import { BentoGrid, BentoGridItem } from "./ui/bento-grid";
import { GlowingEffect } from "./ui/glowing-effect";
import { LampContainer } from "./ui/lamp";
import { TextHoverEffect } from "./ui/text-hover-effect";
import { TracingBeam } from "./ui/tracing-beam";
import { Btn, Reveal, ease, grads } from "./ui";

export function Head({
  label,
  title,
  copy,
  cta = "Learn more",
  ctaHref = "/dashboard",
}: {
  label: string;
  title: string;
  copy: string;
  cta?: string;
  ctaHref?: string;
}) {
  return (
    <Reveal className="grid gap-6 md:grid-cols-2 md:items-end">
      <div>
        <PointerHighlight
          containerClassName="mb-4"
          rectangleClassName="border-accent/35"
          pointerClassName="text-accent"
        >
          <span className="px-0.5 text-lg text-muted">{label}</span>
        </PointerHighlight>
        <h2 className="text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04] tracking-[-0.035em]">
          {title}
        </h2>
      </div>
      <div>
        <p className="max-w-xl text-lg leading-snug">{copy}</p>
        {cta && (
          <div className="mt-6">
            <Btn href={ctaHref}>{cta}</Btn>
          </div>
        )}
      </div>
    </Reveal>
  );
}

const WHO = ["Creators", "Students", "Developers", "Designers", "Agencies", "Teachers", "Marketers", "Freelancers"];

export function Marquee() {
  return (
    <section className="relative mt-24 overflow-hidden border-y border-line py-10">
      <p className="mx-auto mb-6 max-w-[1280px] px-5 text-lg">
        <AnimatedGradientText speed={1.2} colorFrom="#8f8578" colorTo="#c98f6c">
          Made for everyone who works with files
        </AnimatedGradientText>
      </p>
      <div
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <MagicMarquee
          speed={70}
          repeat={3}
          pauseOnHover
          className="p-0 text-5xl tracking-tight text-neutral-300 md:text-7xl"
        >
          {WHO.map((word) => (
            <span key={word} className="whitespace-nowrap pr-12 md:pr-16">
              {word}
            </span>
          ))}
        </MagicMarquee>
      </div>
    </section>
  );
}

const ROWS = [
  ["portrait.png", "WebP", 92],
  ["scan.pdf", "JPG", 64],
  ["interview.wav", "MP3", 38],
] as const;

function ConverterMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-ink shadow-xl">
      <p className="mb-3 text-sm font-medium">Recently converted</p>
      {ROWS.map(([name, format, progress], index) => (
        <div key={name} className="mb-3 rounded-xl border border-line p-3 last:mb-0">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{name}</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs">to {format}</span>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-neutral-100">
            <motion.div
              className="h-full rounded-full bg-ink"
              initial={{ width: 0 }}
              whileInView={{ width: `${progress}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, delay: 0.3 + index * 0.2, ease }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DropMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 text-center">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <UploadCloud size={30} strokeWidth={1.5} />
        </motion.div>
        <p className="mt-3 text-sm font-medium">Drop files here</p>
        <p className="text-xs text-muted">Nothing is uploaded until a run needs the cloud.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["JPG", "PNG", "WebP", "PDF", "MP3", "WAV"].map((format) => (
          <span key={format} className="rounded-full bg-card px-3 py-1 text-xs">
            {format}
          </span>
        ))}
      </div>
    </div>
  );
}

const UPSCALE_SRC = "/showcase/ai-upscale.jpg";

/** Draws the photo into a tiny bitmap so the "before" pane is a genuine low-resolution source. */
function LowResPane({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const image = new window.Image();
    image.src = src;
    image.onload = () => {
      // 1/4 of the 320px-tall card, so each source pixel lands as a 4px block.
      const width = 120;
      const height = Math.round((image.naturalHeight / image.naturalWidth) * width);
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, width, height);
    };
  }, [src]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="h-full w-full object-cover"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function UpscaleMock() {
  // Sweep sharp detail across the frame, hold, then cross-fade back to the 1× source and loop.
  const reveal = {
    duration: 8,
    times: [0, 0.55, 0.85, 1],
    repeat: Infinity,
    repeatDelay: 0.5,
    ease: ["easeInOut", "linear", "easeIn"] as const,
  };

  return (
    <div className="relative h-80 w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900 shadow-xl ring-1 ring-white/10">
      <LowResPane src={UPSCALE_SRC} />
      <motion.img
        src={UPSCALE_SRC}
        alt="Upscaled classical painting restored to full detail"
        className="absolute inset-0 h-full w-full object-cover"
        animate={{
          clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)"],
          opacity: [1, 1, 1, 0],
        }}
        transition={reveal}
      />
      <motion.div
        className="absolute inset-y-0 z-10 w-px bg-white/90 shadow-[0_0_24px_4px_rgba(255,255,255,0.45)]"
        animate={{
          left: ["0%", "100%", "100%", "100%"],
          opacity: [1, 1, 1, 0],
        }}
        transition={reveal}
      >
        <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-lg">
          <Sparkles size={13} strokeWidth={2} />
        </span>
      </motion.div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
      <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white/80 backdrop-blur">
        1× original
      </span>
      <motion.span
        className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink backdrop-blur"
        animate={{ opacity: [0.45, 1, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.4 }}
      >
        4× AI
      </motion.span>
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between text-[11px] text-white/80">
        <span>1864 px</span>
        <motion.span
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 backdrop-blur"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#9ff0c4]" />
          detail reconstructed
        </motion.span>
        <span>7456 px</span>
      </div>
    </div>
  );
}

const PDF_PROMPT = "Make paragraph 2 friendlier";
const PDF_INTRO =
  "We shipped the new checkout flow last week. Early numbers look steady, and payment-error tickets are down by half.";
const PDF_BEFORE =
  "The remaining risk is the vendor migration. It is still not signed off, and the timeline has not moved.";
const PDF_AFTER =
  "Almost there. The only open item is the vendor migration, and once sign-off lands we will share the new timeline with everyone.";

type PdfPhase = "typing" | "thinking" | "rewriting" | "done";

function PdfMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<PdfPhase>("typing");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const typedEnd = 600 + PDF_PROMPT.length * 45;

    setPhase("typing");
    setTyped(0);
    for (let index = 1; index <= PDF_PROMPT.length; index += 1) {
      at(600 + index * 45, () => setTyped(index));
    }

    at(typedEnd + 500, () => setPhase("thinking"));
    at(typedEnd + 1500, () => setPhase("rewriting"));
    at(typedEnd + 4400, () => setPhase("done"));
    at(typedEnd + 7400, () => setCycle((value) => value + 1));

    return () => timers.forEach(clearTimeout);
  }, [inView, cycle]);

  const highlighted = phase === "rewriting" || phase === "done";
  const status =
    phase === "thinking"
      ? "Reading paragraph 2"
      : phase === "rewriting"
        ? "Rewriting with your tone"
        : phase === "done"
          ? "1 change applied"
          : "Describe the change";

  return (
    <div ref={ref} className="w-full max-w-sm rounded-2xl bg-white p-5 text-ink shadow-sm">
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <FileText size={12} strokeWidth={1.6} /> brief.pdf
        </span>
        <span>page 1 of 2</span>
      </div>

      <p className="mt-3 text-[13px] font-medium tracking-[-0.01em]">Design review — Q4</p>
      <p className="mt-2 text-[11.5px] leading-[1.6] text-neutral-600">{PDF_INTRO}</p>

      <motion.div
        className="-mx-2 mt-1 rounded-lg px-2 py-1.5"
        animate={{ backgroundColor: highlighted ? "rgba(253,214,120,0.24)" : "rgba(253,214,120,0)" }}
        transition={{ duration: 0.45 }}
      >
        <p className="text-[11.5px] leading-[1.6] text-neutral-600">
          {highlighted ? (
            <EncryptedText
              key={cycle}
              text={PDF_AFTER}
              revealDelayMs={11}
              flipDelayMs={45}
              encryptedClassName="text-[#bd923c]"
            />
          ) : (
            PDF_BEFORE
          )}
        </p>
      </motion.div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-line p-1.5 pl-3.5 text-[12px]">
        <span className="min-w-0 flex-1 truncate text-muted">
          {PDF_PROMPT.slice(0, typed)}
          {phase === "typing" && (
            <motion.span
              className="ml-0.5 inline-block h-3 w-px translate-y-0.5 bg-ink align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
          )}
        </span>
        <motion.span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
            phase === "thinking" ? "border border-line bg-white" : "bg-ink text-white"
          }`}
          animate={{ scale: phase === "thinking" ? 0.92 : 1 }}
          transition={{ duration: 0.3 }}
        >
          {phase === "thinking" ? (
            <motion.span
              className="h-3 w-3 rounded-full border-2 border-neutral-200 border-t-ink"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <Sparkles size={13} />
          )}
        </motion.span>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted">
        {phase === "done" ? (
          <Check size={12} strokeWidth={2.2} className="text-[#3f9d6b]" />
        ) : (
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-[#d8b168]"
            animate={{ opacity: phase === "typing" ? [0.35, 1, 0.35] : 1 }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
        {status}
      </div>
    </div>
  );
}

const VOICE_SCRIPTS = [
  "“Welcome to frebies.”",
  "“Your file is ready.”",
  "“Let’s get started.”",
];

const WAVE = Array.from({ length: 28 }, (_, index) => 8 + ((index * 7) % 13) * 2);

function VoiceMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span className="flex items-center gap-1.5">
          <AudioLines size={12} strokeWidth={1.6} /> voiceover.mp3
        </span>
        <AnimatedGradientText
          speed={1.4}
          colorFrom="#fda82b"
          colorTo="#e55e40"
          className="text-[11px] font-medium"
        >
          AI voice
        </AnimatedGradientText>
      </div>

      <div className="mt-3 rounded-xl bg-black/30 p-3">
        <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/35">
          Script
        </p>
        <div className="relative mt-1.5 h-5 overflow-hidden text-sm text-white/90">
          <FlipWords words={VOICE_SCRIPTS} duration={2400} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Preview voiceover"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink transition hover:bg-neutral-200"
        >
          <Play size={13} fill="currentColor" />
        </button>
        <div className="flex h-10 flex-1 items-center gap-[2px]" aria-hidden>
          {WAVE.map((height, index) => (
            <motion.span
              key={index}
              className={`w-[3px] shrink-0 rounded-full ${index < 11 ? "bg-[#fda82b]" : "bg-white/30"}`}
              style={{ height }}
              animate={{ scaleY: [0.45, 1, 0.45] }}
              transition={{
                duration: 1.4 + (index % 5) * 0.12,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.03,
              }}
            />
          ))}
        </div>
        <span className="text-[11px] tabular-nums text-white/50">0:24</span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {["Aria", "Kai", "Mira"].map((voice, index) => (
          <span
            key={voice}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              index === 0 ? "bg-white font-medium text-ink" : "bg-white/10 text-white/55"
            }`}
          >
            {voice}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-white/35">US · calm</span>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-full bg-white/10 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-white/75">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-[#fda82b]"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          Generating voiceover
        </span>
        <Sparkles size={12} className="text-[#fda82b]" />
      </div>
    </div>
  );
}

export function Showcase() {
  return (
    <section className="mx-auto mt-28 max-w-[1280px] space-y-28 px-5">
      <div>
        <Head
          label="Frebies Free"
          title="Convert anything, keep everything."
          copy="Images, PDFs and audio. Pick a file, adjust the output and you're done, with no account and no watermark."
          cta="Browse free tools"
          ctaHref="/dashboard"
        />
        <BentoGrid className="mt-12">
          <BentoGridItem
            className="grain text-white md:col-span-4 md:row-span-2 md:p-8"
            style={{ background: grads.sun }}
            header={
              <div className="flex flex-1 items-center justify-center py-6">
                <ConverterMock />
              </div>
            }
            title={<span className="text-xl text-white">Format converter</span>}
            description={
              <span className="block text-[14px] leading-snug text-white/80">
                JPG, PNG, WebP, PDF and the audio formats you actually use.
              </span>
            }
          />
          <BentoGridItem
            className="md:col-span-2 md:row-span-2 md:p-7"
            header={
              <div className="flex flex-1 items-center justify-center py-6">
                <DropMock />
              </div>
            }
            title="Files stay yours"
            description="Free browser tools are designed to process on your device, not ours."
          />
        </BentoGrid>
      </div>

      <div>
        <Head
          label="Frebies AI"
          title="Let AI do the fiddly parts."
          copy="Sharpen low-resolution photos, rewrite text inside PDFs, and turn a script into a natural voiceover."
          cta="See AI tools"
          ctaHref="/image/upscaler"
        />
        <BentoGrid className="mt-12">
          <BentoGridItem
            className="grain bg-ink text-white hover:bg-ink md:col-span-2 md:row-span-2 md:p-7"
            header={
              <div className="flex flex-1 items-center justify-center py-6">
                <UpscaleMock />
              </div>
            }
            title={<span className="text-xl text-white">Image upscaler</span>}
            description={
              <span className="block text-[14px] leading-snug text-white/80">
                Enlarge photos up to 4× and keep the detail.
              </span>
            }
          />
          <BentoGridItem
            className="grain bg-ink text-white hover:bg-ink md:col-span-2 md:row-span-2 md:p-7"
            header={
              <div className="flex flex-1 items-center justify-center py-6">
                <PdfMock />
              </div>
            }
            title={<span className="text-xl text-white">AI PDF editor</span>}
            description={
              <span className="block text-[14px] leading-snug text-white/70">
                Edit a PDF by typing what you want changed.
              </span>
            }
          />
          <BentoGridItem
            className="grain bg-ink text-white hover:bg-ink md:col-span-2 md:row-span-2 md:p-7"
            header={
              <div className="flex flex-1 items-center justify-center py-4">
                <VoiceMock />
              </div>
            }
            title={<span className="text-xl text-white">Text to speech</span>}
            description={
              <span className="block text-[14px] leading-snug text-white/70">
                Give a script a natural voice, tune the pace and export MP3 or WAV.
              </span>
            }
          />
        </BentoGrid>
      </div>
    </section>
  );
}

const TOOLS: [LucideIcon, string, string, string, boolean][] = [
  [Repeat, "Image converter", "JPG, PNG, WebP", "/image/convert", false],
  [Minimize2, "Image compressor", "Smaller files", "/image/compress", false],
  [Crop, "Resize & crop", "Exact dimensions", "/image/resize", false],
  [Layers, "Merge PDF", "Combine files", "/document/merge-pdf", false],
  [ScanText, "OCR", "Scans to text", "/document/ocr", true],
  [ImageIcon, "Image upscaler", "Up to 4×", "/image/upscaler", true],
  [Eraser, "Background remover", "One-click cut-outs", "/image/remove-background", true],
  [Type, "Text to speech", "Natural AI voices", "/audio/text-to-speech", true],
];

export function Tools() {
  return (
    <section id="tools" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Head
        label="The toolbox"
        title="One place for the small jobs."
        copy="Sixteen focused workspaces. Everything is free unless it is marked AI."
        cta=""
      />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map(([Icon, name, note, href, isAi]) => (
          <motion.div
            key={name}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3, ease }}
            className="relative rounded-[24px]"
          >
            <GlowingEffect
              disabled={false}
              proximity={80}
              spread={30}
              inactiveZone={0.45}
              borderWidth={1}
            />
            <Link
              href={href}
              className="group relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-[24px] bg-card p-6 transition-colors hover:bg-white hover:shadow-[0_0_0_1px_#e8e7e4]"
            >
              <BorderBeam
                size={130}
                duration={8}
                radius={24}
                colorFrom="#e55e40"
                colorTo="#fda82b"
                className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <div className="flex items-start justify-between">
                <Icon size={26} strokeWidth={1.5} />
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    isAi ? "bg-ink text-white" : "border border-line bg-white"
                  }`}
                >
                  {isAi ? "AI" : "Free"}
                </span>
              </div>
              <div>
                <p className="text-lg">{name}</p>
                <p className="mt-1 text-[15px] text-muted">{note}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    description: "Everyday tools with no card and no watermark.",
    features: [
      "Image and audio conversion",
      "PDF merge, split and image export",
      "Compression, crop and resize",
      "No account required",
    ],
    pro: false,
    href: "/dashboard",
    action: "Start free",
  },
  {
    name: "AI credits",
    price: "25",
    period: "free credits",
    description: "For the heavier jobs that need a model, not just a browser.",
    features: [
      "Image upscaling and background removal",
      "OCR and AI-assisted PDF editing",
      "Natural speech and transcription",
      "Failed runs refunded automatically",
    ],
    pro: true,
    href: "/sign-in",
    action: "Claim free credits",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Head
        label="Pricing"
        title="Free for everyday. Credits only for AI."
        copy="Start without an account. Sign in only when you want the AI tools, and get 25 credits on the house."
        cta=""
      />
      <div className="mt-12 grid gap-3 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Reveal key={plan.name} className="h-full">
            <div className="relative h-full rounded-[28px]">
              <GlowingEffect
                disabled={false}
                proximity={90}
                spread={34}
                inactiveZone={0.55}
                borderWidth={1}
              />
            <div
              className={`relative flex h-full flex-col overflow-hidden rounded-[28px] p-8 ${
                plan.pro ? "bg-ink text-white" : "bg-card"
              }`}
            >
              {plan.pro && (
                <>
                  <BorderBeam
                    size={220}
                    duration={12}
                    colorFrom="#ffaa40"
                    colorTo="#9c40ff"
                    borderWidth={1}
                  />
                  <Spotlight fill="#fda82b" className="-top-[420px] left-1/2 z-0 -translate-x-1/2" />
                </>
              )}
              <div className="relative z-10 flex h-full flex-col">
              <p className="text-lg">{plan.name}</p>
              <p className="mt-6 text-6xl tracking-[-0.04em]">
                {plan.pro ? (
                  <NumberTicker value={25} className="text-6xl tracking-[-0.04em]" />
                ) : (
                  plan.price
                )}
                <span
                  className={`ml-2 text-lg tracking-normal ${
                    plan.pro ? "text-white/60" : "text-muted"
                  }`}
                >
                  {plan.period}
                </span>
              </p>
              <p className={`mt-3 ${plan.pro ? "text-white/70" : "text-muted"}`}>
                {plan.description}
              </p>
              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check size={18} className="mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <HoverBorderGradient
                  as={Link}
                  href={plan.href}
                  containerClassName="rounded-full"
                  className={`rounded-full px-6 py-3.5 text-[15px] font-medium transition-colors ${
                    plan.pro
                      ? "bg-white text-ink hover:bg-neutral-100"
                      : "bg-ink text-white hover:bg-neutral-800"
                  }`}
                >
                  {plan.action}
                </HoverBorderGradient>
              </div>
              </div>
            </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const draw = (index: number) => ({
  initial: { pathLength: 0 },
  whileInView: { pathLength: 1 },
  viewport: { once: true },
  transition: { duration: 1.6, delay: index * 0.12, ease },
});

const ART = [
  () => (
    <>
      {[22, 40, 58, 76].map((radius, index) => (
        <motion.circle key={radius} cx={160 - radius} cy="100" r={radius} {...draw(index)} />
      ))}
    </>
  ),
  () => (
    <>
      <motion.rect x="50" y="80" width="80" height="80" {...draw(0)} />
      <motion.rect x="80" y="50" width="80" height="80" {...draw(1)} />
      <motion.path d="M50 80L80 50M130 80L160 50M50 160L80 130M130 160L160 130" {...draw(2)} />
    </>
  ),
  () => (
    <>
      {[30, 55, 80].map((radius, index) => (
        <motion.path
          key={radius}
          d={`M${100 - radius} 150A${radius} ${radius} 0 0 1 ${100 + radius} 150`}
          {...draw(index)}
        />
      ))}
      <motion.path d="M100 150V60" {...draw(3)} />
    </>
  ),
];

const SAFE = [
  {
    title: "Private by default",
    copy: "Most conversions run in your browser, so your files never leave your device.",
  },
  {
    title: "Deleted automatically",
    copy: "Anything processed on our servers is removed within an hour.",
  },
  {
    title: "Fair limits",
    copy: "Free tools, plain credit pricing and no surprise paywalls.",
  },
];

export function Privacy() {
  return (
    <section id="privacy" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Reveal className="flex items-end justify-between gap-4">
        <h2 className="text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04] tracking-[-0.035em]">
          Privacy, built in
        </h2>
        <Btn dark={false} href="/dashboard">Explore the tools</Btn>
      </Reveal>
      <div className="mt-14">
        <TracingBeam className="pl-2 md:pl-12">
          <div className="space-y-6 pb-16">
            {SAFE.map((item, index) => {
              const Art = ART[index];
              return (
                <Reveal key={item.title}>
                  <div className="rounded-[28px] border border-line bg-card p-6 md:p-8">
                    <div className="grid items-center gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
                      <div className="relative grid h-44 place-items-center overflow-hidden rounded-[18px] bg-[#fbfbfa]">
                        <DotPattern
                          width={18}
                          height={18}
                          cr={0.9}
                          className="opacity-45 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]"
                        />
                        <svg
                          viewBox="0 0 200 200"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          className="relative h-32 w-32"
                        >
                          <Art />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-faint">0{index + 1}</p>
                        <p className="mt-2 text-xl">{item.title}</p>
                        <p className="mt-2 max-w-md text-[15px] leading-snug text-muted">
                          {item.copy}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </TracingBeam>
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="mx-auto mt-28 max-w-[1280px] px-5">
      <Reveal>
        <LampContainer className="grain">
          <h2 className="mx-auto max-w-3xl text-center text-[clamp(2.2rem,5vw,4rem)] leading-[1.04] tracking-[-0.035em]">
            Get your{" "}
            <FlipWords
              words={["images", "PDFs", "audio", "files"]}
              className="text-[#ffd7a8]"
            />{" "}
            sorted before your coffee cools.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <HoverBorderGradient
              as={Link}
              href="/dashboard"
              containerClassName="rounded-full"
              className="rounded-full bg-white px-6 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-neutral-100"
            >
              Start for free
            </HoverBorderGradient>
          </div>
          <p className="mt-6 text-sm text-white/55">
            New accounts get{" "}
            <NumberTicker value={25} className="font-medium text-white" /> free credits for
            the AI tools.
          </p>
        </LampContainer>
      </Reveal>
    </section>
  );
}

const COLS: { title: string; links: [string, string][] }[] = [
  {
    title: "Toolbox",
    links: [
      ["All tools", "/dashboard"],
      ["Image tools", "/image"],
      ["Document tools", "/document"],
      ["Audio tools", "/audio"],
    ],
  },
  {
    title: "Popular",
    links: [
      ["Image converter", "/image/convert"],
      ["Image upscaler", "/image/upscaler"],
      ["Merge PDF", "/document/merge-pdf"],
      ["Text to speech", "/audio/text-to-speech"],
    ],
  },
  {
    title: "Account",
    links: [
      ["Sign in", "/sign-in"],
      ["Claim 25 credits", "/sign-in"],
      ["Privacy approach", "#privacy"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="mx-auto mt-28 max-w-[1280px] px-5 pb-10">
      <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[15px] text-muted">
            Every tool you need, mostly free.
          </p>
        </div>
        {COLS.map((column) => (
          <div key={column.title}>
            <p className="mb-4 text-[15px]">{column.title}</p>
            <ul className="space-y-2.5 text-[15px] text-muted">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-14 aspect-[1240/240] w-full">
        <TextHoverEffect text="frebies" viewBox="0 0 1240 240" fontSize={300} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-muted">
        <p>© 2026 frebies. All rights reserved.</p>
        <p>Made for the small jobs.</p>
      </div>
    </footer>
  );
}
