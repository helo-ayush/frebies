"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCategory, getTool } from "@/lib/registry/tools";
import { buttonClasses } from "@/components/ui/Button";
import {
  ArrowRightGlyph,
  ChevronGlyph,
  MenuGlyph,
  PanelGlyph,
  SearchGlyph,
  SparkGlyph,
} from "@/components/icons/NavGlyph";
import { CommandMenu } from "./CommandMenu";

type Crumb = { label: string; href?: string };

function useCrumbs(): Crumb[] {
  const pathname = usePathname();

  if (pathname === "/dashboard") return [{ label: "Dashboard" }];

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Dashboard" }];

  const category = getCategory(parts[0]);

  if (parts.length === 1) {
    const fallback = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return [{ label: category?.name ?? fallback }];
  }

  if (parts.length === 2) {
    const tool = getTool(parts[0], parts[1]);
    return [
      ...(category ? [{ label: category.name, href: `/${category.slug}` }] : []),
      { label: tool?.shortName ?? tool?.name ?? parts[1] },
    ];
  }

  return [{ label: "Dashboard" }];
}

export function Topbar({
  onOpenNav,
  collapsed,
  onToggleSidebar,
}: {
  onOpenNav: () => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const crumbs = useCrumbs();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#ecece9] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(251,251,249,0.91)_100%)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,15,16,0.025)] backdrop-blur-xl md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(15,15,16,0.06),0_1px_2px_rgba(15,15,16,0.04)] lg:hidden"
          >
            <MenuGlyph size={19} />
          </button>

          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-controls="workbench-sidebar"
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-[#6a6a67] transition-colors hover:bg-white hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(15,15,16,0.06),0_1px_2px_rgba(15,15,16,0.04)] lg:grid"
          >
            <PanelGlyph collapsed={collapsed} size={20} />
          </button>

          <span className="truncate text-[13.5px] font-medium text-ink md:hidden">
            {crumbs[crumbs.length - 1].label}
          </span>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13.5px] md:flex">
            {crumbs.map((crumb, index) => (
              <span
                key={`${crumb.label}-${index}`}
                className="flex min-w-0 items-center gap-1.5"
              >
                {index > 0 && (
                  <ChevronGlyph size={12} className="shrink-0 text-faint" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate text-muted transition-colors hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-ink">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search tools and pages"
          className="hidden h-9 w-[300px] items-center gap-2.5 rounded-[11px] border border-[#e5e5e1] bg-[linear-gradient(180deg,#ffffff_0%,#f9f9f7_100%)] px-3.5 text-ui text-faint shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,15,16,0.03)] transition-colors hover:border-[#d6d6d1] hover:text-muted md:flex xl:w-[340px]"
        >
          <SearchGlyph size={16} className="shrink-0" />
          <span>Search tools or pages…</span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded-[5px] border border-[#e7e7e3] bg-white px-1.5 py-0.5 text-[10px] text-muted shadow-[0_1px_0_rgba(15,15,16,0.03)]">
              ⌘
            </kbd>
            <kbd className="rounded-[5px] border border-[#e7e7e3] bg-white px-1.5 py-0.5 text-[10px] text-muted shadow-[0_1px_0_rgba(15,15,16,0.03)]">
              K
            </kbd>
          </span>
        </button>

        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search tools and pages"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(15,15,16,0.06),0_1px_2px_rgba(15,15,16,0.04)] md:hidden"
          >
            <SearchGlyph size={19} />
          </button>
          <Link
            href="/sign-in"
            title="Sign in to claim 25 free credits"
            className={buttonClasses("secondary", "sm", "hidden gap-1.5 sm:inline-flex")}
          >
            <SparkGlyph size={13} className="text-accent" />
            Get credits
          </Link>
          <Link href="/sign-in" className={buttonClasses("primary", "sm", "pl-3.5 pr-3")}>
            Sign in
            <ArrowRightGlyph size={13} className="text-white/70" />
          </Link>
        </div>
      </header>

      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
