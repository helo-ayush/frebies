"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Aceternity UI · FlipWords (Tailwind 3 adaptation).
 * Static first word for reduced-motion users and before hydration settles.
 */
export function FlipWords({
  words,
  duration = 2600,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const reducedMotion = useReducedMotion();

  const startAnimation = useCallback(() => {
    const next = words[words.indexOf(currentWord) + 1] || words[0];
    setCurrentWord(next);
    setIsAnimating(true);
  }, [currentWord, words]);

  useEffect(() => {
    if (reducedMotion || isAnimating) return;
    const timer = setTimeout(startAnimation, duration);
    return () => clearTimeout(timer);
  }, [isAnimating, duration, startAnimation, reducedMotion]);

  if (reducedMotion) {
    return <span className={cn("inline-block", className)}>{words[0]}</span>;
  }

  return (
    <AnimatePresence onExitComplete={() => setIsAnimating(false)}>
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
        exit={{
          opacity: 0,
          y: -24,
          x: 24,
          filter: "blur(6px)",
          position: "absolute",
        }}
        className={cn("relative z-10 inline-block text-left", className)}
        key={currentWord}
      >
        {currentWord.split("").map((letter, index) => (
          <motion.span
            key={`${letter}-${index}`}
            initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: index * 0.025, duration: 0.22 }}
            className="inline-block whitespace-pre"
          >
            {letter}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}
