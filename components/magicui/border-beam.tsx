"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  style?: CSSProperties;
  /** Length of the travelling light, in pixels. */
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  reverse?: boolean;
  /** Corner radius of the element this beam decorates. */
  radius?: number;
}

/**
 * Magic UI · BorderBeam (Tailwind 3 adaptation).
 *
 * The registry build masks a moving square to the border ring, which needs
 * Tailwind v4 mask utilities. This version draws a dashed SVG stroke on the
 * same rounded rectangle and animates `stroke-dashoffset`, so it looks the same
 * in every browser and never paints over the card content.
 */
export function BorderBeam({
  className,
  style,
  size = 80,
  duration = 6,
  delay = 0,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  borderWidth = 1,
  reverse = false,
  radius = 20,
}: BorderBeamProps) {
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [dash, setDash] = useState(8);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const perimeter = Math.max(1, 2 * (rect.width + rect.height));
      setDash(Math.min(45, Math.max(3, (size / perimeter) * 100)));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [size]);

  return (
    <svg
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-beam`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colorFrom} />
          <stop offset="60%" stopColor={colorTo} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        fill="none"
        stroke={`url(#${id}-beam)`}
        strokeWidth={borderWidth}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${dash} ${100 - dash}`}
        className="magic-beam"
        style={
          {
            "--duration": `${duration}s`,
            "--delay": `${delay}s`,
            "--direction": reverse ? "reverse" : "normal",
          } as CSSProperties
        }
      />
    </svg>
  );
}
