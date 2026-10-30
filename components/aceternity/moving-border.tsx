"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · MovingBorder (Tailwind 3 adaptation).
 * A light that runs along an SVG rounded rectangle.
 */
export function MovingBorder({
  children,
  duration = 3000,
  rx,
  ry,
}: {
  children: ReactNode;
  duration?: number;
  rx?: string;
  ry?: string;
}) {
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(progress, (value) => pathRef.current?.getPointAtLength(value).x);
  const y = useTransform(progress, (value) => pathRef.current?.getPointAtLength(value).y);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
      >
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div
        aria-hidden
        style={{ position: "absolute", top: 0, left: 0, display: "inline-block", transform }}
      >
        {children}
      </motion.div>
    </>
  );
}

/** A small pill whose border carries a travelling light. */
export function MovingBorderPill({
  children,
  duration = 3200,
  className,
  containerClassName,
  glowClassName,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
  containerClassName?: string;
  glowClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-fit overflow-hidden rounded-full bg-line/70 p-px",
        containerClassName,
      )}
    >
      <MovingBorder duration={duration} rx="50%" ry="50%">
        <div
          className={cn(
            "h-20 w-20 rounded-full bg-[radial-gradient(#e55e40_35%,#fda82b_55%,transparent_72%)] opacity-90",
            glowClassName,
          )}
        />
      </MovingBorder>
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-[inherit] bg-white",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
