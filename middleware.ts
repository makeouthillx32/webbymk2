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
  getZoneFromPathname,
  isLocalDevelopmentHost,
  normalizeHost,
  CORE_DOMAIN,
  ZONES,
  ZONE_HEADER,
  SITE_HOST_HEADER,
  type ZoneName,
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
  const rawHost        = request.headers.get("host") ?? "";
  const normalizedHost = normalizeHost(rawHost);
  const canonicalHost  = getCanonicalHost(normalizedHost);
  const isLocal        = isLocalDevelopmentHost(normalizedHost);

  // ── 1. www → canonical redirect ───────────────────────────────────────────
  if (!isLocal && normalizedHost !== canonicalHost) {
    url.hostname = canonicalHost;
    return NextResponse.redirect(url, 301);
  }

  // ── 2. Determine zone ─────────────────────────────────────────────────────
  // In production, zone comes from the Host header (subdomain routing).
  // In local dev the monolith serves all zones, so fall back to path-based detection.
  const zoneFromHost: ZoneName = isLocal
    ? getZoneFromPathname(url.pathname)
    : getZoneFromHost(normalizedHost);

  // ── 3. Locale stripping ───────────────────────────────────────────────────
  const locale = getLocaleFromPathname(url.pathname);

  // ── 4. Build mutated request headers ─────────────────────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ZONE_HEADER,      zoneFromHost);
  requestHeaders.set(SITE_HOST_HEADER, canonicalHost);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);

  const requestInit = { headers: requestHeaders };

  // ── 5a. Zone-subdomain path prefix injection ─────────────────────────────
  // When a zone is accessed via its own subdomain (e.g. blog.unenter.live/my-post)
  // but the Next.js pages live under a path prefix (/blog/my-post), rewrite the
  // request so Next.js finds the right route without a redirect.
  const zoneConfig = ZONES[zoneFromHost];
  const zonePrimaryPrefix =
    zoneConfig.routePrefixes.find((p) => p !== "/") ?? null;

  const needsZonePrefixRewrite =
    !isLocal &&
    normalizedHost === zoneConfig.host &&
    normalizedHost !== CORE_DOMAIN &&
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
    rewriteTarget.pathname = stripLocaleFromPathname(url.pathname, locale) || "/";
  }

  // Zone-prefix injection uses a REDIRECT (not a rewrite) so the browser URL
  // and Next.js client router stay in sync.  A transparent rewrite causes a
  // server/client hydration mismatch in App Router — the server renders /blog
  // but the client re-initialises at "/" and renders the home page.
  if (rewriteTarget && needsZonePrefixRewrite) {
    return NextResponse.redirect(rewriteTarget, 302);
  }

  let response: NextResponse = rewriteTarget
    ? NextResponse.rewrite(rewriteTarget, { request: requestInit })
    : NextResponse.next({ request: requestInit });

  // Propagate zone headers to the response (readable by client via fetch)
  response.headers.set(ZONE_HEADER,      zoneFromHost);
  response.headers.set(SITE_HOST_HEADER, canonicalHost);

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
          const refreshed = rewriteTarget
            ? NextResponse.rewrite(rewriteTarget, { request: requestInit })
            : NextResponse.next({ request: requestInit });
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshed.cookies.set(name, value, options ?? {})
          );
          // Carry over our zone headers
          refreshed.headers.set(ZONE_HEADER,      zoneFromHost);
          refreshed.headers.set(SITE_HOST_HEADER, canonicalHost);
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
