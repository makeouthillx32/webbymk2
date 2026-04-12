import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import "node_modules/react-modal-video/css/modal-video.css";
import "@/styles/index.css";
import "leaflet/dist/leaflet.css";
import { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "./provider";
import ClientLayout from "@/components/Layouts/ClientLayout";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

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

// Resolve active locale server-side from the X-Next-Locale request header
// (set by middleware for /en/* and /de/* in the same round-trip) or from
// the Next-Locale cookie (present on all subsequent navigations).
// This ensures I18nProviderClient gets the right value on first render
// with no hydration mismatch and no flicker.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const rawLocale =
    headersList.get("X-Next-Locale") ??
    cookieStore.get("Next-Locale")?.value;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "de";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={`bg-[#FCFCFC] dark:bg-black ${titillium.className}`}>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
