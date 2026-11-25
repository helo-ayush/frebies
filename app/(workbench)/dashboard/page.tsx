import type { Metadata } from "next";
import Link from "next/link";
import { DashboardAuthCta } from "@/components/dashboard/DashboardAuthCta";
import { ToolDirectory } from "@/components/dashboard/ToolDirectory";
import { SparkGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { tools } from "@/lib/registry/tools";

export const metadata: Metadata = {
  title: "Dashboard | frebies",
  robots: { index: false, follow: true },
};

const freeCount = tools.filter((tool) => tool.tier === "free").length;

/** The jobs people open most, one click away. */
const QUICK = [
  { path: "/image/compress", label: "Compress an image" },
  { path: "/image/convert", label: "Convert an image" },
  { path: "/document/merge-pdf", label: "Merge PDFs" },
  { path: "/document/split-pdf", label: "Split a PDF" },
  { path: "/document/pdf-to-jpg", label: "PDF to JPG" },
  { path: "/audio/trim", label: "Trim audio" },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="relative overflow-hidden rounded-[26px] border border-line bg-white px-5 py-7 sm:px-8 sm:py-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1d8_0%,#fdc98f_36%,#f08a5d_64%,transparent_74%)] opacity-70"
        />
        <div className="relative max-w-[640px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent-deep">
            {tools.length} tools · {freeCount} free
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            What are we making today?
          </h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-muted">
            Pick a job below. Free tools open instantly and run in your browser.
          </p>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          {QUICK.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="group inline-flex h-11 items-center gap-2 rounded-[13px] border border-line bg-white/90 pl-2 pr-4 text-[14px] font-medium text-ink backdrop-blur transition-colors hover:border-ink"
            >
              <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-ink text-white transition-colors group-hover:bg-accent">
                <ToolGlyph path={item.path} size={15} />
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </header>

      <section id="tools" className="mt-8 scroll-mt-20">
        <ToolDirectory />
      </section>

      <section className="relative mt-10 overflow-hidden rounded-[26px] bg-ink px-6 py-8 text-white sm:px-9 sm:py-9">
        <div
          aria-hidden
          className="absolute -right-14 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)] opacity-75"
        />
        <div className="relative grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.15] bg-white/[0.08] px-3 py-1 text-[12.5px] font-medium text-white/75">
              <SparkGlyph size={13} className="text-[#ffc7a8]" />
              AI tools
            </p>
            <h2 className="mt-3 max-w-[460px] font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
              A little extra power, on the house.
            </h2>
            <p className="mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-white/60">
              Create a free account and get 25 credits for upscaling, natural voices, vocal removal and dubbing.
            </p>
            <DashboardAuthCta />
          </div>
          <div aria-hidden className="flex items-end gap-1.5 sm:pr-4">
            <span className="font-display text-[92px] font-semibold leading-[0.8] tracking-[-0.06em]">25</span>
            <span className="pb-1.5 text-[13px] font-medium leading-tight text-white/50">
              free
              <br />
              credits
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
