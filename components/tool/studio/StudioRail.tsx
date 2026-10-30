import type { ReactNode } from "react";

/**
 * Settings rail for tool studios. By default it fills a fixed-height studio
 * grid and scrolls on its own. With `sticky` it pins below the sticky topbar
 * instead and only scrolls internally when its content grows taller than the
 * viewport (e.g. after expanding an advanced-settings group). Scrollbars only
 * become visible on hover or focus so the surface stays calm.
 */
export function StudioRail({
  children,
  label = "Tool settings",
  className = "",
  sticky = false,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <aside
      aria-label={label}
      tabIndex={0}
      className={`studio-rail min-h-0 border-t border-line bg-[#fdfdfc] p-4 outline-none sm:p-5 lg:border-l lg:border-t-0 lg:focus-visible:ring-2 lg:focus-visible:ring-inset lg:focus-visible:ring-accent ${
        sticky
          ? "lg:sticky lg:top-[76px] lg:z-10 lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto"
          : "lg:h-full lg:overflow-y-auto"
      } ${className}`}
    >
      {children}
    </aside>
  );
}
