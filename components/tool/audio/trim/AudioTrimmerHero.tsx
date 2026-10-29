import Link from "next/link";
import { Check, Play, Scissors } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";

export function AudioTrimmerHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f6f0e7]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f7ece0_0%,#eacdae_48%,#c99b74_100%)] opacity-50"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eef3ea_0%,#c9d8ca_50%,#9ab09e_100%)] opacity-35"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Waveform studio</span>
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
            Cut a clip to the exact moment. Drag the selection across the waveform, preview
            the loop, add fades and export — all on this device.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Drag selection
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Fade in & out
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Lossless output
            </span>
          </div>

          <Link
            href="#audio-trim"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Open the waveform
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[300px] xl:block">
          <div className="absolute right-0 top-0 w-[330px] rotate-[1.5deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_26px_50px_rgba(77,54,28,0.16)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10.5px] font-semibold text-ink">episode-04.m4a</p>
                <p className="mt-0.5 text-[8.5px] text-faint">1:12:08 · stereo · 44.1 kHz</p>
              </div>
              <span className="rounded-full border border-line px-2 py-0.5 text-[8px] text-faint">
                M4A
              </span>
            </div>

            <div className="relative mt-4 px-1">
              <MiniWaveform bars={56} height={72} progress={0.48} />
              <div className="absolute inset-y-0 left-[26%] right-[24%] rounded-[4px] border-x-2 border-accent bg-accent/[0.07]" />
              <span className="absolute -top-1 left-[26%] h-9 w-2.5 -translate-x-1/2 rounded-full border border-white bg-accent shadow-sm" />
              <span className="absolute -top-1 right-[24%] h-9 w-2.5 translate-x-1/2 rounded-full border border-white bg-accent shadow-sm" />
              <span className="absolute inset-y-1 left-[48%] w-px bg-ink/50" />
            </div>

            <div className="mt-2 flex items-center justify-between text-[8px] tabular-nums text-faint">
              <span>0:08.2</span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-[#a8432c]">
                0:28.2 selected
              </span>
              <span>0:36.4</span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
              <span className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                  <Play size={11} fill="currentColor" className="ml-0.5" />
                </span>
                <span className="text-[8.5px] text-faint">Selection loops</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[8px] font-medium text-ink">
                <Scissors size={9} />
                Trim
              </span>
            </div>
          </div>

          <div className="absolute left-0 top-10 inline-flex -rotate-3 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6e6458] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Waveform stays local
          </div>

          <div className="absolute bottom-0 left-4 w-[150px] rotate-[2.5deg] rounded-[13px] border border-white/80 bg-white p-3 shadow-[0_20px_42px_rgba(77,54,28,0.16)]">
            <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-faint">
              Selection
            </span>
            <p className="mt-0.5 font-display text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
              0:28.2
            </p>
            <p className="mt-1 text-[8px] text-faint">fade in 0.4s · fade out 1.2s</p>
          </div>
        </div>
      </div>
    </header>
  );
}
