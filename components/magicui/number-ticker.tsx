"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

import { cn } from "@/lib/utils";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number;
  startValue?: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
}

/**
 * Magic UI · NumberTicker (Tailwind 3 adaptation).
 *
 * Renders the final value on the server and on first paint, then counts up
 * after hydration. That keeps the number correct without JavaScript, avoids a
 * flash of "0", and respects the visitor's reduced-motion preference.
 */
export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();
  const motionValue = useMotionValue(direction === "down" ? value : startValue);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const format = (input: number) =>
    Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(input.toFixed(decimalPlaces)));

  useEffect(() => {
    if (reducedMotion || !ref.current) return;
    ref.current.textContent = format(startValue);
    // Only runs once per value; the spring then drives the visible number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, startValue, decimalPlaces]);

  useEffect(() => {
    if (reducedMotion) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isInView) {
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value);
      }, delay * 1000);
    }

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [motionValue, isInView, delay, value, direction, startValue, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    return springValue.on("change", (latest) => {
      if (ref.current) ref.current.textContent = format(latest);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [springValue, decimalPlaces, reducedMotion]);

  return (
    <span
      ref={ref}
      className={cn("inline-block tabular-nums tracking-tight", className)}
      {...props}
    >
      {format(value)}
    </span>
  );
}
