import Link from "next/link";
import { Check, Target } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";

export function CompressorHero({
  tool,
  category,
}: {
  tool: Tool;
  category: Category;
}) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f4f0e8]">
      <div
        aria-hidden
        className="absolute -right-20 -top-32 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3dc_0%,#f3c491_48%,#df8b62_100%)] opacity-70"
      />
      <div
        aria-hidden
        className="absolute -bottom-28 left-[32%] h-56 w-56 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eef7ef_0%,#b8cdbd_50%,#8aa894_100%)] opacity-25"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]"
          >
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Compression studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="free">Free</Badge>
              <Badge tone="neutral">Runs on your device</Badge>
            </div>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.45rem,5vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
            {tool.h1}
          </h1>
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#6a6156]">
            Hit an exact final size or shave a fixed percentage off. Tune JPG, PNG and WebP
            in a studio built around your images — no upload, no account and no watermark.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Exact target sizes
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Percentage cuts
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Batch friendly
            </span>
          </div>

          <Link
            href="#compressor"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Choose images
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[292px] xl:block">
          <div className="absolute inset-x-0 top-0 ml-auto w-[304px] rotate-[1.5deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_26px_50px_rgba(77,54,28,0.16)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold text-ink">Size ladder</p>
                <p className="mt-0.5 truncate text-[8.5px] text-faint">
                  campaign-shot.jpg · 2400 × 1600
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[8px] font-medium text-faint">
                JPG → WebP
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <LadderRow label="Original" size="2.4 MB" width={100} tone="track" />
              <LadderRow label="70% quality" size="1.7 MB" width={71} tone="mid" />
              <LadderRow label="45% quality" size="1.1 MB" width={46} tone="mid" />
              <LadderRow label="WebP · 72%" size="440 KB" width={18} tone="ink" />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
              <span className="text-[8.5px] text-faint">Saved 1.96 MB</span>
              <span className="rounded-full bg-[#eef4ee] px-2 py-0.5 text-[8.5px] font-semibold text-[#3d6b4a]">
                −82%
              </span>
            </div>
          </div>

          <div className="absolute left-0 top-14 w-[132px] rotate-[-4deg] rounded-[13px] border border-white/80 bg-white px-3 py-2.5 shadow-[0_18px_38px_rgba(77,54,28,0.16)]">
            <span className="flex items-center gap-1.5 text-[8.5px] font-medium uppercase tracking-[0.08em] text-faint">
              <Target size={10} aria-hidden />
              Final size
            </span>
            <p className="mt-1 font-display text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
              500 KB
            </p>
          </div>

          <div className="absolute bottom-0 left-6 flex rotate-[2.5deg] items-center gap-2 rounded-[12px] border border-white/80 bg-white px-3 py-2 shadow-[0_18px_38px_rgba(77,54,28,0.18)]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-[#3d6b4a]">
              <Check size={11} strokeWidth={2.4} aria-hidden />
            </span>
            <span>
              <span className="block text-[9px] font-medium text-ink">Landed under target</span>
              <span className="block text-[8px] text-faint">440 KB of 500 KB</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function LadderRow({
  label,
  size,
  width,
  tone,
}: {
  label: string;
  size: string;
  width: number;
  tone: "track" | "mid" | "ink";
}) {
  const bar =
    tone === "ink" ? "bg-ink" : tone === "mid" ? "bg-[#b5ab99]" : "bg-[#d9d1c2]";

  return (
    <div>
      <div className="flex items-center justify-between text-[8.5px]">
        <span className="text-[#7c7367]">{label}</span>
        <span className="font-medium tabular-nums text-ink">{size}</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#f1ece3]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
