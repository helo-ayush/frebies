import type { Faq } from "@/lib/registry/tools";

/** Hairline accordion, shared by the landing, category and tool pages. */
export function FaqList({ items, className = "" }: { items: Faq[]; className?: string }) {
  return (
    <div className={`border-t border-line-strong ${className}`}>
      {items.map((item) => (
        <details key={item.q} className="group border-b border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium transition-colors hover:text-accent-deep md:text-[18.5px]">
            {item.q}
            <span className="fb-plus grid h-9 w-9 shrink-0 place-items-center bg-panel text-ink transition-colors duration-300">
              <svg aria-hidden width="13" height="13" viewBox="0 0 13 13" stroke="currentColor" strokeWidth="1.6">
                <path d="M6.5 0v13M0 6.5h13" />
              </svg>
            </span>
          </summary>
          <p className="max-w-[660px] pb-7 text-[15.5px] leading-[1.55] text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
