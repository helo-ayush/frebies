"use client";
import { motion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const grads = {
  sun: "radial-gradient(circle at 32% 28%,#ffe2b8 0%,#ff9d4d 38%,#d9480f 72%,#8a2a08 100%)",
  iris: "radial-gradient(circle at 35% 30%,#ffc6f4 0%,#b69cff 42%,#6aa7ff 78%,#4b6bff 100%)",
  ember: "radial-gradient(circle at 30% 25%,#f3b19c 0%,#7a3a30 42%,#241512 80%,#120b0a 100%)",
};
export type G = keyof typeof grads;

/** Respects the visitor's "reduce motion" setting everywhere. */
export const Motion = ({ children }: { children: ReactNode }) => (
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
);

export function Orb({ g, className = "h-64 w-64" }: { g: G; className?: string }) {
  return <div className={`grain rounded-full ${className}`} style={{ background: grads[g] }} />;
}

export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, ease }}>
      {children}
    </motion.div>
  );
}

/** Headline that rises word by word out of a mask. */
export function Words({ lines, className = "" }: { lines: string[]; className?: string }) {
  let n = 0;
  return (
    <h1 className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line.split(" ").map((w) => (
            <span key={n} className="mr-[0.22em] inline-block overflow-hidden pb-[0.1em] align-bottom">
              <motion.span className="inline-block" initial={{ y: "110%" }} animate={{ y: 0 }}
                transition={{ duration: 0.95, delay: 0.1 + 0.07 * n++, ease }}>{w}</motion.span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

export function Btn({ children, href = "#", dark = true, sm = false }: { children: ReactNode; href?: string; dark?: boolean; sm?: boolean }) {
  return (
    <motion.a href={href} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center gap-2 rounded-full text-[15px] font-medium transition-colors ${sm ? "px-5 py-2.5" : "px-6 py-3.5"} ${dark ? "bg-ink text-white hover:bg-neutral-800" : "border border-line bg-white text-ink hover:bg-neutral-50"}`}>
      {children}
    </motion.a>
  );
}
