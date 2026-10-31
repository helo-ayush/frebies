import type { ReactNode } from "react";

/**
 * Paid-tool settings rail. The run card sits fixed above the controls so the
 * credit action and cost are visible before scrolling.
 */
export function PaidRail({
  children,
  action,
  label = "Tool settings",
}: {
  children: ReactNode;
  action: ReactNode;
  label?: string;
}) {
  return (
    <aside
      aria-label={label}
      className="flex min-h-0 flex-col border-t border-line bg-[#fdfdfc] lg:h-full lg:border-l lg:border-t-0"
    >
      <div className="shrink-0 border-b border-line bg-[#fdfdfc] p-4">{action}</div>
      <div
        tabIndex={0}
        className="studio-rail min-h-0 flex-1 p-4 outline-none sm:p-5 lg:overflow-y-auto lg:focus-visible:ring-2 lg:focus-visible:ring-inset lg:focus-visible:ring-accent"
      >
        {children}
      </div>
    </aside>
  );
}
