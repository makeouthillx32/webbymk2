"use client";

// components/Layouts/LayoutBranches.tsx
// The three concrete layout shells. ClientLayout picks the right one.

import { lazy, Suspense, useState } from "react";
import { Header as AppHeader } from "@/components/Layouts/app/nav";
import { Header as DashboardHeader } from "@/components/Layouts/dashboard";
import { Header as ShopHeader } from "@/components/Layouts/shop/Header";
import { Sidebar } from "@/components/Layouts/sidebar";
import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
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

const Footer = lazy(() => import("@/components/Layouts/footer"));

// ─── Dashboard Layout ─────────────────────────────────────

interface DashboardLayoutProps {
  children: React.ReactNode;
  screenSize: ScreenSize;
}

export function DashboardLayout({ children, screenSize }: DashboardLayoutProps) {
  return (
    <CartProvider>
      <div data-layout="dashboard" className="dark:bg-dark_bg1 bg-gray-1">
        <div className="flex h-screen overflow-hidden">
          <SidebarProvider>
            <Sidebar />
            <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
              <DashboardHeader sidebarOpen={false} setSidebarOpen={() => {}} />
              <main>
                <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">{children}</div>
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

// ─── Auth Layout (clean PWA shell — no header/footer) ────

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <CartProvider>
      <main className="min-h-screen">{children}</main>
      <AppAccessibility />
      <AppToaster />
    </CartProvider>
  );
}

// ─── Shop / App Layout ────────────────────────────────────

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
      <RegionBootstrap />

      <div data-layout={useAppHeader ? "app" : "shop"}>
        {useAppHeader ? (
          <AppHeader />
        ) : (
          showNav && <ShopHeader onMenuClick={() => setMobileMenuOpen(true)} />
        )}

        {/* Mobile Drawer with Overlay */}
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

        <main className="min-h-screen">{children}</main>

        {showFooter && (
          <Suspense fallback={<div className="h-96" />}>
            <Footer />
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