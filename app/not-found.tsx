import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { IsoBlock } from "@/components/site/blocks";
import { Arrow } from "@/components/site/kit";
import { ToolSearch } from "@/components/site/ToolSearch";
import { categories } from "@/lib/registry/tools";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-line px-[var(--fb-pad)]">
        <Wordmark href="/" size={26} />
        <Link href="/dashboard" className="fb-btn">
          Open the tools
        </Link>
      </div>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)]">
        <div className="flex flex-col justify-center px-[var(--fb-pad)] py-12">
          <p className="text-[14px] uppercase text-muted">[404 // empty]</p>
          <h1 className="fb-wide mt-5 text-[clamp(44px,7.4vw,132px)]">
            Nothing
            <br />
            in this one.
          </h1>
          <p className="mt-6 max-w-[440px] text-[16px] leading-[1.5] text-muted">
            The page moved, or the link was cut short. Say what needs doing and you will land in the right tool.
          </p>
          <ToolSearch drop="down" label="Search the tools" className="mt-8 w-full max-w-[640px] border border-line-strong" />
        </div>
        <div className="fb-stage fb-corners relative grid min-h-[300px] place-items-center border-line max-lg:border-t lg:border-l">
          <IsoBlock label={["404"]} open lift={92} className="h-[min(48vh,420px)] w-auto" />
        </div>
      </div>

      <nav aria-label="Tool categories" className="grid shrink-0 border-t border-line sm:grid-cols-4">
        {categories.map((category, index) => (
          <Link
            key={category.slug}
            href={`/${category.slug}`}
            className="group flex h-[72px] items-center justify-between border-line px-[var(--fb-pad)] transition-colors hover:bg-ink hover:text-white max-sm:border-b sm:border-l sm:px-6 sm:first:border-l-0"
          >
            <span className="fb-wide text-[19px]">{category.name}</span>
            <span className="flex items-center gap-3 text-[13px] text-faint group-hover:text-white/60">
              [0{index + 1}]
              <Arrow />
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
