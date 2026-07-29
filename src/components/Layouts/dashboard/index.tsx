"use client";

import { useEffect, useRef } from "react";
import { SearchIcon } from "@/assets/icons";
import Image from "next/image";
import Link from "next/link";
import { useSidebarContext } from "./sidebar/sidebar-context";
import { MenuIcon } from "./icons";
import { Notification } from "./notification";
import { ThemeToggleSwitch } from "./theme-toggle";
import SwitchtoDarkMode from "@/components/Layouts/SwitchtoDarkMode";

export function Header() {
  const { toggleSidebar, isMobile } = useSidebarContext();
  const headerRef = useRef<HTMLElement>(null);

  // Publish the real rendered height as a CSS var so anything ELSE that's
  // sticky inside the dashboard (e.g. the blog editor's own header) can pin
  // itself just below this bar instead of guessing a pixel value. Without
  // this, two `sticky top-0` elements stack on top of each other the moment
  // both are visible at once — this header wraps to a taller layout on
  // narrow/mobile widths (search bar grows, icons wrap), so a hardcoded
  // offset would drift out of sync anyway. ResizeObserver keeps it correct
  // across breakpoint changes and orientation flips, not just mount.
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--dashboard-header-h", `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      data-layout="dashboard"
      className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--lt-border)] bg-[var(--lt-bg)] px-4 py-5 shadow-[var(--lt-shadow)] md:px-5 2xl:px-10"
    >
      <button
        onClick={toggleSidebar}
        className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-1.5 py-1 dark:border-[hsl(var(--sidebar-border))] dark:bg-[hsl(var(--background))] hover:dark:bg-[hsla(var(--background),0.1)] lg:hidden"
      >
        <MenuIcon />
        <span className="sr-only">Toggle Sidebar</span>
      </button>

      {isMobile && (
        <Link href="/" className="ml-2 max-[430px]:hidden min-[375px]:ml-4">
          <Image
            src="/images/logo/logo-icon.svg"
            width={50}
            height={50}
            alt="Logo"
            role="presentation"
          />
        </Link>
      )}

      <div className="max-xl:hidden">
        <h1 className="mb-0.5 text-heading-5 font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
          Dashboard
        </h1>
        <p className="font-medium text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">
          Byrd's Dashboard
        </p>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 min-[375px]:gap-4">
        <div className="relative w-full max-w-[300px]">
          <input
            type="search"
            placeholder="Search"
            className="flex w-full items-center gap-3.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] py-3 pl-[53px] pr-5 outline-none transition-colors focus-visible:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--secondary))] dark:hover:border-[hsl(var(--border))] dark:hover:bg-[hsl(var(--secondary))] dark:hover:text-[hsl(var(--muted-foreground))] dark:focus-visible:border-[hsl(var(--sidebar-primary))]"
          />
          <SearchIcon className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 max-[1015px]:size-5" />
        </div>

        <div className="flex items-center justify-center">
          {isMobile ? <SwitchtoDarkMode /> : <ThemeToggleSwitch />}
        </div>

        <Notification />
      </div>
    </header>
  );
}
