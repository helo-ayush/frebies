"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { useAuthSession } from "@/components/auth/AuthContext";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { categories, tools, toolsForCategory } from "@/lib/registry/tools";
import { Arrow, EASE, Roll } from "./kit";

const LINKS = [
  { id: "journey", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "Questions" },
];
const SECTIONS = ["tools", ...LINKS.map((link) => link.id)];

/** The brand mark with a dog-ear: an ink file with a coral button. */
export function LogoMark({ size = 26, invert = false }: { size?: number; invert?: boolean }) {
  return (
    <span
      aria-hidden
      className="lp-ear grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        background: invert ? "#fff" : "var(--lp-ink)",
        ["--ear" as string]: `${Math.round(size * 0.27)}px`,
      }}
    >
      <span
        className="rounded-full bg-[var(--lp-coral)]"
        style={{ width: size * 0.36, height: size * 0.36 }}
      />
    </span>
  );
}

export function Nav() {
  const { isSignedIn } = useAuthSession();
  const [scrolled, setScrolled] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const [menu, setMenu] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const headerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 32, mass: 0.3 });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 6);
      const probe = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const id of SECTIONS) {
        const node = document.getElementById(id);
        if (!node) continue;
        const box = node.getBoundingClientRect();
        if (box.top <= probe && box.bottom > probe) current = id;
      }
      setSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeAll = useCallback(() => {
    setTray(false);
    setMenu(false);
  }, []);

  useEffect(() => {
    if (!tray && !menu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) closeAll();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [tray, menu, closeAll]);

  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menu]);

  const openTray = () => {
    window.clearTimeout(closeTimer.current);
    setTray(true);
  };
  const leaveTray = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setTray(false), 160);
  };

  const solid = scrolled || tray || menu;
  const marker = (id: string) => (
    <span
      aria-hidden
      className={`absolute -left-[15px] top-1/2 -mt-[3.5px] h-[7px] w-[7px] bg-[var(--lp-coral)] transition-transform duration-300 ${
        section === id ? "scale-100" : "scale-0"
      }`}
    />
  );

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "bg-[var(--lp-bg)]" : ""}`}
    >
      <div
        className={`relative flex h-[var(--lp-nav)] items-center justify-between gap-6 border-b px-[var(--lp-pad)] transition-colors duration-300 ${
          solid ? "border-[var(--lp-line)]" : "border-transparent"
        }`}
      >
        <Link href="/" aria-label="frebies home" className="flex items-center gap-2.5" onClick={closeAll}>
          <LogoMark />
          <span className="lp-wide text-[19px] lowercase leading-none">frebies</span>
        </Link>

        <div className="flex items-center gap-[clamp(18px,2vw,34px)]">
          <nav aria-label="Main navigation" className="hidden items-center gap-[clamp(18px,2vw,34px)] lg:flex">
            <div onPointerEnter={openTray} onPointerLeave={leaveTray}>
              <button
                type="button"
                aria-expanded={tray}
                aria-controls="tools-tray"
                onClick={() => setTray((value) => !value)}
                className="relative flex h-[var(--lp-nav)] items-center text-[14px] uppercase"
              >
                {marker("tools")}
                <Roll>Tools</Roll>
                <svg
                  aria-hidden
                  width="9"
                  height="9"
                  viewBox="0 0 10 10"
                  className={`ml-2 transition-transform duration-300 ${tray ? "rotate-45" : ""}`}
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M5 0v10M0 5h10" />
                </svg>
              </button>
            </div>
            {LINKS.map((link) => (
              <a key={link.id} href={`#${link.id}`} className="relative flex items-center text-[14px] uppercase">
                {marker(link.id)}
                <Roll>{link.label}</Roll>
              </a>
            ))}
            {!isSignedIn && (
              <Link href="/sign-in" className="flex items-center text-[14px] uppercase">
                <Roll>Sign in</Roll>
              </Link>
            )}
          </nav>

          <Link
            href="/dashboard"
            className="lp-btn lp-ear !h-[44px] max-sm:!px-4 max-sm:!text-[13px]"
            style={{ ["--ear" as string]: "12px" }}
          >
            {isSignedIn ? "Open studio" : "Open the tools"}
          </Link>

          <button
            type="button"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu((value) => !value)}
            className="relative grid h-11 w-11 place-items-center lg:hidden"
          >
            <span className={`absolute h-[2px] w-6 bg-current transition-transform duration-300 ${menu ? "rotate-45" : "-translate-y-[5px]"}`} />
            <span className={`absolute h-[2px] w-6 bg-current transition-transform duration-300 ${menu ? "-rotate-45" : "translate-y-[5px]"}`} />
          </button>
        </div>

        <motion.span
          aria-hidden
          style={{ scaleX: progress, originX: 0 }}
          className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--lp-coral)]"
        />
      </div>

      {/* Tools tray */}
      <AnimatePresence>
        {tray && (
          <motion.div
            id="tools-tray"
            onPointerEnter={openTray}
            onPointerLeave={leaveTray}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-x-0 top-full hidden border-b border-[var(--lp-line)] bg-[var(--lp-panel)] lg:block"
          >
            <div className="grid grid-cols-4">
              {categories.map((category, index) => (
                <div
                  key={category.slug}
                  className={`flex flex-col px-[var(--lp-pad)] pb-9 pt-7 ${index > 0 ? "border-l border-[var(--lp-line)]" : ""}`}
                >
                  <Link
                    href={`/${category.slug}`}
                    onClick={closeAll}
                    className="lp-wide flex items-baseline justify-between text-[19px] hover:text-[var(--lp-coral)]"
                  >
                    {category.name}
                    <Arrow />
                  </Link>
                  <ul className="mt-5">
                    {toolsForCategory(category.slug).map((tool) => (
                      <li key={tool.path} className="border-t border-[var(--lp-line)]">
                        <Link
                          href={tool.path}
                          onClick={closeAll}
                          className="group flex items-center gap-3 py-2.5 text-[15px] transition-[padding] duration-300 hover:pl-2"
                        >
                          <ToolGlyph
                            path={tool.path}
                            size={18}
                            className="shrink-0 text-[var(--lp-muted)] transition-colors group-hover:text-[var(--lp-coral)]"
                          />
                          <span className="flex-1">{tool.name}</span>
                          <span className="lp-label !text-[12px]">
                            {tool.status === "soon" ? "Preview" : tool.tier === "free" ? "Free" : "AI"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {index === categories.length - 1 && (
                    <Link
                      href="/dashboard"
                      onClick={closeAll}
                      className="lp-btn lp-ear mt-auto !h-[76px] !justify-between"
                      style={{ ["--ear" as string]: "20px" }}
                    >
                      All {tools.length} tools
                      <Arrow size={18} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone menu */}
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="absolute inset-x-0 top-full flex h-[calc(100svh-var(--lp-nav))] flex-col overflow-y-auto bg-[var(--lp-bg)] lg:hidden"
          >
            <div className="flex-1">
              {categories.map((category, index) => (
                <Link
                  key={category.slug}
                  href={`/${category.slug}`}
                  onClick={closeAll}
                  className="flex items-center justify-between border-b border-[var(--lp-line)] px-[var(--lp-pad)] py-5"
                >
                  <motion.span
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.12 + index * 0.05, duration: 0.5, ease: EASE }}
                    className="lp-wide text-[26px]"
                  >
                    {category.name}
                  </motion.span>
                  <span className="lp-label">{toolsForCategory(category.slug).length}</span>
                </Link>
              ))}
              <div className="grid grid-cols-2">
                {[...LINKS.map((link) => ({ href: `#${link.id}`, label: link.label })), ...(isSignedIn ? [] : [{ href: "/sign-in", label: "Sign in" }])].map(
                  (link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={closeAll}
                      className="border-b border-r border-[var(--lp-line)] px-[var(--lp-pad)] py-4 text-[14px] uppercase even:border-r-0"
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            </div>
            <Link
              href="/dashboard"
              onClick={closeAll}
              className="flex items-center justify-between bg-[var(--lp-coral-deep)] px-[var(--lp-pad)] py-6 text-[15px] font-semibold uppercase text-white"
            >
              All {tools.length} tools
              <Arrow size={18} />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
