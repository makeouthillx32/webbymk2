// zones/auth/src/app/layout.tsx
// Root layout for the auth zone (auth.unenter.live).
// Overrides the core root metadata. All auth pages live in src/app/(auth-pages)/
// and src/app/auth/ — those are shared core code used as-is.

import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";
import "@/styles/index.css";
import { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/provider";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Sign In | Unenter",
    template: "%s | Unenter",
  },
  description: "Sign in or create your Unenter account.",
  robots: { index: false, follow: false },
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
