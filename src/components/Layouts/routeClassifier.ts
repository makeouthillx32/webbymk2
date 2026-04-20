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

  // ── Blog zone override ─────────────────────────────────────────────────────
  // When NEXT_PUBLIC_ZONE=blog is baked in at build time, every non-auth path
  // is a blog page and must use the landing layout (LandingHeader + Footer).
  // Without this, single-segment slugs like /my-post-slug trip isCategoryPage
  // and render the shop layout instead.
  if (process.env.NEXT_PUBLIC_ZONE === "blog" && !isAuthPage) {
    return {
      isHome:             cleanPathname === "/",
      isToolsPage:        false,
      isDashboardPage:    false,
      isProductsPage:     false,
      isCollectionsPage:  false,
      isPagesRoute:       false,
      isCheckoutRoute:    false,
      isProfileMeRoute:   false,
      isAuthPage:         false,
      isCategoryPage:     false,
      isShopRoute:        false,
      useAppHeader:       false,
      isLocalePage,
      isLandingPage:      true,
    };
  }

  // ── Shop zone override ────────────────────────────────────────────────────
  // When NEXT_PUBLIC_ZONE=shop is baked in, every route uses the shop layout.
  // This ensures / (shop home), /products, /collections, /[categorySlug] etc.
  // all get ShopHeader instead of the landing shell.
  if (process.env.NEXT_PUBLIC_ZONE === "shop") {
    const isProductsPage    = lower.startsWith("/products");
    const isCollectionsPage = lower.startsWith("/collections");
    const isCheckoutRoute   = lower.startsWith("/checkout") || lower.startsWith("/cart");
    const isProfileMeRoute  = lower.startsWith("/profile/me");
    const shopCategoryPage  =
      /^\/[^/]+$/.test(cleanPathname) &&
      !isAuthPage &&
      cleanPathname !== "/" &&
      !lower.startsWith("/products") &&
      !lower.startsWith("/collections") &&
      !lower.startsWith("/checkout") &&
      !lower.startsWith("/shop") &&
      !lower.startsWith("/profile") &&
      !lower.startsWith("/settings") &&
      !lower.startsWith("/share") &&
      !lower.startsWith("/api");
    const isShopRoute =
      cleanPathname === "/" ||
      lower.startsWith("/shop") ||
      isProductsPage ||
      isCollectionsPage ||
      shopCategoryPage ||
      lower.startsWith("/pages");
    const useAppHeader =
      isCheckoutRoute ||
      isProfileMeRoute ||
      lower.startsWith("/legal") ||
      lower.startsWith("/profile") ||
      lower.startsWith("/settings") ||
      lower.startsWith("/share");
    return {
      isHome:             cleanPathname === "/",
      isToolsPage:        false,
      isDashboardPage:    false,
      isProductsPage,
      isCollectionsPage,
      isPagesRoute:       lower.startsWith("/pages"),
      isCheckoutRoute,
      isProfileMeRoute,
      isAuthPage,
      isCategoryPage:     shopCategoryPage,
      isShopRoute,
      useAppHeader,
      isLocalePage,
      isLandingPage:      false,  // shop zone never uses the landing shell
    };
  }

















  // ── Test3 zone override ───────────────────────────────────────────────
  // NEXT_PUBLIC_ZONE=test3 — layout: app
  if (process.env.NEXT_PUBLIC_ZONE === "test3" && !isAuthPage) {
    return {
      isHome:             cleanPathname === "/",
      isToolsPage:        false,
      isDashboardPage:    false,
      isProductsPage:     false,
      isCollectionsPage:  false,
      isPagesRoute:       false,
      isCheckoutRoute:    false,
      isProfileMeRoute:   false,
      isAuthPage,
      isCategoryPage:     false,
      isShopRoute:        true,
      useAppHeader:       true,
      isLocalePage,
      isLandingPage:      false,
    };
  }
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
    !lower.startsWith("/blog") &&
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
    lower.startsWith("/blog") ||
    lower.startsWith("/error");

  // /shop and all its sub-routes use the shop layout + ShopHeader
  const isShopRoute =
    isProductsPage ||
    isCollectionsPage ||
    isCategoryPage ||
    isPagesRoute ||
    lower.startsWith("/shop");

  // Only routes that explicitly need the app-shell header (checkout, profile, legal, etc.)
  // /shop is intentionally excluded so it gets the ShopHeader instead
  const useAppHeader =
    isCheckoutRoute ||
    isProfileMeRoute ||
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
