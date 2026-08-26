// zones/test14/src/app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Test14 zone  ·  test14.unenter.live
//
// Root layout for your new Unenter zone.  This file is a thin shell — the
// actual layout shell (header, footer, sidebar) is determined by zone.config.ts.
//
// Architecture:
//   • <Providers>    — theme system, auth/session, role context, fonts
//   • <ZoneLayout>  — reads zone.config.ts, renders appropriate shell
//   • globals.css   — restored from core by Dockerfile (shared theme tokens)
//   • locale        — reads the locale cookie / header set by middleware
//
// To change which header/footer/sidebar renders, edit zone.config.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Titillium_Web }           from "next/font/google";
import type { ReactNode }          from "react";
import { cookies, headers }        from "next/headers";
import { Providers }               from "@/app/provider";
import { ZoneLayout }               from "@/components/Layouts/ZoneLayout";
import { resolveZoneConfig }        from "@/components/Layouts/config";
import zoneConfig                   from "./zone.config";
import "./globals.css";  // Restored from core by Dockerfile — shared theme tokens

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default:  "Test14 | Unenter",
    template: "%s | Test14 – Unenter",
  },
  description: "Test14 — built on unenter.live.",
};

const VALID_LOCALES = ["en", "de"] as const;
type Locale = (typeof VALID_LOCALES)[number];
function isValidLocale(v: string | undefined | null): v is Locale {
  return VALID_LOCALES.includes(v as Locale);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const rawLocale =
    headersList.get("X-Next-Locale") ??
    cookieStore.get("Next-Locale")?.value;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "en";

  // Resolve zone config with defaults
  const config = resolveZoneConfig(zoneConfig);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={titillium.className} suppressHydrationWarning>
        <Providers>
          <ZoneLayout config={config} locale={locale}>
            {children}
          </ZoneLayout>
        </Providers>
      </body>
    </html>
  );
}
