import type { ReactNode } from "react";

/**
 * Settings rail for tool studios. By default it fills a fixed-height studio
 * grid and scrolls on its own. With `sticky` it pins below the sticky topbar
 * instead and only scrolls internally when its content grows taller than the
 * viewport (e.g. after expanding an advanced-settings group). Scrollbars only
 * become visible on hover or focus so the surface stays calm.
 *
 * `footer` pins an action area below the scrolling settings — used by studios
 * whose primary action belongs next to the controls rather than in the canvas.
 */
export function StudioRail({
  children,
  label = "Tool settings",
  className = "",
  sticky = false,
  footer,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  sticky?: boolean;
  footer?: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className={`flex min-h-0 min-w-0 flex-col border-t border-line bg-[#fdfdfc] lg:border-l lg:border-t-0 ${
        sticky ? "lg:sticky lg:top-[76px] lg:z-10 lg:max-h-[calc(100vh-92px)]" : "lg:h-full"
      } ${className}`}
    >
      <div
        tabIndex={0}
        className="studio-rail min-h-0 flex-1 p-4 outline-none sm:p-5 lg:overflow-y-auto lg:focus-visible:ring-2 lg:focus-visible:ring-inset lg:focus-visible:ring-accent"
      >
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t border-line bg-white px-4 py-3.5 sm:px-5">{footer}</div>
      ) : null}
    </aside>
  );
}
