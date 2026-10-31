"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const StickyScroll = ({
  content,
  contentClassName,
}: {
  content: {
    title: string;
    description: string;
    content?: React.ReactNode | any;
  }[];
  contentClassName?: string;
}) => {
  const [activeCard, setActiveCard] = React.useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const updateActive = () => {
      const viewportCenter = window.innerHeight / 2;
      let closest = 0;
      let closestDistance = Infinity;

      itemRefs.current.forEach((node, index) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = index;
        }
      });

      setActiveCard(closest);
    };

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateActive();
      });
    };

    updateActive();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const backgroundColors = ["#fbfbfa", "#fdf6f0", "#f7f5fb"];
  const linearGradients = [
    "radial-gradient(circle at 30% 20%, #ffe2b8 0%, #ff9d4d 45%, #d9480f 85%, #8a2a08 100%)",
    "radial-gradient(circle at 30% 20%, #ffd8c8 0%, #f0866a 45%, #c2432b 85%, #7c2417 100%)",
    "radial-gradient(circle at 30% 20%, #ffe7c4 0%, #ffc26b 45%, #e07a2b 85%, #8a4210 100%)",
  ];

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0],
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard]);

  return (
    <motion.div
      animate={{
        backgroundColor: backgroundColors[activeCard % backgroundColors.length],
      }}
      transition={{ duration: 0.6 }}
      className="relative mx-auto flex w-full max-w-[1280px] flex-col gap-10 rounded-[32px] border border-line px-5 py-10 md:gap-16 md:px-10 md:py-16 lg:flex-row"
      ref={ref}
    >
      <div className="relative flex items-start lg:w-1/2">
        <div className="max-w-xl">
          {content.map((item, index) => (
            <div
              key={item.title + index}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className="flex min-h-[42vh] flex-col justify-center py-10"
            >
              <motion.h3
                animate={{ opacity: activeCard === index ? 1 : 0.3 }}
                className="text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.08] tracking-[-0.03em] text-ink"
              >
                {item.title}
              </motion.h3>
              <motion.p
                animate={{ opacity: activeCard === index ? 1 : 0.3 }}
                className="mt-4 max-w-md text-lg leading-snug text-muted"
              >
                {item.description}
              </motion.p>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:block lg:w-1/2">
        <div
          style={{ background: backgroundGradient }}
          className={cn(
            "sticky top-[max(5.5rem,calc(50vh-12rem))] flex h-[24rem] w-full items-center justify-center overflow-hidden rounded-[28px] p-8 shadow-[0_30px_80px_rgba(25,20,12,0.18)]",
            contentClassName,
          )}
        >
          {content[activeCard].content ?? null}
        </div>
      </div>
    </motion.div>
  );
};
