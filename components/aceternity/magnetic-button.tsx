"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · MagneticButton (Tailwind 3 adaptation).
 * The wrapper no longer paints a debug box; it only moves its child.
 */
export function MagneticButton({
  children,
  strength = 0.25,
  maxDistance = 12,
  className,
}: {
  children: ReactNode;
  strength?: number;
  maxDistance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || reducedMotion) return;

    const { width, height, left, top } = ref.current.getBoundingClientRect();
    let x = (event.clientX - (left + width / 2)) * strength;
    let y = (event.clientY - (top + height / 2)) * strength;

    const distance = Math.hypot(x, y);
    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      x *= scale;
      y *= scale;
    }

    setPosition({ x, y });
  }

  function handleMouseLeave() {
    setPosition({ x: 0, y: 0 });
  }

  return (
    <div
      className={cn("inline-flex", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        ref={ref}
        animate={{ x: position.x, y: position.y }}
        transition={{ type: "spring", stiffness: 200, damping: 18, mass: 0.12 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
