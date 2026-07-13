"use client";
// src/components/Layouts/Blog/Footer.tsx
// Blog zone chrome — Butler's Log-style footer: big CTA banner, link columns,
// copyright. Driven by blog_settings.

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/utils/supabase/client";

interface FooterLink   { label: string; url: string }
interface FooterColumn { title: string; links: FooterLink[] }
interface FooterSettings {
  cta_banner: { enabled: boolean; text: string; url: string; image: string | null };
  columns: FooterColumn[];
  copyright: string;
}

const DEFAULTS: FooterSettings = {
  cta_banner: { enabled: false, text: "", url: "", image: null },
  columns: [],
  copyright: "",
};

export default function BlogFooter() {
  const [settings, setSettings] = useState<FooterSettings>(DEFAULTS);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("blog_settings")
      .select("value")
      .eq("key", "footer")
      .single()
      .then(({ data }) => {
        if (data?.value) setSettings({ ...DEFAULTS, ...(data.value as FooterSettings) });
      });
  }, []);

  return (
    <footer className="bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
      <div className="container py-10 md:py-14">
        {/* CTA banner */}
        {settings.cta_banner.enabled && settings.cta_banner.text && (
          <a
            href={settings.cta_banner.url}
            className="group mb-12 flex items-center justify-between gap-6 overflow-hidden rounded-2xl bg-[hsl(var(--accent))] px-8 py-10 text-[hsl(var(--accent-foreground))] md:px-12 md:py-12"
          >
            <span className="font-serif text-2xl leading-snug md:text-4xl">
              {settings.cta_banner.text}
            </span>
            {settings.cta_banner.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.cta_banner.image}
                alt=""
                className="hidden h-24 w-auto shrink-0 md:block"
              />
            ) : (
              <svg
                width="48" height="24" viewBox="0 0 48 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                className="shrink-0 transition-transform group-hover:translate-x-2"
                aria-hidden
              >
                <path d="M2 12h42M36 4l8 8-8 8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </a>
        )}

        {/* Link columns */}
        {settings.columns.length > 0 && (
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
            {settings.columns.map((col) => (
              <div key={col.title}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
                  {col.title}
                </h3>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.url} className="text-sm opacity-80 transition hover:opacity-100">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Copyright */}
        {settings.copyright && (
          <p className="mt-10 border-t border-current/10 pt-6 text-xs opacity-60">
            {settings.copyright}
          </p>
        )}
      </div>
    </footer>
  );
}
