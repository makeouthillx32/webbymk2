// zones/shop/src/app/layout.tsx
// Root layout for the shop zone (shop.unenter.live).
// Identical structure to the core layout — shop pages already live in src/app/
// so this just overrides the root metadata and confirms zone identity.
// All components, providers, and styles come from the shared core.

import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";
import "node_modules/react-modal-video/css/modal-video.css";
import "@/styles/index.css";
import "leaflet/dist/leaflet.css";
import { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/provider";
import ClientLayout from "@/components/Layouts/ClientLayout";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Shop | Unenter",
    template: "%s | Shop – Unenter",
  },
  description: "Browse our full collection of products.",
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
      <body className={titillium.className} suppressHydrationWarning>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
