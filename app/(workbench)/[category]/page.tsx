import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cloud, FileStack, Gauge, WandSparkles, type LucideIcon } from "lucide-react";
import { CategoryIndex } from "@/components/dashboard/CategoryIndex";
import { FaqList } from "@/components/site/FaqList";
import { JsonLd } from "@/components/seo/JsonLd";
import { categories, getCategory, type CategorySlug } from "@/lib/registry/tools";
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

  const showcase = showcases[category.slug];

  return (
    <>
      <JsonLd data={categoryJsonLd(category)} />
      <CategoryIndex slug={category.slug} title={category.title} description={category.description} />

      <section className="grid grid-cols-1 border-b border-line lg:grid-cols-3">
        {showcase.useCases.map((item, index) => {
          const UseCaseIcon = item.icon;
          return (
            <article
              key={item.title}
              className={`border-line px-[var(--fb-pad)] py-[clamp(30px,3.4vw,56px)] max-lg:border-b max-lg:last:border-b-0 lg:border-l lg:first:border-l-0 ${
                index === 0 ? "bg-ink-2 text-white" : index === 2 ? "bg-panel" : ""
              }`}
            >
              <UseCaseIcon
                size={26}
                strokeWidth={1.4}
                className={index === 0 ? "text-accent" : "text-muted"}
                aria-hidden
              />
              <h2 className="fb-wide mt-10 text-[22px] !leading-[1.08]">{item.title}</h2>
              <p className={`mt-3.5 max-w-[400px] text-[15.5px] leading-[1.5] ${index === 0 ? "text-white/70" : "text-muted"}`}>
                {item.copy}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-y-10 px-[var(--fb-pad)] py-[clamp(48px,6vw,100px)] lg:grid-cols-[38%_minmax(0,1fr)]">
        <div className="max-w-[420px]">
          <h2 className="fb-wide text-[clamp(26px,2.7vw,44px)]">About {category.title.toLowerCase()}</h2>
          {category.intro.map((paragraph) => (
            <p key={paragraph} className="mt-5 text-[15.5px] leading-[1.55] text-muted">
              {paragraph}
            </p>
          ))}
        </div>
        <FaqList items={category.faq} />
      </section>
    </>
  );
}
