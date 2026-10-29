import Link from "next/link";
import { Check, Cloud } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";

export function UpscalerHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f2ede4]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe6d9_0%,#eeb49d_46%,#c8795f_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[32%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e9f1ea_0%,#bfd2c5_50%,#8ca596_100%)] opacity-30"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]"
          >
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">AI upscale</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="credits">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                2 credits
              </Badge>
              <Badge tone="neutral">
                <Cloud size={10} aria-hidden />
                Cloud AI
              </Badge>
            </div>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.45rem,5vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
            {tool.h1}
          </h1>
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#6a6156]">
            Recover detail at 2× or 4× with a model built for photos, illustration and
            product shots. Your image uploads only when you run it.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              2× and 4×
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Detail + face restore
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              No watermark
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#upscaler"
              className={buttonClasses("primary", "md", "rounded-full px-5")}
            >
              Open the upscale lab
              <ArrowRightGlyph size={14} />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#786e61]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              2 credits per image
            </span>
          </div>
        </div>

        <div aria-hidden className="relative hidden min-h-[336px] xl:block">
          <div className="absolute right-0 top-0 w-[330px] rotate-[1.5deg] rounded-[20px] border border-white/10 bg-[#121214] p-4 text-white shadow-[0_30px_60px_rgba(15,15,16,0.28)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold">AI detail</p>
                <p className="mt-0.5 truncate text-[8.5px] text-white/40">
                  campaign-shot.jpg · 640 × 480
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[8px] font-semibold text-[#ffb7a6]">
                4× UPSCALE
              </span>
            </div>

            <div className="relative mt-3 h-[168px] overflow-hidden rounded-[12px] bg-[linear-gradient(155deg,#d9e6df_0%,#efd8b7_52%,#b87958_53%,#694a3d_100%)]">
              <span className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-[#f8d9a8]/90" />
              <span className="absolute -bottom-8 -left-5 h-24 w-24 rounded-full bg-[#6b806f]" />
              <span
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <span className="absolute left-[58%] top-[18%] h-[68px] w-[68px] rounded-full border-2 border-white/85 bg-[linear-gradient(155deg,#d9e6df_0%,#efd8b7_52%,#b87958_53%,#694a3d_100%)] bg-[length:220%_220%] bg-[position:65%_42%] shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
              <span className="absolute left-[58%] top-[18%] grid h-[68px] w-[68px] place-items-center">
                <span className="h-px w-3 bg-white/70" />
                <span className="absolute h-3 w-px bg-white/70" />
              </span>
              <span className="absolute bottom-2 left-2 rounded-full bg-black/35 px-2 py-0.5 text-[7.5px] font-medium text-white/70 backdrop-blur">
                Source detail · loupe
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="flex items-center gap-1.5 text-[8.5px] tabular-nums text-white/45">
                640 × 480
                <ArrowRightGlyph size={9} />
                2560 × 1920
              </span>
              <span className="inline-flex items-center gap-1 text-[8.5px] font-medium text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                2 credits
              </span>
            </div>
          </div>

          <div className="absolute left-0 top-9 inline-flex -rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6e6458] shadow-[0_14px_30px_rgba(77,54,28,0.14)]">
            <Cloud size={9} aria-hidden />
            Cloud run · deleted in 1h
          </div>

          <div className="absolute bottom-0 left-4 w-[152px] rotate-[2.5deg] rounded-[13px] border border-white/80 bg-white p-3 shadow-[0_20px_42px_rgba(77,54,28,0.18)]">
            <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-faint">
              Run cost
            </span>
            <p className="mt-0.5 font-display text-[19px] font-semibold leading-none tracking-[-0.02em] text-ink">
              2 credits
            </p>
            <p className="mt-1 text-[8px] leading-relaxed text-faint">
              per image · refunded on failure
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
