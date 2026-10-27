"use client";
import { motion } from "framer-motion";
import { Check, Eraser, FileText, Film, Image as ImageIcon, Layers, Minimize2, Repeat, ScanText, Sparkles, UploadCloud, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Navbar";
import { Btn, Reveal, ease, grads } from "./ui";

/* ---------- shared ---------- */
function Head({ label, title, copy, cta = "Learn more" }: { label: string; title: string; copy: string; cta?: string }) {
  return (
    <Reveal className="grid gap-6 md:grid-cols-2 md:items-end">
      <div>
        <p className="mb-4 text-lg text-muted">{label}</p>
        <h2 className="text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04] tracking-[-0.035em]">{title}</h2>
      </div>
      <div>
        <p className="max-w-xl text-lg leading-snug">{copy}</p>
        {cta && <div className="mt-6"><Btn>{cta}</Btn></div>}
      </div>
    </Reveal>
  );
}

function Card({ bg, title, sub, children }: { bg?: string; title: string; sub: string; children: ReactNode }) {
  return (
    <Reveal className="h-full">
      <div className={`h-full min-h-[540px] overflow-hidden rounded-[28px] p-5 md:p-6 ${bg ? "grain text-white" : "bg-card"}`} style={bg ? { background: bg } : undefined}>
        <div className="relative z-10 flex h-full min-h-[490px] flex-col">
          <div className="flex flex-1 items-center justify-center py-6">{children}</div>
          <p className={`text-[15px] ${bg ? "text-white/75" : "text-muted"}`}>{title}</p>
          <p className="mt-1 max-w-md text-lg leading-snug">{sub}</p>
        </div>
      </div>
    </Reveal>
  );
}

/* ---------- marquee ---------- */
const WHO = ["Creators", "Students", "Developers", "Designers", "Agencies", "Teachers", "Marketers", "Freelancers"];
export function Marquee() {
  return (
    <section className="mt-24 overflow-hidden border-y border-line py-10">
      <p className="mx-auto mb-8 max-w-[1280px] px-5 text-lg">Made for everyone who works with files</p>
      <div className="flex w-max animate-marquee text-5xl tracking-tight text-neutral-300 motion-reduce:animate-none md:text-7xl">
        {[...WHO, ...WHO].map((w, i) => <span key={i} className="mr-16">{w}</span>)}
      </div>
    </section>
  );
}

/* ---------- mock UIs ---------- */
const ROWS = [["report.docx", "PDF", 92], ["holiday.heic", "JPG", 64], ["intro.mov", "MP4", 38]] as const;
function ConverterMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-ink shadow-xl">
      <p className="mb-3 text-sm font-medium">Converting 3 files</p>
      {ROWS.map(([name, fmt, p], i) => (
        <div key={name} className="mb-3 rounded-xl border border-line p-3 last:mb-0">
          <div className="flex justify-between text-sm"><span>{name}</span><span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs">to {fmt}</span></div>
          <div className="mt-2.5 h-1.5 rounded-full bg-neutral-100">
            <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} whileInView={{ width: `${p}%` }}
              viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.3 + i * 0.2, ease }} />
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
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}><UploadCloud size={30} strokeWidth={1.5} /></motion.div>
        <p className="mt-3 text-sm font-medium">Drop files here</p>
        <p className="text-xs text-muted">or paste a link. Up to 20 files.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["PDF", "DOCX", "PNG", "WEBP", "MP4", "MP3", "+250"].map((f) => <span key={f} className="rounded-full bg-card px-3 py-1 text-xs">{f}</span>)}
      </div>
    </div>
  );
}

