"use client";

import { useEffect, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type Direction = "TOP" | "LEFT" | "BOTTOM" | "RIGHT";

const movingMap: Record<Direction, string> = {
  TOP: "radial-gradient(20.7% 50% at 50% 0%, #e55e40 0%, rgba(229,94,64,0) 100%)",
  LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, #e55e40 0%, rgba(229,94,64,0) 100%)",
  BOTTOM:
    "radial-gradient(20.7% 50% at 50% 100%, #e55e40 0%, rgba(229,94,64,0) 100%)",
  RIGHT:
    "radial-gradient(16.2% 41.2% at 100% 50%, #e55e40 0%, rgba(229,94,64,0) 100%)",
};

/**
 * Aceternity UI · HoverBorderGradient (Tailwind 3 adaptation).
 *
 * The travelling highlight is kept, but the palette and the inner surface are
 * driven by props so it can wrap the site's own buttons and links.
 */
export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  colorFrom = "#e55e40",
  colorTo = "#fda82b",
  ...props
}: {
  children: ReactNode;
  containerClassName?: string;
  className?: string;
  as?: ElementType;
  duration?: number;
  clockwise?: boolean;
  colorFrom?: string;
  colorTo?: string;
  [key: string]: unknown;
} & HTMLAttributes<HTMLElement>) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<Direction>("TOP");

  const rotateDirection = (current: Direction): Direction => {
    const directions: Direction[] = ["TOP", "LEFT", "BOTTOM", "RIGHT"];
    const index = directions.indexOf(current);
    const next = clockwise
      ? (index - 1 + directions.length) % directions.length
      : (index + 1) % directions.length;
    return directions[next];
  };

  useEffect(() => {
    if (hovered) return;
    const interval = setInterval(() => {
      setDirection((current) => rotateDirection(current));
    }, duration * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, duration, clockwise]);

  const highlight = `radial-gradient(75% 181% at 50% 50%, ${colorTo} 0%, ${colorFrom}66 55%, rgba(255,255,255,0) 100%)`;

  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex w-fit items-center justify-center overflow-hidden rounded-full p-px",
        containerClassName,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative z-10 flex w-auto items-center justify-center rounded-[inherit] bg-white px-4 py-2 text-ink",
          className,
        )}
      >
        {children}
      </div>

      <motion.div
        aria-hidden
        className="absolute inset-0 z-0 rounded-[inherit]"
        style={{ filter: "blur(2px)" }}
        initial={{ background: movingMap[direction] }}
        animate={{
          background: hovered
            ? [movingMap[direction], highlight]
            : movingMap[direction],
        }}
        transition={{ ease: "linear", duration: duration ?? 1 }}
      />
      <span
        aria-hidden
        className="absolute inset-[1px] z-[1] rounded-[inherit] bg-white"
      />
    </Tag>
  );
}

/**
 * Server-safe variant: the Next Link is created inside this client module, so
 * server components only pass serializable props.
 */
export function HoverBorderLink({
  href,
  children,
  containerClassName,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  containerClassName?: string;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <HoverBorderGradient
      as={Link}
      href={href}
      containerClassName={containerClassName}
      className={className}
      {...rest}
    >
      {children}
    </HoverBorderGradient>
  );
}
