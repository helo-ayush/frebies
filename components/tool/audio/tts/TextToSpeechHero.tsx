import Link from "next/link";
import { Check, Play, Sparkles } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";

export function TextToSpeechHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f7f1e9]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdf0e2_0%,#eccfb2_48%,#cc9f7b_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[28%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eef3ec_0%,#c6d7ca_50%,#96ad9f_100%)] opacity-35"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Voice studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="credits">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />1 credit / 1k chars
              </Badge>
              <Badge tone="neutral">AI voice</Badge>
            </div>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.45rem,5vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
            {tool.h1}
          </h1>
          <p className="mt-3 max-w-[550px] text-[15px] leading-relaxed text-[#6a6156]">
            Turn a script into a natural voiceover. Pick a voice, tune the pace and
            generate audio — one credit per 1,000 characters.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Natural voices
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Pace &amp; pitch
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              MP3 or WAV
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#text-to-speech"
              className={buttonClasses("primary", "md", "rounded-full px-5")}
            >
              Open the voice studio
              <ArrowRightGlyph size={14} />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#786e61]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              25 free credits for new accounts
            </span>
          </div>
        </div>

        <div aria-hidden className="relative hidden min-h-[310px] xl:block">
          <div className="absolute left-0 top-0 w-[246px] -rotate-[3deg] rounded-[16px] border border-white/80 bg-white p-4 shadow-[0_24px_48px_rgba(77,54,28,0.14)]">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-semibold text-ink">Script</span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[7.5px] text-faint">
                312 chars
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <span className="block h-1.5 w-11/12 rounded-full bg-[#e8e2d7]" />
              <span className="block h-1.5 w-full rounded-full bg-[#eee9df]" />
              <span className="block h-1.5 w-4/5 rounded-full bg-[#eee9df]" />
              <span className="block h-1.5 w-2/3 rounded-full bg-[#eee9df]" />
              <span className="block h-1.5 w-5/6 rounded-full bg-[#eee9df]" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-2.5 text-[8px]">
              <span className="text-faint">≈ 0:52</span>
              <span className="font-medium text-[#a8432c]">1 credit</span>
            </div>
          </div>

          <div className="absolute right-0 bottom-0 w-[218px] rotate-[2.5deg] rounded-[16px] border border-white/80 bg-white p-3.5 shadow-[0_26px_52px_rgba(77,54,28,0.16)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9.5px] font-semibold text-ink">Aria</p>
                <p className="mt-0.5 text-[8px] text-faint">Warm · narration</p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                <Play size={11} fill="currentColor" className="ml-0.5" />
              </span>
            </div>
            <div className="mt-3">
              <MiniWaveform bars={34} height={32} progress={0.46} seed={2} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[8px]">
              <span className="text-faint">0:52 · MP3</span>
              <span className="rounded-full bg-[#eef4ee] px-1.5 py-0.5 font-medium text-[#3f6b4f]">
                Natural
              </span>
            </div>
          </div>

          <span className="absolute left-[46px] top-[176px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
            <ArrowRightGlyph size={15} />
          </span>
          <span className="absolute right-[8px] top-[28px] inline-flex rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6e6458] shadow-sm">
            <Sparkles size={9} className="text-accent" />
            1 credit per 1k chars
          </span>
        </div>
      </div>
    </header>
  );
}
