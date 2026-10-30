"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · PointerHighlight (Tailwind 3 adaptation).
 * Draws a measured rectangle and a small pointer around inline content.
 */
export function PointerHighlight({
  children,
  rectangleClassName,
  pointerClassName,
  containerClassName,
}: {
  children: ReactNode;
  rectangleClassName?: string;
  pointerClassName?: string;
  containerClassName?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setDimensions({ width, height });
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = dimensions.width > 1 && dimensions.height > 1;

  return (
    <span className={cn("relative inline-block w-fit", containerClassName)} ref={containerRef}>
      {children}
      {ready && !reducedMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.span
            className={cn("absolute inset-0 border border-ink/20", rectangleClassName)}
            initial={{ width: 0, height: 0 }}
            whileInView={{ width: dimensions.width, height: dimensions.height }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
          <motion.span
            className="pointer-events-none absolute"
            initial={{ opacity: 0 }}
            whileInView={{
              opacity: 1,
              x: dimensions.width + 2,
              y: dimensions.height + 2,
            }}
            viewport={{ once: true }}
            transition={{
              opacity: { duration: 0.1 },
              duration: 0.9,
              ease: "easeInOut",
            }}
          >
            <Pointer className={cn("h-4 w-4 text-accent", pointerClassName)} />
          </motion.span>
        </motion.span>
      )}
    </span>
  );
}

function Pointer({ ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" />
    </svg>
  );
}
