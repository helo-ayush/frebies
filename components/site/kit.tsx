"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { motion, type Variants } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Registration square: the small coral mark that pins a label to the grid. */
export function Sq({ className = "" }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={`fb-sq ${className}`}
      initial={{ scale: 0.01 }}
      whileInView={{ scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: 0.15, ease: EASE }}
    />
  );
}

const LINE: Variants = {
  hidden: { y: "108%" },
  shown: (delay: number) => ({
    y: 0,
    transition: { duration: 0.85, delay, ease: EASE },
  }),
};

/**
 * Text that rises line by line out of a mask. The trigger sits on the wrapper,
 * because a fully masked child never intersects the viewport on its own.
 */
export function MaskLines({
  lines,
  as = "div",
  className = "",
  delay = 0,
  stagger = 0.07,
  immediate = false,
}: {
  lines: ReactNode[];
  as?: "h1" | "h2" | "h3" | "p" | "div";
  className?: string;
  delay?: number;
  stagger?: number;
  /** Play on mount rather than on scroll. */
  immediate?: boolean;
}) {
  const Tag = motion[as];
  const play = immediate
    ? { animate: "shown" }
    : { whileInView: "shown", viewport: { once: true, margin: "0px 0px -8% 0px" } };
  return (
    <Tag className={className} initial="hidden" {...play}>
      {lines.map((line, index) => (
        <span key={index} className="fb-mask">
          <motion.span className="block" variants={LINE} custom={delay + index * stagger}>
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** A block of content that rises as one piece out of a mask. */
export function MaskBlock({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={`overflow-hidden ${className}`}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
    >
      <motion.div variants={LINE} custom={delay}>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Hairline that draws itself when it enters the viewport. */
export function Rule({ vertical = false, className = "" }: { vertical?: boolean; className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={`pointer-events-none absolute bg-[var(--fb-line)] ${vertical ? "w-px" : "h-px"} ${className}`}
      style={{ originX: 0, originY: 0 }}
      initial={vertical ? { scaleY: 0 } : { scaleX: 0 }}
      whileInView={vertical ? { scaleY: 1 } : { scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.1, ease: EASE }}
    />
  );
}

/** Label that rolls to a coral copy of itself when its link is hovered. */
export function Roll({ children }: { children: string }) {
  return (
    <span className="fb-roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

export function Arrow({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1.5 8h12M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

/** Dog-eared file outline with a type tag. */
export function FileIcon({ ext, lit = false }: { ext: string; lit?: boolean }) {
  return (
    <span className="relative inline-block h-[54px] w-[42px]">
      <svg aria-hidden viewBox="0 0 42 54" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M.75.75h28L41.25 13v40.25H.75z" fill="var(--fb-panel)" stroke="var(--fb-line-strong)" />
        <path d="M28.75.75V13h12.5" stroke="var(--fb-line-strong)" />
        <path d="M9 22h24M9 28h24" stroke="var(--fb-line)" />
      </svg>
      <span
        className={`fb-wide absolute -left-1.5 bottom-[9px] px-1.5 py-[4px] text-[11px] leading-none tracking-normal text-white ${
          lit ? "bg-[var(--fb-coral)]" : "bg-[var(--fb-ink)]"
        }`}
      >
        {ext}
      </span>
    </span>
  );
}

export function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    sync();
    list.addEventListener("change", sync);
    return () => list.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/** Pixel size of an element, kept current. */
export function useSize(ref: RefObject<HTMLElement>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const sync = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Right-angled polyline with rounded corners, in pixels. */
export function roundPath(points: [number, number][], radius = 12): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const [px, py] = points[index - 1];
    const [x, y] = points[index];
    const [nx, ny] = points[index + 1];
    const before = Math.hypot(x - px, y - py);
    const after = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, before / 2, after / 2);
    const ax = x - ((x - px) / (before || 1)) * r;
    const ay = y - ((y - py) / (before || 1)) * r;
    const bx = x + ((nx - x) / (after || 1)) * r;
    const by = y + ((ny - y) / (after || 1)) * r;
    d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}
