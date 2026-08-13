"use client";

// components/Layouts/LayoutBranches.tsx

import { lazy, Suspense, useState } from "react";
import { I18nProviderClient } from "@/locales/client";
import { Header as AppHeader } from "@/components/Layouts/app/nav";
import { Header as DashboardHeader } from "@/components/Layouts/dashboard";
import { Header as ShopHeader } from "@/components/Layouts/shop/Header";
import { Header as LabsHeader } from "@/components/Layouts/labs/Header";
import LandingHeader from "@/components/Layouts/Landing/Header";
import LandingFooter from "@/components/Layouts/Landing/Footer";
import BlogHeader from "@/components/Layouts/Blog/Header";
import BlogFooter from "@/components/Layouts/Blog/Footer";
import { Sidebar } from "@/components/Layouts/dashboard/sidebar";
import { SidebarProvider } from "@/components/Layouts/dashboard/sidebar/sidebar-context";
import MobileDrawer from "@/components/Layouts/shop/MobileDrawer";
import { CartProvider } from "@/components/Layouts/overlays/cart/cart-context";
import { ResearchCartProvider } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import RegionBootstrap from "@/components/Auth/RegionBootstrap";
import {
  AppToaster,
  AppAccessibility,
  AppCookieConsent,
  ConditionalOverlays,
} from "@/components/Layouts/LayoutShells";
import type { ScreenSize } from "@/components/Layouts/hooks/useScreenSize";

const ShopFooter = lazy(() => import("@/components/Layouts/shop/footer"));
const LabsFooter = lazy(() => import("@/components/Layouts/labs/Footer"));
const LandingFooterLazy = lazy(
  () => import("@/components/Layouts/Landing/Footer"),
);

// Build-time constant — each zone is its own image, so this branch compiles
// to a fixed true/false per zone and the unused header/footer becomes dead
// code in every other zone's bundle (same pattern as the blog-zone check
// in ClientLayout.tsx).
const IS_LABS_ZONE = process.env.NEXT_PUBLIC_ZONE === "labs";

// Minimal Layout
// No header, no footer, no navigation chrome — just theme + providers + children.
// Used by zones that manage their own UI entirely (micro-apps, embeds, etc.).

interface MinimalLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
}

export function MinimalLayout({ children, screenSize }: MinimalLayoutProps) {
  return (
    <>
      <main
        className="min-h-screen"
        style={{ backgroundColor: "hsl(var(--background))" }}
        data-layout="minimal"
      >
        {children}
      </main>
      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <AppToaster />
    </>
  );
}

// Blog Layout
// Dedicated chrome for the blog zone (NEXT_PUBLIC_ZONE=blog): slim serif
// header + CTA footer, both driven by blog_settings. No cart, no shop chrome.

interface BlogLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
}

export function BlogLayout({ children, screenSize }: BlogLayoutProps) {
  return (
    <>
      {/* blog-chrome: pins the iOS status-bar color to the taupe header
          (hsl(var(--secondary))) in both themes — see layout-tokens.css. */}
      <div data-layout="landing" className="blog-chrome">
        <BlogHeader />
        <main
          className="min-h-screen"
          style={{ backgroundColor: "hsl(var(--background))" }}
        >
          {children}
        </main>
        <BlogFooter />
      </div>
      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <AppToaster />
    </>
  );
}

// Landing Layout

interface LandingLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
  /** Active locale resolved server-side from the Next-Locale cookie / X-Next-Locale header. */
  locale?: "en" | "de";
}

export function LandingLayout({
  children,
  screenSize,
  locale = "en",
}: LandingLayoutProps) {
  return (
    <CartProvider>
      <RegionBootstrap />
      <I18nProviderClient locale={locale}>
        <div data-layout="landing">
          <LandingHeader />
          {/* Explicit --background override so body's var(--gp-bg) doesn't bleed into page content */}
          <main
            className="min-h-screen"
            style={{ backgroundColor: "hsl(var(--background))" }}
          >
            {children}
          </main>
          <LandingFooter />
        </div>
      </I18nProviderClient>
      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <ConditionalOverlays />
      <AppToaster />
    </CartProvider>
  );
}

