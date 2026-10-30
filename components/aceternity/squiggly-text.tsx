"use client";

import { useId, useMemo } from "react";
import { motion, useReducedMotion, useTime, useTransform } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · SquigglyText (Tailwind 3 adaptation).
 * Cycles SVG turbulence filters to wobble its children; static when reduced.
 */
export function SquigglyText({
  children,
  className,
  steps = 4,
  stepDuration = 120,
  scale = [3, 4],
  baseFrequency = 0.018,
  numOctaves = 2,
}: {
  children: React.ReactNode;
  className?: string;
  steps?: number;
  stepDuration?: number;
  scale?: number | [number, number];
  baseFrequency?: number;
  numOctaves?: number;
}) {
  const rawId = useId();
  const safeId = rawId.replace(/[:_]/g, "");
  const reducedMotion = useReducedMotion();

  const filters = useMemo(
    () => Array.from({ length: steps }, (_, index) => `url(#squiggly-${safeId}-${index})`),
    [steps, safeId],
  );

  const time = useTime();
  const filter = useTransform(time, (value) => filters[Math.floor(value / stepDuration) % filters.length]);
  const scaleAt = (index: number) =>
    Array.isArray(scale) ? scale[index % scale.length] : scale;

  if (reducedMotion) {
    return <span className={cn("inline-block", className)}>{children}</span>;
  }

  return (
    <motion.span style={{ filter }} className={cn("inline-block", className)}>
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          {Array.from({ length: steps }).map((_, index) => (
            <filter id={`squiggly-${safeId}-${index}`} key={index}>
              <feTurbulence
                baseFrequency={baseFrequency}
                numOctaves={numOctaves}
                result="noise"
                seed={index}
              />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={scaleAt(index)} />
            </filter>
          ))}
        </defs>
      </svg>
      {children}
    </motion.span>
  );
}
