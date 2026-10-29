import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Clock3,
  FilePlus2,
  History,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ToolDirectory } from "@/components/dashboard/ToolDirectory";
import { tools } from "@/lib/registry/tools";

export const metadata: Metadata = {
  title: "Dashboard | frebies",
  robots: { index: false, follow: true },
};

const quickToolPaths = [
  "/image/convert",
  "/image/upscaler",
  "/image/remove-background",
  "/document/merge-pdf",
  "/document/ocr",
  "/audio/text-to-speech",
  "/audio/speech-to-text",
  "/audio/convert",
];

const quickTools = quickToolPaths
  .map((path) => tools.find((tool) => tool.path === path))
  .filter((tool) => tool !== undefined);

export default function DashboardPage() {
  return (
    <div>
      <section className="mx-auto max-w-[920px] pt-3 text-center sm:pt-7">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-rail px-2.5 py-1 text-micro font-medium text-muted">
          <Sparkles size={11} className="text-accent" aria-hidden />
          Your everyday file workspace
        </div>
        <h1 className="mt-4 font-display text-[30px] font-semibold tracking-[-0.035em] text-ink sm:text-[36px]">
          What would you like to get done?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Start with a tool below. Most are free and need no account.
        </p>

        <div className="relative mx-auto mt-7 max-w-[760px] rounded-[22px] border border-line bg-white p-2 shadow-[0_8px_30px_rgba(15,15,16,0.06)]">
          <div className="flex items-center gap-2 rounded-[16px] bg-rail px-3 py-2 sm:px-4">
            <span
              aria-hidden
              className="h-8 w-8 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)]"
            />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Describe what you want to do</span>
              <input
                type="text"
                placeholder="Try “turn this PDF into images”…"
                className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              />
            </label>
            <button
              type="button"
              disabled
              title="The task assistant is not connected yet"
              aria-label="Find a tool from this description"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-30"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-micro text-faint">
          <Link href="/image/convert" className="hover:text-ink">Convert an image</Link>
          <Link href="/document/merge-pdf" className="hover:text-ink">Merge PDFs</Link>
          <Link href="/audio/speech-to-text" className="hover:text-ink">Transcribe audio</Link>
        </div>
      </section>

      <section aria-label="Popular tools" className="mx-auto mt-10 max-w-[980px]">
        <div className="grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-8">
          {quickTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.path} href={tool.path} className="group text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-[13px] border border-line bg-white text-muted transition-all group-hover:-translate-y-0.5 group-hover:border-[#d5d5d2] group-hover:text-ink group-hover:shadow-[0_5px_16px_rgba(15,15,16,0.06)]">
                  <Icon size={20} strokeWidth={1.55} aria-hidden />
                </span>
                <span className="mt-2 block truncate text-micro font-medium text-muted group-hover:text-ink">
                  {tool.shortName ?? tool.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="relative mt-12 overflow-hidden rounded-[18px] border border-line bg-[#fbfaf8]">
        <div className="relative z-10 grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr_auto] lg:items-center">
          <div className="space-y-2.5 text-micro leading-relaxed text-muted">
            <p className="flex items-center gap-2"><Check size={13} className="text-ink" /> No account for free tools</p>
            <p className="flex items-center gap-2"><Check size={13} className="text-ink" /> No watermarks on your files</p>
            <p className="flex items-center gap-2"><Check size={13} className="text-ink" /> Private, on-device processing</p>
            <p className="flex items-center gap-2"><Check size={13} className="text-ink" /> Clear credit costs for AI</p>
          </div>
          <div className="lg:px-4">
            <p className="text-micro font-medium text-accent">A little more room to create</p>
            <h2 className="mt-2 font-display text-[25px] font-semibold tracking-[-0.025em]">25 credits, on us.</h2>
            <p className="mt-2 max-w-md text-ui leading-relaxed text-muted">
              Sign in to try image upscaling, OCR, transcription and natural AI voices.
            </p>
            <Link
              href="/sign-in"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-ui font-medium text-white hover:bg-[#262626]"
            >
              Claim free credits
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div aria-hidden className="relative hidden h-[150px] w-[190px] lg:block">
            <span className="absolute right-2 top-0 h-24 w-24 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)]" />
            <span className="absolute bottom-0 left-0 h-20 w-20 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e7dcff_0%,#b69cff_42%,#6aa7ff_78%,#4b6bff_100%)]" />
            <span className="absolute bottom-2 right-0 h-14 w-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e9fff3_0%,#91d5ae_45%,#45846a_100%)]" />
          </div>
        </div>
      </section>

      <section id="tools" className="mt-12 scroll-mt-24">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.025em]">Explore the toolbox</h2>
            <p className="mt-1 text-ui text-muted">Every file task, with its own focused workspace.</p>
          </div>
          <span className="hidden text-micro text-faint sm:block">{tools.length} workspaces</span>
        </div>
        <ToolDirectory />
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-[14px] border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
            <div className="flex items-center gap-2">
              <History size={15} className="text-muted" aria-hidden />
              <h2 className="text-ui font-semibold">Recent work</h2>
            </div>
            <span className="text-micro text-faint">Saved after sign in</span>
          </div>
          <div className="hidden grid-cols-[1fr_120px_90px] gap-4 border-b border-line-soft px-4 py-2.5 text-micro font-medium text-faint sm:grid">
            <span>File</span><span>Tool</span><span>Created</span>
          </div>
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-rail text-muted">
              <FilePlus2 size={18} strokeWidth={1.5} aria-hidden />
            </span>
            <p className="mt-3 text-ui font-medium text-ink">Your recent files will live here</p>
            <p className="mt-1 max-w-sm text-micro leading-relaxed text-muted">
              Pick any tool to open its workspace. Nothing is uploaded while you browse as a guest.
            </p>
          </div>
        </div>

        <div className="rounded-[14px] border border-line bg-rail p-5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-muted">
            <ShieldCheck size={17} strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="mt-4 text-sm font-semibold">Private by design</h2>
          <p className="mt-2 text-ui leading-relaxed text-muted">
            Everyday tools are designed to run in your browser. AI tools use temporary private files and show their credit cost before a run.
          </p>
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-micro text-faint">
            <Clock3 size={13} aria-hidden />
            Cloud files are scheduled for deletion within one hour.
          </div>
        </div>
      </section>
    </div>
  );
}
