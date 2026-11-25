import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Check,
  ChevronDown,
  Cloud,
  FileStack,
  Gauge,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { ToolDirectory } from "@/components/dashboard/ToolDirectory";
import { JsonLd } from "@/components/seo/JsonLd";
import { categories, getCategory, toolsForCategory, type CategorySlug } from "@/lib/registry/tools";
import { categoryMetadata } from "@/lib/seo/metadata";
import { categoryJsonLd } from "@/lib/seo/schema";

export const dynamicParams = false;

type CategoryParams = { params: Promise<{ category: string }> };

const showcases: Record<
  CategorySlug,
  {
    eyebrow: string;
    title: string;
    copy: string;
    points: string[];
    useCases: { title: string; copy: string; icon: LucideIcon }[];
  }
> = {
  image: {
    eyebrow: "Every pixel, under your control",
    title: "From quick fixes to AI detail.",
    copy: "Handle everyday image jobs locally, then reach for AI only when you need a heavier lift.",
    points: ["JPG, PNG and WebP", "Up to 25 MB", "No watermark"],
    useCases: [
      { title: "Prepare for the web", copy: "Convert to modern formats and balance quality against file size.", icon: Gauge },
      { title: "Polish product shots", copy: "Remove distractions, create clean cut-outs and recover detail.", icon: WandSparkles },
      { title: "Package and share", copy: "Resize for any channel or arrange images into one tidy PDF.", icon: FileStack },
    ],
  },
  document: {
    eyebrow: "PDFs without the usual friction",
    title: "Make documents work your way.",
    copy: "Combine, extract and convert everyday files, with AI available for text-heavy jobs.",
    points: ["Private by default", "No account for free tools", "Clear AI pricing"],
    useCases: [
      { title: "Organize paperwork", copy: "Merge related documents or pull out only the pages you need.", icon: FileStack },
      { title: "Unlock scanned text", copy: "Turn screenshots and scanned pages into editable, searchable text.", icon: WandSparkles },
      { title: "Reuse anywhere", copy: "Export pages as crisp images for slides, messages and archives.", icon: Cloud },
    ],
  },
  audio: {
    eyebrow: "A focused studio in your browser",
    title: "Shape sound and speech.",
    copy: "Convert and trim recordings, or use AI to move effortlessly between spoken and written words.",
    points: ["MP3, WAV, M4A and OGG", "Natural AI voices", "Speaker-friendly transcripts"],
    useCases: [
      { title: "Clean up recordings", copy: "Trim dead air, convert formats and prepare clips for sharing.", icon: Gauge },
      { title: "Create voiceovers", copy: "Turn scripts into natural speech with a voice and pace that fit.", icon: WandSparkles },
      { title: "Make audio useful", copy: "Transcribe conversations or separate vocals from instrumentals.", icon: FileStack },
    ],
  },
  video: {
    eyebrow: "Built for multi-language video",
    title: "Localize videos without studio overhead.",
    copy: "Transcribe dialogue, translate with scene-aware pacing, and synthesize natural dubbing that keeps music and ambience alive.",
    points: ["MP4, MOV, WebM and MKV", "Voice clone or preset talent", "Ducked background & SRT captions"],
    useCases: [
      { title: "Translate creator videos", copy: "Bring tutorials, commentary and clips to new audiences in minutes.", icon: WandSparkles },
      { title: "Keep speaker identity", copy: "Automatically sample the original speaker's timbre for natural dubbed continuity.", icon: Cloud },
      { title: "Deliver clean mixes", copy: "Duck original ambience during dialogue and export synced MP4 + SRT files.", icon: FileStack },
    ],
  },
};

export function generateStaticParams() {
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: CategoryParams): Promise<Metadata> {
  const { category } = await params;
  const match = getCategory(category);
  return match ? categoryMetadata(match) : {};
}

export default async function CategoryPage({ params }: CategoryParams) {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const categoryTools = toolsForCategory(category.slug);
  const showcase = showcases[category.slug];
  const Icon = category.icon;

  return (
    <div className="mx-auto max-w-[1280px]">
      <JsonLd data={categoryJsonLd(category)} />

      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[16px] bg-ink text-white shadow-[0_12px_24px_-12px_rgba(15,15,16,0.55)]">
          <Icon size={24} strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-[280px]">
          <h1 className="font-display text-[clamp(1.75rem,3.4vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">
            {category.title}
          </h1>
          <p className="mt-1 text-[15px] leading-relaxed text-muted">{category.description}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {showcase.points.map((point) => (
            <span
              key={point}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-muted"
            >
              <Check size={13} className="text-success" aria-hidden />
              {point}
            </span>
          ))}
        </div>
      </header>

      <section id="tools" className="mt-7 scroll-mt-24">
        <ToolDirectory category={category.slug} />
      </section>

      <section className="mt-14">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent-deep">{showcase.eyebrow}</p>
        <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.03em] text-ink">{showcase.title}</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{showcase.copy}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {showcase.useCases.map((item) => {
            const UseCaseIcon = item.icon;
            return (
              <article key={item.title} className="rounded-[18px] border border-line bg-white p-5">
                <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-card text-ink">
                  <UseCaseIcon size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.025em] text-ink">
              About {category.title.toLowerCase()}
            </h2>
            {category.intro.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </div>

          <aside>
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.025em] text-ink">
              Frequently asked questions
            </h2>
            <div className="mt-3 border-t border-line">
              {category.faq.map((item) => (
                <details key={item.q} className="group border-b border-line py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">
                    {item.q}
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-faint transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
