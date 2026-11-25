"use client";

/**
 * The isometric blocks. On the landing page and category pages they are the
 * tool launcher; inside a tool the same block sits open, waiting for a file.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { seamColor } from "@/components/ui/Seam";
import { toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";
import { EASE } from "./kit";

/** What each block says on its lid. */
export const LID: Record<string, string[]> = {
  "/image/convert": ["Convert"],
  "/image/compress": ["Compress"],
  "/image/resize": ["Resize"],
  "/image/to-pdf": ["To PDF"],
  "/image/upscaler": ["Upscale"],
  "/image/remove-background": ["Cut out"],
  "/document/merge-pdf": ["Merge"],
  "/document/split-pdf": ["Split"],
  "/document/pdf-to-jpg": ["PDF to", "JPG"],
  "/document/ocr": ["OCR"],
  "/document/ai-editor": ["AI edit"],
  "/audio/convert": ["Convert"],
  "/audio/trim": ["Trim"],
  "/audio/text-to-speech": ["To", "speech"],
  "/audio/speech-to-text": ["To text"],
  "/audio/vocal-remover": ["Vocals"],
  "/video/dubbing": ["Dub"],
};

type Point = { x: number; y: number };

const CX = 500;
const CY = 356;

const HW = 122; // half width of a block
const HH = 70.5; // half depth
const LIDH = 40;
const GAP = 9;
const BASE = 46;
const STROKE = "rgba(29,28,31,0.62)";

const left = (y: number, h: number) => `M${-HW} ${y} L0 ${HH + y} L0 ${HH + y + h} L${-HW} ${y + h}Z`;
const right = (y: number, h: number) => `M${HW} ${y} L0 ${HH + y} L0 ${HH + y + h} L${HW} ${y + h}Z`;
const top = (y: number) => `M0 ${-HH + y} L${HW} ${y} L0 ${HH + y} L${-HW} ${y}Z`;

