import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { CategoryCards } from "@/components/dashboard/CategoryCards";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { ToolDirectory } from "@/components/dashboard/ToolDirectory";
import { HoverBorderLink } from "@/components/aceternity/hover-border-gradient";
import { ArrowRightGlyph, SparkGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { tools } from "@/lib/registry/tools";

export const metadata: Metadata = {
  title: "Dashboard | frebies",
  robots: { index: false, follow: true },
};

const freeCount = tools.filter((tool) => tool.tier === "free").length;
const creditCount = tools.length - freeCount;
const readyCount = tools.filter((tool) => tool.status === "live").length;

export default function DashboardPage() {
  return (
    <div>
      <DashboardHero />
      <CategoryCards />

      <section id="tools" className="mt-12 scroll-mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-micro font-medium uppercase tracking-[0.14em] text-faint">Library</p>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold tracking-[-0.03em]">
              All tools
            </h2>
            <p className="mt-1 text-ui text-muted">
              Pick a job, adjust a few settings, and keep moving.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-full border border-line bg-[#fbfaf8] px-4 py-2 text-micro text-faint">
            <span>
              <NumberTicker value={readyCount} className="font-medium text-ink" /> ready
            </span>
            <span aria-hidden className="h-3 w-px bg-line" />
            <span>
              <NumberTicker value={tools.length} className="font-medium text-ink" /> total
            </span>
            <span aria-hidden className="h-3 w-px bg-line" />
            <span>
              <NumberTicker value={freeCount} className="font-medium text-ink" /> free
            </span>
            <span aria-hidden className="h-3 w-px bg-line" />
            <span>
              <NumberTicker value={creditCount} className="font-medium text-ink" /> AI
            </span>
          </div>
        </div>
        <ToolDirectory />
      </section>

      <section className="mt-12 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative overflow-hidden rounded-[26px] bg-ink px-6 py-7 text-white sm:px-8 sm:py-8">
          <div
            aria-hidden
            className="absolute -right-14 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)] opacity-75"
          />
          <div className="relative grid gap-7 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.15] bg-white/[0.08] px-2.5 py-1 text-[10.5px] font-medium text-white/75">
                <SparkGlyph size={12} className="text-[#ffc7a8]" />
                AI tools
              </p>
              <h2 className="mt-3 max-w-[430px] font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                A little extra power, on the house.
              </h2>
              <p className="mt-2 max-w-[380px] text-ui leading-relaxed text-white/60">
                Create a free account and get 25 credits for upscaling, OCR,
                transcription and natural voices.
              </p>
              <HoverBorderLink
                href="/sign-in"
                containerClassName="mt-5 rounded-full"
                className="h-10 gap-2 rounded-full bg-white px-4 text-ui font-medium text-ink transition-colors hover:bg-[#f1efeb]"
              >
                Claim 25 free credits
                <ArrowRightGlyph size={14} />
              </HoverBorderLink>
            </div>

            <div aria-hidden className="flex items-end gap-1 sm:pr-3">
              <span className="font-display text-[80px] font-semibold leading-[0.8] tracking-[-0.06em]">
                25
              </span>
              <span className="pb-1 text-[11px] font-medium leading-tight text-white/50">
                free
                <br />
                credits
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-line bg-[#fbfaf7]">
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
            <h2 className="text-ui font-semibold">Recent work</h2>
            <span className="text-micro text-faint">Saved after sign in</span>
          </div>
          <div className="flex flex-col items-center px-5 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-muted">
              <FilePlus2 size={18} strokeWidth={1.5} aria-hidden />
            </span>
            <p className="mt-3 text-ui font-medium text-ink">Nothing here yet</p>
            <p className="mt-1 max-w-[220px] text-micro leading-relaxed text-muted">
              Your completed files will collect here once you start using the tools.
            </p>
            <Link
              href="/image/convert"
              className="mt-4 inline-flex items-center gap-1.5 text-micro font-medium text-ink hover:underline"
            >
              <ToolGlyph path="/image/convert" size={13} />
              Start with an image
              <ArrowRightGlyph size={11} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
