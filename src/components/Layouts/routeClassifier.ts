// src/components/Layouts/routeClassifier.ts
// ─────────────────────────────────────────────────────────────────────────────
// Route classification for the multi-zone platform.
//
// Zone routing (NEXT_PUBLIC_ZONE set at Docker build time):
//   Looks up the zone key in ZONE_LAYOUTS (zone-overrides.ts).
//   If found, delegates to classifyZoneRoute() — a pure, layout-aware
//   classifier with no zone-key literals.  Auth routes always fall through
//   to the full classifier so every zone gets AuthLayout for /sign-in etc.
//
// Monolith routing (NEXT_PUBLIC_ZONE unset or unknown key):
//   Full pathname-based heuristic at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────────

import { ZONE_LAYOUTS } from "./zone-overrides";

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
  isMinimalLayout: boolean;
  /** True for zones scaffolded with layoutType="app". Routes to AppLayout
   *  (AppHeader + selectable footer) instead of piggybacking on ShopLayout. */
  isAppLayout: boolean;
}

export function classifyRoute(pathname: string): RouteInfo {
  // Strip locale prefix — usePathname() keeps /en/ or /de/ in the URL even
  // though middleware rewrites the content, so we normalise before classifying.
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

  // ── Zone override ─────────────────────────────────────────────────────────
  // Auth pages skip the zone override so every zone gets AuthLayout for /sign-in.
  // The zone key is a build-time constant — only one branch ever runs.
  const zone = process.env.NEXT_PUBLIC_ZONE;
  if (zone && !isAuthPage) {
    const config = ZONE_LAYOUTS[zone];
    if (config) {
      return classifyZoneRoute(config, cleanPathname, lower, isLocalePage);
    }
  }

  // ── Full monolith classifier ──────────────────────────────────────────────
  // Used when NEXT_PUBLIC_ZONE is unset (monolith dev) or the zone key has no
  // entry in ZONE_LAYOUTS. Also handles auth routes for every zone (see above).

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

  const isHome             = cleanPathname === "/";
  const isToolsPage        = lower.startsWith("/tools");
  const isDashboardPage    = lower.startsWith("/dashboard");
  const isProductsPage     = lower.startsWith("/products");
  const isCollectionsPage  = lower.startsWith("/collections");
  const isPagesRoute       = lower.startsWith("/pages");
  const isCheckoutRoute    = lower.startsWith("/checkout") || lower.startsWith("/cart");
  const isProfileMeRoute   = lower.startsWith("/profile/me");

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

  const isShopRoute =
    isProductsPage ||
    isCollectionsPage ||
    isCategoryPage ||
    isPagesRoute ||
    lower.startsWith("/shop");

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
    isMinimalLayout: false,
    isAppLayout:     false,
  };
}

// ── Zone-specific classifier ──────────────────────────────────────────────────
//
// Called only when the zone key has a ZONE_LAYOUTS entry AND the route is not
// an auth page. Returns the RouteInfo appropriate for the zone's layout type.
// Auth pages are intentionally excluded — they fall through to the monolith
// classifier which returns isAuthPage: true, and ClientLayout renders AuthLayout.

function classifyZoneRoute(
  config:        { layoutType: string; appFooter: string },
  cleanPathname: string,
  lower:         string,
  isLocalePage:  boolean,
): RouteInfo {
  const isHome = cleanPathname === "/";

  // ── Landing ────────────────────────────────────────────────────────────────
  if (config.layoutType === "landing") {
    return {
      isHome,
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
      isMinimalLayout:    false,
      isAppLayout:        false,
    };
  }

  // ── Shop ───────────────────────────────────────────────────────────────────
  // Full pathname-based routing — shop zones need dynamic product/collection/
  // category/checkout classification identical to the old hardcoded override.
  if (config.layoutType === "shop") {
    const isProductsPage    = lower.startsWith("/products");
    const isCollectionsPage = lower.startsWith("/collections");
    const isCheckoutRoute   = lower.startsWith("/checkout") || lower.startsWith("/cart");
    const isProfileMeRoute  = lower.startsWith("/profile/me");
    const shopCategoryPage  =
      /^\/[^/]+$/.test(cleanPathname) &&
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
      isHome ||
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
      isHome,
      isToolsPage:        false,
      isDashboardPage:    false,
      isProductsPage,
      isCollectionsPage,
      isPagesRoute:       lower.startsWith("/pages"),
      isCheckoutRoute,
      isProfileMeRoute,
      isAuthPage:         false,
      isCategoryPage:     shopCategoryPage,
      isShopRoute,
      useAppHeader,
      isLocalePage,
      isLandingPage:      false,
      isMinimalLayout:    false,
      isAppLayout:        false,
    };
  }

  // ── App ────────────────────────────────────────────────────────────────────
  // isShopRoute / isLandingPage encode the footer choice so ClientLayout can
  // render the right footer (if any) inside AppLayout.
  if (config.layoutType === "app") {
    return {
      isHome,
      isToolsPage:        false,
      isDashboardPage:    false,
      isProductsPage:     false,
      isCollectionsPage:  false,
      isPagesRoute:       false,
      isCheckoutRoute:    false,
      isProfileMeRoute:   false,
      isAuthPage:         false,
      isCategoryPage:     false,
      isShopRoute:        config.appFooter === "shop",
      useAppHeader:       false,
      isLocalePage,
      isLandingPage:      config.appFooter === "landing",
      isMinimalLayout:    false,
      isAppLayout:        true,
    };
  }

  // ── Minimal ────────────────────────────────────────────────────────────────
  // No header, no footer, bare canvas. Theme providers and cookie consent still
  // render via MinimalLayout (checked before isLandingPage in ClientLayout).
  return {
    isHome,
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
    isLandingPage:      false,
    isMinimalLayout:    true,
    isAppLayout:        false,
  };
}
