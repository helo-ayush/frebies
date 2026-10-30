"use client";

import { motion, useScroll } from "motion/react";

import { cn } from "@/lib/utils";

/** Magic UI · ScrollProgress (Tailwind 3 adaptation). */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      aria-hidden
      className={cn(
        "fixed inset-x-0 top-0 z-[60] h-[2px] origin-left",
        className,
      )}
      style={{
        scaleX: scrollYProgress,
        background: "linear-gradient(90deg, #e55e40, #fda82b, #9d97cf)",
      }}
    />
  );
}
