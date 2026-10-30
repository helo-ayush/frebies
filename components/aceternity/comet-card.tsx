"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · CometCard (Tailwind 3 adaptation).
 * 3D tilt with a moving glare; renders a plain surface for reduced motion.
 */
export function CometCard({
  children,
  className,
  rotateDepth = 8,
  translateDepth = 6,
}: {
  children: ReactNode;
  className?: string;
  rotateDepth?: number;
  translateDepth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 180, damping: 22 });
  const springY = useSpring(y, { stiffness: 180, damping: 22 });

  const rotateX = useTransform(springY, [-0.5, 0.5], [`${rotateDepth}deg`, `-${rotateDepth}deg`]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [`-${rotateDepth}deg`, `${rotateDepth}deg`]);
  const translateX = useTransform(springX, [-0.5, 0.5], [`-${translateDepth}px`, `${translateDepth}px`]);
  const translateY = useTransform(springY, [-0.5, 0.5], [`-${translateDepth}px`, `${translateDepth}px`]);
  const glareX = useTransform(springX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(springY, [-0.5, 0.5], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.55) 8%, rgba(255,255,255,0.18) 24%, rgba(255,255,255,0) 62%)`;

  if (reducedMotion) {
    return <div className={cn("relative", className)}>{children}</div>;
  }

  return (
    <div className={cn("relative", className)} style={{ perspective: "1200px" }}>
      <motion.div
        ref={ref}
        onMouseMove={(event) => {
          if (!ref.current) return;
          const rect = ref.current.getBoundingClientRect();
          x.set((event.clientX - rect.left) / rect.width - 0.5);
          y.set((event.clientY - rect.top) / rect.height - 0.5);
        }}
        onMouseLeave={() => {
          x.set(0);
          y.set(0);
        }}
        style={{
          rotateX,
          rotateY,
          translateX,
          translateY,
          transformStyle: "preserve-3d",
        }}
        whileHover={{ scale: 1.012 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="relative rounded-[inherit] will-change-transform"
      >
        {children}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-40 mix-blend-overlay"
          style={{ background: glare }}
        />
      </motion.div>
    </div>
  );
}
