"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthSession } from "@/components/auth/AuthContext";
import { HomeGlyph, SparkGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { Arrow } from "@/components/site/kit";
import { Seam, seamLabel } from "@/components/ui/Seam";
import { categories, tools, toolsForCategory, type CategorySlug, type Tool } from "@/lib/registry/tools";
import { useAuthSuffix } from "./Topbar";

const STORE = "frebies:index";
type Choice = Partial<Record<CategorySlug, boolean>>;

/**
 * Which groups are unfolded: the one you are in, plus whatever was opened by
 * hand. Remembered between visits.
 */
function useGroups(current: CategorySlug | null) {
  const [choice, setChoice] = useState<Choice>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE);
      if (saved) setChoice(JSON.parse(saved) as Choice);
    } catch {
      // Storage can be blocked; the defaults are fine.
    }
  }, []);

  const fallback = current ?? categories[0].slug;
  const isOpen = (slug: CategorySlug) => choice[slug] ?? slug === fallback;

  const toggle = useCallback(
    (slug: CategorySlug) => {
      setChoice((now) => {
        const next = { ...now, [slug]: !(now[slug] ?? slug === fallback) };
        try {
          window.localStorage.setItem(STORE, JSON.stringify(next));
        } catch {
          // Ignore blocked storage.
        }
        return next;
      });
    },
    [fallback],
  );

  // Arriving in a group always unfolds it.
  useEffect(() => {
    if (current) setChoice((now) => (now[current] === false ? { ...now, [current]: true } : now));
  }, [current]);

  return { isOpen, toggle };
}

/**
 * The tool index. On desktop it is a fixed column under the top bar, one group
 * per category; on phones it is a full-screen sheet.
 */
