"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useInView, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { tools } from "@/lib/registry/tools";
import { Arrow, EASE, FileIcon, MaskBlock, MaskLines, Rule, Sq, useMedia } from "./kit";

const freeCount = tools.filter((tool) => tool.tier === "free").length;
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/* ---------- Exploded box ---------- */

function Cube({ size, className = "" }: { size: number; className?: string }) {
  const half = size / 2;
  return (
    <div className={`[perspective:900px] ${className}`} style={{ width: size, height: size }} aria-hidden>
      <div className="lp-cube relative h-full w-full">
        {[
          `translateZ(${half}px)`,
          `rotateY(90deg) translateZ(${half}px)`,
          `rotateY(180deg) translateZ(${half}px)`,
          `rotateY(-90deg) translateZ(${half}px)`,
          `rotateX(90deg) translateZ(${half}px)`,
          `rotateX(-90deg) translateZ(${half}px)`,
        ].map((transform, index) => (
          <i key={index} style={{ transform, filter: index === 4 ? "brightness(1.12)" : index % 2 ? "brightness(.9)" : undefined }} />
        ))}
      </div>
    </div>
  );
}

function Wall({
  progress,
  from,
  to,
  className,
  hatch = false,
}: {
  progress: MotionValue<number>;
  from: string;
  to: string;
  className: string;
  hatch?: boolean;
}) {
  const transform = useTransform(progress, [0, 1], [from, to]);
  return (
    <motion.div
      style={{ transform }}
      className={`absolute border border-white/75 bg-[#1d1c1f] ${className}`}
    >
      {hatch && (
        <span className="absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(45deg,#fff_0_1px,transparent_1px_7px)]" />
      )}
    </motion.div>
  );
}

/** A dark box with its walls pulled apart around the coral cube: your file, inside your browser. */
function Exploded({ progress, frontRef }: { progress: MotionValue<number>; frontRef: RefObject<HTMLDivElement> }) {
  return (
    <div className="relative h-[clamp(230px,27vw,420px)] w-[clamp(300px,40vw,620px)] [perspective:1600px]" aria-hidden>
      <div className="absolute inset-0 [transform-style:preserve-3d]">
        <Wall
          progress={progress}
          className="left-[52%] top-[4%] h-[88%] w-[40%]"
          from="translate3d(0,14px,-120px) rotateY(-10deg)"
          to="translate3d(8%,-2%,-120px) rotateY(-14deg)"
        />
        <Wall
          progress={progress}
          className="left-[49%] top-[0%] h-[88%] w-[40%]"
          from="translate3d(0,14px,-160px) rotateY(-10deg)"
          to="translate3d(14%,-6%,-160px) rotateY(-14deg)"
        />
        <Wall
          progress={progress}
          hatch
          className="left-[0%] top-[6%] h-[92%] w-[26%]"
          from="translate3d(60px,0,-20px) rotateY(24deg)"
          to="translate3d(-10px,0,-20px) rotateY(34deg)"
        />
        <Wall
          progress={progress}
          className="left-[2.5%] top-[4%] h-[92%] w-[26%]"
          from="translate3d(60px,0,-10px) rotateY(24deg)"
          to="translate3d(-4px,0,-10px) rotateY(30deg)"
        />
        <div className="absolute left-1/2 top-[40%] -translate-x-1/2 max-md:scale-[0.6]">
          <Cube size={118} />
        </div>
        <Wall
          progress={progress}
          className="left-[74%] top-[10%] h-[92%] w-[25%]"
          from="translate3d(-50px,0,60px) rotateY(-26deg)"
          to="translate3d(16px,0,60px) rotateY(-34deg)"
        />
        <Wall
          progress={progress}
          className="left-[30%] top-[-4%] h-[34%] w-[40%]"
          from="translate3d(0,20px,40px) rotateX(74deg)"
          to="translate3d(0,-26px,40px) rotateX(72deg)"
        />
        {/* Where the front wall sits before it becomes the first card */}
        <div ref={frontRef} className="absolute left-[8%] top-[14%] h-[92%] w-[40%]" />
      </div>
    </div>
  );
}

