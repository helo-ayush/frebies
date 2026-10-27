"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Btn, Orb, Words, ease, type G } from "./ui";

const TABS: Record<string, { t: string; d: string; g: G }[]> = {
  Convert: [
    { t: "Documents", d: "PDF, DOCX, TXT and dozens more, converted in seconds.", g: "sun" },
    { t: "Images", d: "PNG, JPG, WebP, HEIC and SVG, any format to any format.", g: "iris" },
    { t: "Audio & video", d: "MP4, MP3, WAV and GIF without installing anything.", g: "ember" },
  ],
  Enhance: [
    { t: "Image upscaler", d: "Enlarge and sharpen photos up to 4× with AI.", g: "iris" },
    { t: "Background remover", d: "Clean cut-outs from a single upload.", g: "sun" },
    { t: "Compressor", d: "Shrink images and PDFs without visible loss.", g: "ember" },
  ],
  Documents: [
    { t: "AI PDF editor", d: "Edit text in any PDF by typing what you want changed.", g: "ember" },
    { t: "Merge & split", d: "Combine, reorder and split PDFs in the browser.", g: "sun" },
    { t: "OCR", d: "Turn scans and screenshots into searchable text.", g: "iris" },
  ],
};
const PILLS = ["File converter", "Image upscaler", "AI PDF editor", "Compressor", "OCR", "Background remover"];
const ARROWS = [
  { d: -1, pos: "left-3 md:left-[22%]", I: ArrowLeft, label: "Previous" },
  { d: 1, pos: "right-3 md:right-[22%]", I: ArrowRight, label: "Next" },
];

export default function Hero() {
  const names = Object.keys(TABS);
  const [tab, setTab] = useState(names[0]);
  const [a, setA] = useState(0);
  const items = TABS[tab];
  const n = items.length, half = Math.floor(n / 2);

  useEffect(() => {
    const id = setInterval(() => setA((x) => (x + 1) % n), 4500);
    return () => clearInterval(id);
  }, [n, tab, a]);

  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-16 md:pt-28">
      <div className="grid gap-8 md:grid-cols-2 md:items-end">
        <Words lines={["Every tool you need,", "mostly free."]} className="text-[clamp(2.8rem,7vw,5.4rem)] leading-[1.02] tracking-[-0.04em]" />
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}
          className="max-w-xl text-lg leading-snug md:ml-auto">
          A growing toolbox for creators, students and teams. Convert any of 256+ file types, upscale images and edit PDFs with AI. Free for everyday work, Pro when you need more.
        </motion.p>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-8 flex flex-wrap gap-3">
        <Btn>Get started free</Btn>
        <Btn dark={false} href="#tools">Browse tools</Btn>
      </motion.div>

      <div className="mt-14 rounded-[28px] border border-line bg-card/60 p-2">
        <div className="grid grid-cols-3 rounded-[22px] bg-[#eeedea] p-1">
          {names.map((k) => (
            <button key={k} onClick={() => { setTab(k); setA(0); }}
              className={`relative rounded-[18px] py-4 text-[15px] transition-colors ${tab === k ? "text-ink" : "text-neutral-500 hover:text-ink"}`}>
              {tab === k && <motion.span layoutId="tab" transition={{ duration: 0.4, ease }} className="absolute inset-0 rounded-[18px] bg-white shadow-sm" />}
              <span className="relative">{k}</span>
            </button>
          ))}
        </div>

        <div className="relative mt-6 h-[440px] overflow-hidden">
          {items.map((it, i) => {
            const o = ((i - a + n + half) % n) - half;
            return (
              <motion.div key={tab + i} className="absolute left-1/2 top-4 -ml-[180px] w-[360px] text-center"
                initial={{ opacity: 0, scale: 0.85, x: o * 400 }}
                animate={{ opacity: o === 0 ? 1 : 0.5, scale: o === 0 ? 1 : 0.78, x: o * 400 }}
                transition={{ duration: 0.9, ease }}>
                <motion.div animate={o === 0 ? { y: [0, -10, 0] } : { y: 0 }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                  <Orb g={it.g} className="mx-auto h-64 w-64 md:h-72 md:w-72" />
                </motion.div>
                <h3 className="mt-8 flex items-center justify-center gap-1 text-xl">{it.t}{o === 0 && <ArrowUpRight size={16} />}</h3>
                <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-snug text-muted">{it.d}</p>
              </motion.div>
            );
          })}
          {ARROWS.map(({ d, pos, I, label }) => (
            <button key={label} aria-label={label} onClick={() => setA((x) => (x + d + n) % n)}
              className={`absolute top-[36%] z-10 grid h-10 w-10 place-items-center rounded-full bg-white/80 backdrop-blur transition hover:bg-white ${pos}`}>
              <I size={18} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-2 md:px-14">
          <div className="flex flex-wrap gap-1 text-[15px]">
            {PILLS.map((p, i) => (
              <a key={p} href="#tools" className={`rounded-full px-4 py-2.5 ${i === 0 ? "border border-line bg-white" : "text-neutral-600 hover:text-ink"}`}>{p}</a>
            ))}
          </div>
          <Btn>Get started</Btn>
        </div>
      </div>
    </section>
  );
}
