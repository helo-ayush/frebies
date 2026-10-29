import type { ReactNode } from "react";

/**
 * Fixed-height settings rail used by image studios. It scrolls on its own on
 * desktop, with a scrollbar that only becomes visible on hover or focus so the
 * surface stays calm while still making the affordance obvious.
 */
export function StudioRail({
  children,
  label = "Tool settings",
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <aside
      aria-label={label}
      tabIndex={0}
      className={`studio-rail min-h-0 border-t border-line bg-[#fdfdfc] p-4 outline-none sm:p-5 lg:h-full lg:overflow-y-auto lg:border-l lg:border-t-0 lg:focus-visible:ring-2 lg:focus-visible:ring-inset lg:focus-visible:ring-accent ${className}`}
    >
      {children}
    </aside>
  );
}