/* ---------- Card illustrations ---------- */

const BYTES = [
  [196, 40, 54, 30, 0], [172, 40, 5, 30, 2], [182, 40, 5, 30, 1], [120, 78, 54, 30, 3], [66, 116, 54, 30, 0],
  [126, 116, 6, 30, 4], [138, 116, 5, 30, 0], [148, 116, 5, 30, 0], [158, 116, 5, 30, 0], [168, 116, 5, 30, 0],
  [214, 116, 54, 30, 0], [150, 154, 54, 34, 1], [66, 194, 54, 30, 3], [216, 194, 6, 30, 0], [228, 194, 6, 30, 0],
  [240, 194, 6, 30, 4], [252, 194, 6, 30, 0], [264, 194, 6, 30, 0], [104, 232, 5, 30, 1], [116, 232, 54, 30, 0],
] as const;
const BYTE_FILL = ["#8b8a8d", "#ffffff", "#d7d6d3", "transparent", "#f2552c"];

/* The trigger lives on each svg: parts that start at zero size never report as in view. */
const SEEN = { initial: "off", whileInView: "on", viewport: { once: true, amount: 0.3 } } as const;

function OpenArt() {
  return (
    <motion.svg {...SEEN} viewBox="30 20 280 270" className="h-full w-full" aria-hidden>
      {BYTES.map(([x, y, w, h, tone], index) => (
        <motion.rect
          key={index}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={BYTE_FILL[tone]}
          stroke={tone === 3 ? "rgba(255,255,255,.35)" : "none"}
          variants={{
            off: { opacity: 0, scaleX: 0 },
            on: { opacity: 1, scaleX: 1, transition: { duration: 0.4, delay: 0.3 + index * 0.055, ease: EASE } },
          }}
          style={{ transformBox: "fill-box", originX: 0 }}
        />
      ))}
    </motion.svg>
  );
}

const KNOBS = [
  { x: 62, y: 34, w: 108, label: "Format", delay: 0, tone: "coral" },
  { x: 152, y: 92, w: 108, label: "Quality", delay: -1.1, tone: "ink" },
  { x: 42, y: 150, w: 108, label: "Size", delay: -2, tone: "ink" },
  { x: 172, y: 208, w: 108, label: "Pages", delay: -2.8, tone: "coral" },
] as const;

function WorkArt() {
  return (
    <div className="relative mx-auto aspect-[320/270] h-full max-w-full" aria-hidden>
      <svg viewBox="0 0 320 270" className="absolute inset-0 h-full w-full">
        {[
          "M116 64 L206 92", "M206 122 L96 150", "M96 180 L226 208",
        ].map((d, index) => (
          <motion.path
            key={d}
            d={d}
            stroke="rgba(29,28,31,.35)"
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: 0.6 + index * 0.25 }}
          />
        ))}
      </svg>
      {KNOBS.map((knob) => (
        <div
          key={knob.label}
          className="absolute"
          style={{ left: `${(knob.x / 320) * 100}%`, top: `${(knob.y / 270) * 100}%`, width: `${(knob.w / 320) * 100}%` }}
        >
          <div className="relative h-[22px] border border-[var(--lp-ink)]/60 bg-[var(--lp-panel)]">
            <span
              className={`absolute bottom-[3px] top-[3px] w-[32%] ${knob.tone === "coral" ? "bg-[var(--lp-coral)]" : "bg-[var(--lp-ink)]"}`}
              style={{ animation: `lp-knob 4.2s cubic-bezier(.65,0,.35,1) ${knob.delay}s infinite` }}
            />
          </div>
          <p className="lp-label mt-1 !text-[11px]">{knob.label}</p>
        </div>
      ))}
    </div>
  );
}

