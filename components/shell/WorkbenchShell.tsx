"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
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

  // Remember the rail preference so a tool page keeps its width between visits.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("frebies:sidebar") === "collapsed") setSidebarCollapsed(true);
    } catch {
      // Storage can be blocked; the default expanded rail is fine.
    }
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("frebies:sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Ignore blocked storage.
      }
      return next;
    });
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-ink">
      <Sidebar
        open={navOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setNavOpen(false)}
      />

      {navOpen && (
        <div
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-35 bg-black/30 lg:hidden"
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
        <main className="mx-auto w-full max-w-[1520px] px-4 pb-24 pt-4 sm:px-5 lg:px-6 lg:pt-5">
          {children}
        </main>
      </div>

    </div>
  );
}
