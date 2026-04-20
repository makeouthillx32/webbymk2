// zones/test3/src/app/layout.tsx
// Root layout for the test3 zone (test3.unenter.live).

import type { Metadata, Viewport } from "next";
import { Titillium_Web }           from "next/font/google";
import type { ReactNode }          from "react";
import { cookies, headers }        from "next/headers";
import { Providers }               from "@/app/provider";
import ClientLayout                from "@/components/Layouts/ClientLayout";
import "./globals.css";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default:  "Test3 | Unenter",
    template: "%s | Test3 – Unenter",
  },
  description: "Welcome to the Test3 zone.",
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
