"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandMark, Wordmark } from "@/components/brand/Wordmark";
import {
  CloseGlyph,
  HomeGlyph,
  LockGlyph,
  SparkGlyph,
  ToolGlyph,
  ToolsGlyph,
} from "@/components/icons/NavGlyph";
import { buttonClasses } from "@/components/ui/Button";
import { categories, toolsForCategory } from "@/lib/registry/tools";

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
      className={`fixed inset-y-0 left-0 z-40 w-[264px] flex-col overflow-hidden border-r border-line bg-rail transition-[width] duration-150 ease-out motion-reduce:transition-none ${
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
              className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-ink transition-colors hover:bg-hover"
            >
              <SparkGlyph size={17} />
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
              <Row href="/dashboard" label="Home" active={pathname === "/dashboard"} icon={<HomeGlyph size={20} />} />
              <Row href="/dashboard#tools" label="All tools" icon={<ToolsGlyph size={20} />} />
            </nav>

            {categories.map((category) => {
              const categoryActive =
                pathname === `/${category.slug}` || pathname.startsWith(`/${category.slug}/`);

              return (
                <div key={category.slug} className="mt-5">
                  <Link
                    href={`/${category.slug}`}
                    aria-current={categoryActive ? "page" : undefined}
                    className={`flex h-7 items-center px-2.5 text-[12px] font-medium transition-colors ${
                      categoryActive ? "text-ink" : "text-faint hover:text-ink"
                    }`}
                  >
                    {category.name}
                  </Link>
                  <div className="mt-1 space-y-0.5">
                    {toolsForCategory(category.slug).map((tool) => (
                      <Row
                        key={tool.path}
                        href={tool.path}
                        label={tool.name}
                        active={pathname === tool.path}
                        icon={<ToolGlyph path={tool.path} size={19} />}
                        trailing={
                          <span
                            className="ml-auto flex w-3.5 shrink-0 justify-end text-faint"
                            title={tool.tier === "credits" ? "Uses credits — sign in to run" : undefined}
                          >
                            {tool.tier === "credits" && (
                              <>
                                <LockGlyph size={12} />
                                <span className="sr-only">Uses credits</span>
                              </>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 p-2.5">
            <div className="rounded-xl border border-line bg-white p-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-rail text-ink">
                <SparkGlyph size={15} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-ink">Get 25 free credits</p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-muted">
                Create an account to try the AI tools.
              </p>
              <Link href="/sign-in" className={buttonClasses("secondary", "sm", "mt-3 w-full")}>
                Sign in to claim
              </Link>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function Row({
  href,
  icon,
  label,
  active = false,
  trailing,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors ${
        active ? "bg-active font-medium text-ink" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      {trailing}
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
      className={`grid h-10 w-11 place-items-center rounded-lg transition-colors ${
        active ? "bg-active text-ink" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
