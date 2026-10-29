import Link from "next/link";
import { Check, Play } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, ChevronGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";

export function AudioConverterHero({ tool, category }: { tool: Tool; category: Category }) {
  return (
    <header className="relative overflow-hidden rounded-[30px] border border-line bg-[#f5f0e7]">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fdf0e2_0%,#eed2b6_48%,#cfa17d_100%)] opacity-55"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 left-[30%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_30%,#edf3ec_0%,#c3d5c9_50%,#94ab9d_100%)] opacity-35"
      />

      <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-11">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-micro font-medium text-[#786e61]">
            <Link href={`/${category.slug}`} className="transition-colors hover:text-ink">
              {category.title}
            </Link>
            <ChevronGlyph size={11} className="text-[#998d7d]" />
            <span className="text-[#6b6155]">Audio studio</span>
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
            Convert MP3, WAV, M4A and OGG in a player built around your audio. Choose the
            bitrate, sample rate and channels — no upload and no account.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-micro font-medium text-[#6e6458]">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              MP3, WAV, M4A, OGG
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Bitrate control
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-ink" aria-hidden />
              Stays on this device
            </span>
          </div>

          <Link
            href="#audio-convert"
            className={buttonClasses("primary", "md", "mt-6 rounded-full px-5")}
          >
            Open the audio studio
            <ArrowRightGlyph size={14} />
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-[310px] xl:block">
          <div className="absolute left-0 top-2 w-[218px] -rotate-[3deg] rounded-[16px] border border-white/80 bg-white p-3.5 shadow-[0_24px_48px_rgba(77,54,28,0.14)]">
            <div className="flex items-center justify-between">
              <span className="truncate text-[9.5px] font-semibold text-ink">podcast-intro.mp3</span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[7.5px] text-faint">
                MP3
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white">
                <Play size={11} fill="currentColor" className="ml-0.5" aria-hidden />
              </span>
              <MiniWaveform bars={32} height={34} progress={0.4} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[8px] text-faint">
              <span>0:42</span>
              <span>192 kbps</span>
            </div>
          </div>

          <div className="absolute bottom-0 right-0 w-[218px] rotate-[2.5deg] rounded-[16px] border border-white/80 bg-white p-3.5 shadow-[0_26px_52px_rgba(77,54,28,0.17)]">
            <div className="flex items-center justify-between">
              <span className="truncate text-[9.5px] font-semibold text-ink">podcast-intro.wav</span>
              <span className="rounded-full bg-ink px-1.5 py-0.5 text-[7.5px] text-white">WAV</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-ink">
                <Play size={11} fill="currentColor" className="ml-0.5" aria-hidden />
              </span>
              <MiniWaveform bars={32} height={34} progress={0.68} tone="coral" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[8px]">
              <span className="text-faint">Lossless · 44.1 kHz</span>
              <span className="font-medium text-[#3f6b4f]">Ready</span>
            </div>
          </div>

          <span className="absolute left-[196px] top-[132px] grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white text-ink shadow-sm">
            <ArrowRightGlyph size={15} />
          </span>
          <span className="absolute left-[42px] top-[154px] inline-flex -rotate-2 items-center gap-1.5 rounded-full border border-white/80 bg-white px-2.5 py-1 text-[8.5px] font-medium text-[#6e6458] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            No upload
          </span>
        </div>
      </div>
    </header>
  );
}
