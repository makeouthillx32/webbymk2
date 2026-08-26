"use client";

import React, { useEffect } from "react";
import { Menu, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme, useAuth } from "@/app/provider";
import SwitchtoDarkMode from "@/components/Layouts/SwitchtoDarkMode";
import DesktopNav from "@/components/Layouts/shop/DesktopNav";
import { CORE_DOMAIN } from "@/lib/multiZone";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps = {}) {
  const { session, refreshSession } = useAuth();
  const { themeType } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // /sign-in only lives on the core zone (www.unenter.live) — it's not in
  // this zone's route whitelist, so a plain relative href 404s here. `next`
  // sends the visitor right back to the labs page they were on.
  // Found via E2E checkout test, 2026-08-06.
  const currentPath = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const signInHref = `https://www.${CORE_DOMAIN}/sign-in?next=${encodeURIComponent(
    `https://labs.${CORE_DOMAIN}${currentPath}`
  )}`;

  useEffect(() => {
    const handleAuthChange = (event: Event) => {
      const authEvent = (event as CustomEvent).detail?.event;
      if (authEvent === "SIGNED_IN" || authEvent === "SIGNED_OUT") {
        refreshSession();
      }
    };

    window.addEventListener("supabase-auth-change", handleAuthChange);
    return () =>
      window.removeEventListener("supabase-auth-change", handleAuthChange);
  }, [refreshSession]);

  return (
    <header
      data-layout="shop"
      data-zone="labs"
      className="w-full border-b border-[var(--lt-border)] bg-[var(--lt-bg)] text-[var(--lt-fg)]"
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-4 lg:gap-3 lg:px-6">
        <div className="flex items-center md:hidden">
          <button
            className="rounded-lg p-2 transition-colors hover:bg-[hsl(var(--muted))]"
            onClick={onMenuClick}
            aria-label="Open menu"
            type="button"
          >
            <Menu size={22} />
          </button>
        </div>

        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-1.5"
          aria-label="Unenter Labs home"
        >
          <img
            src={
              themeType === "dark"
                ? "/images/home/dartlogowhite.svg"
                : "/images/home/dartlogo.svg"
            }
            alt="Unenter"
            className="h-7 w-auto lg:h-8"
          />
          <span className="border-l border-[hsl(var(--border))] pl-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[hsl(var(--primary))] lg:text-xs">
            Labs
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center overflow-visible md:flex [&_.nav-container]:min-w-0 [&_.nav-item]:shrink [&_.nav-menu]:flex-nowrap [&_.nav-menu]:gap-1.5 lg:[&_.nav-menu]:gap-2.5 xl:[&_.nav-menu]:gap-4 [&_.nav-top-link]:px-0.5 [&_.nav-top-link]:text-[9px] [&_.nav-top-link]:tracking-[0.02em] lg:[&_.nav-top-link]:text-[10px] xl:[&_.nav-top-link]:text-xs xl:[&_.nav-top-link]:tracking-[0.05em]">
          <DesktopNav />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-[hsl(var(--muted))]"
            aria-label="Search research catalog"
          >
            <Search size={17} />
          </Link>

          {!session ? (
            <Link
              href={signInHref}
              className="inline-flex items-center gap-1.5 rounded-full p-2 text-xs font-bold transition-colors hover:bg-[hsl(var(--muted))] xl:px-3"
              aria-label="Sign in"
            >
              <User size={17} />
              <span className="hidden xl:inline">Sign In</span>
            </Link>
          ) : (
            <Link
              href="/profile/me"
              className="inline-flex items-center gap-1.5 rounded-full p-2 text-xs font-bold transition-colors hover:bg-[hsl(var(--muted))] xl:px-3"
              aria-label="Account"
            >
              <User size={17} />
              <span className="hidden xl:inline">Account</span>
            </Link>
          )}

          <div className="theme-switcher text-[hsl(var(--foreground))]">
            <SwitchtoDarkMode />
          </div>
        </div>
      </div>
    </header>
  );
}