/** The drawing itself, centred on the middle of its lid. `lift` raises the lid. */
export function BlockShape({
  label,
  seam,
  hot = false,
  lift = 30,
}: {
  label: string[];
  seam: string;
  hot?: boolean;
  lift?: number;
}) {
  return (
    <>
      {/* base */}
      <path d={left(LIDH + GAP, BASE)} fill="#dededa" stroke={STROKE} />
      <path d={right(LIDH + GAP, BASE)} fill="#e9e9e5" stroke={STROKE} />
      <path d={`M-96 ${LIDH + GAP + 36} l34 19.6 v13 l-34 -19.6z`} fill="none" stroke="rgba(29,28,31,.22)" />
      <path d={`M42 ${LIDH + GAP + 57} l26 -15 v11 l-26 15z`} fill="none" stroke="rgba(29,28,31,.22)" />
      {/* seam and the bed the lid lifts off */}
      <path d={left(LIDH, GAP)} fill={seam} />
      <path d={right(LIDH, GAP)} fill={seam} />
      <path d={top(LIDH)} fill={seam} />
      {/* lid */}
      <motion.g
        initial={false}
        animate={{ y: hot ? -lift : 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
      >
        <path d={left(0, LIDH)} fill="#e6e6e2" stroke={STROKE} />
        <path d={right(0, LIDH)} fill="#efefec" stroke={STROKE} />
        <path d={top(0)} fill={hot ? "#ffffff" : "#f8f8f5"} stroke={STROKE} />
        <circle cx={0} cy={-HH + 7} r={1.8} fill="#1d1c1f" />
        <circle cx={HW - 11} cy={0} r={1.8} fill="#1d1c1f" />
        <circle cx={-HW + 11} cy={0} r={1.8} fill="#1d1c1f" />
        <g
          transform="matrix(0.866 0.5 -0.866 0.5 0 0)"
          className="fb-wide"
          fill={hot ? "var(--fb-coral)" : "#343337"}
        >
          {label.map((line, row) => (
            <text
              key={line}
              textAnchor="middle"
              x={0}
              y={7 + (row - (label.length - 1) / 2) * 21}
              fontSize={label.length > 1 ? 19 : Math.min(25, 138 / Math.max(1, line.length))}
            >
              {line}
            </text>
          ))}
          {[0, 1, 2, 3].map((bar) => (
            <path
              key={bar}
              d={`M${20 + bar * 9} 60 h5 l-7 -9 h-5z`}
              fill={seam}
              opacity={bar === 3 ? 1 : 0.4 + bar * 0.15}
            />
          ))}
        </g>
      </motion.g>
    </>
  );
}

/**
 * One block on its own, as an illustration. With `sheet`, a blank file hovers
 * over the open bed; that is the empty state of every tool.
 */
export function IsoBlock({
  path,
  label,
  seam = "var(--fb-coral)",
  open = false,
  sheet = false,
  lift,
  className = "",
}: {
  path?: string;
  label?: string[];
  seam?: string;
  open?: boolean;
  sheet?: boolean;
  lift?: number;
  className?: string;
}) {
  const raise = lift ?? (sheet ? 92 : 34);
  return (
    <svg viewBox="-134 -176 268 340" className={`overflow-visible ${className}`} aria-hidden>
      <ellipse cx={0} cy={HH + LIDH + GAP + BASE - 26} rx={118} ry={40} fill="rgba(29,28,31,.08)" />
      {/* base and bed */}
      <path d={left(LIDH + GAP, BASE)} fill="#dededa" stroke={STROKE} />
      <path d={right(LIDH + GAP, BASE)} fill="#e9e9e5" stroke={STROKE} />
      <path d={`M-96 ${LIDH + GAP + 36} l34 19.6 v13 l-34 -19.6z`} fill="none" stroke="rgba(29,28,31,.22)" />
      <path d={`M42 ${LIDH + GAP + 57} l26 -15 v11 l-26 15z`} fill="none" stroke="rgba(29,28,31,.22)" />
      <path d={left(LIDH, GAP)} fill={seam} />
      <path d={right(LIDH, GAP)} fill={seam} />
      <path d={top(LIDH)} fill={seam} />
      <path
        d={`M0 ${-HH + LIDH + 15} L${HW - 26} ${LIDH} L0 ${HH + LIDH - 15} L${-HW + 26} ${LIDH}Z`}
        fill="none"
        stroke="rgba(255,255,255,.55)"
        strokeDasharray="4 5"
      />

      {sheet && (
        <motion.g
          initial={false}
          animate={{ y: open ? 8 : -16 }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
        >
          <g className="fb-bob">
            {/* a dog-eared sheet lying in the iso plane */}
            <path d="M0 -26 L56 6 L60 22 L0 56 L-74 14Z" fill="#fff" stroke={STROKE} strokeLinejoin="round" />
            <path d="M56 6 L34 14 L60 22Z" fill="#f2552c" stroke={STROKE} strokeLinejoin="round" />
            <path d="M-42 14 L2 39 M-26 5 L18 30 M-10 -4 L22 14" stroke="rgba(29,28,31,.28)" strokeWidth={3.2} />
          </g>
        </motion.g>
      )}

      {/* lid */}
      <motion.g
        initial={false}
        animate={{ y: open ? -raise - 12 : -raise + (sheet ? 0 : raise) }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <path d={left(0, LIDH)} fill="#e6e6e2" stroke={STROKE} />
        <path d={right(0, LIDH)} fill="#efefec" stroke={STROKE} />
        <path d={top(0)} fill="#f8f8f5" stroke={STROKE} />
        <circle cx={0} cy={-HH + 7} r={1.8} fill="#1d1c1f" />
        <circle cx={HW - 11} cy={0} r={1.8} fill="#1d1c1f" />
        <circle cx={-HW + 11} cy={0} r={1.8} fill="#1d1c1f" />
        <g
          transform="matrix(0.866 0.5 -0.866 0.5 0 0)"
          className="fb-wide"
          fill={open ? "var(--fb-coral)" : "#343337"}
        >
          {(label ?? LID[path ?? ""] ?? []).map((line, row, all) => (
            <text
              key={line}
              textAnchor="middle"
              x={0}
              y={7 + (row - (all.length - 1) / 2) * 21}
              fontSize={all.length > 1 ? 19 : Math.min(25, 138 / Math.max(1, line.length))}
            >
              {line}
            </text>
          ))}
          {[0, 1, 2, 3].map((bar) => (
            <path
              key={bar}
              d={`M${20 + bar * 9} 60 h5 l-7 -9 h-5z`}
              fill={seam}
              opacity={bar === 3 ? 1 : 0.4 + bar * 0.15}
            />
          ))}
        </g>
      </motion.g>
    </svg>
  );
}

/* ---------- The launcher stage ---------- */

function layout(count: number): Point[] {
  if (count === 1) return [{ x: CX, y: CY - 70 }];
  if (count === 5) {
    return [
      { x: CX - 186, y: CY - 156 },
      { x: CX + 186, y: CY - 156 },
      { x: CX, y: CY },
      { x: CX - 186, y: CY + 156 },
      { x: CX + 186, y: CY + 156 },
    ];
  }
  // Isometric lattice, three by two.
  return Array.from({ length: count }, (_, index) => {
    const i = index % 3;
    const j = Math.floor(index / 3);
    return { x: CX - 82 + (i - j) * 164, y: CY + (i + j - 1.5) * 94.6 };
  }).sort((a, b) => a.y - b.y);
}

/** Floor-level route between two blocks that only turns along the iso axes. */
function route(a: Point, b: Point, drop: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const along = dx / (2 * 0.866) + dy;
  const corner = { x: a.x + along * 0.866, y: a.y + along * 0.5 };
  return `M${a.x} ${a.y + drop} L${corner.x} ${corner.y + drop} L${b.x} ${b.y + drop}`;
}

function Block({
  tool,
  at,
  index,
  hot,
  onHover,
}: {
  tool: Tool;
  at: Point;
  index: number;
  hot: boolean;
  onHover: (tool: Tool | null) => void;
}) {
  return (
    <motion.g
      initial={{ x: at.x, y: at.y - 70, opacity: 0 }}
      animate={{ x: at.x, y: at.y, opacity: 1 }}
      exit={{ y: at.y + 46, opacity: 0, transition: { duration: 0.22, delay: index * 0.02 } }}
      transition={{ duration: 0.75, delay: index * 0.06, ease: EASE, opacity: { duration: 0.35 } }}
    >
      <Link
        href={tool.path}
        aria-label={`${tool.name}. ${tool.tagline}`}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(tool)}
        onBlur={() => onHover(null)}
        className="cursor-pointer outline-none"
      >
        <BlockShape label={LID[tool.path] ?? [tool.name]} seam={seamColor(tool)} hot={hot} />
      </Link>
    </motion.g>
  );
}

/** The one-tool category: the block opened into the layers it works on. */
function DubBlock({ tool, hot, onHover }: { tool: Tool; hot: boolean; onHover: (tool: Tool | null) => void }) {
  const W = 190;
  const D = 110;
  const layers = [
    { label: "Dub", note: "New voice", h: 34, fill: "#f8f8f5", tone: "#e6e6e2" },
    { label: "", note: "Subtitles", h: 22, fill: "#f2552c", tone: "#d9471f" },
    { label: "", note: "Music and room sound", h: 34, fill: "#f1f1ee", tone: "#dededa" },
    { label: "", note: "Your video, untouched", h: 46, fill: "#2a292d", tone: "#1d1c1f" },
  ];
  const spread = hot ? 92 : 74;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <Link
        href={tool.path}
        aria-label={`${tool.name}. ${tool.tagline}`}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(tool)}
        onBlur={() => onHover(null)}
        className="cursor-pointer outline-none"
      >
        {[...layers].reverse().map((layer, reversed) => {
          const index = layers.length - 1 - reversed;
          return (
            <motion.g
              key={layer.note}
              initial={{ x: CX - 118, y: CY - 150 }}
              animate={{ x: CX - 118, y: CY - 150 + index * spread }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              <path d={`M${-W} 0 L0 ${D} L0 ${D + layer.h} L${-W} ${layer.h}Z`} fill={layer.tone} stroke="rgba(29,28,31,.55)" />
              <path d={`M${W} 0 L0 ${D} L0 ${D + layer.h} L${W} ${layer.h}Z`} fill={layer.fill} stroke="rgba(29,28,31,.55)" />
              <path d={`M0 ${-D} L${W} 0 L0 ${D} L${-W} 0Z`} fill={layer.fill} stroke="rgba(29,28,31,.55)" />
              {layer.label && (
                <g transform="matrix(0.866 0.5 -0.866 0.5 0 0)" className="fb-wide" fill="#343337">
                  <text textAnchor="middle" y={16} fontSize={54}>
                    {layer.label}
                  </text>
                </g>
              )}
              <path d={`M${W} ${layer.h / 2} h58`} stroke="rgba(29,28,31,.4)" />
              <rect x={W + 56} y={layer.h / 2 - 4} width={8} height={8} fill="var(--fb-coral)" />
              <text x={W + 74} y={layer.h / 2 + 5} fontSize={15} fill="#4d4c51" style={{ textTransform: "uppercase" }}>
                {layer.note}
              </text>
            </motion.g>
          );
        })}
      </Link>
    </motion.g>
  );
}

/** Every tool of a category as clickable blocks on a hatched floor. */
export function BlockStage({
  slug,
  hovered,
  onHover,
}: {
  slug: CategorySlug;
  hovered: Tool | null;
  onHover: (tool: Tool | null) => void;
}) {
  const list = toolsForCategory(slug);
  const spots = layout(list.length);
  const drop = LIDH + GAP + BASE;

  return (
    <svg viewBox="112 34 776 742" className="h-full w-full overflow-visible" role="group" aria-label="Tools in this category">
      <defs>
        <pattern id="fb-floor" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <path d="M0 4.5H9" stroke="#f2552c" strokeWidth="0.8" opacity="0.55" />
        </pattern>
      </defs>
      <AnimatePresence mode="wait">
        <motion.g key={slug} initial="off" animate="on" exit={{ opacity: 1, transition: { duration: 0.3 } }}>
          <motion.path
            d={`M${CX} ${CY + drop - 206} L${CX + 358} ${CY + drop} L${CX} ${CY + drop + 206} L${CX - 358} ${CY + drop}Z`}
            fill="url(#fb-floor)"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.8, ease: EASE }}
            style={{ transformOrigin: `${CX}px ${CY + drop}px` }}
          />
          {spots.slice(1).map((spot, index) => (
            <motion.path
              key={index}
              d={route(spots[index], spot, drop)}
              fill="none"
              stroke="var(--fb-coral)"
              strokeWidth={1.6}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.7, delay: 0.35 + index * 0.12, ease: "easeInOut" }}
            />
          ))}
          {list.length === 1 ? (
            <DubBlock tool={list[0]} hot={hovered?.path === list[0].path} onHover={onHover} />
          ) : (
            list.map((tool, index) => (
              <Block
                key={tool.path}
                tool={tool}
                at={spots[index]}
                index={index}
                hot={hovered?.path === tool.path}
                onHover={onHover}
              />
            ))
          )}
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}
