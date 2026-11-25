import type { ReactNode } from "react";
import { ActionDock } from "@/components/tool/kit";

/**
 * Settings rail for tool studios. By default it fills a fixed-height studio and
 * scrolls on its own. With `sticky` its content pins below the top bar instead,
 * for studios that grow with their content.
 *
 * `action` is the primary action: pinned above the settings on desktop and
 * docked to the bottom of the screen on phones, so it is always in reach.
 * `footer` pins secondary output actions below the settings.
 */
export function StudioRail({
  children,
  label = "Tool settings",
  className = "",
  sticky = false,
  action,
  footer,
  pinActionOnMobile = true,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  sticky?: boolean;
  action?: ReactNode;
  footer?: ReactNode;
  pinActionOnMobile?: boolean;
}) {
  const body = (
    <>
      {action ? <ActionDock pinned={pinActionOnMobile}>{action}</ActionDock> : null}
      <div
        tabIndex={0}
        className="studio-rail min-h-0 flex-1 px-4 py-5 outline-none sm:px-5 lg:overflow-y-auto lg:focus-visible:ring-2 lg:focus-visible:ring-inset lg:focus-visible:ring-accent"
      >
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-line bg-panel px-4 py-4 sm:px-5">{footer}</div> : null}
    </>
  );

  return (
    <aside
      aria-label={label}
      className={`flex min-h-0 min-w-0 flex-col border-t border-line bg-panel lg:border-l lg:border-t-0 ${
        sticky ? "" : "lg:h-full"
      } ${className}`}
    >
      {sticky ? (
        <div className="flex min-h-0 flex-col lg:sticky lg:top-[var(--fb-bar)] lg:max-h-[calc(100dvh-var(--fb-bar))]">
          {body}
        </div>
      ) : (
        body
      )}
    </aside>
  );
}
