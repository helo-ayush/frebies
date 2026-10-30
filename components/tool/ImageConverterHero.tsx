import Link from "next/link";
import { Check } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import {
  ArrowRightGlyph,
  ChevronGlyph,
  ToolGlyph,
} from "@/components/icons/NavGlyph";

export function ImageConverterHero({
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
        className="absolute -right-24 -top-36 h-[430px] w-[430px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1d8_0%,#f5b985_45%,#dd8161_100%)] opacity-75"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[38%] h-56 w-56 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eee8ff_0%,#c5b8e6_48%,#9096ce_100%)] opacity-20"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Image studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="free">Free</Badge>
              <Badge tone="neutral">Runs on your device</Badge>
              <Badge tone="neutral">No upload</Badge>
            </div>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.45rem,5vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
            Image Converter
          </h1>
          <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-[#6a6156]">
            Convert between 12 formats: JPG, PNG, WebP, AVIF, PDF, SVG, TIFF, BMP, ICO, TGA, GIF & EPS with precision quality controls.
            Convert single files or batch up to 20 images with instant ZIP download — all processed locally.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              12 output formats (Web, Docs, Pro)
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Batch ZIP download
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Quality & background controls
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Up to 25 MB
            </span>
          </div>

          <Link
            href="#converter"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Choose images
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[255px] xl:block">
          <div className="absolute right-5 top-2 h-[230px] w-[230px] rounded-full border border-white/30" />

          <div className="absolute left-0 top-1 w-[220px] -rotate-[4deg] rounded-[17px] border border-white/80 bg-white p-3.5 shadow-[0_22px_45px_rgba(77,54,28,0.14)]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-semibold text-ink">iphone-shot.heic</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[8px] text-faint">HEIC</span>
            </div>
            <div className="relative mt-2.5 h-[108px] overflow-hidden rounded-[10px] bg-[linear-gradient(160deg,#d9e6df_0%,#efd8b7_55%,#b87958_56%,#694a3d_100%)]">
              <span className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-[#f8d9a8]/90" />
              <span className="absolute -bottom-7 -left-4 h-24 w-24 rounded-full bg-[#6b806f]" />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[8px] text-faint">
              <span>4032 × 3024</span>
              <span>4.2 MB</span>
            </div>
          </div>

          <div className="absolute bottom-0 right-2 w-[210px] rotate-[3deg] rounded-[17px] border border-white/80 bg-white p-3.5 shadow-[0_24px_48px_rgba(77,54,28,0.17)]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-semibold text-ink">iphone-shot.webp</span>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[8px] text-white">WebP 90%</span>
            </div>
            <div className="relative mt-2.5 h-[74px] overflow-hidden rounded-[9px] bg-[linear-gradient(160deg,#d9e6df_0%,#efd8b7_55%,#b87958_56%,#694a3d_100%)]">
              <span className="absolute -right-4 -top-6 h-16 w-16 rounded-full bg-[#f8d9a8]/90" />
              <span className="absolute -bottom-6 -left-3 h-20 w-20 rounded-full bg-[#6b806f]" />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[8px]">
              <span className="text-faint">780 KB · -81%</span>
              <span className="font-medium text-[#55725e]">Ready</span>
            </div>
          </div>

          <div className="absolute left-[34px] top-[150px] grid h-9 w-9 place-items-center rounded-full border border-white/75 bg-white text-ink shadow-sm">
            <ArrowRightGlyph size={15} />
          </div>
        </div>
      </div>
    </header>
  );
}
