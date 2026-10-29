import Link from "next/link";
import { Check, Cloud, Play } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";

export function VocalRemoverHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f6f0eb]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f9ece1_0%,#e8c7c0_46%,#c89a92_100%)] opacity-45"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#edf3ec_0%,#c4d6c8_50%,#93aa9c_100%)] opacity-35"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Stem studio</span>
          </nav>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/80 bg-white/65 text-ink backdrop-blur-sm">
              <ToolGlyph path={tool.path} size={21} />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="credits">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />4 credits / min
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
            Split a song or recording into clean stems. Choose vocals and instrumental, or
            go deeper with four stems — four credits per started minute.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
2 or 4 stems
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Karaoke ready
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              WAV or MP3
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#vocal-remover"
              className={buttonClasses("primary", "md", "rounded-full px-5")}
            >
              Open the stem studio
              <ArrowRightGlyph size={14} />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#786e61]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />4 credits per
              started minute
            </span>
          </div>
        </div>

        <div aria-hidden className="relative hidden min-h-[320px] xl:block">
          <div className="absolute right-0 top-0 w-[318px] rotate-[1.5deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_26px_50px_rgba(77,54,28,0.15)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10.5px] font-semibold text-ink">midnight-drive.wav</p>
                <p className="mt-0.5 text-[8.5px] text-faint">3:42 · stereo · 48 kHz</p>
              </div>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[7.5px] font-semibold text-white">
                2 STEMS
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[9px] border border-line bg-[#fffaf7] p-2.5">
                <div className="flex items-center justify-between text-[8px]">
                  <span className="flex items-center gap-1.5 font-medium text-[#a8432c]">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Vocals
                  </span>
                  <span className="text-faint">lead + backing</span>
                </div>
                <div className="mt-1.5">
                  <MiniWaveform bars={38} height={26} progress={0.45} seed={3} tone="coral" />
                </div>
              </div>
              <div className="rounded-[9px] border border-line bg-[#f9fbf8] p-2.5">
                <div className="flex items-center justify-between text-[8px]">
                  <span className="flex items-center gap-1.5 font-medium text-[#3f6b4f]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8fae9f]" />
                    Instrumental
                  </span>
                  <span className="text-faint">music bed</span>
                </div>
                <div className="mt-1.5">
                  <MiniWaveform bars={38} height={26} progress={0.6} seed={7} tone="sage" />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                  <Play size={11} fill="currentColor" className="ml-0.5" />
                </span>
                <span className="text-[8px] text-faint">0:00 / 3:42</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[8.5px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />4 credits/min
              </span>
            </div>
          </div>

          <div className="absolute left-0 top-9 inline-flex -rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6e6458] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8fae9f]" aria-hidden />
            Karaoke ready
          </div>
        </div>
      </div>
    </header>
  );
}
