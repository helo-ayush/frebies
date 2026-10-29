"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandMark, Wordmark } from "@/components/brand/Wordmark";
import {
  ChevronGlyph,
  CloseGlyph,
  HomeGlyph,
  LockGlyph,
  SparkGlyph,
  ToolGlyph,
  ToolsGlyph,
} from "@/components/icons/NavGlyph";
import { categories, toolsForCategory, type Tool } from "@/lib/registry/tools";

export function Sidebar({
  open,
  collapsed,
  onClose,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const compact = collapsed && !open;

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  return (
    <aside
      id="workbench-sidebar"
      role={open ? "dialog" : undefined}
      aria-modal={open || undefined}
      aria-label="Navigation menu"
      className={`fixed inset-y-0 left-0 z-40 w-[264px] flex-col overflow-hidden border-r border-line bg-rail transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        open ? "flex" : "hidden lg:flex"
      } ${collapsed ? "lg:w-[72px]" : "lg:w-[264px]"}`}
    >
      {compact ? (
        <>
          <div className="flex h-14 shrink-0 items-center justify-center">
            <Link
              href="/dashboard"
              aria-label="frebies home"
              className="grid h-9 w-9 place-items-center rounded-[10px] transition-colors hover:bg-hover"
            >
              <BrandMark />
            </Link>
          </div>

          <div className="flex flex-1 flex-col items-center overflow-y-auto px-3 pb-4 pt-3">
            <nav aria-label="Workbench" className="flex flex-col items-center gap-1">
              <CompactLink href="/dashboard" label="Home" active={pathname === "/dashboard"}>
                <HomeGlyph size={20} />
              </CompactLink>
              <CompactLink href="/dashboard#tools" label="All tools">
                <ToolsGlyph size={20} />
              </CompactLink>
            </nav>

            <div className="my-2.5 h-px w-6 bg-line" />

            <nav aria-label="Tools" className="flex flex-col items-center gap-1">
              {categories.map((category, index) => (
                <div key={category.slug} className="contents">
                  {index > 0 && <div className="my-2 h-px w-6 bg-line" />}
                  {toolsForCategory(category.slug).map((tool) => (
                    <CompactLink
                      key={tool.path}
                      href={tool.path}
                      label={
                        tool.tier === "credits"
                          ? `${tool.name} · ${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"}`
                          : tool.name
                      }
                      active={pathname === tool.path}
                    >
                      <ToolGlyph path={tool.path} size={20} />
                    </CompactLink>
                  ))}
                </div>
              ))}
            </nav>
          </div>

          <div className="shrink-0 p-3">
            <Link
              href="/sign-in"
              aria-label="Get 25 free credits"
              title="Get 25 free credits"
              className="group relative grid h-11 w-11 place-items-center overflow-hidden rounded-[12px] border border-line bg-white transition-colors hover:border-[#d7d7d3]"
            >
              <span
                aria-hidden
                className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)]"
              />
              <SparkGlyph size={16} className="relative text-ink" />
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <Wordmark />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-active hover:text-ink lg:hidden"
            >
              <CloseGlyph size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4 pt-2">
            <nav aria-label="Workbench" className="space-y-0.5">
              <SidebarRow
                href="/dashboard"
                label="Home"
                active={pathname === "/dashboard"}
                icon={<HomeGlyph size={20} />}
              />
              <SidebarRow
                href="/dashboard#tools"
                label="All tools"
                icon={<ToolsGlyph size={20} />}
              />
            </nav>

            <div className="mx-2 my-3.5 h-px bg-line-soft" />

            {categories.map((category) => {
              const items = toolsForCategory(category.slug);
              const categoryActive =
                pathname === `/${category.slug}` || pathname.startsWith(`/${category.slug}/`);

              return (
                <div key={category.slug} className="mb-3.5 last:mb-0">
                  <Link
                    href={`/${category.slug}`}
                    aria-current={categoryActive ? "page" : undefined}
                    className={`group flex h-7 items-center justify-between rounded-md px-2.5 text-[11.5px] font-medium tracking-[0.01em] transition-colors ${
                      categoryActive ? "text-ink" : "text-faint hover:text-muted"
                    }`}
                  >
                    <span>{category.name}</span>
                    <ChevronGlyph
                      size={13}
                      className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                  <div className="mt-1 space-y-0.5">
                    {items.map((tool) => (
                      <SidebarTool key={tool.path} tool={tool} active={pathname === tool.path} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 border-t border-line bg-white/45 p-2.5">
            <Link
              href="/sign-in"
              className="group relative block overflow-hidden rounded-[12px] border border-line bg-white px-3 py-3 transition-colors hover:border-[#d7d7d3]"
            >
              <span
                aria-hidden
                className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)] opacity-90"
              />
              <span className="relative flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-ink">
                <SparkGlyph size={14} className="text-accent" />
                Get 25 free credits
              </span>
              <span className="relative mt-1 block max-w-[155px] text-[11.5px] font-normal leading-[1.5] text-muted">
                Try AI tools when you create an account.
              </span>
              <span className="relative mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-ink">
                Sign in to claim
                <ChevronGlyph size={12} />
              </span>
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}

function SidebarRow({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[13.5px] transition-colors ${
        active
          ? "bg-active font-medium text-ink"
          : "font-normal text-[#60605d] hover:bg-hover hover:text-ink"
      }`}
    >
      <span className="flex shrink-0 items-center text-[#777774]">{icon}</span>
      {label}
    </Link>
  );
}

function SidebarTool({ tool, active }: { tool: Tool; active: boolean }) {
  return (
    <Link
      href={tool.path}
      aria-current={active ? "page" : undefined}
      className={`group flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[13.5px] transition-colors ${
        active
          ? "bg-active font-medium text-ink"
          : "font-normal text-[#60605d] hover:bg-hover hover:text-ink"
      }`}
    >
      <span className="flex shrink-0 items-center text-[#777774] transition-colors group-hover:text-ink">
        <ToolGlyph path={tool.path} size={19} />
      </span>
      <span className="min-w-0 truncate">{tool.name}</span>
      {tool.tier === "credits" && (
        <span className="ml-auto flex shrink-0 text-[#989894]" title="Uses credits — sign in to run">
          <LockGlyph size={12} />
          <span className="sr-only">Uses credits</span>
        </span>
      )}
    </Link>
  );
}

function CompactLink({
  href,
  label,
  active = false,
  children,
}: {
  href: string;
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`grid h-10 w-11 place-items-center rounded-[9px] text-[#737370] transition-colors ${
        active ? "bg-active text-ink" : "hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
