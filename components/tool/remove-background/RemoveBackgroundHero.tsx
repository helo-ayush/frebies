import Link from "next/link";
import { Check, Cloud } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";

export function RemoveBackgroundHero({
  tool,
  category,
}: {
  tool: Tool;
  category: Category;
}) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#eef1ea]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f4f6e8_0%,#cbd6c2_46%,#9aae95_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdeee3_0%,#eec8ae_50%,#d39a7c_100%)] opacity-30"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-micro font-medium text-[#6f7565]"
          >
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#959d8b]" />
            <span className="text-[#646a5b]">Cutout studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="credits">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />1 credit
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
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#5f6756]">
            Clean cut-outs for products, portraits and screenshots. One credit gets you a
            transparent PNG with refined edges and an optional new background.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#636b59]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Transparent PNG
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Edge refinement
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              No watermark
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#remove-background"
              className={buttonClasses("primary", "md", "rounded-full px-5")}
            >
              Open the cutout studio
              <ArrowRightGlyph size={14} />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#6f7565]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />1 credit
              per image
            </span>
          </div>
        </div>

        <div aria-hidden className="relative hidden min-h-[330px] xl:block">
          <div className="absolute right-0 top-0 w-[326px] rotate-[1.5deg] rounded-[18px] border border-white/80 bg-white p-3.5 shadow-[0_28px_55px_rgba(55,60,45,0.16)]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold text-ink">cutout.png</p>
                <p className="mt-0.5 text-[8.5px] text-faint">product-shot.jpg · 1600 × 1600</p>
              </div>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[7.5px] font-semibold text-white">
                PNG
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="relative h-[168px] overflow-hidden rounded-[10px] bg-[linear-gradient(155deg,#efe0ca_0%,#d9bf9a_60%,#b38d63_100%)]">
                <span className="absolute left-2 top-2 rounded-full bg-white/80 px-1.5 py-0.5 text-[7px] font-medium text-[#6e6456]">
                  Original
                </span>
                <span className="absolute inset-0 grid place-items-center">
                  <ProductShot />
                </span>
              </div>

              <div className="checkerboard relative h-[168px] overflow-hidden rounded-[10px] border border-line">
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[7px] font-medium text-[#3f6b4f]">
                  Cutout
                </span>
                <span className="absolute inset-[10%] rounded-[10px] border border-dashed border-[#aab4a1]" />
                <span className="absolute inset-0 grid place-items-center">
                  <ProductShot />
                </span>
                <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[7px] font-medium text-[#3f6b4f]">
                  alpha
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
              <span className="text-[8.5px] text-faint">Transparent · refined edges</span>
              <span className="inline-flex items-center gap-1 text-[8.5px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />1 credit
              </span>
            </div>
          </div>

          <div className="absolute left-0 top-10 inline-flex -rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6f7565] shadow-[0_14px_30px_rgba(55,60,45,0.14)]">
            <Cloud size={9} aria-hidden />
            Cloud run · deleted in 1h
          </div>

          <div className="absolute bottom-0 left-4 w-[154px] rotate-[2.5deg] rounded-[13px] border border-white/80 bg-white p-3 shadow-[0_20px_42px_rgba(55,60,45,0.16)]">
            <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-faint">
              Output
            </span>
            <p className="mt-0.5 font-display text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink">
              Transparent PNG
            </p>
            <p className="mt-1 text-[8px] leading-relaxed text-faint">
              hair, product edges and soft shadows
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProductShot() {
  return (
    <span className="relative block h-[92px] w-[54px]">
      <span className="absolute left-1/2 top-0 h-3 w-6 -translate-x-1/2 rounded-t-[3px] bg-[#3b362e]" />
      <span className="absolute inset-x-0 bottom-0 top-2 rounded-[10px] bg-[linear-gradient(100deg,#d9b88f_0%,#f0d6b4_45%,#c69f76_100%)] shadow-[0_10px_18px_rgba(65,50,30,0.18)]" />
      <span className="absolute left-1/2 top-[36px] h-4 w-8 -translate-x-1/2 rounded-[2px] bg-white/80" />
      <span className="absolute left-1/2 top-[39px] h-1 w-5 -translate-x-1/2 rounded bg-[#b58b60]" />
      <span className="absolute left-2 top-3 h-8 w-1 rounded-full bg-white/35" />
    </span>
  );
}
