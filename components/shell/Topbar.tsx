"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Wordmark, LogoMark } from "@/components/brand/Wordmark";
import { PanelGlyph, SearchGlyph } from "@/components/icons/NavGlyph";
import { useAuthSession } from "@/components/auth/AuthContext";
import { Roll } from "@/components/site/kit";
import { SoundToggle } from "@/components/ui/sound";
import { categories, getCategory, getTool, tools } from "@/lib/registry/tools";

type Crumb = { label: string; href?: string };

function useCrumbs(): Crumb[] {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] === "dashboard") return [{ label: "All tools" }];
  const category = getCategory(parts[0]);
  if (!category) return [{ label: parts[0] }];
  if (parts.length === 1) return [{ label: category.name }];
  const tool = getTool(parts[0], parts[1]);
  return [{ label: category.name, href: `/${category.slug}` }, { label: tool?.shortName ?? tool?.name ?? parts[1] }];
}

/** Where to come back to after signing in. */
export function useAuthSuffix() {
  const pathname = usePathname();
  if (!pathname || pathname === "/dashboard" || pathname.startsWith("/sign-")) return "";
  return `?redirect_url=${encodeURIComponent(pathname)}`;
}

export function Topbar({
  navOpen,
  onToggleNav,
  onSearch,
  collapsed,
  onToggleSidebar,
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  onSearch: () => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const crumbs = useCrumbs();
  const pathname = usePathname();
  const { isSignedIn, user, signOut } = useAuthSession();
  const authSuffix = useAuthSuffix();
  const [mac, setMac] = useState(false);
  const number = categories.findIndex((category) => pathname.startsWith(`/${category.slug}`)) + 1;

  useEffect(() => {
    setMac(/mac|iphone|ipad/i.test(navigator.platform));
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-[var(--fb-bar)] items-stretch border-b border-line bg-canvas">
      {/* Logo cell lines up with the index below it */}
      <div className="flex shrink-0 items-center gap-2 border-line pl-4 transition-[width] duration-200 motion-reduce:transition-none lg:w-[var(--fb-side)] lg:justify-between lg:border-r lg:pl-0">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Expand the tool index"
            aria-expanded={false}
            aria-controls="workbench-sidebar"
            title="Expand the tool index (Ctrl B)"
            data-slot="sidebar-trigger"
            className="hidden h-full w-full place-items-center transition-colors hover:bg-hover lg:grid"
          >
            <PanelGlyph collapsed size={20} />
          </button>
        ) : (
          <>
            <span className="lg:pl-6">
              <Wordmark href="/" size={24} />
            </span>
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Collapse the tool index"
              aria-expanded
              aria-controls="workbench-sidebar"
              title="Collapse the tool index (Ctrl B)"
              data-slot="sidebar-trigger"
              className="hidden h-full w-12 place-items-center text-muted transition-colors hover:bg-hover hover:text-ink lg:grid"
            >
              <PanelGlyph collapsed={false} size={19} />
            </button>
          </>
        )}
        {collapsed ? (
          <span className="lg:hidden">
            <Wordmark href="/" size={24} />
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-4 pl-4 pr-3 sm:pr-4 lg:pl-6 lg:pr-5">
        {collapsed ? (
          <Link href="/" aria-label="frebies home" className="hidden lg:block">
            <LogoMark size={24} />
          </Link>
        ) : null}

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center text-[14px] uppercase sm:flex">
          <span className="whitespace-pre text-faint">[{number > 0 ? `0${number} // ` : ""}</span>
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="flex min-w-0 items-center whitespace-pre">
              {index > 0 ? <span className="text-faint">{" // "}</span> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="text-muted transition-colors hover:text-accent-deep">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
          <span className="text-faint">]</span>
        </nav>

        <button
          type="button"
          onClick={onSearch}
          aria-label="Search tools"
          className="group ml-auto flex h-10 items-stretch border border-line-strong bg-panel text-left transition-colors hover:border-ink max-md:border-0 max-md:bg-transparent md:w-[260px] xl:w-[340px]"
        >
          <span className="grid w-10 shrink-0 place-items-center transition-colors max-md:text-ink md:bg-ink md:text-white md:group-hover:bg-accent-deep">
            <SearchGlyph size={18} />
          </span>
          <span className="hidden flex-1 items-center justify-between gap-3 px-3 text-[14px] text-faint md:flex">
            Search {tools.length} tools
            <kbd className="font-sans text-[12px] text-faint">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </span>
        </button>

        <SoundToggle
          aria-label="Toggle interface sounds"
          className="hidden h-10 w-10 shrink-0 place-items-center text-muted transition-colors hover:bg-hover hover:text-ink sm:grid"
        />

        {isSignedIn && user ? (
          <div className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-2.5" title={user.email ?? undefined}>
              {user.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.imageUrl} alt="" className="fb-ear h-8 w-8 object-cover" style={{ ["--ear" as string]: "8px" }} />
              ) : (
                <span
                  className="fb-ear grid h-8 w-8 place-items-center bg-ink text-[12px] font-semibold text-white"
                  style={{ ["--ear" as string]: "8px" }}
                >
                  {user.initials}
                </span>
              )}
              <span className="hidden max-w-[120px] truncate text-[14px] xl:block">
                {user.firstName ?? user.email ?? "Account"}
              </span>
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-10 w-10 place-items-center text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="hidden items-center gap-5 sm:flex">
            <Link href={`/sign-in${authSuffix}`} className="text-[14px] uppercase">
              <Roll>Sign in</Roll>
            </Link>
            <Link
              href={`/sign-up${authSuffix}`}
              className="fb-btn fb-ear !hidden !h-10 !px-4 !text-[13px] xl:!inline-flex"
              style={{ ["--ear" as string]: "11px" }}
            >
              25 free credits
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleNav}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          aria-controls="workbench-sidebar"
          className="relative grid h-10 w-10 shrink-0 place-items-center lg:hidden"
        >
          <span className={`absolute h-[2px] w-6 bg-current transition-transform duration-300 ${navOpen ? "rotate-45" : "-translate-y-[5px]"}`} />
          <span className={`absolute h-[2px] w-6 bg-current transition-transform duration-300 ${navOpen ? "-rotate-45" : "translate-y-[5px]"}`} />
        </button>
      </div>
    </header>
  );
}
