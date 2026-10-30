"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type SVGProps,
} from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

interface DotPatternProps extends SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
  maxDots?: number;
}

/**
 * Magic UI · DotPattern (Tailwind 3 adaptation).
 *
 * Two deliberate changes for stability:
 *  - the static pattern is a single SVG <pattern> instead of thousands of
 *    animated nodes, so a full-width hero stays cheap;
 *  - glow delays are derived from the dot index rather than Math.random(), so
 *    the server and client markup match and hydration stays clean.
 */
export function DotPattern({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  maxDots = 90,
  ...props
}: DotPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () =>
      setDimensions({
        width: element.clientWidth,
        height: element.clientHeight,
      });

    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(1, Math.ceil(dimensions.width / width));
  const rows = Math.max(1, Math.ceil(dimensions.height / height));
  const total = columns * rows;
  const dotCount = Math.min(total, glow ? maxDots : 0);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-[#c9c3b8]",
        className,
      )}
      {...props}
    >
      <defs>
        <pattern
          id={`${id}-dots`}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
        </pattern>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />

      {glow &&
        Array.from({ length: dotCount }, (_, index) => {
          const dotX = (index % columns) * width + cx;
          const dotY = Math.floor(index / columns) * height + cy;
          const delay = ((index * 7) % 40) / 10;
          const duration = 2.4 + ((index * 13) % 30) / 10;

          return (
            <motion.circle
              key={`${dotX}-${dotY}`}
              cx={dotX}
              cy={dotY}
              r={cr}
              fill={`url(#${id}-glow)`}
              initial={{ opacity: 0.35, scale: 1 }}
              animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.6, 1] }}
              transition={{
                duration,
                repeat: Infinity,
                repeatType: "reverse",
                delay,
                ease: "easeInOut",
              }}
            />
          );
        })}
    </svg>
  );
}
