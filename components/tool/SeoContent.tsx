import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, Lock, ShieldCheck } from "lucide-react";
import type { Category, Tool } from "@/lib/registry/tools";
import { getRelatedTools } from "@/lib/registry/tools";
import { Badge } from "@/components/ui/Badge";

export function SeoContent({ tool, category }: { tool: Tool; category: Category }) {
  const related = getRelatedTools(tool);
  const steps = tool.seo.howItWorks.length > 0
    ? tool.seo.howItWorks
    : [
        tool.category === "audio" && tool.slug === "text-to-speech"
          ? "Enter or paste the script you want to turn into speech."
          : `Add the ${tool.category === "image" ? "image" : tool.category === "audio" ? "audio file" : "document"} you want to work with.`,
        "Choose the output settings that fit your task, with the cost visible before you run.",
        "Review the result in the workspace and download your finished file.",
      ];
  const benefits = tool.seo.benefits.length > 0
    ? tool.seo.benefits
    : [
        tool.engine === "browser"
          ? "Designed for on-device processing, so everyday files can stay with you."
          : "Clear credit pricing, with failed provider runs automatically refunded.",
        "A focused workspace with no watermarks and no unnecessary detours.",
        "Your recent outputs are organized in one place after you sign in.",
      ];

  return (
    <div className="mt-14 border-t border-line-soft pt-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          <section>
            <p className="text-micro font-medium text-faint">A simpler workflow</p>
            <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em]">How {tool.name.toLowerCase()} works</h2>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step} className="rounded-[13px] border border-line bg-white p-4">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-rail text-micro font-semibold text-muted">
                    {index + 1}
                  </span>
                  <p className="mt-4 text-ui leading-relaxed text-muted">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Made to stay out of your way</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="rounded-[13px] bg-rail p-4 text-ui leading-relaxed text-muted">
                  <Check size={15} className="mb-3 text-ink" aria-hidden />
                  {benefit}
                </li>
              ))}
            </ul>
          </section>

          {tool.seo.faq.length > 0 && (
            <section>
              <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Frequently asked questions</h2>
              <div className="mt-3 border-t border-line-soft">
                {tool.seo.faq.map((item) => (
                  <details key={item.q} className="group border-b border-line-soft py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
                      {item.q}
                      <ChevronDown size={15} className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-2.5 max-w-2xl text-ui leading-relaxed text-muted">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <p className="text-micro text-faint">Last updated October 2026</p>
        </div>

        <aside className="min-w-0">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Related tools</h2>
          <div className="mt-3 space-y-2.5">
            {related.map((item) => (
              <RelatedRow key={item.path} tool={item} />
            ))}
          </div>

          <div className="mt-6 rounded-[13px] border border-line bg-rail p-4">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] border border-line bg-white text-muted">
              <ShieldCheck size={15} strokeWidth={1.5} aria-hidden />
            </span>
            <p className="mt-3 text-ui font-semibold text-ink">
              {tool.engine === "browser" ? "Your everyday files stay private." : "Cloud processing, made clear."}
            </p>
            <p className="mt-1.5 text-micro leading-relaxed text-muted">
              {tool.engine === "browser"
                ? "This tool is designed to run in your browser, with no account and no upload."
                : "AI runs use private temporary storage. You see the credit cost before anything starts."}
            </p>
            <Link
              href={`/${category.slug}`}
              className="mt-3 inline-flex items-center gap-1 text-ui font-medium text-ink hover:underline"
            >
              All {category.title.toLowerCase()}
              <ArrowUpRight size={13} aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RelatedRow({ tool }: { tool: Tool }) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.path}
      className="group flex items-center gap-2.5 rounded-[11px] border border-line bg-white p-2.5 transition-colors hover:bg-hover"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-line bg-rail">
        <Icon size={16} strokeWidth={1.6} className="text-ink" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-ui font-medium text-ink">
          {tool.name}
          {tool.tier === "credits" && <Lock size={10} className="text-faint" aria-hidden />}
        </span>
        <span className="block truncate text-micro text-faint">{tool.tagline}</span>
      </span>
      {tool.status === "soon" ? (
        <Badge tone="soon">Preview</Badge>
      ) : (
        <ArrowUpRight size={14} className="shrink-0 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      )}
    </Link>
  );
}
