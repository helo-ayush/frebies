import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  className?: string;
  /** Reverse the animation direction. */
  reverse?: boolean;
  /** Pause the animation while the pointer is over the marquee. */
  pauseOnHover?: boolean;
  children: ReactNode;
  /** Animate vertically instead of horizontally. */
  vertical?: boolean;
  /** How many copies of the content are laid out (4 is plenty for a loop). */
  repeat?: number;
  /** Seconds for one full pass. */
  speed?: number;
}

/**
 * Magic UI · Marquee (Tailwind 3 adaptation).
 *
 * The registry version relies on Tailwind v4 custom-property shorthand, so this
 * build keeps the same API but drives the animation from `globals.css`.
 */
export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  speed = 40,
  style,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...props}
      style={
        {
          "--duration": `${speed}s`,
          "--gap": "1rem",
          ...style,
        } as CSSProperties
      }
      className={cn("group flex gap-[var(--gap)] overflow-hidden p-2", className)}
    >
      {Array.from({ length: repeat }, (_, index) => (
        <div
          key={index}
          className={cn(
            "flex shrink-0 justify-around gap-[var(--gap)]",
            vertical
              ? "magic-marquee-vertical flex-col"
              : "magic-marquee flex-row",
            pauseOnHover && "group-hover:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]",
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
