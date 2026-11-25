"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/brand/Wordmark";
import { useAuthSession } from "@/components/auth/AuthContext";

const LINKS = [
  { label: "Tools", href: "#tools" },
  { label: "How it works", href: "#how" },
  { label: "Privacy", href: "#privacy" },
  { label: "Pricing", href: "#pricing" },
];

/** Floating glass navigation that tightens once the page starts to scroll. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { isSignedIn } = useAuthSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={`pointer-events-auto mx-auto flex h-[58px] items-center justify-between gap-4 rounded-[20px] border pl-4 pr-2 transition-[max-width,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          scrolled
            ? "max-w-[880px] border-line bg-white/80 shadow-[0_18px_50px_-24px_rgba(15,15,16,0.35)] backdrop-blur-xl"
            : "max-w-[1240px] border-transparent bg-transparent"
        }`}
      >
        <Link href="/" aria-label="frebies home" className="flex items-center gap-2">
          <BrandMark className="!h-[24px] !w-[24px] !rounded-[7px]" />
          <span className="font-display text-[20px] font-semibold tracking-[-0.04em] text-ink">frebies</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[14px] font-medium text-muted transition-colors hover:bg-black/[0.04] hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          {!isSignedIn && (
            <Link
              href="/sign-in"
              className="hidden rounded-full px-3.5 py-2 text-[14px] font-medium text-muted transition-colors hover:text-ink sm:block"
            >
              Sign in
            </Link>
          )}
          <Link
            href="/dashboard"
            className="group inline-flex h-[42px] items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a2b]"
          >
            {isSignedIn ? "Open studio" : "Open the tools"}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
