"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, grads } from "./ui";

const links = [
  { label: "Tools", href: "#tools" },
  { label: "Pricing", href: "#pricing" },
  { label: "Privacy", href: "#privacy" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
      <span className="h-5 w-5 rounded-full" style={{ background: grads.sun }} />
      frebies
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-line bg-white px-4 py-3 text-[15px]">
        <span>16 focused tools for images, documents and audio.</span>
        <Link
          href="/dashboard"
          className="rounded-full border border-line px-4 py-1.5 transition-colors hover:bg-neutral-50"
        >
          Browse tools
        </Link>
      </div>
      <header
        className={`sticky top-0 z-50 transition-colors ${
          scrolled ? "border-b border-line bg-white/85 backdrop-blur-xl" : ""
        }`}
      >
        <div className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-5">
          <div className="flex items-center gap-10">
            <Logo />
            <AnimatePresence>
              {!scrolled && (
                <motion.nav
                  key="nav"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  aria-label="Main navigation"
                  className="hidden gap-8 text-[15px] md:flex"
                >
                  {links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="text-neutral-700 transition-colors hover:text-black"
                    >
                      {link.label}
                    </a>
                  ))}
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Btn sm href="/dashboard">Get started</Btn>
          </div>
        </div>
      </header>
    </>
  );
}
