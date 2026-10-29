"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Crop,
  Eraser,
  Image as ImageIcon,
  Layers,
  Minimize2,
  Repeat,
  ScanText,
  Sparkles,
  Type,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Navbar";
import { Btn, Reveal, ease, grads } from "./ui";

function Head({
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
        <p className="mb-4 text-lg text-muted">{label}</p>
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

function Card({
  bg,
  title,
  sub,
  children,
}: {
  bg?: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <Reveal className="h-full">
      <div
        className={`h-full min-h-[540px] overflow-hidden rounded-[28px] p-5 md:p-6 ${
          bg ? "grain text-white" : "bg-card"
        }`}
        style={bg ? { background: bg } : undefined}
      >
        <div className="relative z-10 flex h-full min-h-[490px] flex-col">
          <div className="flex flex-1 items-center justify-center py-6">{children}</div>
          <p className={`text-[15px] ${bg ? "text-white/75" : "text-muted"}`}>{title}</p>
          <p className="mt-1 max-w-md text-lg leading-snug">{sub}</p>
        </div>
      </div>
    </Reveal>
  );
}

const WHO = ["Creators", "Students", "Developers", "Designers", "Agencies", "Teachers", "Marketers", "Freelancers"];

export function Marquee() {
  return (
    <section className="mt-24 overflow-hidden border-y border-line py-10">
      <p className="mx-auto mb-8 max-w-[1280px] px-5 text-lg">
        Made for everyone who works with files
      </p>
      <div className="flex w-max animate-marquee text-5xl tracking-tight text-neutral-300 motion-reduce:animate-none md:text-7xl">
        {[...WHO, ...WHO].map((word, index) => (
          <span key={index} className="mr-16">
            {word}
          </span>
        ))}
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

function Scene({ blur }: { blur?: boolean }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden ${blur ? "scale-110" : ""}`}
      style={{
        filter: blur ? "blur(7px)" : undefined,
        background:
          "radial-gradient(circle at 72% 28%,#fff1c2 0 8%,transparent 9%),linear-gradient(180deg,#ffb07a,#ff5f8f 55%,#3d2a7c)",
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[#1b1340]"
        style={{ clipPath: "polygon(0 100%,0 58%,22% 24%,42% 62%,68% 14%,100% 52%,100% 100%)" }}
      />
    </div>
  );
}

function UpscaleMock() {
  const transition = { duration: 6, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <div className="relative h-72 w-full max-w-sm overflow-hidden rounded-2xl shadow-xl">
      <Scene />
      <motion.div
        className="absolute inset-0"
        animate={{ clipPath: ["inset(0 70% 0 0)", "inset(0 30% 0 0)", "inset(0 70% 0 0)"] }}
        transition={transition}
      >
        <Scene blur />
      </motion.div>
      <motion.div
        className="absolute inset-y-0 w-0.5 bg-white"
        animate={{ left: ["30%", "70%", "30%"] }}
        transition={transition}
      >
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
      </motion.div>
      <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">1×</span>
      <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">4× AI</span>
    </div>
  );
}

const Bars = ({ widths }: { widths: number[] }) => (
  <div className="space-y-2">
    {widths.map((width, index) => (
      <div key={index} style={{ width: `${width}%` }} className="h-2 rounded bg-neutral-200" />
    ))}
  </div>
);

function PdfMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm">
      <Bars widths={[90, 100, 82]} />
      <motion.div
        className="my-3 rounded-lg bg-amber-100 p-2"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <Bars widths={[96, 70, 88]} />
      </motion.div>
      <Bars widths={[100, 76]} />
      <div className="mt-5 flex items-center gap-2 rounded-full border border-line p-1.5 pl-4 text-sm">
        <span className="flex-1 text-muted">Make paragraph 2 friendlier</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
          <Sparkles size={14} />
        </span>
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
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          <Card
            bg={grads.sun}
            title="Format converter"
            sub="JPG, PNG, WebP, PDF and the audio formats you actually use."
          >
            <ConverterMock />
          </Card>
          <Card title="Files stay yours" sub="Free browser tools are designed to process on your device, not ours.">
            <DropMock />
          </Card>
        </div>
      </div>

      <div>
        <Head
          label="Frebies AI"
          title="Let AI do the fiddly parts."
          copy="Sharpen low-resolution images, remove backgrounds and rewrite text inside PDFs by describing the change you want."
          cta="See AI tools"
          ctaHref="/image/upscaler"
        />
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          <Card bg={grads.iris} title="Image upscaler" sub="Enlarge photos up to 4× and keep the detail.">
            <UpscaleMock />
          </Card>
          <Card title="AI PDF editor" sub="Edit a PDF by typing what you want changed.">
            <PdfMock />
          </Card>
        </div>
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
          <motion.div key={name} whileHover={{ y: -4 }} transition={{ duration: 0.3, ease }}>
            <Link
              href={href}
              className="flex min-h-[190px] flex-col justify-between rounded-[24px] bg-card p-6 transition-colors hover:bg-white hover:shadow-[0_0_0_1px_#e8e7e4]"
            >
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
            <div
              className={`flex h-full flex-col rounded-[28px] p-8 ${
                plan.pro ? "bg-ink text-white" : "bg-card"
              }`}
            >
              <p className="text-lg">{plan.name}</p>
              <p className="mt-6 text-6xl tracking-[-0.04em]">
                {plan.price}
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
                <Btn dark={!plan.pro} href={plan.href}>
                  {plan.action}
                </Btn>
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
      <div className="mt-12 grid gap-3 md:grid-cols-3">
        {SAFE.map((item, index) => {
          const Art = ART[index];
          return (
            <Reveal key={item.title} className="h-full">
              <div className="flex h-full min-h-[440px] flex-col justify-between rounded-[28px] bg-card p-6">
                <div className="grid flex-1 place-items-center">
                  <svg
                    viewBox="0 0 200 200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="h-52 w-52"
                  >
                    <Art />
                  </svg>
                </div>
                <div>
                  <p className="text-lg">{item.title}</p>
                  <p className="mt-1 text-[15px] leading-snug text-muted">{item.copy}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="mx-auto mt-28 max-w-[1280px] px-5">
      <Reveal>
        <div className="relative overflow-hidden rounded-[32px] bg-ink px-6 py-24 text-center text-white md:py-32">
          <motion.div
            className="absolute -bottom-48 left-1/2 -ml-[220px] h-[440px] w-[440px] rounded-full opacity-80 blur-2xl"
            style={{ background: grads.sun }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,5vw,4rem)] leading-[1.04] tracking-[-0.035em]">
              Get your files sorted before your coffee cools.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Btn dark={false} href="/dashboard">Start for free</Btn>
            </div>
          </div>
        </div>
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
    <footer className="mx-auto mt-28 max-w-[1280px] px-5 pb-12">
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
      <p className="mt-12 text-sm text-muted">© 2026 frebies. All rights reserved.</p>
    </footer>
  );
}