export function Sidebar({ open, collapsed, onClose }: { open: boolean; collapsed: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { isSignedIn, user, signOut } = useAuthSession();
  const authSuffix = useAuthSuffix();
  const listRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const current =
    categories.find((category) => pathname === `/${category.slug}` || pathname.startsWith(`/${category.slug}/`))?.slug ??
    null;
  const groups = useGroups(current);

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

  const home = pathname === "/dashboard";

  return (
    <>
      {/* ---------- Desktop index ---------- */}
      <aside
        id="workbench-sidebar"
        aria-label="Tool index"
        className="fixed bottom-0 left-0 top-[var(--fb-bar)] z-40 hidden w-[var(--fb-side)] flex-col overflow-hidden border-r border-line bg-canvas transition-[width] duration-200 motion-reduce:transition-none lg:flex"
      >
        {collapsed ? (
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain py-4">
            <IconRow href="/dashboard" label="All tools" active={home}>
              <HomeGlyph size={20} />
            </IconRow>
            {categories.map((category) => (
              <nav
                key={category.slug}
                aria-label={category.name}
                className="mt-3 flex w-10 flex-col gap-1 border-t border-line pt-3"
              >
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
          <div
            ref={listRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-8 pt-4 [mask-image:linear-gradient(#000_calc(100%-28px),transparent)]"
          >
            <Link
              href="/dashboard"
              aria-current={home ? "page" : undefined}
              className={`group flex h-[52px] shrink-0 items-center gap-2.5 border pl-[9px] pr-3 text-[15px] font-semibold transition-colors ${
                home ? "border-ink bg-ink text-white" : "border-line bg-panel hover:border-ink"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center ${
                  home ? "bg-white/10 text-white" : "bg-canvas text-ink"
                }`}
              >
                <HomeGlyph size={17} />
              </span>
              <span className="flex-1">All tools</span>
              <span className={`fb-num text-[13px] font-normal ${home ? "text-white/55" : "text-faint"}`}>
                {tools.length}
              </span>
            </Link>

            <div className="mt-5 flex flex-col gap-1.5">
              {categories.map((category, index) => {
                const list = toolsForCategory(category.slug);
                const unfolded = groups.isOpen(category.slug);
                const panelId = `${baseId}-${category.slug}`;
                const here = current === category.slug;
                return (
                  <nav key={category.slug} aria-label={category.name}>
                    <button
                      type="button"
                      onClick={() => groups.toggle(category.slug)}
                      aria-expanded={unfolded}
                      aria-controls={panelId}
                      className="group flex h-11 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-hover"
                    >
                      <span className={`fb-num w-6 text-center text-[12.5px] ${here ? "text-accent-deep" : "text-faint"}`}>
                        0{index + 1}
                      </span>
                      <span className="flex-1 text-[14.5px] font-semibold">{category.name}</span>
                      <span className="fb-num text-[13px] text-faint">{list.length}</span>
                      <PlusMinus open={unfolded} />
                    </button>
                    <div
                      id={panelId}
                      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                        unfolded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <ul className={`min-h-0 overflow-hidden ${unfolded ? "" : "invisible"}`}>
                        {list.map((tool) => (
                          <ToolRow key={tool.path} tool={tool} on={pathname === tool.path} />
                        ))}
                        <li aria-hidden className="h-3" />
                      </ul>
                    </div>
                  </nav>
                );
              })}
            </div>
          </div>
        )}

        {/* Account */}
        <div className="shrink-0 p-3 pt-2">
          {isSignedIn && user ? (
            collapsed ? (
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                title={`Sign out ${user.email ?? ""}`}
                className="grid h-10 w-10 place-items-center transition-colors hover:bg-hover"
              >
                <Initials>{user.initials}</Initials>
              </button>
            ) : (
              <div className="flex h-14 items-center gap-3 border border-line bg-panel pl-2.5 pr-1.5">
                <Initials>{user.initials}</Initials>
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
              className={`group flex items-center gap-3 border border-line bg-panel transition-colors hover:border-ink hover:bg-ink hover:text-white ${
                collapsed ? "h-10 w-10 justify-center" : "h-14 pl-3.5 pr-4"
              }`}
            >
              <SparkGlyph size={18} className="shrink-0 text-accent-deep transition-colors group-hover:text-accent" />
              {collapsed ? null : (
                <>
                  <span className="flex-1 text-[13.5px] font-semibold leading-tight">
                    25 AI credits
                    <span className="block font-normal text-muted transition-colors group-hover:text-white/65">
                      when you sign up
                    </span>
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
      className={`relative grid h-10 w-10 shrink-0 place-items-center transition-colors ${
        active ? "bg-ink text-white" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function ToolRow({ tool, on }: { tool: Tool; on: boolean }) {
  return (
    <li>
      <Link
        href={tool.path}
        aria-current={on ? "page" : undefined}
        title={`${tool.name} (${seamLabel(tool)})`}
        className={`group relative flex h-[38px] items-center gap-3 px-3 text-[14.5px] transition-colors ${
          on
            ? "bg-panel font-semibold"
            : `hover:bg-hover hover:text-ink ${tool.status === "soon" ? "text-faint/75" : "text-muted"}`
        }`}
      >
        {on ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" /> : null}
        <span className="grid w-6 shrink-0 place-items-center">
          <ToolGlyph path={tool.path} size={18} />
        </span>
        <span className="min-w-0 flex-1 truncate">{tool.name}</span>
        {tool.status === "soon" ? (
          <span className="sr-only">(preview)</span>
        ) : tool.tier === "credits" ? (
          <span className="text-[12px] font-normal text-faint">AI</span>
        ) : null}
      </Link>
    </li>
  );
}

function Initials({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="fb-ear grid h-8 w-8 shrink-0 place-items-center bg-ink text-[12px] font-semibold text-white"
      style={{ ["--ear" as string]: "8px" }}
    >
      {children}
    </span>
  );
}

function PlusMinus({ open }: { open: boolean }) {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-faint">
      <path d="M0 5.5h11" />
      <path
        d="M5.5 0v11"
        className="origin-center transition-transform duration-200"
        style={{ transform: open ? "scaleY(0)" : undefined }}
      />
    </svg>
  );
}