// Dashboard Layout

interface DashboardLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
}

export function DashboardLayout({
  children,
  screenSize,
}: DashboardLayoutProps) {
  return (
    <CartProvider>
      {/* Explicit --background override so body's var(--gp-bg) doesn't bleed into page content */}
      <div
        data-layout="dashboard"
        className="dark:bg-dark_bg1 bg-gray-1"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        <div className="flex h-screen overflow-hidden">
          <SidebarProvider>
            <Sidebar />
            <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
              <DashboardHeader />
              <main>
                <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
                  {children}
                </div>
              </main>
            </div>
          </SidebarProvider>
        </div>
      </div>
      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <ConditionalOverlays />
      <AppToaster />
    </CartProvider>
  );
}

// Auth Layout

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <CartProvider>
      {/* Explicit --background override so body's var(--gp-bg) doesn't bleed into page content */}
      <main
        className="min-h-screen"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        {children}
      </main>
      <AppAccessibility />
      <AppToaster />
    </CartProvider>
  );
}

// App Layout
// AppHeader + selectable footer (none | shop | landing).
// Zones scaffolded with layoutType="app" land here — never ShopLayout.

export type AppFooterType = "none" | "shop" | "landing";

interface AppLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
  footer: AppFooterType;
}

export function AppLayout({ children, screenSize, footer }: AppLayoutProps) {
  return (
    <CartProvider>
      <RegionBootstrap />
      <div data-layout="app">
        <AppHeader />
        <main
          className="min-h-screen"
          style={{ backgroundColor: "hsl(var(--background))" }}
        >
          {children}
        </main>
        {footer === "shop" && (
          <Suspense fallback={<div className="h-96" />}>
            <ShopFooter />
          </Suspense>
        )}
        {footer === "landing" && (
          <Suspense fallback={<div className="h-96" />}>
            <LandingFooterLazy />
          </Suspense>
        )}
      </div>
      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <ConditionalOverlays />
      <AppToaster />
    </CartProvider>
  );
}

// Shop / App Layout

interface ShopLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
  sessionUserId?: string;
  useAppHeader: boolean;
  showNav: boolean;
  showFooter: boolean;
}

export function ShopLayout({
  children,
  screenSize,
  sessionUserId,
  useAppHeader,
  showNav,
  showFooter,
}: ShopLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <CartProvider>
      <ResearchCartProvider>
        <RegionBootstrap />
        <div data-layout={useAppHeader ? "app" : "shop"}>
          {useAppHeader ? (
            <AppHeader />
          ) : (
            showNav &&
            (IS_LABS_ZONE ? (
              <LabsHeader onMenuClick={() => setMobileMenuOpen(true)} />
            ) : (
              <ShopHeader onMenuClick={() => setMobileMenuOpen(true)} />
            ))
          )}

          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                className="fixed bottom-0 left-0 top-0 z-50 w-[min(86vw,360px)] overflow-y-auto border-r border-[var(--lt-border)] bg-[var(--lt-bg)] shadow-[var(--lt-shadow)] lg:hidden"
                data-layout="shop"
              >
                <MobileDrawer
                  key={sessionUserId || "guest"}
                  onClose={() => setMobileMenuOpen(false)}
                />
              </div>
            </>
          )}

          {/* Explicit --background override so body's var(--gp-bg) doesn't bleed into page content */}
          <main
            className={
              IS_LABS_ZONE ? "min-h-screen pt-4 sm:pt-5" : "min-h-screen"
            }
            style={{ backgroundColor: "hsl(var(--background))" }}
          >
            {children}
          </main>

          {showFooter && (
            <Suspense fallback={<div className="h-96" />}>
              {IS_LABS_ZONE ? <LabsFooter /> : <ShopFooter />}
            </Suspense>
          )}
        </div>

        <AppAccessibility />
        <AppCookieConsent screenSize={screenSize} />
        <ConditionalOverlays />
        <AppToaster />
      </ResearchCartProvider>
    </CartProvider>
  );
}
