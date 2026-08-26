// zones/docs/src/app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docs zone  ·  docs.unenter.live
//
// Root layout for your new Unenter zone.  This file is your app shell — it
// wires everything a branded Unenter app needs so your pages render correctly
// from the first deploy:
//
//   • <Providers>     — theme system, auth/session, role context, fonts
//   • <ClientLayout>  — the app header + footer selected in the wizard,
//                       resolved at runtime via routeClassifier.ts
//   • globals.css     — design tokens (--gp-* / --lt-*) shared with core
//   • locale handling — reads the locale cookie / header set by middleware
//
// You can keep this file as-is; anything you build under  src/zones/docs/
// (or import from elsewhere) renders automatically inside the branded shell.
// Tweak metadata, viewport, or the font here when you want to diverge from
// the defaults — this is your zone's top-level entry point.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/provider";
import ClientLayout from "@/components/Layouts/ClientLayout";
import { generateSiteMetadata } from "@/lib/zoneMetadata";
import "./globals.css";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)", color: "hsl(24, 40%, 25%)" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  return generateSiteMetadata();
}

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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={titillium.className} suppressHydrationWarning>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
