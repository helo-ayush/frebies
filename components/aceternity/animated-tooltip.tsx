"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

type Position = { x: number; y: number };

/**
 * Aceternity UI · AnimatedTooltip (Tailwind 3 adaptation).
 *
 * Rendered with fixed coordinates so it can escape the sidebar's overflow, and
 * driven by keyboard focus as well as hover.
 */
export function AceternityTooltip({
  label,
  hint,
  side = "right",
  children,
  className,
}: {
  label: string;
  hint?: string;
  side?: "right" | "bottom";
  children: ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState<Position | null>(null);

  function show(event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition(
      side === "right"
        ? { x: rect.right + 10, y: rect.top + rect.height / 2 }
        : { x: rect.left + rect.width / 2, y: rect.bottom + 8 },
    );
  }

  function hide() {
    setPosition(null);
  }

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {position && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, x: side === "right" ? -4 : 0, y: side === "right" ? 0 : 4, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            style={{ left: position.x, top: position.y }}
            className={cn(
              "pointer-events-none fixed z-[70] flex -translate-y-1/2 flex-col rounded-md border border-white/10 bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-[0_10px_30px_rgba(15,15,16,0.22)]",
              side === "bottom" && "translate-x-[-50%] translate-y-0",
            )}
          >
            <span className="whitespace-nowrap">{label}</span>
            {hint && (
              <span className="mt-0.5 whitespace-nowrap text-[9.5px] font-normal text-white/55">
                {hint}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "absolute h-1.5 w-1.5 rotate-45 bg-ink",
                side === "right"
                  ? "-left-[3px] top-1/2 -translate-y-1/2"
                  : "-top-[3px] left-1/2 -translate-x-1/2",
              )}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
