import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
// globals.css MUST come first — it defines all --background/--foreground/--lt-*
// CSS variables and imports layout-tokens.css. Without it, every var() call
// resolves to nothing (transparent) until the JS theme engine hydrates.
import "./globals.css";
import "node_modules/react-modal-video/css/modal-video.css";
import "@/styles/index.css";
import "leaflet/dist/leaflet.css";
import { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "./provider";
import ClientLayout from "@/components/Layouts/ClientLayout";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

/**
 * Server-rendered theme-color for iOS/Safari PWA.
 * Values match the default --gp-bg token (= --secondary light / --accent dark)
 * from globals.css. The client-side useMetaThemeColor hook takes over after
 * hydration and updates this to the live --lt-status-bar CSS-var value.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Unenter",
    template: "%s | Unenter",
  },
  description: "Explore Unenter's projects, live streams, and community.",
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      {/* NO hardcoded bg class here — background-color is set by
          globals.css via hsl(var(--background)) so the iOS status bar
          always reads the correct theme color, never a hardcoded value. */}
      <body className={titillium.className} suppressHydrationWarning>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
