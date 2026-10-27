"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, grads } from "./ui";

const links = ["Tools", "Pricing", "Privacy"];

export function Logo() {
  return (
    <a href="#" className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
      <span className="h-5 w-5 rounded-full" style={{ background: grads.sun }} />
      frebies
    </a>
  );
}

export default function Navbar() {
  const [s, setS] = useState(false);
  useEffect(() => {
    const f = () => setS(window.scrollY > 240);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-line bg-white px-4 py-3 text-[15px]">
        <span>Frebies Pro is live: 4× upscaling and an AI PDF editor.</span>
        <a href="#pricing" className="rounded-full border border-line px-4 py-1.5 hover:bg-neutral-50">Discover</a>
      </div>
      <header className={`sticky top-0 z-50 transition-colors ${s ? "border-b border-line bg-white/85 backdrop-blur-xl" : ""}`}>
        <div className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-5">
          <div className="flex items-center gap-10">
            <Logo />
            <AnimatePresence>
              {!s && (
                <motion.nav key="nav" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                  className="hidden gap-8 text-[15px] md:flex">
                  {links.map((l) => (
                    <a key={l} href={`#${l.toLowerCase()}`} className="text-neutral-700 transition-colors hover:text-black">{l}</a>
                  ))}
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex"><Btn dark={false} sm>Log in</Btn></span>
            <Btn sm>Get started</Btn>
          </div>
        </div>
      </header>
    </>
  );
}
