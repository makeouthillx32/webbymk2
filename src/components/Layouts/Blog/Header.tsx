"use client";
// src/components/Layouts/Blog/Header.tsx
// Blog zone chrome — Butler's Log-style slim header, driven by blog_settings.

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { createBrowserClient } from "@/utils/supabase/client";
import ThemeToggler from "@/components/Layouts/Landing/Header/ThemeToggler";
import { cn } from "@/utils/cn";

interface HeaderSettings {
  wordmark: string;
  show_rss: boolean;
  links: { label: string; url: string }[];
  cta: { label: string; url: string; enabled: boolean };
}

const DEFAULTS: HeaderSettings = {
  wordmark: "Blog",
  show_rss: false,
  links: [],
  cta: { label: "", url: "", enabled: false },
};

export default function BlogHeader() {
  const { theme } = useTheme();
  const [settings, setSettings] = useState<HeaderSettings>(DEFAULTS);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("blog_settings")
      .select("value")
      .eq("key", "header")
      .single()
      .then(({ data }) => {
        if (data?.value) setSettings({ ...DEFAULTS, ...(data.value as HeaderSettings) });
      });
  }, []);

  return (
    <header className="relative z-40 w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="container">
        <div className="flex items-center justify-between py-5">
          {/* Wordmark */}
          <div className="flex min-w-0 items-center gap-3">
            <a href="https://unenter.live" className="shrink-0" aria-label="Unenter home">
              <Image
                src={theme === "dark" ? "/logodk.svg" : "/logo.svg"}
                alt="Unenter"
                width={90}
                height={60}
                priority
                key={theme}
                suppressHydrationWarning
              />
            </a>
            <span className="opacity-40">/</span>
            <Link href="/" className="truncate font-serif text-xl md:text-2xl">
              {settings.wordmark}
            </Link>
            {settings.show_rss && (
              <a
                // No `download` attribute on purpose: on iOS/WebKit it routes
                // through the "web download" path (top banner). A plain link to
                // a resource served with Content-Disposition: attachment gives
                // the classic BOTTOM download action sheet — matching GitButler.
                href="/rss"
                aria-label="Download RSS feed"
                title="Download RSS feed"
                className="inline-flex items-center gap-1 text-xs uppercase opacity-60 transition hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true">
                  <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20 5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18zM4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
                </svg>
                RSS
              </a>
            )}
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 lg:flex">
            {settings.links.map((l) => (
              <a
                key={l.label}
                href={l.url}
                className="text-sm opacity-75 transition hover:opacity-100"
              >
                {l.label}
              </a>
            ))}
            {settings.cta.enabled && settings.cta.label && (
              <a
                href={settings.cta.url}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90"
              >
                {settings.cta.label}
              </a>
            )}
            <ThemeToggler />
          </nav>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
            className="block rounded-lg p-2 lg:hidden"
          >
            <span className={cn("my-1 block h-0.5 w-6 bg-current transition-all", menuOpen && "translate-y-1.5 rotate-45")} />
            <span className={cn("my-1 block h-0.5 w-6 bg-current transition-all", menuOpen && "opacity-0")} />
            <span className={cn("my-1 block h-0.5 w-6 bg-current transition-all", menuOpen && "-translate-y-1.5 -rotate-45")} />
          </button>
        </div>
      </div>

      {/* Mobile sheet — seamless with header */}
      {menuOpen && (
        <nav className="absolute left-0 right-0 top-full border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-8 pb-6 shadow-lg lg:hidden">
          {settings.links.map((l) => (
            <a
              key={l.label}
              href={l.url}
              className="block py-2.5 text-lg opacity-80 hover:opacity-100"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <div className="mt-4 flex items-center justify-between">
            {settings.cta.enabled && settings.cta.label && (
              <a
                href={settings.cta.url}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))]"
              >
                {settings.cta.label}
              </a>
            )}
            <ThemeToggler />
          </div>
        </nav>
      )}
    </header>
  );
}
