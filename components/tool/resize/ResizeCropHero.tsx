import Link from "next/link";
import { Check, Link2, RotateCw } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";

export function ResizeCropHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f4f0e8]">
      <div
        aria-hidden
        className="absolute -right-24 -top-36 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f2f6e9_0%,#d8dfc0_46%,#b3bb8f_100%)] opacity-60"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[34%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdf0e4_0%,#eec6a9_50%,#d49a7c_100%)] opacity-25"
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
            <span className="text-[#6b6155]">Resize studio</span>
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
            Set exact pixels, scale by a percentage or drag a free-form crop. Rotate, flip
            and pad an image in a canvas built around it — no upload and no account.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Exact dimensions
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Free-form crop
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Rotate &amp; flip
            </span>
          </div>

          <Link
            href="#resize"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Open the canvas
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[296px] xl:block">
          <div className="absolute inset-x-0 top-0 ml-auto w-[318px] rotate-[1.5deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_26px_50px_rgba(77,54,28,0.16)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold text-ink">Canvas</p>
                <p className="mt-0.5 truncate text-[8.5px] text-faint">
                  campaign-shot.jpg · 2400 × 1600
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[8px] font-medium text-faint">
                <Link2 size={8} aria-hidden />
                Locked
              </span>
            </div>

            <div className="relative mt-3 h-[150px] overflow-hidden rounded-[10px] bg-[linear-gradient(160deg,#d9e6df_0%,#efd8b7_52%,#b87958_53%,#694a3d_100%)]">
              <span className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-[#f8d9a8]/90" />
              <span className="absolute -bottom-8 -left-5 h-24 w-24 rounded-full bg-[#6b806f]" />
              <div className="absolute inset-[10%_19%] border border-dashed border-white/95">
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                <span className="absolute inset-y-0 right-1/3 w-px bg-white/35" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/35" />
                <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-[2px] border border-ink bg-white" />
                <span className="absolute -right-[3px] -top-[3px] h-2 w-2 rounded-[2px] border border-ink bg-white" />
                <span className="absolute -bottom-[3px] -left-[3px] h-2 w-2 rounded-[2px] border border-ink bg-white" />
                <span className="absolute -bottom-[3px] -right-[3px] h-2 w-2 rounded-[2px] border border-ink bg-white" />
              </div>
              <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[8px] font-medium text-ink">
                4:5
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div>
                <span className="block text-[8px] text-faint">Original</span>
                <span className="block text-[10px] font-medium tabular-nums text-ink">
                  2400 × 1600
                </span>
              </div>
              <span className="grid h-6 w-6 place-items-center rounded-full border border-line text-faint">
                <ArrowRightGlyph size={10} />
              </span>
              <div className="text-right">
                <span className="block text-[8px] text-faint">Output</span>
                <span className="block text-[10px] font-medium tabular-nums text-ink">
                  1080 × 1350
                </span>
              </div>
            </div>
          </div>

          <div className="absolute left-0 top-14 w-[128px] -rotate-[4deg] rounded-[13px] border border-white/80 bg-white px-3 py-2.5 shadow-[0_18px_38px_rgba(77,54,28,0.16)]">
            <span className="text-[8.5px] font-medium uppercase tracking-[0.08em] text-faint">
              Crop ratio
            </span>
            <p className="mt-0.5 font-display text-[19px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
              4:5
            </p>
            <div className="mt-1.5 flex gap-1 text-[8px]">
              <span className="rounded-full border border-line px-1.5 py-0.5 text-faint">1:1</span>
              <span className="rounded-full bg-ink px-1.5 py-0.5 font-medium text-white">4:5</span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-faint">16:9</span>
            </div>
          </div>

          <div className="absolute bottom-0 left-6 flex rotate-[2.5deg] items-center gap-2 rounded-[12px] border border-white/80 bg-white px-3 py-2 shadow-[0_18px_38px_rgba(77,54,28,0.18)]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f5f2ec] text-muted">
              <RotateCw size={11} aria-hidden />
            </span>
            <span>
              <span className="block text-[9px] font-medium text-ink">Rotate · scale</span>
              <span className="block text-[8px] text-faint">1080 × 1350 · 45%</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
