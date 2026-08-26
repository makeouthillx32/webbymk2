"use client";

// src/ink/templates/zone/ZoneLayout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unified zone layout shell — one component, config-driven.
//
// Reads ZoneLayoutConfig from the zone's zone.config.ts and renders the
// appropriate header, footer, sidebar, and overlay components.
//
// This replaces per-zone layout boilerplate. Each zone's layout.tsx becomes:
//
//   import { Providers } from "@/app/provider";
//   import { ZoneLayout } from "@/components/Layouts/ZoneLayout";
//   import { resolveZoneConfig } from "@/components/Layouts/config";
//   import zoneConfig from "./zone.config";
//
//   export default function RootLayout({ children }) {
//     return (
//       <html lang="en" suppressHydrationWarning>
//         <body>
//           <Providers>
//             <ZoneLayout config={resolveZoneConfig(zoneConfig)}>{children}</ZoneLayout>
//           </Providers>
//         </body>
//       </html>
//     );
//   }
//
// ZONE-LOCAL zone.config.ts exports:
//   layoutType: "landing" | "shop" | "dashboard" | "app" | "minimal"
//   useTicker, useSidebar, useAppHeader, useFooter, useNav
// ─────────────────────────────────────────────────────────────────────────────

import { lazy, Suspense, useState } from "react";
import { I18nProviderClient } from "@/locales/client";

// Header components
import { Header as AppHeader } from "@/components/Layouts/app/nav";
import { Header as DashboardHeader } from "@/components/Layouts/dashboard";
import { Header as ShopHeader } from "@/components/Layouts/shop/Header";
import LandingHeader from "@/components/Layouts/Landing/Header";

// Footer components
import LandingFooter from "@/components/Layouts/Landing/Footer";
const ShopFooter = lazy(() => import("@/components/Layouts/shop/footer"));

// Sidebar
import { Sidebar } from "@/components/Layouts/sidebar";
import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";

// Overlays / utilities
import MobileDrawer from "@/components/Layouts/shop/MobileDrawer";
import { CartProvider } from "@/components/Layouts/overlays/cart/cart-context";
import RegionBootstrap from "@/components/Auth/RegionBootstrap";
import {
  AppToaster,
  AppAccessibility,
  AppCookieConsent,
  ConditionalOverlays,
} from "@/components/Layouts/LayoutShells";

import type { ScreenSize } from "@/components/Layouts/hooks/useScreenSize";
import type { ZoneLayoutConfig } from "@/types/zones";

// ── Props ────────────────────────────────────────────────────────────────────

interface ZoneLayoutProps {
  children: React.ReactNode;
  config: Required<ZoneLayoutConfig>;
  screenSize?: ScreenSize;
  locale?: "en" | "de";
  sessionUserId?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ZoneLayout({
  children,
  config,
  screenSize = "desktop",
  locale = "en",
  sessionUserId,
}: ZoneLayoutProps) {
  const { layoutType, useTicker, useSidebar, useAppHeader, useFooter, useNav } = config;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Header selection based on layoutType + useAppHeader
  const renderHeader = () => {
    if (layoutType === "landing") {
      return <LandingHeader />;
    }

    if (layoutType === "dashboard") {
      // Dashboard has its own header pattern
      return null;
    }

    if (layoutType === "shop" || layoutType === "app") {
      if (useAppHeader) {
        return <AppHeader />;
      }
      if (useNav) {
        return <ShopHeader onMenuClick={() => setMobileMenuOpen(true)} />;
      }
      return null;
    }

    // minimal — no header
    return null;
  };

  // Footer selection
  const renderFooter = () => {
    if (!useFooter) return null;

    if (layoutType === "landing") {
      return <LandingFooter />;
    }

    if (layoutType === "shop" || layoutType === "app") {
      return (
        <Suspense fallback={<div className="h-96" />}>
          <ShopFooter />
        </Suspense>
      );
    }

    return null;
  };

  // Mobile drawer (shop/app mobile nav)
  const renderMobileDrawer = () => {
    if (layoutType !== "shop" && layoutType !== "app") return null;
    if (!mobileMenuOpen) return null;

    return (
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
          <MobileDrawer onClose={() => setMobileMenuOpen(false)} />
        </div>
      </>
    );
  };

  // Dashboard sidebar
  const renderDashboardShell = () => (
    <div
      data-layout="dashboard"
      className="dark:bg-dark_bg1 bg-gray-1"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      <div className="flex h-screen overflow-hidden">
        <SidebarProvider>
          {useSidebar && <Sidebar />}
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
  );

  // Standard shell (landing/shop/app/minimal)
  const renderStandardShell = () => (
    <div data-layout={layoutType}>
      {renderHeader()}
      {renderMobileDrawer()}

      {/* TODO: useTicker banner would render here */}
      {/* {useTicker && <Ticker />} */}

      <main className="min-h-screen" style={{ backgroundColor: "hsl(var(--background))" }}>
        {children}
      </main>

      {renderFooter()}
    </div>
  );

  return (
    <CartProvider>
      {/* RegionBootstrap needed for shop/app for geo-based features */}
      {(layoutType === "shop" || layoutType === "app") && <RegionBootstrap />}

      <I18nProviderClient locale={locale}>
        {layoutType === "dashboard" ? renderDashboardShell() : renderStandardShell()}
      </I18nProviderClient>

      <AppAccessibility />
      <AppCookieConsent screenSize={screenSize} />
      <ConditionalOverlays />
      <AppToaster />
    </CartProvider>
  );
}

export default ZoneLayout;
