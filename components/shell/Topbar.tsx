"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCategory, getTool } from "@/lib/registry/tools";
import { AceternityTooltip } from "@/components/aceternity/animated-tooltip";
import { HoverBorderGradient } from "@/components/aceternity/hover-border-gradient";
import { buttonClasses } from "@/components/ui/Button";
import { ChevronGlyph, MenuGlyph, PanelGlyph, SearchGlyph } from "@/components/icons/NavGlyph";
import { CommandMenu } from "./CommandMenu";

type Crumb = { label: string; href?: string };

function useCrumbs(): Crumb[] {
  const pathname = usePathname();

  if (pathname === "/dashboard") return [{ label: "Home" }];

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Home" }];

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

  return [{ label: "Home" }];
}

const iconBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink";
const kbd =
  "rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] leading-none text-muted";

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
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-soft bg-white/95 px-4 backdrop-blur md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AceternityTooltip label="Open navigation" side="bottom">
            <button type="button" onClick={onOpenNav} aria-label="Open navigation" className={`${iconBtn} lg:hidden`}>
              <MenuGlyph size={19} />
            </button>
          </AceternityTooltip>

          <AceternityTooltip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            hint="⌘B"
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-controls="workbench-sidebar"
              aria-expanded={!collapsed}
              className={`${iconBtn} hidden lg:grid`}
            >
              <PanelGlyph collapsed={collapsed} size={20} />
            </button>
          </AceternityTooltip>

          <span className="truncate text-[13.5px] font-medium text-ink md:hidden">
            {crumbs[crumbs.length - 1].label}
          </span>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 pl-1 text-[13.5px] md:flex">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <ChevronGlyph size={12} className="shrink-0 text-faint" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="truncate text-muted transition-colors hover:text-ink">
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
          className="hidden h-9 w-[320px] items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 text-ui text-faint transition-colors hover:border-[#d8d8d5] md:flex xl:w-[400px]"
        >
          <SearchGlyph size={16} className="shrink-0" />
          <span>Search everything…</span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className={kbd}>⌘</kbd>
            <kbd className={kbd}>K</kbd>
          </span>
        </button>

        <div className="flex items-center justify-end gap-2">
          <AceternityTooltip label="Search" hint="⌘K" side="bottom">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search tools and pages"
              className={`${iconBtn} md:hidden`}
            >
              <SearchGlyph size={19} />
            </button>
          </AceternityTooltip>
          <HoverBorderGradient
            as={Link}
            href="/sign-in"
            containerClassName="hidden rounded-full sm:flex"
            className="h-8 rounded-full px-3 text-ui transition-colors hover:bg-neutral-50"
          >
            Get credits
          </HoverBorderGradient>
          <HoverBorderGradient
            as={Link}
            href="/sign-in"
            containerClassName="rounded-full"
            className="h-8 rounded-full bg-ink px-3 text-ui text-white transition-colors hover:bg-neutral-800"
          >
            Sign in
          </HoverBorderGradient>
        </div>
      </header>

      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
