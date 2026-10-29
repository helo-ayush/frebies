import Link from "next/link";
import { ArrowRightGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import {
  categories,
  tools,
  toolsForCategory,
  type CategorySlug,
} from "@/lib/registry/tools";

const styles: Record<
  CategorySlug,
  { card: string; orb: string; glyph: string; count: string }
> = {
  image: {
    card: "bg-[#f6eee4]",
    orb: "bg-[radial-gradient(circle_at_35%_28%,#ffe9c7_0%,#f4bd86_46%,#dc8964_100%)]",
    glyph: "/image/convert",
    count: "text-[#816653]",
  },
  document: {
    card: "bg-[#f0eef5]",
    orb: "bg-[radial-gradient(circle_at_35%_28%,#efe7ff_0%,#cbbce8_46%,#9d97cf_100%)]",
    glyph: "/document/merge-pdf",
    count: "text-[#6b6384]",
  },
  audio: {
    card: "bg-[#edf3ee]",
    orb: "bg-[radial-gradient(circle_at_35%_28%,#e3f8ea_0%,#aad9be_46%,#6da187_100%)]",
    glyph: "/audio/text-to-speech",
    count: "text-[#5c7867]",
  },
};

export function CategoryCards() {
  return (
    <section aria-labelledby="category-heading" className="mt-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 id="category-heading" className="font-display text-[21px] font-semibold tracking-[-0.025em]">
            Browse by category
          </h2>
          <span className="hidden text-micro text-faint sm:inline">A quieter way into the toolbox</span>
        </div>
        <Link
          href="#tools"
          className="group inline-flex items-center gap-1.5 text-micro font-medium text-muted hover:text-ink"
        >
          All {tools.length} tools
          <ArrowRightGlyph size={12} />
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {categories.map((category) => {
          const count = toolsForCategory(category.slug).length;
          const sample = toolsForCategory(category.slug).slice(0, 3);
          const visual = styles[category.slug];

          return (
            <Link
              key={category.slug}
              href={`/${category.slug}`}
              className={`group relative flex min-h-[232px] flex-col overflow-hidden rounded-[24px] border border-line p-5 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#d5cfc5] ${visual.card}`}
            >
              <span
                aria-hidden
                className={`absolute -right-14 -top-16 h-48 w-48 rounded-full opacity-60 transition-transform duration-500 group-hover:scale-110 ${visual.orb}`}
              />

              <div className="relative flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/75 bg-white/70 text-ink backdrop-blur-sm">
                  <ToolGlyph path={visual.glyph} size={21} />
                </span>
                <span className="flex items-center gap-1.5 text-micro font-medium text-[#6f675d]">
                  <span className={visual.count}>{count} tools</span>
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-white/55 text-muted transition-colors group-hover:bg-white group-hover:text-ink">
                    <ArrowRightGlyph size={12} />
                  </span>
                </span>
              </div>

              <div className="relative mt-auto pt-9">
                <h3 className="font-display text-[27px] font-semibold leading-none tracking-[-0.035em]">
                  {category.name}
                </h3>
                <p className="mt-2 max-w-[290px] text-ui leading-relaxed text-[#6c665e]">
                  {category.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {sample.map((tool) => (
                    <span
                      key={tool.path}
                      className="rounded-full border border-white/65 bg-white/45 px-2.5 py-1 text-[10.5px] font-medium text-[#6d655a] backdrop-blur-sm"
                    >
                      {tool.shortName ?? tool.name}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
