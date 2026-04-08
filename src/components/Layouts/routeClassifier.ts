// components/Layouts/routeClassifier.ts
// Pure route classification — no React, no side effects.
// Add new routes here when the app grows; ClientLayout reads this automatically.

export interface RouteInfo {
  isHome: boolean;
  isToolsPage: boolean;
  isDashboardPage: boolean;
  isProductsPage: boolean;
  isCollectionsPage: boolean;
  /** CMS static pages under app/pages/[slug] */
  isPagesRoute: boolean;
  isCheckoutRoute: boolean;
  isProfileMeRoute: boolean;
  /** Auth/off-pages render with NO header or footer — clean PWA shell */
  isAuthPage: boolean;
  /** Catch-all for single-segment shop routes like /tops, /new-releases */
  isCategoryPage: boolean;
  /** Convenience: any route that should show the shop header + footer */
  isShopRoute: boolean;
  /** Convenience: routes that use the app (minimal) header instead of shop */
  useAppHeader: boolean;
}

export function classifyRoute(pathname: string): RouteInfo {
  const lower = pathname.toLowerCase();

  const isAuthPage =
    lower.startsWith("/sign-in") ||
    lower.startsWith("/sign-up") ||
    lower.startsWith("/forgot-password") ||
    lower.startsWith("/reset-password") ||
    lower.startsWith("/auth/");

  // Catch-all for single-segment paths like /tops, /new-releases.
  // Must explicitly exclude every known non-category prefix to prevent false matches.
  const isCategoryPage =
    /^\/[^/]+$/.test(pathname) &&
    !isAuthPage &&
    !lower.startsWith("/tools") &&
    !lower.startsWith("/dashboard") &&
    !lower.startsWith("/products") &&
    !lower.startsWith("/collections") &&
    !lower.startsWith("/checkout") &&
    !lower.startsWith("/cart") &&
    !lower.startsWith("/profile") &&
    !lower.startsWith("/settings") &&
    !lower.startsWith("/protected") &&
    !lower.startsWith("/auth") &&
    !lower.startsWith("/api");

  const isHome = pathname === "/";
  const isToolsPage = lower.startsWith("/tools");
  const isDashboardPage = lower.startsWith("/dashboard");
  const isProductsPage = lower.startsWith("/products");
  const isCollectionsPage = lower.startsWith("/collections");
  const isPagesRoute = lower.startsWith("/pages");   // app/pages/[slug] — static CMS pages
  const isCheckoutRoute = lower.startsWith("/checkout") || lower.startsWith("/cart");
  const isProfileMeRoute = lower.startsWith("/profile/me");

  const isShopRoute =
    isHome || isProductsPage || isCollectionsPage || isCategoryPage || isPagesRoute;
  const useAppHeader = isCheckoutRoute || isProfileMeRoute;

  return {
    isHome,
    isToolsPage,
    isDashboardPage,
    isProductsPage,
    isCollectionsPage,
    isPagesRoute,
    isCheckoutRoute,
    isProfileMeRoute,
    isAuthPage,
    isCategoryPage,
    isShopRoute,
    useAppHeader,
  };
}