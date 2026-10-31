"use client";

import { ArrowRight, Check, Download, SlidersHorizontal, UploadCloud } from "lucide-react";
import { Head } from "@/components/Sections";
import { StickyScroll } from "@/components/ui/sticky-scroll-reveal";

const STEPS = [
  {
    title: "Drop it in",
    description:
      "Pick a file from your device or drop it straight into the workspace. Nothing is uploaded until a run actually needs the cloud.",
    content: (
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-ink shadow-[0_24px_60px_rgba(60,25,10,0.18)]">
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-[#fafaf9] text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white">
            <UploadCloud size={20} strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">Drop your file here</p>
          <p className="mt-1 text-xs text-muted">or click to browse</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["JPG", "PNG", "WebP", "PDF", "MP3"].map((format) => (
            <span key={format} className="rounded-full bg-[#f4f2ee] px-3 py-1 text-[11px] text-muted">
              {format}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Tune the output",
    description:
      "Choose a format, quality or size. Every control has a sensible default, so you can hit run without reading a manual.",
    content: (
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-ink shadow-[0_24px_60px_rgba(60,25,10,0.18)]">
        <p className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal size={15} strokeWidth={1.8} />
          Output settings
        </p>
        <div className="mt-4 space-y-2">
          {[
            ["Format", "WebP"],
            ["Quality", "90%"],
            ["Resize", "Original"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs"
            >
              <span className="text-muted">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-muted">
            <span>Compression</span>
            <span>balanced</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[#efece7]">
            <div className="h-full w-[68%] rounded-full bg-ink" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-lg bg-ink px-4 py-2.5 text-xs font-medium text-white">
          Convert file
          <ArrowRight size={14} />
        </div>
      </div>
    ),
  },
  {
    title: "Take it with you",
    description:
      "Download the result instantly. Files processed on your device never leave it, and cloud jobs are deleted within the hour.",
    content: (
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-ink shadow-[0_24px_60px_rgba(60,25,10,0.18)]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e9f6ee] text-[#2f8f5b]">
            <Check size={17} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">portrait.webp</p>
            <p className="text-xs text-muted">142 KB · ready</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-xs">
          <span className="text-muted">Saved to Downloads</span>
          <Download size={14} />
        </div>
        <div className="mt-3 rounded-lg bg-[#fafaf9] p-3 text-[11px] leading-relaxed text-muted">
          Processed on your device. Nothing was uploaded.
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto mt-28 max-w-[1280px] scroll-mt-24 px-5">
      <Head
        label="How it works"
        title="Three steps, no detours."
        copy="Drop a file, set the output, take the result. The same rhythm works for every tool in the box."
        cta=""
      />
      <div className="mt-12">
        <StickyScroll content={STEPS} />
      </div>
    </section>
  );
}
