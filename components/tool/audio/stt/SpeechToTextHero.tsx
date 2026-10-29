import Link from "next/link";
import { Check, Cloud, FileText } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";

export function SpeechToTextHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f2f2ea]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f3f4e6_0%,#d5d9bd_46%,#acb28b_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdeee4_0%,#edc9b1_50%,#d09a7e_100%)] opacity-30"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#74735f]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#97947c]" />
            <span className="text-[#65644f]">Transcript studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="credits">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />2 credits / min
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
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#686754]">
            Turn recordings into clean text with timestamps and speaker labels. Export TXT,
            SRT or VTT — two credits per started minute.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6b6a55]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Timestamps
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Speaker labels
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              TXT, SRT, VTT
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#speech-to-text"
              className={buttonClasses("primary", "md", "rounded-full px-5")}
            >
              Open the transcript studio
              <ArrowRightGlyph size={14} />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#74735f]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />2 credits per
              started minute
            </span>
          </div>
        </div>

        <div aria-hidden className="relative hidden min-h-[320px] xl:block">
          <div className="absolute left-0 top-1 w-[238px] -rotate-[3deg] rounded-[15px] border border-white/80 bg-white p-3.5 shadow-[0_24px_48px_rgba(63,62,43,0.14)]">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-semibold text-ink">interview.mp3</span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[7.5px] text-faint">
                0:24:12
              </span>
            </div>
            <div className="mt-3">
              <MiniWaveform bars={38} height={38} progress={0.52} />
            </div>
            <p className="mt-2 text-[8px] text-faint">Detected: English · 2 speakers</p>
          </div>

          <div className="absolute right-0 top-[104px] w-[272px] rotate-[1.5deg] rounded-[15px] border border-white/80 bg-white p-3.5 shadow-[0_26px_52px_rgba(63,62,43,0.16)]">
            <div className="flex items-center justify-between border-b border-line-soft pb-2">
              <span className="flex items-center gap-1.5 text-[9.5px] font-semibold text-ink">
                <FileText size={10} aria-hidden />
                Transcript
              </span>
              <span className="rounded-full bg-[#eef4ee] px-1.5 py-0.5 text-[7.5px] font-medium text-[#3f6b4f]">
                SRT
              </span>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center gap-2 text-[7.5px] tabular-nums text-[#a09a89]">
                  <span>00:00</span>
                  <span className="h-1 w-1 rounded-full bg-accent" />
                  <span>Speaker 1</span>
                </div>
                <span className="mt-1 block h-1.5 w-11/12 rounded-full bg-[#e9e4d9]" />
                <span className="mt-1 block h-1.5 w-3/4 rounded-full bg-[#eeeae0]" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[7.5px] tabular-nums text-[#a09a89]">
                  <span>00:04</span>
                  <span className="h-1 w-1 rounded-full bg-[#8fae9f]" />
                  <span>Speaker 2</span>
                </div>
                <span className="mt-1 block h-1.5 w-full rounded-full bg-[#e9e4d9]" />
                <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-[#eeeae0]" />
              </div>
            </div>
            <p className="mt-3 border-t border-line-soft pt-2 text-[7.5px] text-faint">
              Editable · 14 min read
            </p>
          </div>

          <span className="absolute left-[12px] top-[168px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
            <ArrowRightGlyph size={15} />
          </span>
          <span className="absolute right-[12px] top-[10px] inline-flex rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6b6a55] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />2 credits / minute
          </span>
        </div>
      </div>
    </header>
  );
}
