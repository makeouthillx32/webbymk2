// middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Multi-zone aware Next.js middleware.
//
// Responsibilities (in order):
//   1. www → canonical redirect
//   2. Inject zone + host headers so server components know which zone is active
//   3. Strip locale prefix from pathname, set locale header + cookie
//   4. Enforce auth on protected zones / routes (redirect to /sign-in)
//   5. Forward Supabase auth cookie state
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient }                        from "@supabase/ssr";
import { NextResponse, type NextRequest }            from "next/server";
import {
  getCanonicalHost,
  getZoneFromHost,
  getZoneConfig,
  getZoneFromPathname,
  isLocalDevelopmentHost,
  normalizeHost,
  resolvePromotionRedirect,
  buildZoneContext,
  getZoneBaseUrl,
  CORE_DOMAIN,
  ZONE_HEADER,
  SITE_HOST_HEADER,
  CORE_HOST_HEADER,
  PROMOTION_STATUS_HEADER,
  PROMOTION_ZONE_HEADER,
} from "@/lib/multiZone";
import { isProtectedRoute } from "@/lib/protectedRoutes";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALES       = ["en", "de"] as const;
const LOCALE_COOKIE = "Next-Locale";
const LOCALE_HEADER = "X-Next-Locale";

type Locale = (typeof LOCALES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLocaleFromPathname(pathname: string): Locale | null {
  return (
    LOCALES.find(
      (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
    ) ?? null
  );
}

function stripLocaleFromPathname(pathname: string, locale: Locale): string {
  if (pathname === `/${locale}`) return "/";
  if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  return pathname;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const url            = request.nextUrl.clone();
  // Prefer x-forwarded-host (set by NPM/OpenResty) over host so the zone
  // resolver sees the original public hostname even when the reverse proxy
  // rewrites the Host header to the upstream service address.
  const rawHost        =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    "";
  const normalizedHost = normalizeHost(rawHost);
  const canonicalHost  = getCanonicalHost(normalizedHost);
  const isLocal        = isLocalDevelopmentHost(normalizedHost);

  // ── 1. www → canonical redirect ───────────────────────────────────────────
  if (!isLocal && normalizedHost !== canonicalHost) {
    url.hostname = canonicalHost;
    url.port     = "";   // strip internal container port — public URL has none
    return NextResponse.redirect(url, 301);
  }

  // Resolve locale before zone ownership and promotion. Otherwise a localized
  // Core path such as /de/shop would be rewritten only after the promotion
  // registry had already been skipped.
  const locale = getLocaleFromPathname(url.pathname);
  const effectivePathname = locale
    ? stripLocaleFromPathname(url.pathname, locale)
    : url.pathname;

  // ── 2. Determine zone ─────────────────────────────────────────────────────
  // In production, zone comes from the Host header (subdomain routing).
  // In local dev the monolith serves all zones, so fall back to path-based detection.
  // getZoneFromHost returns the subdomain key for dynamic zones not in ZONES.
  const zoneFromHost: string = isLocal
    ? getZoneFromPathname(effectivePathname)
    : getZoneFromHost(normalizedHost);

  // ── 2b. Zone Promotion redirect (Core path → promoted zone subdomain) ─────
  // Only fires on the CORE host in production. A promoted Core path like /shop
  // redirects to its zone (shop.unenter.live), preserving the deep path and
  // query string. On the zone's OWN host that same path is the destination and
  // must not redirect; in local dev the monolith serves every zone path-based,
  // so we never cross-redirect there either. The redirect decision lives in the
  // promotion registry (status: "redirect") — flip a zone to "first-class" there
  // and its Core path is served normally again, no middleware change needed.
  const onCoreHost = zoneFromHost === "unenter";
  if (!isLocal && onCoreHost) {
    const promo = resolvePromotionRedirect(effectivePathname);
    if (promo) {
      const target = new URL(`${getZoneBaseUrl(promo.zone)}${promo.path}`);
      target.search = url.search; // preserve query string across the move
      // Cross-zone signal: tell the destination zone which Core path moved, so
      // it can show a "this section moved here — you've been redirected" toast.
      // A query param (not a cookie) carries the signal across the subdomain
      // boundary: it's scoped to THIS navigation, self-clears, and adds no
      // cookie weight. The destination strips it after showing the toast.
      target.searchParams.set("_moved", effectivePathname);
      // 307 (temporary) during rollout — NOT cached by browsers, so a mistaken
      // promotion can be undone instantly. Flip to 308 (permanent, SEO-positive
      // but aggressively cached) once the redirect is confirmed correct in prod.
      const redirectResponse = NextResponse.redirect(target, 307);
      if (locale) {
        redirectResponse.cookies.set(LOCALE_COOKIE, locale, {
          path:     "/",
          maxAge:   7 * 24 * 60 * 60,
          sameSite: "lax",
          secure:   true,
        });
      }
      return redirectResponse;
    }
  }

  // ── 3. Locale stripping ───────────────────────────────────────────────────
  // ── 4. Build mutated request headers ─────────────────────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ZONE_HEADER,      zoneFromHost);
  requestHeaders.set(SITE_HOST_HEADER, canonicalHost);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);

  // Richer zone-request context for server components + the zone-aware 404.
  // One typed contract computed once here; downstream reads it instead of
  // recomputing zone facts from the host.
  const zoneCtx = buildZoneContext({
    host:     normalizedHost,
    pathname: effectivePathname,
    isLocal,
  });
  requestHeaders.set(CORE_HOST_HEADER, zoneCtx.isCoreHost ? "1" : "0");
  if (zoneCtx.promotionStatus) requestHeaders.set(PROMOTION_STATUS_HEADER, zoneCtx.promotionStatus);
  if (zoneCtx.promotedToZone)  requestHeaders.set(PROMOTION_ZONE_HEADER,  zoneCtx.promotedToZone);

  const requestInit = { headers: requestHeaders };

  // Some browsers can keep an older Server Action form document around during
  // local dev rebuilds. Route those stale POSTs into the stable sign-in handler.
  if (request.method === "POST" && url.pathname === "/sign-in") {
    const signInTarget = url.clone();
    signInTarget.pathname = "/auth/sign-in";
    return NextResponse.redirect(signInTarget, 307);
  }

  const createRoutedResponse = () =>
    rewriteTarget
      ? NextResponse.rewrite(rewriteTarget, { request: requestInit })
      : NextResponse.next({ request: requestInit });

  // ── 5a. Zone-subdomain path prefix injection ─────────────────────────────
  // When a zone is accessed via its own subdomain (e.g. blog.unenter.live/my-post)
  // but the Next.js pages live under a path prefix (/blog/my-post), rewrite the
  // request so Next.js finds the right route without a redirect.
  // getZoneConfig returns the static ZoneConfig for known zones, or a safe
  // default (requiresAuth:false, routePrefixes:["/"]) for dynamically scaffolded
  // zones not in the static ZONES map — prevents spurious auth redirects and
  // zone-prefix rewrites on zones the static map doesn't know about.
  const zoneConfig = getZoneConfig(zoneFromHost);
  const nonRootPrefixes = zoneConfig.routePrefixes.filter((p) => p !== "/");

  // Zone-prefix injection only makes sense for SINGLE-prefix zones (e.g. blog),
  // whose overlay pages nest under that one prefix. Multi-prefix zones (e.g. shop:
  // /shop, /products, /checkout, /collections, /cart, /u) serve their overlay at
  // ROOT, so injecting the primary prefix would 302 every non-primary route to
  // /shop/* and 404. Only inject when there is exactly one non-root prefix.
  const zonePrimaryPrefix = nonRootPrefixes.length === 1 ? nonRootPrefixes[0] : null;

  const needsZonePrefixRewrite =
    !isLocal &&
    normalizedHost === zoneConfig.host &&
    normalizedHost !== CORE_DOMAIN &&   // core (incl. www) never needs path-prefix injection
    zonePrimaryPrefix !== null &&
    !url.pathname.startsWith(zonePrimaryPrefix);

  // ── 5. Rewrite locale-prefixed paths (or zone prefix) ────────────────────
  // Pre-compute the rewrite target so the Supabase setAll callback can also
  // apply it (setAll replaces the response object; without this the rewrite
  // would be silently discarded when session cookies are refreshed).
  let rewriteTarget: URL | null = null;

  if (needsZonePrefixRewrite && zonePrimaryPrefix) {
    rewriteTarget = url.clone();
    // /my-post  →  /blog/my-post
    // /         →  /blog
    rewriteTarget.pathname =
      url.pathname === "/" ? zonePrimaryPrefix : `${zonePrimaryPrefix}${url.pathname}`;
  } else if (locale) {
    rewriteTarget = url.clone();
    rewriteTarget.pathname = effectivePathname || "/";
  }

  // Zone-prefix injection uses a REDIRECT (not a rewrite) so the browser URL
  // and Next.js client router stay in sync.  A transparent rewrite causes a
  // server/client hydration mismatch in App Router — the server renders /blog
  // but the client re-initialises at "/" and renders the home page.
  if (rewriteTarget && needsZonePrefixRewrite) {
    return NextResponse.redirect(rewriteTarget, 302);
  }

  let response: NextResponse = createRoutedResponse();

  // Propagate zone headers to the response (readable by client via fetch)
  response.headers.set(ZONE_HEADER,      zoneFromHost);
  response.headers.set(SITE_HOST_HEADER, canonicalHost);
  response.headers.set(CORE_HOST_HEADER, zoneCtx.isCoreHost ? "1" : "0");

  // ── 6. Set locale cookie if missing / stale ───────────────────────────────
  if (locale) {
    const existing = request.cookies.get(LOCALE_COOKIE)?.value;
    if (existing !== locale) {
      response.cookies.set(LOCALE_COOKIE, locale, {
        path:     "/",
        maxAge:   7 * 24 * 60 * 60,
        sameSite: "lax",
        secure:   !isLocal,
      });
    }
  }

  // ── 7. Supabase auth + protected route enforcement ───────────────────────
  const supabaseResponse = { current: response };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Refresh Supabase auth cookies on each request.
          // Must preserve any rewrite target so zone-subdomain routing isn't lost.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          requestHeaders.set("cookie", request.cookies.toString());
          const refreshed = createRoutedResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshed.cookies.set(name, value, options ?? {})
          );
          // Carry over our zone headers
          refreshed.headers.set(ZONE_HEADER,      zoneFromHost);
          refreshed.headers.set(SITE_HOST_HEADER, canonicalHost);
          refreshed.headers.set(CORE_HOST_HEADER, zoneCtx.isCoreHost ? "1" : "0");
          supabaseResponse.current = refreshed;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protect zones that require auth + individual protected routes
  const routeIsProtected = zoneConfig.requiresAuth || isProtectedRoute(url.pathname);

  if (routeIsProtected && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.searchParams.set("next", url.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse.current;
}

// ── Matcher ───────────────────────────────────────────────────────────────────
// Skip Next.js internals, static assets, and common image/font extensions.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.ico|opengraph-image|twitter-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)$).*)",
  ],
};
