"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTheme, useAuth } from "@/app/provider";
import { classifyRoute } from "@/components/Layouts/routeClassifier";
import { useScreenSize } from "@/components/Layouts/hooks/useScreenSize";
import { useMetaThemeColor } from "@/components/Layouts/hooks/useMetaThemeColor";
import { DashboardLayout, AuthLayout, ShopLayout, LandingLayout, MinimalLayout, AppLayout, BlogLayout, type AppFooterType } from "@/components/Layouts/LayoutBranches";
import PullToRefresh from "@/components/Layouts/shop/PullToRefresh";
import BackendStatusToast from "@/components/system/BackendStatusToast";
import { setCookie } from "@/lib/cookieUtils";
import analytics from "@/lib/analytics";

export default function ClientLayout({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: "en" | "de";
}) {
  const pathname = usePathname();
  const { themeType } = useTheme();
  const { session } = useAuth();

  const screenSize = useScreenSize();
  const route = classifyRoute(pathname);

  const metaLayout = route.isDashboardPage
    ? "dashboard"
    : route.useAppHeader
    ? "app"
    : route.isLandingPage
    ? "landing"
    : "shop";
  useMetaThemeColor(metaLayout, themeType);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!route.isAuthPage && !route.isDashboardPage) {
      setCookie("lastPage", pathname, { path: "/", maxAge: 1800 });
    }
  }, [pathname, route.isAuthPage, route.isDashboardPage]);

  useEffect(() => {
    if (typeof window === "undefined" || route.isAuthPage) return;
    try {
      const isFirstLoad = !sessionStorage.getItem("analyticsInit");
      if (isFirstLoad) { sessionStorage.setItem("analyticsInit", "1"); return; }
      const lastUrl = sessionStorage.getItem("lastTrackedUrl");
      if (lastUrl === pathname) return;
      sessionStorage.setItem("lastTrackedUrl", pathname);
    } catch {}

    analytics.onRouteChange(window.location.href);

    const pageCategory = route.isHome ? "landing" : route.isToolsPage ? "tools" : route.isDashboardPage ? "dashboard" : "general";
    const scheduleTracking = () => {
      analytics.trackEvent("navigation", {
        category: "user_flow",
        action: "page_change",
        label: pageCategory,
        metadata: { pathname, from: document.referrer || "direct", pageType: pageCategory, timestamp: Date.now() },
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(scheduleTracking);
    } else {
      setTimeout(scheduleTracking, 0);
    }
  }, [pathname, route]);

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

  // Resolve the route's layout branch into a single element so we can render
  // one universal, cross-zone sibling alongside it. ClientLayout is rendered by
  // EVERY zone (core + each zone's own layout), so anything mounted here shows
  // on every zone — the right home for cross-zone system toasts.
  let branch: ReactNode;

  if (route.isDashboardPage) {
    branch = <DashboardLayout screenSize={screenSize}>{children}</DashboardLayout>;
  } else if (route.isAuthPage) {
    branch = <AuthLayout>{children}</AuthLayout>;
  } else if (route.isMinimalLayout) {
    // Minimal zones: no header, no footer — just theme + children.
    // Checked before isLandingPage so minimal zones don't fall through to
    // LandingLayout (which adds LandingHeader + LandingFooter).
    branch = <MinimalLayout screenSize={screenSize}>{children}</MinimalLayout>;
  } else if (route.isAppLayout) {
    // App zones get their own layout with a configurable footer.
    // isShopRoute → ShopFooter, isLandingPage → LandingFooter, else none.
    const footer: AppFooterType =
      route.isShopRoute  ? "shop"
      : route.isLandingPage ? "landing"
      : "none";
    branch = <AppLayout screenSize={screenSize} footer={footer}>{children}</AppLayout>;
  } else if (route.isLandingPage && process.env.NEXT_PUBLIC_ZONE === "blog") {
    // Blog zone gets its own chrome (blog_settings-driven header/footer)
    // instead of the shared landing shell. Build-time constant — dead code
    // in every other zone image.
    branch = <BlogLayout screenSize={screenSize}>{children}</BlogLayout>;
  } else if (route.isLandingPage) {
    branch = <LandingLayout screenSize={screenSize} locale={locale}>{children}</LandingLayout>;
  } else {
    branch = (
      <>
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

  return (
    <>
      {/* Cross-zone system toast: raised on any zone when middleware detects the
          backend is unreachable. Renders nothing until then. */}
      <BackendStatusToast />
      {branch}
    </>
  );
}
