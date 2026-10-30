"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteProgressiveBlur } from "@/components/effects/SiteProgressiveBlur";
import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function WorkbenchShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
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

  function toggleSidebar() {
    setSidebarCollapsed((current) => !current);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <ScrollProgress />
      <Sidebar
        open={navOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setNavOpen(false)}
      />

      {navOpen && (
        <div
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}

      <div
        ref={contentRef}
        aria-hidden={navOpen || undefined}
        className={`transition-[padding] duration-200 motion-reduce:transition-none ${
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[264px]"
        }`}
      >
        <Topbar
          onOpenNav={() => setNavOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main className="mx-auto w-full max-w-[1280px] px-5 pb-24 pt-7 sm:px-6 lg:px-9 lg:pt-8">
          {children}
        </main>
      </div>

      <SiteProgressiveBlur
        className={sidebarCollapsed ? "lg:left-[72px]" : "lg:left-[264px]"}
      />
    </div>
  );
}