function Scene({ blur }: { blur?: boolean }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${blur ? "scale-110" : ""}`}
      style={{ filter: blur ? "blur(7px)" : undefined, background: "radial-gradient(circle at 72% 28%,#fff1c2 0 8%,transparent 9%),linear-gradient(180deg,#ffb07a,#ff5f8f 55%,#3d2a7c)" }}>
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#1b1340]" style={{ clipPath: "polygon(0 100%,0 58%,22% 24%,42% 62%,68% 14%,100% 52%,100% 100%)" }} />
    </div>
  );
}
function UpscaleMock() {
  const t = { duration: 6, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <div className="relative h-72 w-full max-w-sm overflow-hidden rounded-2xl shadow-xl">
      <Scene />
      <motion.div className="absolute inset-0" animate={{ clipPath: ["inset(0 70% 0 0)", "inset(0 30% 0 0)", "inset(0 70% 0 0)"] }} transition={t}><Scene blur /></motion.div>
      <motion.div className="absolute inset-y-0 w-0.5 bg-white" animate={{ left: ["30%", "70%", "30%"] }} transition={t}>
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
      </motion.div>
      <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">1×</span>
      <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">4× AI</span>
    </div>
  );
}

const Bars = ({ w }: { w: number[] }) => <div className="space-y-2">{w.map((x, i) => <div key={i} style={{ width: `${x}%` }} className="h-2 rounded bg-neutral-200" />)}</div>;
function PdfMock() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm">
      <Bars w={[90, 100, 82]} />
      <motion.div className="my-3 rounded-lg bg-amber-100 p-2" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }}><Bars w={[96, 70, 88]} /></motion.div>
      <Bars w={[100, 76]} />
      <div className="mt-5 flex items-center gap-2 rounded-full border border-line p-1.5 pl-4 text-sm">
        <span className="flex-1 text-muted">Make paragraph 2 friendlier</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white"><Sparkles size={14} /></span>
      </div>
    </div>
  );
}

/* ---------- showcase ---------- */
export function Showcase() {
  return (
    <section className="mx-auto mt-28 max-w-[1280px] space-y-28 px-5">
      <div>
        <Head label="Frebies Free" title="Convert anything, keep everything." copy="Documents, images, audio and video. Pick a file, pick a format and you're done, with no account and no watermark." />
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          <Card bg={grads.sun} title="File converter" sub="256+ conversions across documents, images, audio and video."><ConverterMock /></Card>
          <Card title="Batch uploads" sub="Drop a whole folder, then download everything in one zip."><DropMock /></Card>
        </div>
      </div>
      <div>
        <Head label="Frebies Pro" title="Let AI do the fiddly parts." copy="Sharpen low-resolution images and rewrite text inside PDFs by describing the change you want." />
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          <Card bg={grads.iris} title="Image upscaler" sub="Enlarge photos up to 4× and keep the detail."><UpscaleMock /></Card>
          <Card title="AI PDF editor" sub="Edit any PDF by typing what you want changed."><PdfMock /></Card>
        </div>
      </div>
    </section>
  );
}

/* ---------- tools ---------- */
const TOOLS: [LucideIcon, string, string, boolean][] = [
  [Repeat, "File converter", "256+ formats", false],
  [Minimize2, "Compressor", "Images and PDFs", false],
  [Layers, "Merge & split", "Reorder PDF pages", false],
  [ScanText, "OCR", "Scans to text", false],
  [ImageIcon, "Image upscaler", "Up to 4×", true],
  [Eraser, "Background remover", "One-click cut-outs", true],
  [FileText, "AI PDF editor", "Edit by prompt", true],
  [Film, "Video converter", "MP4, MOV, GIF", false],
];
export function Tools() {
  return (
    <section id="tools" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Head label="The toolbox" title="One place for the small jobs." copy="New tools land every few weeks. Everything here is free unless it's marked Pro." cta="" />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map(([I, name, note, pro]) => (
          <motion.a key={name} href="#" whileHover={{ y: -4 }} transition={{ duration: 0.3, ease }}
            className="flex min-h-[190px] flex-col justify-between rounded-[24px] bg-card p-6 transition-colors hover:bg-white hover:shadow-[0_0_0_1px_#e8e7e4]">
            <div className="flex items-start justify-between">
              <I size={26} strokeWidth={1.5} />
              <span className={`rounded-full px-2.5 py-1 text-xs ${pro ? "bg-ink text-white" : "border border-line bg-white"}`}>{pro ? "Pro" : "Free"}</span>
            </div>
            <div><p className="text-lg">{name}</p><p className="mt-1 text-[15px] text-muted">{note}</p></div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}

/* ---------- pricing ---------- */
const PLANS = [
  { n: "Free", p: "$0", d: "Everyday tools. No card, no watermark.", f: ["256+ file conversions", "Compress, merge and split PDFs", "OCR up to 10 pages a day", "Batches of up to 5 files"], pro: false },
  { n: "Pro", p: "$9", d: "AI tools and generous limits.", f: ["Everything in Free", "4× AI image upscaler", "AI PDF editor", "Batches of 50 and a priority queue"], pro: true },
];
export function Pricing() {
  return (
    <section id="pricing" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Head label="Pricing" title="Free for everyday. Pro for the heavy lifting." copy="Start without an account. Upgrade only when you need AI tools or bigger batches." cta="" />
      <div className="mt-12 grid gap-3 md:grid-cols-2">
        {PLANS.map((p) => (
          <Reveal key={p.n} className="h-full">
            <div className={`flex h-full flex-col rounded-[28px] p-8 ${p.pro ? "bg-ink text-white" : "bg-card"}`}>
              <p className="text-lg">{p.n}</p>
              <p className="mt-6 text-6xl tracking-[-0.04em]">{p.p}<span className={`ml-2 text-lg tracking-normal ${p.pro ? "text-white/60" : "text-muted"}`}>per month</span></p>
              <p className={`mt-3 ${p.pro ? "text-white/70" : "text-muted"}`}>{p.d}</p>
              <ul className="mt-8 flex-1 space-y-3">
                {p.f.map((x) => <li key={x} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0" />{x}</li>)}
              </ul>
              <div className="mt-10"><Btn dark={!p.pro}>{p.pro ? "Go Pro" : "Start free"}</Btn></div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------- privacy ---------- */
const draw = (i: number) => ({ initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 1.6, delay: i * 0.12, ease } });
const ART = [
  () => <>{[22, 40, 58, 76].map((r, i) => <motion.circle key={r} cx={160 - r} cy="100" r={r} {...draw(i)} />)}</>,
  () => (<><motion.rect x="50" y="80" width="80" height="80" {...draw(0)} /><motion.rect x="80" y="50" width="80" height="80" {...draw(1)} /><motion.path d="M50 80L80 50M130 80L160 50M50 160L80 130M130 160L160 130" {...draw(2)} /></>),
  () => (<>{[30, 55, 80].map((r, i) => <motion.path key={r} d={`M${100 - r} 150A${r} ${r} 0 0 1 ${100 + r} 150`} {...draw(i)} />)}<motion.path d="M100 150V60" {...draw(3)} /></>),
];
const SAFE = [
  { t: "Private by default", d: "Most conversions run in your browser, so your files never leave your device." },
  { t: "Deleted automatically", d: "Anything processed on our servers is removed within an hour." },
  { t: "Fair limits", d: "Clear free limits and plain Pro pricing. No surprise paywalls." },
];
export function Privacy() {
  return (
    <section id="privacy" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Reveal className="flex items-end justify-between gap-4">
        <h2 className="text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04] tracking-[-0.035em]">Privacy, built in</h2>
        <Btn dark={false}>Learn more</Btn>
      </Reveal>
      <div className="mt-12 grid gap-3 md:grid-cols-3">
        {SAFE.map((s, i) => {
          const A = ART[i];
          return (
            <Reveal key={s.t} className="h-full">
              <div className="flex h-full min-h-[440px] flex-col justify-between rounded-[28px] bg-card p-6">
                <div className="grid flex-1 place-items-center">
                  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1" className="h-52 w-52"><A /></svg>
                </div>
                <div><p className="text-lg">{s.t}</p><p className="mt-1 text-[15px] leading-snug text-muted">{s.d}</p></div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- CTA + footer ---------- */
export function CTA() {
  return (
    <section className="mx-auto mt-28 max-w-[1280px] px-5">
      <Reveal>
        <div className="relative overflow-hidden rounded-[32px] bg-ink px-6 py-24 text-center text-white md:py-32">
          <motion.div className="absolute -bottom-48 left-1/2 -ml-[220px] h-[440px] w-[440px] rounded-full opacity-80 blur-2xl" style={{ background: grads.sun }}
            animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,5vw,4rem)] leading-[1.04] tracking-[-0.035em]">Get your files sorted before your coffee cools.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3"><Btn dark={false}>Start for free</Btn></div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const COLS: Record<string, string[]> = {
  Tools: ["File converter", "Image upscaler", "AI PDF editor", "Compressor"],
  Company: ["About", "Changelog", "Contact"],
  Legal: ["Privacy", "Terms", "Cookies"],
};
export function Footer() {
  return (
    <footer className="mx-auto mt-28 max-w-[1280px] px-5 pb-12">
      <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div><Logo /><p className="mt-4 max-w-xs text-[15px] text-muted">Every tool you need, mostly free.</p></div>
        {Object.entries(COLS).map(([h, ls]) => (
          <div key={h}>
            <p className="mb-4 text-[15px]">{h}</p>
            <ul className="space-y-2.5 text-[15px] text-muted">{ls.map((l) => <li key={l}><a href="#" className="hover:text-ink">{l}</a></li>)}</ul>
          </div>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted">© 2026 Frebies. All rights reserved.</p>
    </footer>
  );
}
