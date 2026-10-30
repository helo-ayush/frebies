"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>";

function scramble(text: string, charset: string) {
  return text
    .split("")
    .map((character) =>
      character === " " ? " " : charset.charAt(Math.floor(Math.random() * charset.length)),
    )
    .join("");
}

/**
 * Aceternity UI · EncryptedText (Tailwind 3 adaptation).
 *
 * The server renders the final text, so hydration is clean and the copy is
 * readable without JavaScript. On mount it scrambles, then decodes in view.
 */
export function EncryptedText({
  text,
  className,
  revealDelayMs = 42,
  flipDelayMs = 80,
  encryptedClassName,
  revealedClassName,
}: {
  text: string;
  className?: string;
  revealDelayMs?: number;
  flipDelayMs?: number;
  encryptedClassName?: string;
  revealedClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reducedMotion = useReducedMotion();
  const [revealCount, setRevealCount] = useState(text.length);
  const [noise, setNoise] = useState(text);
  const startedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion || !inView || startedRef.current) return;
    startedRef.current = true;

    const started = performance.now();
    let frame = 0;
    let lastFlip = started;

    const tick = (now: number) => {
      const revealed = Math.min(text.length, Math.floor((now - started) / revealDelayMs));
      setRevealCount(revealed);

      if (now - lastFlip >= flipDelayMs) {
        const next = text.split("");
        for (let index = revealed; index < text.length; index += 1) {
          next[index] = text[index] === " " ? " " : scramble(text[index], DEFAULT_CHARSET);
        }
        setNoise(next.join(""));
        lastFlip = now;
      }

      if (revealed < text.length) frame = requestAnimationFrame(tick);
      else setNoise(text);
    };

    setNoise(scramble(text, DEFAULT_CHARSET));
    setRevealCount(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reducedMotion, text, revealDelayMs, flipDelayMs]);

  return (
    <span ref={ref} aria-label={text} className={cn("inline-block", className)}>
      {text.split("").map((character, index) => {
        const revealed = index < revealCount;
        return (
          <span
            key={`${character}-${index}`}
            aria-hidden
            className={revealed ? revealedClassName : encryptedClassName}
          >
            {revealed ? character : noise[index] ?? character}
          </span>
        );
      })}
    </span>
  );
}
