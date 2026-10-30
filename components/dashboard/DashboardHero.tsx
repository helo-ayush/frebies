"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowUp, Check } from "lucide-react";
import { ArrowRightGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { AnimatedGradientText } from "@/components/magicui/animated-gradient-text";
import { BlurFade } from "@/components/magicui/blur-fade";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { tools } from "@/lib/registry/tools";

const shortcutPaths = [
  "/image/convert",
  "/document/merge-pdf",
  "/image/remove-background",
  "/audio/speech-to-text",
];

const shortcuts = shortcutPaths
  .map((path) => tools.find((tool) => tool.path === path))
  .filter((tool) => tool !== undefined);

export function DashboardHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return tools
      .filter((tool) =>
        [tool.name, tool.description, tool.tagline, tool.category, ...tool.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 4);
  }, [query]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (matches[0]) router.push(matches[0].path);
  }

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-line bg-[#f3efe7]">
      <DotPattern
        width={20}
        height={20}
        cr={1}
        className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute -right-32 -top-48 h-[470px] w-[470px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff0d8_0%,#f5b784_46%,#d97555_100%)] opacity-70"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 left-[36%] h-64 w-64 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f1eaff_0%,#c9b9ea_48%,#8e93cf_100%)] opacity-25"
      />

      <div className="relative grid gap-10 px-5 py-9 sm:px-8 sm:py-11 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-center xl:px-11 xl:py-12">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-[11.5px] font-medium uppercase tracking-[0.16em] text-[#6f6458]">
            <span aria-hidden className="h-px w-7 bg-accent" />
            <AnimatedGradientText speed={1.6} colorFrom="#8f8578" colorTo="#c98f6c">
              Your workspace
            </AnimatedGradientText>
          </p>

          <BlurFade inView={false} delay={0.02} offset={8} duration={0.55}>
            <h1 className="mt-4 max-w-[590px] font-display text-[clamp(2.25rem,4.4vw,3.7rem)] font-semibold leading-[1.01] tracking-[-0.048em] text-ink">
              What are we making today?
            </h1>
            <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-[#6c645a]">
              Sixteen focused tools for images, documents and audio. Start with an idea, or
              go straight to a tool below.
            </p>
          </BlurFade>

          <BlurFade inView={false} delay={0.12} offset={8} duration={0.55}>
          <form onSubmit={onSubmit} className="relative mt-7 max-w-[650px]" role="search">
            <label htmlFor="dashboard-search" className="sr-only">
              Search tools or describe a file task
            </label>
            <div className="flex h-[58px] items-center gap-2.5 rounded-[18px] border border-white/80 bg-white py-1.5 pl-2 pr-1.5 shadow-[0_10px_35px_rgba(81,58,30,0.08)] transition-colors focus-within:border-[#c8beb0]">
              <span
                aria-hidden
                className="ml-0.5 h-9 w-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)]"
              />
              <input
                id="dashboard-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                type="text"
                autoComplete="off"
                placeholder="Search or describe a job…"
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-[#8b8378] focus-visible:outline-none"
              />
              <button
                type="submit"
                disabled={!matches.length}
                aria-label="Open the best matching tool"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink text-white transition-colors hover:bg-[#2a2a2b] disabled:opacity-25"
              >
                <ArrowUp size={16} aria-hidden />
              </button>
            </div>

            {query.trim() && (
              <div
                aria-live="polite"
                className="mt-2 overflow-hidden rounded-[16px] border border-[#e5dfd4] bg-white shadow-[0_14px_35px_rgba(81,58,30,0.08)]"
              >
                {matches.length > 0 ? (
                  <div className="divide-y divide-line-soft">
                    {matches.map((tool) => (
                      <Link
                        key={tool.path}
                        href={tool.path}
                        className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[#fbfaf7]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-line bg-[#fbfaf8] text-muted">
                          <ToolGlyph path={tool.path} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-ink">
                            {tool.name}
                          </span>
                          <span className="block truncate text-micro text-faint">
                            {tool.tagline}
                          </span>
                        </span>
                        <ArrowRightGlyph size={14} className="shrink-0 text-faint group-hover:text-ink" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-ui font-medium text-ink">No tool matches that yet.</p>
                    <p className="mt-1 text-micro text-muted">
                      Try a file format, such as PDF, WebP or audio.
                    </p>
                  </div>
                )}
                <Link
                  href="#tools"
                  onClick={() => setQuery("")}
                  className="flex items-center justify-between border-t border-line-soft bg-[#fbfaf7] px-3.5 py-2.5 text-micro font-medium text-muted transition-colors hover:text-ink"
                >
                  Browse the full library
                  <ArrowRightGlyph size={12} />
                </Link>
              </div>
            )}
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-micro font-medium text-[#7d7366]">Jump to</span>
            {shortcuts.map((tool) => (
              <Link
                key={tool.path}
                href={tool.path}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#ddd6ca] bg-white/55 px-2.5 text-micro font-medium text-[#645b50] transition-colors hover:border-[#cfc5b7] hover:bg-white hover:text-ink"
              >
                <ToolGlyph path={tool.path} size={13} />
                {tool.shortName ?? tool.name}
              </Link>
            ))}
          </div>
          </BlurFade>
        </div>

        <div aria-hidden className="relative hidden min-h-[370px] xl:block">
          <div className="absolute right-2 top-7 h-[270px] w-[270px] rounded-full bg-[radial-gradient(circle_at_34%_28%,#ffe1b4_0%,#f6b478_42%,#df7b5c_77%,#a34735_100%)] opacity-90" />
          <div className="absolute right-9 top-[74px] h-[210px] w-[210px] rounded-full border border-white/25" />

          <div className="absolute left-0 top-0 w-[294px] -rotate-[2.5deg] rounded-[19px] border border-white/80 bg-white p-4 shadow-[0_28px_55px_rgba(77,54,28,0.17)]">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[9px] border border-line bg-[#fbfaf8] text-ink">
                <ToolGlyph path="/image/convert" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-semibold text-ink">Image Converter</span>
                <span className="mt-0.5 block text-[9px] text-faint">Ready on your device</span>
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[8px] text-faint">Free</span>
            </div>

            <div className="mt-3.5 flex min-h-[124px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#d9d5cd] bg-[#fbfaf8]">
              <span className="grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-white text-muted">
                <ToolGlyph path="/image/convert" size={16} />
              </span>
              <p className="mt-2 text-[10px] font-medium text-ink">portrait.png</p>
              <p className="mt-0.5 text-[8px] text-faint">JPG · 2.4 MB</p>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-[9px] border border-line bg-[#fcfbf9] px-2.5 py-2 text-[9px]">
              <span className="font-medium text-ink">JPG → WebP</span>
              <span className="flex items-center gap-1 text-[#52735d]">
                <Check size={10} /> Ready
              </span>
            </div>
          </div>

          <div className="absolute bottom-1 right-0 w-[238px] rotate-[3deg] rounded-[17px] border border-white/80 bg-white p-3.5 shadow-[0_22px_45px_rgba(77,54,28,0.15)]">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[8px] border border-line bg-[#fbfaf8] text-ink">
                <ToolGlyph path="/document/merge-pdf" size={15} />
              </span>
              <span className="text-[10.5px] font-semibold">Merge PDF</span>
              <span className="ml-auto text-[8px] text-faint">3 files</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {["invoice.pdf", "appendix.pdf", "notes.pdf"].map((name) => (
                <div key={name} className="flex items-center gap-2 rounded-[7px] border border-line/75 px-2 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c9beb0]" />
                  <span className="text-[8px] text-muted">{name}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 rounded-[7px] bg-ink px-2.5 py-2 text-center text-[8px] font-medium text-white">
              Combine documents
            </div>
          </div>

          <div className="absolute bottom-[58px] left-8 flex items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-2.5 py-1.5 text-[9px] font-medium text-[#5b5349] shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#65a37b]" />
            No upload required
          </div>
        </div>
      </div>
    </section>
  );
}
