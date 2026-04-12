// components/Layouts/routeClassifier.ts

export interface RouteInfo {
  isHome: boolean;
  isToolsPage: boolean;
  isDashboardPage: boolean;
  isProductsPage: boolean;
  isCollectionsPage: boolean;
  isPagesRoute: boolean;
  isCheckoutRoute: boolean;
  isProfileMeRoute: boolean;
  isAuthPage: boolean;
  isCategoryPage: boolean;
  isShopRoute: boolean;
  useAppHeader: boolean;
  isLocalePage: boolean;
  isLandingPage: boolean;
}

export function classifyRoute(pathname: string): RouteInfo {
  // usePathname() returns the browser URL which keeps the locale prefix
  // (e.g. /en/about) even though middleware rewrites the content to /about.
  // Strip it before classifying so isLandingPage etc. fire correctly.
  const isLocalePage = /^\/(en|de)(\/|$)/.test(pathname.toLowerCase());
  const cleanPathname = isLocalePage
    ? pathname.replace(/^\/(en|de)/, "") || "/"
    : pathname;
  const lower = cleanPathname.toLowerCase();

  const isAuthPage =
    lower.startsWith("/sign-in") ||
    lower.startsWith("/sign-up") ||
    lower.startsWith("/forgot-password") ||
    lower.startsWith("/reset-password") ||
    lower.startsWith("/auth/");

  const isCategoryPage =
    /^\/[^/]+$/.test(cleanPathname) &&
    !isAuthPage &&
    !isLocalePage &&
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
    !lower.startsWith("/api") &&
    !lower.startsWith("/shop") &&
    !lower.startsWith("/about") &&
    !lower.startsWith("/contact") &&
    !lower.startsWith("/jobs") &&
    !lower.startsWith("/services") &&
    !lower.startsWith("/hero") &&
    !lower.startsWith("/calendar") &&
    !lower.startsWith("/legal") &&
    !lower.startsWith("/share") &&
    !lower.startsWith("/error") &&
    cleanPathname !== "/";

  const isHome = cleanPathname === "/";
  const isToolsPage = lower.startsWith("/tools");
  const isDashboardPage = lower.startsWith("/dashboard");
  const isProductsPage = lower.startsWith("/products");
  const isCollectionsPage = lower.startsWith("/collections");
  const isPagesRoute = lower.startsWith("/pages");
  const isCheckoutRoute = lower.startsWith("/checkout") || lower.startsWith("/cart");
  const isProfileMeRoute = lower.startsWith("/profile/me");

  const isLandingPage =
    isHome ||
    lower.startsWith("/about") ||
    lower.startsWith("/contact") ||
    lower.startsWith("/jobs") ||
    lower.startsWith("/services") ||
    lower.startsWith("/hero") ||
    lower.startsWith("/calendar") ||
    lower.startsWith("/error");

  const isShopRoute =
    isProductsPage || isCollectionsPage || isCategoryPage || isPagesRoute;

  const useAppHeader =
    isCheckoutRoute ||
    isProfileMeRoute ||
    lower.startsWith("/shop") ||
    lower.startsWith("/legal") ||
    lower.startsWith("/profile") ||
    lower.startsWith("/settings") ||
    lower.startsWith("/share");

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
    isLocalePage,
    isLandingPage,
  };
}
