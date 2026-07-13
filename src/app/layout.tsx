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
import ChunkReloader from "@/components/system/ChunkReloader";
import { ZoneProvider } from "@/components/providers/ZoneProvider";
import { getZoneContext } from "@/lib/zoneContext";
import MovedHereToast from "@/components/system/MovedHereToast";
import { generateSiteMetadata } from "@/lib/zoneMetadata";

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

export async function generateMetadata(): Promise<Metadata> {
  return generateSiteMetadata();
}

const VALID_LOCALES = ["en", "de"] as const;
type Locale = (typeof VALID_LOCALES)[number];

function isValidLocale(v: string | undefined | null): v is Locale {
  return VALID_LOCALES.includes(v as Locale);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headersList, zoneCtx] = await Promise.all([
    cookies(),
    headers(),
    getZoneContext(),
  ]);
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
        <ChunkReloader />
        <Providers>
          <ZoneProvider value={zoneCtx}>
            <MovedHereToast />
            <ClientLayout locale={locale}>{children}</ClientLayout>
          </ZoneProvider>
        </Providers>
      </body>
    </html>
  );
}
