// zones/blog/src/app/layout.tsx
// Root layout for the blog zone (blog.unenter.live).
// Uses the core Providers + ClientLayout so the shared landing shell
// (LandingHeader, LandingFooter, AppCookieConsent, etc.) renders identically
// to the main app. routeClassifier returns isLandingPage for all blog paths
// because NEXT_PUBLIC_ZONE=blog is baked in at build time.

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/provider";
import ClientLayout from "@/components/Layouts/ClientLayout";
import { generateSiteMetadata } from "@/lib/zoneMetadata";
import "./globals.css";

// Load the THEME's declared fonts (globals.css: --font-sans / --font-serif /
// --font-mono = Plus Jakarta Sans / Source Serif 4 / JetBrains Mono). Nothing
// actually loaded them before — the layout forced Titillium — so `font-serif`
// headings fell back to a generic system serif and everything looked the same.
// We set the --font-* vars INLINE on <html> (inline wins over the static
// globals :root values) so Tailwind's font-sans/serif/mono classes resolve to
// the real, loaded theme fonts.
const fontSans  = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap" });
const fontSerif = Source_Serif_4({ subsets: ["latin"], display: "swap" });
const fontMono  = JetBrains_Mono({ subsets: ["latin"], display: "swap" });

const fontVars = {
  "--font-sans":  fontSans.style.fontFamily,
  "--font-serif": fontSerif.style.fontFamily,
  "--font-mono":  fontMono.style.fontFamily,
} as CSSProperties;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(218.54 79.19% 66.08%)" },
    { media: "(prefers-color-scheme: dark)", color: "hsl(207.27 44% 49.02%)" },
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
    <html lang={locale} style={fontVars} suppressHydrationWarning>
      <head />
      {/* fontSans.className sets the body's default family to the theme sans;
          font-serif / font-mono utility classes pick up the inline vars above. */}
      <body className={fontSans.className} suppressHydrationWarning>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
