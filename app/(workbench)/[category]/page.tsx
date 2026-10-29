import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  FileStack,
  Gauge,
  ShieldCheck,
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
    <>
      <JsonLd data={categoryJsonLd(category)} />

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-rail">
              <Icon size={17} strokeWidth={1.55} aria-hidden />
            </span>
            <span className="text-micro font-medium text-faint">{categoryTools.length} focused workspaces</span>
          </div>
          <h1 className="mt-4 font-display text-[32px] font-semibold tracking-[-0.035em]">
            {category.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{category.description}</p>
        </div>
        <a
          href="#tools"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-ui font-medium hover:bg-hover"
        >
          Browse all tools
          <ArrowRight size={14} aria-hidden />
        </a>
      </header>

      <section className="relative mt-7 overflow-hidden rounded-[18px] border border-line bg-[#f8f8f6]">
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="p-6 sm:p-8">
            <p className="text-micro font-medium text-faint">{showcase.eyebrow}</p>
            <h2 className="mt-3 max-w-md font-display text-[26px] font-semibold leading-tight tracking-[-0.03em]">
              {showcase.title}
            </h2>
            <p className="mt-3 max-w-lg text-ui leading-relaxed text-muted">{showcase.copy}</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
              {showcase.points.map((point) => (
                <span key={point} className="flex items-center gap-1.5 text-micro text-muted">
                  <Check size={12} className="text-ink" aria-hidden />
                  {point}
                </span>
              ))}
            </div>
          </div>
          <div aria-hidden className="relative hidden min-h-[220px] overflow-hidden lg:block">
            <span className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff2dc_0%,#efc9a5_35%,#d58e72_70%,#93504b_100%)] opacity-80" />
            <div className="absolute bottom-7 left-4 right-8 flex items-end gap-3">
              {categoryTools.slice(0, 3).map((tool, index) => {
                const ToolIcon = tool.icon;
                return (
                  <span
                    key={tool.path}
                    className="grid flex-1 place-items-center rounded-[14px] border border-white/70 bg-white/80 backdrop-blur-sm"
                    style={{ height: `${78 + index * 22}px` }}
                  >
                    <ToolIcon size={23} strokeWidth={1.35} className="text-muted" />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="tools" className="mt-11 scroll-mt-24">
        <div className="mb-5">
          <h2 className="font-display text-[21px] font-semibold tracking-[-0.025em]">Find your tool</h2>
          <p className="mt-1 text-ui text-muted">Search by task or narrow the list to free and AI tools.</p>
        </div>
        <ToolDirectory category={category.slug} />
      </section>

      <section className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-micro font-medium text-faint">Made for the everyday</p>
            <h2 className="mt-1.5 font-display text-[21px] font-semibold tracking-[-0.025em]">One toolbox, fewer detours.</h2>
          </div>
          <ShieldCheck size={19} strokeWidth={1.4} className="text-faint" aria-hidden />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {showcase.useCases.map((item, index) => {
            const UseCaseIcon = item.icon;
            return (
              <article key={item.title} className="rounded-[14px] border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-rail text-muted">
                    <UseCaseIcon size={17} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="font-display text-[22px] font-medium text-line">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-ui leading-relaxed text-muted">{item.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-14 border-t border-line-soft pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">About {category.title.toLowerCase()}</h2>
            {category.intro.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{paragraph}</p>
            ))}
          </div>

          <aside>
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Frequently asked questions</h2>
            <div className="mt-3 border-t border-line-soft">
              {category.faq.map((item) => (
                <details key={item.q} className="group border-b border-line-soft py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
                    {item.q}
                    <ChevronDown size={15} className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-2.5 text-ui leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
