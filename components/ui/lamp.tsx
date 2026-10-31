"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const LampContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[32px] bg-ink text-white",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[26rem]">
        <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#ffe9c9] shadow-[0_0_70px_24px_rgba(253,168,43,0.35)]" />
        <div className="absolute left-1/2 top-0 h-[24rem] w-3/4 -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_top,rgba(255,180,107,0.3),transparent_62%)] blur-2xl" />
        <div className="absolute left-1/2 top-0 h-[21rem] w-12 origin-top -translate-x-1/2 rotate-[26deg] bg-gradient-to-b from-[#ffcf9e]/70 via-[#ffb46b]/20 to-transparent blur-2xl" />
        <div className="absolute left-1/2 top-0 h-[21rem] w-12 origin-top -translate-x-1/2 -rotate-[26deg] bg-gradient-to-b from-[#ffcf9e]/70 via-[#ffb46b]/20 to-transparent blur-2xl" />
        <motion.div
          initial={{ width: "8rem", opacity: 0 }}
          whileInView={{ width: "34rem", opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeInOut" }}
          className="absolute left-1/2 top-[10.5rem] h-px -translate-x-1/2 bg-gradient-to-r from-transparent via-[#ffd7a8] to-transparent"
        />
        <div className="absolute left-1/2 top-[10rem] h-24 w-80 -translate-x-1/2 rounded-full bg-[#fda82b]/25 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pb-20 pt-64 md:pb-24 md:pt-72">
        {children}
      </div>
    </div>
  );
};
