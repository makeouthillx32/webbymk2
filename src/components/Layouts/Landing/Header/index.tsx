"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import ThemeToggler from "./ThemeToggler";
import useMenuData from "@/data/useMenuData";
import useServiceData from "@/data/useServiceData";
import { cn } from "@/utils/cn";
import { useTheme } from "next-themes";
import { setCookie } from "@/lib/cookieUtils";

const LOCALES = ["en", "de"] as const;

function getCleanPath(pathname: string): string {
  for (const l of LOCALES) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(`/${l}`.length);
  }
  return pathname;
}

function getPathLocale(pathname: string): "en" | "de" | null {
  for (const l of LOCALES) {
    if (pathname === `/${l}` || pathname.startsWith(`/${l}/`)) return l;
  }
  return null;
}

const Header = () => {
  const { theme } = useTheme();
  const menuData = useMenuData();
  const serviceData = useServiceData();

  const pathname = usePathname();
  const cleanPath = getCleanPath(pathname);

  const activeLocale: "en" | "de" = getPathLocale(pathname) ?? (
    typeof document !== "undefined"
      ? ((document.cookie.match(/(?:^|;\s*)Next-Locale=([^;]+)/)?.[1] as "en" | "de" | undefined) ?? "de")
      : "de"
  );

  const [navbarOpen, setNavbarOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [openIndex, setOpenIndex] = useState(1);
  const navbarRef = useRef<HTMLDivElement>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const switchLocale = (newLocale: "en" | "de") => {
    if (newLocale === activeLocale) return;
    setCookie("Next-Locale", newLocale, { path: "/", maxAge: 7 * 24 * 60 * 60 });
    window.location.href = `/${newLocale}${cleanPath === "/" ? "" : cleanPath}`;
  };

  const handleStickyNavbar = () => {
    if (window.scrollY >= 80) {
      setSticky(true);
    } else {
      setSticky(false);
    }
  };

  const handleResize = () => {
    setIsSmallScreen(window.innerWidth < 1024);
    if (window.innerWidth >= 1024) {
      setNavbarOpen(false);
    }
  };

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleStickyNavbar);
    return () => {
      window.removeEventListener("scroll", handleStickyNavbar);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleSubmenu = (index: number) => {
    if (openIndex === index) {
      setOpenIndex(-1);
    } else {
      setOpenIndex(index);
    }
  };

  return (
    <header
      className={cn(
        "header left-0 top-0 z-40 flex w-full items-center",
        sticky
          ? "fixed z-[9999] shadow-sticky backdrop-blur-sm transition dark:shadow-sticky-dark bg-[var(--lt-bg)]"
          : "absolute bg-transparent"
      )}
    >
      <div className="container">
        <div className="relative -mx-4 flex items-center justify-between">
          <div className="w-60 max-w-full px-4 xl:mr-12">
            <Link
              href={navbarOpen ? "#" : "/"}
              onClick={(e) => {
                if (navbarOpen) {
                  e.preventDefault();
                  setNavbarOpen(false);
                }
              }}
              className={`header-logo block w-full ${sticky ? "py-5 lg:py-2" : "py-8"}`}
            >
              <Image
                src={theme === "dark" ? "/logodk.svg" : "/logo.svg"}
                alt="logo"
                width={150}
                height={100}
                priority
                key={theme}
                suppressHydrationWarning
              />
            </Link>
          </div>
          <div className="flex w-full items-center justify-between px-4">
            <div>
              <button
                onClick={() => setNavbarOpen(!navbarOpen)}
                id="navbarToggler"
                aria-label="Mobile Menu"
                className="absolute right-4 top-1/2 z-50 block translate-y-[-50%] rounded-lg px-3 py-[6px] ring-primary focus:ring-2 lg:hidden"
              >
                <span className={`relative my-1.5 block h-0.5 w-[30px] bg-[hsl(var(--foreground))] transition-all duration-300 ${navbarOpen ? " top-[7px] rotate-45" : ""}`} />
                <span className={`relative my-1.5 block h-0.5 w-[30px] bg-[hsl(var(--foreground))] transition-all duration-300 ${navbarOpen ? "opacity-0" : ""}`} />
                <span className={`relative my-1.5 block h-0.5 w-[30px] bg-[hsl(var(--foreground))] transition-all duration-300 ${navbarOpen ? " top-[-8px] -rotate-45" : ""}`} />
              </button>
              <nav
                ref={navbarRef}
                id="navbarCollapse"
                className={cn(
                  "navbar absolute right-0 rounded border-[.5px] border-[hsl(var(--border))] px-6 py-4 duration-300",
                  "bg-[var(--lt-bg)]",
                  "lg:visible lg:static lg:w-auto lg:border-none lg:!bg-transparent lg:p-0 lg:opacity-100",
                  navbarOpen && isSmallScreen ? "visibility top-[70%] w-full opacity-100" : "invisible top-[120%] opacity-0",
                  isSmallScreen ? "max-h-[calc(100vh-120px)] overflow-y-auto" : "overflow-visible",
                )}
              >
                <ul className="block lg:flex lg:space-x-12">
                  {menuData.map((menuItem, index) => (
                    <li key={index} className="group relative">
                      {menuItem.path ? (
                        <Link
                          onClick={() => setNavbarOpen(false)}
                          href={menuItem.path}
                          className={cn(
                            "flex py-2 text-xl lg:mr-0 lg:inline-flex lg:px-0 lg:py-6",
                            cleanPath === menuItem.path
                              ? "text-primary"
                              : "text-[hsl(var(--foreground))] hover:text-primary opacity-80 hover:opacity-100"
                          )}
                        >
                          {menuItem.title}
                        </Link>
                      ) : (
                        <>
                          <p
                            onClick={() => handleSubmenu(index)}
                            className="flex cursor-pointer items-center justify-between py-2 text-xl text-[hsl(var(--foreground))] opacity-80 group-hover:opacity-100 group-hover:text-primary lg:mr-0 lg:inline-flex lg:px-0 lg:py-6"
                          >
                            {menuItem.title}
                            <span className="pl-3">
                              <svg width="25" height="24" viewBox="0 0 25 24">
                                <path fillRule="evenodd" clipRule="evenodd" d="M6.29289 8.8427C6.68342 8.45217 7.31658 8.45217 7.70711 8.8427L12 13.1356L16.2929 8.8427C16.6834 8.45217 17.3166 8.45217 17.7071 8.8427C18.0976 9.23322 18.0976 9.86639 17.7071 10.2569L12 15.964L6.29289 10.2569C5.90237 9.86639 5.90237 9.23322 6.29289 8.8427Z" fill="currentColor" />
                              </svg>
                            </span>
                          </p>
                          <div
                            className={cn(
                              "submenu relative left-4 top-full rounded-sm transition-[top] duration-300 group-hover:opacity-100",
                              "bg-[var(--lt-bg)] border border-[hsl(var(--border))]",
                              "lg:invisible lg:absolute lg:top-[110%] lg:rounded-lg lg:opacity-0 lg:shadow-lg lg:group-hover:visible lg:group-hover:top-full",
                              "lg:mr-6 lg:p-4",
                              openIndex === index ? "flex flex-col lg:flex-row" : "hidden",
                            )}
                          >
                            {serviceData.map((serviceItem) => (
                              <div key={serviceItem.title} className="lg:text-nowrap lg:px-4 lg:py-2">
                                <p className={cn("cursor-default rounded py-2.5 text-lg text-[hsl(var(--foreground))] transition")}>
                                  {serviceItem.title}
                                </p>
                                {serviceItem.subServices.map(
                                  (subService) =>
                                    subService.path && (
                                      <Link
                                        onClick={() => setNavbarOpen(false)}
                                        href={`/services${subService.path}`}
                                        key={subService.title}
                                        className={cn("block px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition hover:bg-primary hover:bg-opacity-10")}
                                      >
                                        {subService.title}
                                      </Link>
                                    ),
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </li>
                  ))}

                  <li className="block lg:hidden">
                    <div className="mt-4 flex items-center justify-end gap-2 rounded border border-[hsl(var(--border))] bg-[var(--lt-bg)] p-1">
                      {LOCALES.map((l) => (
                        <button
                          key={l}
                          onClick={() => switchLocale(l)}
                          aria-label={`Switch to ${l.toUpperCase()}`}
                          className={cn(
                            "rounded px-2 py-1 text-sm font-semibold uppercase transition",
                            activeLocale === l
                              ? "bg-primary text-[hsl(var(--primary-foreground))]"
                              : "text-[hsl(var(--foreground))] opacity-70 hover:bg-primary/10 hover:opacity-100"
                          )}
                        >
                          {l.toUpperCase()}
                        </button>
                      ))}
                      <ThemeToggler />
                    </div>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="hidden items-center justify-end gap-2 pr-16 lg:flex lg:pr-0">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  onClick={() => switchLocale(l)}
                  aria-label={`Switch to ${l.toUpperCase()}`}
                  className={cn(
                    "rounded px-2 py-1 text-sm font-semibold uppercase transition",
                    activeLocale === l
                      ? "bg-primary text-[hsl(var(--primary-foreground))]"
                      : "text-[hsl(var(--foreground))] opacity-70 hover:bg-primary/10 hover:opacity-100"
                  )}
                >
                  {l.toUpperCase()}
                </button>
              ))}
              <div>
                <ThemeToggler />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
