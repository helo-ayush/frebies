"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { HomeGlyph, SparkGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { Arrow } from "@/components/site/kit";
import { Seam, seamLabel } from "@/components/ui/Seam";
import { categories, tools, toolsForCategory } from "@/lib/registry/tools";
import { useAuthSuffix } from "./Topbar";

/**
 * The tool index. On desktop it is a fixed column under the top bar, styled
 * like the landing page's category tabs; on phones it is a full-screen sheet.
 */
export function Sidebar({ open, collapsed, onClose }: { open: boolean; collapsed: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { isSignedIn, user, signOut } = useAuthSession();
  const authSuffix = useAuthSuffix();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the current tool in view. Moves this list only, never the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !row) return;
    const above = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const below = above + row.offsetHeight - list.clientHeight;
    if (above < 0) list.scrollTop += above - 44;
    else if (below > 0) list.scrollTop += below + 44;
  }, [pathname, collapsed]);

  return (
    <>
      {/* ---------- Desktop index ---------- */}
      <aside
        id="workbench-sidebar"
        aria-label="Tool index"
        className="fixed bottom-0 left-0 top-[var(--fb-bar)] z-40 hidden w-[var(--fb-side)] flex-col overflow-hidden border-r border-line bg-canvas transition-[width] duration-200 motion-reduce:transition-none lg:flex"
      >
        {collapsed ? (
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <IconRow href="/dashboard" label="All tools" active={pathname === "/dashboard"}>
              <HomeGlyph size={20} />
            </IconRow>
            {categories.map((category) => (
              <nav key={category.slug} aria-label={category.name} className="border-t border-line py-1">
                {toolsForCategory(category.slug).map((tool) => (
                  <IconRow
                    key={tool.path}
                    href={tool.path}
                    label={`${tool.name} (${seamLabel(tool)})`}
                    active={pathname === tool.path}
                  >
                    <ToolGlyph path={tool.path} size={20} />
                  </IconRow>
                ))}
              </nav>
            ))}
          </div>
        ) : (
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <Link
              href="/dashboard"
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              className={`relative flex h-11 shrink-0 items-center gap-3 pl-5 pr-4 text-[14.5px] transition-colors ${
                pathname === "/dashboard" ? "bg-ink-2 text-white" : "hover:text-accent-deep"
              }`}
            >
              <HomeGlyph size={18} />
              <span className="flex-1">All tools</span>
              <span className={`text-[13px] ${pathname === "/dashboard" ? "text-white/55" : "text-faint"}`}>{tools.length}</span>
            </Link>

            {categories.map((category, index) => {
              const here = pathname === `/${category.slug}`;
              return (
                <nav key={category.slug} aria-label={category.name} className="shrink-0 border-t border-line pb-1.5">
                  <Link
                    href={`/${category.slug}`}
                    aria-current={here ? "page" : undefined}
                    className={`flex h-[34px] items-center pl-5 pr-4 text-[13px] uppercase transition-colors hover:text-accent-deep ${
                      here ? "text-accent-deep" : "text-faint"
                    }`}
                  >
                    [0{index + 1} // {category.name}]
                  </Link>
                  {toolsForCategory(category.slug).map((tool) => {
                    const on = pathname === tool.path;
                    return (
                      <Link
                        key={tool.path}
                        href={tool.path}
                        aria-current={on ? "page" : undefined}
                        title={`${tool.name} (${seamLabel(tool)})`}
                        className={`group relative flex h-[34px] items-center gap-3 pl-5 pr-4 text-[14.5px] transition-colors ${
                          on ? "bg-ink-2 text-white" : "hover:text-accent-deep"
                        }`}
                      >
                        {on ? <span aria-hidden className="absolute inset-y-0 left-2 w-[2px] bg-accent" /> : null}
                        <ToolGlyph
                          path={tool.path}
                          size={18}
                          className={`shrink-0 ${on ? "" : "text-muted group-hover:text-accent-deep"}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                        <Seam tool={tool} className={on && tool.tier === "credits" ? "!bg-white/70" : ""} />
                      </Link>
                    );
                  })}
                </nav>
              );
            })}
          </div>
        )}

        {/* Account */}
        <div className="shrink-0 border-t border-line">
          {isSignedIn && user ? (
            collapsed ? (
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                title={`Sign out ${user.email ?? ""}`}
                className="grid h-14 w-full place-items-center transition-colors hover:bg-hover"
              >
                <span className="fb-ear grid h-8 w-8 place-items-center bg-ink text-[12px] font-semibold text-white" style={{ ["--ear" as string]: "8px" }}>
                  {user.initials}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-3 py-3 pl-5 pr-2">
                <span className="fb-ear grid h-8 w-8 shrink-0 place-items-center bg-ink text-[12px] font-semibold text-white" style={{ ["--ear" as string]: "8px" }}>
                  {user.initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{user.email ?? user.fullName ?? "Signed in"}</span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid h-9 w-9 place-items-center text-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  <LogOut size={16} aria-hidden />
                </button>
              </div>
            )
          ) : (
            <Link
              href={`/sign-up${authSuffix}`}
              title="Create an account for 25 free AI credits"
              className={`group flex h-14 items-center gap-3 bg-ink text-white transition-colors hover:bg-accent-deep ${
                collapsed ? "justify-center" : "pl-5 pr-4"
              }`}
            >
              <SparkGlyph size={18} className="shrink-0 text-accent transition-colors group-hover:text-white" />
              {collapsed ? null : (
                <>
                  <span className="flex-1 text-[13.5px] leading-tight">
                    25 AI credits
                    <span className="block text-white/60">when you sign up</span>
                  </span>
                  <Arrow />
                </>
              )}
            </Link>
          )}
        </div>
      </aside>

      {/* ---------- Phone sheet ---------- */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fb-unfold fixed inset-x-0 bottom-0 top-[var(--fb-bar)] z-40 flex flex-col bg-canvas lg:hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Link
              href="/dashboard"
              onClick={onClose}
              className="flex h-14 items-center justify-between border-b border-line px-4 text-[15px] font-medium"
            >
              All tools
              <span className="fb-label">{tools.length}</span>
            </Link>
            {categories.map((category) => (
              <div key={category.slug} className="border-b border-line pb-2">
                <Link
                  href={`/${category.slug}`}
                  onClick={onClose}
                  className="fb-wide flex h-14 items-center justify-between px-4 text-[21px]"
                >
                  {category.name}
                  <Arrow size={17} />
                </Link>
                {toolsForCategory(category.slug).map((tool) => {
                  const on = pathname === tool.path;
                  return (
                    <Link
                      key={tool.path}
                      href={tool.path}
                      onClick={onClose}
                      aria-current={on ? "page" : undefined}
                      className={`relative flex h-12 items-center gap-3 px-4 text-[16px] ${on ? "bg-ink-2 text-white" : ""}`}
                    >
                      <ToolGlyph path={tool.path} size={20} className={on ? "" : "text-muted"} />
                      <span className="flex-1">{tool.name}</span>
                      <Seam tool={tool} className={on && tool.tier === "credits" ? "!bg-white/70" : ""} />
                    </Link>
                  );
                })}
              </div>
            ))}
            <p className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-[13px] text-muted">
              <span className="flex items-center gap-2"><span className="h-[6px] w-5 bg-accent" />Free</span>
              <span className="flex items-center gap-2"><span className="h-[6px] w-5 bg-ink" />AI credits</span>
              <span className="flex items-center gap-2"><span className="h-[6px] w-5 bg-line-strong" />Preview</span>
            </p>
          </div>
          {isSignedIn && user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-16 shrink-0 items-center justify-between bg-ink px-4 text-[14px] font-semibold uppercase text-white"
            >
              Sign out
              <LogOut size={17} aria-hidden />
            </button>
          ) : (
            <div className="grid shrink-0 grid-cols-2">
              <Link
                href={`/sign-in${authSuffix}`}
                onClick={onClose}
                className="flex h-16 items-center justify-center bg-ink text-[14px] font-semibold uppercase text-white"
              >
                Sign in
              </Link>
              <Link
                href={`/sign-up${authSuffix}`}
                onClick={onClose}
                className="flex h-16 items-center justify-center bg-accent-deep text-[14px] font-semibold uppercase text-white"
              >
                25 free credits
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function IconRow({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative grid h-10 w-full place-items-center transition-colors ${
        active ? "bg-ink-2 text-white" : "text-muted hover:text-accent-deep"
      }`}
    >
      {active ? <span aria-hidden className="absolute inset-y-0 left-1.5 w-[2px] bg-accent" /> : null}
      {children}
    </Link>
  );
}
