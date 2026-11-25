import Link from "next/link";
import type { Category, Tool } from "@/lib/registry/tools";
import { getRelatedTools } from "@/lib/registry/tools";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { FaqList } from "@/components/site/FaqList";
import { Arrow } from "@/components/site/kit";
import { Seam, seamLabel } from "@/components/ui/Seam";

/** Everything under the studio: how it works, why, related tools, questions. */
export function SeoContent({ tool, category }: { tool: Tool; category: Category }) {
  const related = getRelatedTools(tool);
  const noun =
    tool.category === "image" ? "image" : tool.category === "audio" ? "audio file" : tool.category === "video" ? "video" : "document";
  const steps =
    tool.seo.howItWorks.length > 0
      ? tool.seo.howItWorks
      : [
          `Add the ${noun} you want to work with.`,
          "Choose the output settings that fit your task, with the cost visible before you run.",
          "Review the result and download your finished file.",
        ];
  const benefits =
    tool.seo.benefits.length > 0
      ? tool.seo.benefits
      : [
          tool.engine === "browser"
            ? "Runs on your device, so everyday files stay with you."
            : "Clear credit pricing, with failed runs refunded automatically.",
          "A focused workspace with no watermarks.",
        ];

  return (
    <div className="border-t border-line">
      {tool.status === "soon" ? (
        <p className="flex items-center gap-3 border-b border-line bg-panel px-[var(--fb-pad)] py-4 text-[15px]">
          <Seam tool={tool} className="shrink-0" />
          This tool is a preview and is not connected yet. Below is how it will work.
        </p>
      ) : null}
      <section aria-label={`How ${tool.name} works`}>
        <h2 className="sr-only">How {tool.name} works</h2>
        <ol className="grid grid-cols-1 border-b border-line lg:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className={`flex flex-col border-line px-[var(--fb-pad)] py-[clamp(28px,3vw,48px)] max-lg:border-b max-lg:last:border-b-0 lg:border-l lg:first:border-l-0 ${
                index === 0 ? "bg-ink-2 text-white" : index === 2 ? "bg-panel" : ""
              }`}
            >
              <span className={`text-[13px] ${index === 0 ? "text-white/50" : "text-faint"}`}>// 0{index + 1}</span>
              <p className={`mt-8 max-w-[420px] text-[17px] leading-[1.45] ${index === 0 ? "text-white/85" : ""}`}>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,32%)]">
        <div className="px-[var(--fb-pad)] py-[clamp(40px,5vw,84px)]">
          <h2 className="fb-wide text-[clamp(25px,2.5vw,40px)]">Why this one</h2>
          <ul className="mt-8 max-w-[760px] border-t border-line-strong">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-4 border-b border-line py-5 text-[16px] leading-[1.5]">
                <span aria-hidden className="fb-sq mt-[7px] !h-[10px] !w-[10px]" />
                {benefit}
              </li>
            ))}
          </ul>

          {tool.seo.faq.length > 0 ? (
            <div className="mt-[clamp(44px,5vw,80px)] max-w-[820px]">
              <h2 className="fb-wide text-[clamp(25px,2.5vw,40px)]">Before you ask</h2>
              <FaqList items={tool.seo.faq} className="mt-8" />
            </div>
          ) : null}
        </div>

        <aside className="border-line bg-panel max-lg:border-t lg:border-l">
          <div className="lg:sticky lg:top-[var(--fb-bar)]">
            <h2 className="fb-wide px-[clamp(18px,2vw,32px)] pb-5 pt-[clamp(40px,5vw,84px)] text-[22px]">Next job</h2>
            <ul className="border-t border-line">
              {related.map((item) => (
                <li key={item.path} className="border-b border-line">
                  <Link
                    href={item.path}
                    className="group flex items-center gap-4 px-[clamp(18px,2vw,32px)] py-4 transition-colors hover:bg-ink hover:text-white"
                  >
                    <ToolGlyph path={item.path} size={21} className="shrink-0 text-muted group-hover:text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold">{item.name}</span>
                      <span className="block truncate text-[13px] text-muted group-hover:text-white/60">{item.tagline}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[12px] uppercase text-faint group-hover:text-white/65">
                      {seamLabel(item)}
                      <Seam tool={item} className={item.tier === "credits" ? "group-hover:!bg-white/70" : ""} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="px-[clamp(18px,2vw,32px)] py-8">
              <Link href={`/${category.slug}`} className="fb-link">
                All {category.title.toLowerCase()}
                <Arrow />
              </Link>
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