const NODES = [
  [160, 34], [246, 58], [282, 136], [238, 214], [160, 236], [78, 214], [40, 136], [76, 58],
] as const;

function SaveArt({ nodeRef }: { nodeRef: RefObject<HTMLSpanElement> }) {
  return (
    <div className="relative mx-auto aspect-[320/270] h-full max-w-full" aria-hidden>
      <motion.svg {...SEEN} viewBox="0 0 320 270" className="absolute inset-0 h-full w-full overflow-visible">
        {NODES.map(([x, y], index) => (
          <g key={index}>
            <motion.path
              d={`M160 136 L${x} ${y}`}
              stroke={index === 5 ? "var(--lp-coral)" : "rgba(29,28,31,.35)"}
              variants={{
                off: { pathLength: 0 },
                on: { pathLength: 1, transition: { duration: 0.6, delay: 0.3 + index * 0.08 } },
              }}
            />
            <motion.path
              d={`M${x - 10} ${y - 12} h13 l7 7 v17 h-20z`}
              fill={index === 5 ? "#f2552c" : "var(--lp-panel)"}
              stroke={index === 5 ? "#f2552c" : "rgba(29,28,31,.45)"}
              variants={{
                off: { scale: 0 },
                on: { scale: 1, transition: { duration: 0.45, delay: 0.55 + index * 0.08, ease: EASE } },
              }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          </g>
        ))}
      </motion.svg>
      <span
        ref={nodeRef}
        className="absolute h-px w-px"
        style={{ left: `${(NODES[5][0] / 320) * 100}%`, top: `${(NODES[5][1] / 270) * 100}%` }}
      />
      <div className="absolute left-1/2 top-[50.4%] -translate-x-1/2 -translate-y-1/2">
        <Cube size={62} />
      </div>
    </div>
  );
}

function CardText({ title, n, copy, dark = false }: { title: string; n: number; copy: string; dark?: boolean }) {
  return (
    <div className="px-7 pb-8 lg:px-9">
      <div className="flex items-baseline gap-2.5">
        <MaskLines as="h3" className="lp-wide text-[26px]" lines={[title]} />
        <span className={`text-[13px] ${dark ? "text-white/45" : "text-[var(--lp-muted)]"}`}>// 0{n}</span>
      </div>
      <MaskBlock className="mt-3.5 max-w-[400px]" delay={0.12}>
        <p className={`text-[15.5px] leading-[1.5] ${dark ? "text-white/75" : "text-[#3d3c41]"}`}>{copy}</p>
      </MaskBlock>
    </div>
  );
}

/* ---------- Section ---------- */

type Flight = { x: number; y: number; sx: number; sy: number };
type Trace = { d: string; w: number; h: number; jx: number; jy: number; ex: number; ey: number };

export function Journey() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const desktop = useMedia("(min-width: 1024px)");
  const [flight, setFlight] = useState<Flight>({ x: 0, y: 0, sx: 1, sy: 1 });
  const nodeRef = useRef<HTMLSpanElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const traced = useInView(stripRef, { once: true, amount: 0.7 });

  // How far the front wall of the box is from the card it turns into.
  useEffect(() => {
    const measure = () => {
      const front = frontRef.current;
      const slot = slotRef.current;
      const wrap = wrapRef.current;
      if (!front || !slot || !wrap) return;
      const at = (node: HTMLElement) => {
        let x = 0;
        let y = 0;
        let current: HTMLElement | null = node;
        while (current && current !== wrap) {
          x += current.offsetLeft;
          y += current.offsetTop;
          current = current.offsetParent as HTMLElement | null;
        }
        return { x, y, w: node.offsetWidth, h: node.offsetHeight };
      };
      const board = boardRef.current;
      const node = nodeRef.current;
      const strip = stripRef.current;
      if (board && node && strip) {
        const root = board.getBoundingClientRect();
        const from = node.getBoundingClientRect();
        const row = strip.getBoundingClientRect();
        const r = 14;
        const nx = from.left - root.left - 12;
        const ny = from.top - root.top;
        const gx = root.width * (2 / 3) + 17;
        const by = row.bottom - root.top - 34;
        const ex = root.width * 0.148;
        const ey = row.top - root.top;
        setTrace({
          d: `M${nx} ${ny} H${gx + r} Q${gx} ${ny} ${gx} ${ny + r} V${by - r} Q${gx} ${by} ${gx - r} ${by} H${ex + r} Q${ex} ${by} ${ex} ${by - r} V${ey}`,
          w: root.width,
          h: root.height,
          jx: root.width * (2 / 3),
          jy: by,
          ex,
          ey,
        });
      }
      const a = at(front);
      const b = at(slot);
      setFlight({ x: a.x - b.x, y: a.y - b.y, sx: a.w / Math.max(1, b.w), sy: a.h / Math.max(1, b.h) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [desktop]);

  const { scrollYProgress: bandProgress } = useScroll({ target: bandRef, offset: ["start end", "end start"] });
  const open = useSpring(useTransform(bandProgress, [0.12, 0.55], [0, 1]), { stiffness: 120, damping: 26 });
  const stripes = useTransform(bandProgress, [0, 1], [0, 680]);
  const stripePos = useTransform(stripes, (value) => `${value}px 0px`);

  const { scrollYProgress: flyRaw } = useScroll({ target: gridRef, offset: ["start 88%", "start 26%"] });
  const fly = useSpring(flyRaw, { stiffness: 150, damping: 28, mass: 0.4 });
  const cardTransform = useTransform(fly, (value) => {
    if (!desktop) return "none";
    const t = value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
    const k = 1 - t;
    const sx = 1 + (flight.sx - 1) * k;
    const sy = 1 + (flight.sy - 1) * k;
    return `perspective(1600px) translate3d(${flight.x * k}px, ${flight.y * k}px, 0) scale(${sx}, ${sy}) rotateY(${12 * k}deg) rotateZ(${-1.4 * Math.sin(t * Math.PI)}deg)`;
  });
  const edge = useTransform(fly, [0, 0.9, 1], ["rgba(255,255,255,0.75)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]);
  const inside = useTransform(fly, [0.72, 0.96], [0, 1]);

  const ink: ReactNode = (
    <>
      <div className="h-[clamp(220px,23vw,360px)] px-8 pt-10">
        <OpenArt />
      </div>
      <CardText
        dark
        title="Open"
        n={1}
        copy="The file is read from your disk into this tab's memory. It is not copied anywhere else."
      />
    </>
  );

  return (
    <section id="journey" aria-label="How it works" className="relative border-t border-[var(--lp-line)]">
      <div className="relative px-[var(--lp-pad)] pb-[clamp(56px,7vw,110px)] pt-[clamp(84px,9vw,150px)] text-center">
        <Rule vertical className="bottom-0 left-[17%] top-0 hidden md:block" />
        <Rule vertical className="bottom-0 right-[17%] top-0 hidden md:block" />
        <MaskLines as="h2" className="lp-wide lp-title" lines={["Your file takes", "a short trip"]} />
        <MaskBlock className="mx-auto mt-8 max-w-[500px]" delay={0.16}>
          <p className="lp-body">
            {NUMBER_WORDS[freeCount] ?? freeCount} of our tools are code that runs inside this page. This is everything that happens between
            opening a file and saving the result.
          </p>
        </MaskBlock>
        <MaskBlock className="mt-7" delay={0.24}>
          <Link href="/dashboard" className="lp-link">
            See the free tools
            <Arrow />
          </Link>
        </MaskBlock>
        <div className="absolute right-[calc(17%-140px)] top-[52%] hidden items-start gap-3 text-left xl:flex">
          <Sq className="-ml-[6px]" />
          <p className="lp-label">
            Browser tab
            <br />
            // No server
          </p>
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <motion.div
          ref={bandRef}
          style={{ backgroundPosition: stripePos }}
          className="lp-stripes relative flex h-[clamp(240px,27vw,420px)] items-start justify-center"
        >
          <div className="absolute -top-[11%]">
            <Exploded progress={open} frontRef={frontRef} />
          </div>
        </motion.div>

        <div className="h-[clamp(36px,6vw,96px)] border-b border-[var(--lp-line)] max-lg:hidden" />

        <div ref={boardRef} className="relative">
        <div ref={gridRef} className="relative grid lg:grid-cols-3">
          <div ref={slotRef} className="relative z-10 lg:min-h-[520px]">
            <motion.div
              style={{ transform: cardTransform, transformOrigin: "0 0", borderColor: edge }}
              className="h-full border bg-[var(--lp-ink-2)] text-white will-change-transform"
            >
              <motion.div style={desktop ? { opacity: inside } : undefined} className="flex h-full flex-col justify-between">
                {ink}
              </motion.div>
            </motion.div>
          </div>
          <div className="flex flex-col justify-between border-[var(--lp-line)] lg:border-r">
            <div className="m-4 h-[clamp(220px,23vw,360px)] bg-[var(--lp-tint)] p-6">
              <WorkArt />
            </div>
            <CardText
              title="Work"
              n={2}
              copy="You set the format, quality, size or pages. The tool does the job on your own processor."
            />
          </div>
          <div className="flex flex-col justify-between bg-[var(--lp-panel)]">
            <div className="m-4 h-[clamp(220px,23vw,360px)] p-6">
              <SaveArt nodeRef={nodeRef} />
            </div>
            <CardText
              title="Save"
              n={3}
              copy="One button. One file, or a ZIP of the whole batch, with no watermark on any of it."
            />
          </div>
        </div>

        {/* Trace: from the saved file, back to the disk it came from */}
        <div ref={stripRef} className="relative grid border-y border-[var(--lp-line)] lg:grid-cols-3">
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4 px-[var(--lp-pad)] py-11 lg:col-span-2">
            {["JPG", "PDF", "MP3", "PNG", "WAV"].map((ext, index) => (
              <motion.span
                key={ext}
                initial={{ scale: 0, y: 16 }}
                animate={traced ? { scale: 1, y: 0 } : { scale: 0, y: 16 }}
                transition={{ duration: 0.5, delay: 0.5 + (4 - index) * 0.1, ease: EASE }}
              >
                <FileIcon ext={ext} lit={index === 1} />
              </motion.span>
            ))}
          </div>
          <div className="pt-9 max-lg:border-t max-lg:border-[var(--lp-line)] lg:pl-6">
            <CardText
              title="Forget"
              n={4}
              copy="Close the tab and the memory is gone. There is nothing on our side to delete, because nothing was sent."
            />
          </div>
        </div>

        {trace && desktop && (
          <svg
            aria-hidden
            width={trace.w}
            height={trace.h}
            className="pointer-events-none absolute inset-0 z-20 overflow-visible"
          >
            <motion.path
              d={trace.d}
              fill="none"
              stroke="var(--lp-coral)"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: traced ? 1 : 0 }}
              transition={{ duration: 1.9, ease: "easeInOut" }}
            />
            {[
              [trace.jx, trace.jy, 0.85],
              [trace.ex, trace.ey, 1.8],
            ].map(([x, y, delay]) => (
              <motion.rect
                key={delay}
                x={x - 5.5}
                y={y - 5.5}
                width={11}
                height={11}
                fill="var(--lp-coral)"
                stroke="#fff"
                strokeWidth={delay > 1 ? 3 : 0}
                initial={{ scale: 0 }}
                animate={{ scale: traced ? 1 : 0 }}
                transition={{ delay, duration: 0.35, ease: EASE }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ))}
          </svg>
        )}
        </div>
      </div>
    </section>
  );
}
