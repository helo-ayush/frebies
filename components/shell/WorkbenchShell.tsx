"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { sweepHeldFiles } from "@/lib/held-file";
import { CommandMenu } from "./CommandMenu";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const COLLAPSED_WIDTH = "64px";

export function WorkbenchShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setNavOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const node = contentRef.current;
    if (node) (node as HTMLElement & { inert: boolean }).inert = navOpen;
    if (!navOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  // Files left at the sign-in gate are gone after an hour.
  useEffect(() => {
    void sweepHeldFiles();
  }, []);

  // Remember the index width, so a tool page keeps its room between visits.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("frebies:sidebar") === "collapsed") setCollapsed(true);
    } catch {
      // Storage can be blocked; the open index is a fine default.
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("frebies:sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Ignore blocked storage.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !command && !target?.closest("input, textarea, select, [contenteditable]")) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return (
    <div
      className="min-h-dvh bg-canvas text-ink"
      style={{ "--fb-side": collapsed ? COLLAPSED_WIDTH : "264px" } as CSSProperties}
    >
      <Topbar
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((value) => !value)}
        onSearch={() => setSearchOpen(true)}
        collapsed={collapsed}
        onToggleSidebar={toggleSidebar}
      />
      <Sidebar open={navOpen} collapsed={collapsed} onClose={() => setNavOpen(false)} />

      <div
        ref={contentRef}
        aria-hidden={navOpen || undefined}
        className="pt-[var(--fb-bar)] transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--fb-side)]"
      >
        <main>{children}</main>
      </div>

      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
