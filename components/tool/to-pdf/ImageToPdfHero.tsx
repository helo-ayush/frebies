import Link from "next/link";
import { Check, ChevronRight, Layers3 } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";

export function ImageToPdfHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f4f0e8]">
      <div
        aria-hidden
        className="absolute -right-24 -top-36 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdf0e4_0%,#eecca9_46%,#d99f7c_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eaf1ee_0%,#bfd1c7_50%,#8fa99a_100%)] opacity-30"
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
            <span className="text-[#6b6155]">PDF studio</span>
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
            Turn JPG and PNG images into one clean PDF. Choose the paper size, margins and
            page order in a document builder that never uploads your files.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              A4, Letter, Legal
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Reorder pages
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              No watermark
            </span>
          </div>

          <Link
            href="#to-pdf"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Add images
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[340px] xl:block">
          <div className="absolute left-0 top-1 w-[118px] -rotate-[5deg] rounded-[13px] border border-white/80 bg-white p-2.5 shadow-[0_20px_42px_rgba(77,54,28,0.16)]">
            <div className="relative h-[92px] overflow-hidden rounded-[7px] bg-[linear-gradient(155deg,#d9e6df_0%,#efd8b7_55%,#b87958_56%,#694a3d_100%)]">
              <span className="absolute -right-4 -top-5 h-12 w-12 rounded-full bg-[#f8d9a8]/90" />
              <span className="absolute -bottom-4 -left-3 h-12 w-12 rounded-full bg-[#6b806f]" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[7.5px]">
              <span className="truncate font-medium text-ink">cover.jpg</span>
              <span className="text-faint">01</span>
            </div>
          </div>

          <div className="absolute left-[38px] top-[156px] w-[126px] rotate-[3deg] rounded-[13px] border border-white/80 bg-white p-2.5 shadow-[0_20px_42px_rgba(77,54,28,0.16)]">
            <div className="relative h-[78px] overflow-hidden rounded-[7px] bg-[linear-gradient(155deg,#e8dccb_0%,#c9b28f_55%,#4f5b4a_56%,#3c4738_100%)]">
              <span className="absolute -right-3 -top-4 h-10 w-10 rounded-full bg-[#f7e7c8]/80" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[7.5px]">
              <span className="truncate font-medium text-ink">detail.jpg</span>
              <span className="text-faint">02</span>
            </div>
          </div>

          <span className="absolute left-[154px] top-[144px] grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
            <ChevronRight size={14} aria-hidden />
          </span>

          <div className="absolute right-0 top-0 w-[234px] rotate-[1.5deg] rounded-[16px] border border-white/80 bg-white p-3.5 shadow-[0_26px_50px_rgba(77,54,28,0.17)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-semibold text-ink">images.pdf</p>
                <p className="mt-0.5 text-[8.5px] text-faint">A4 · Portrait</p>
              </div>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[7.5px] font-semibold text-white">
                PDF
              </span>
            </div>

            <div className="relative mt-3 aspect-[210/297] overflow-hidden rounded-[3px] border border-line bg-white p-2.5 shadow-[0_2px_8px_rgba(15,15,16,0.05)]">
              <div className="relative h-[58%] overflow-hidden rounded-[2px] bg-[linear-gradient(155deg,#d9e6df_0%,#efd8b7_55%,#b87958_56%,#694a3d_100%)]">
                <span className="absolute -right-4 -top-5 h-12 w-12 rounded-full bg-[#f8d9a8]/90" />
              </div>
              <div className="mt-2 space-y-1">
                <span className="block h-[3px] w-4/5 rounded-full bg-[#e7e2d8]" />
                <span className="block h-[3px] w-3/5 rounded-full bg-[#eeeae2]" />
                <span className="block h-[3px] w-2/3 rounded-full bg-[#eeeae2]" />
              </div>
              <span className="absolute bottom-1.5 right-2 text-[6px] text-[#a09a8f]">1 / 3</span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[8px]">
              <span className="flex items-center gap-1 text-faint">
                <Layers3 size={9} aria-hidden />3 pages
              </span>
              <span className="rounded-full bg-[#eef4ee] px-1.5 py-0.5 font-semibold text-[#3d6b4a]">
                Ready
              </span>
            </div>
          </div>

          <div className="absolute bottom-1 left-0 w-[142px] -rotate-[2deg] rounded-[12px] border border-white/80 bg-white px-3 py-2 shadow-[0_18px_38px_rgba(77,54,28,0.18)]">
            <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-faint">
              Page order
            </span>
            <div className="mt-1 flex items-center gap-1 text-[8px]">
              <span className="grid h-4 w-4 place-items-center rounded bg-ink font-semibold text-white">1</span>
              <span className="grid h-4 w-4 place-items-center rounded bg-ink/80 font-semibold text-white">2</span>
              <span className="grid h-4 w-4 place-items-center rounded bg-ink/60 font-semibold text-white">3</span>
              <span className="ml-1 text-[7px] text-faint">in order</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
