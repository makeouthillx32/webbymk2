"use client";

// components/Layouts/ClientLayout.tsx
// Orchestrator only — routing logic lives in routeClassifier, layout shells in LayoutBranches.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme, useAuth } from "@/app/provider";
import { classifyRoute } from "@/components/Layouts/routeClassifier";
import { useScreenSize } from "@/components/Layouts/hooks/useScreenSize";
import { useMetaThemeColor } from "@/components/Layouts/hooks/useMetaThemeColor";
import { DashboardLayout, AuthLayout, ShopLayout } from "@/components/Layouts/LayoutBranches";
import PullToRefresh from "@/components/Layouts/shop/PullToRefresh";
import { setCookie } from "@/lib/cookieUtils";
import analytics from "@/lib/analytics";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { themeType } = useTheme();
  const { session } = useAuth();

  const screenSize = useScreenSize();
  const route = classifyRoute(pathname);

  const metaLayout = route.isDashboardPage ? "dashboard" : route.useAppHeader ? "app" : "shop";
  useMetaThemeColor(metaLayout, themeType);

  // ─── Last Page Tracking ──────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!route.isAuthPage && !route.isDashboardPage) {
      setCookie("lastPage", pathname, { path: "/", maxAge: 1800 }); // 30 min
    }
  }, [pathname, route.isAuthPage, route.isDashboardPage]);

  // ─── Analytics Tracking ──────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined" || route.isAuthPage) return;

    try {
      const isFirstLoad = !sessionStorage.getItem("analyticsInit");
      if (isFirstLoad) {
        sessionStorage.setItem("analyticsInit", "1");
        return;
      }
      const lastUrl = sessionStorage.getItem("lastTrackedUrl");
      if (lastUrl === pathname) return;
      sessionStorage.setItem("lastTrackedUrl", pathname);
    } catch {}

    analytics.onRouteChange(window.location.href);

    const pageCategory = route.isHome
      ? "landing"
      : route.isToolsPage
      ? "tools"
      : route.isDashboardPage
      ? "dashboard"
      : "general";

    const scheduleTracking = () => {
      analytics.trackEvent("navigation", {
        category: "user_flow",
        action: "page_change",
        label: pageCategory,
        metadata: {
          pathname,
          from: document.referrer || "direct",
          pageType: pageCategory,
          timestamp: Date.now(),
        },
      });
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(scheduleTracking);
    } else {
      setTimeout(scheduleTracking, 0);
    }
  }, [pathname, route]);

  // ─── Query Parameter Cleanup ─────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (params.get("logout") === "true") { params.delete("logout"); changed = true; }
    if (params.get("signin") === "true") { params.delete("signin"); changed = true; }

    if (changed) {
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.location.replace(newUrl);
    }
  }, []);

  // ─── Route → Layout Branch ───────────────────────────────

  if (route.isDashboardPage) {
    return <DashboardLayout screenSize={screenSize}>{children}</DashboardLayout>;
  }

  if (route.isAuthPage) {
    return <AuthLayout>{children}</AuthLayout>;
  }

  return (
    <>
      {/* Pull-to-refresh — shop & app routes only, mobile touch only */}
      <PullToRefresh />

      <ShopLayout
        screenSize={screenSize}
        sessionUserId={session?.user?.id}
        useAppHeader={route.useAppHeader}
        showNav={!route.isAuthPage && (route.isShopRoute || route.useAppHeader)}
        showFooter={!route.isAuthPage && route.isShopRoute}
      >
        {children}
      </ShopLayout>
    </>
  );
}