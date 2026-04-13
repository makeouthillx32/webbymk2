import type { Metadata } from "next";
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
