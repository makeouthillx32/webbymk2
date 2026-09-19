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

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getCanonicalHost,
  getZoneFromHost,
  getZoneConfig,
  getZoneFromPathname,
  isLocalDevelopmentHost,
  isDevZoneHost,
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
import { evaluateSessionFreshness } from "@/lib/auth/sessionPolicy";
import { isTankBackstagePath, sessionPolicyKey } from "@/lib/auth/backstage";
import { createShieldChallenge, verifyClearanceToken } from "@/lib/shield/crypto";
import { renderShieldVerificationHtml } from "@/lib/shield/template";
import { SHIELD_COOKIE_NAME } from "@/lib/shield/types";
import { getShieldPolicyForHost } from "@/lib/shield/policy";
import { inspectRequest } from "@/lib/shield/waf";
import { globalRateLimiter, SlidingWindowLimiter } from "@/lib/shield/ratelimit";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALES = ["en", "de"] as const;
const LOCALE_COOKIE = "Next-Locale";
const LOCALE_HEADER = "X-Next-Locale";
// Keep this comfortably below NPM's upstream timeout. A stale Kong/GoTrue
// request must degrade a public zone to signed-out; it must never turn the
// entire page request into the 504 handled by the independent status site.
const AUTH_FETCH_TIMEOUT_MS = 4_000;

type Locale = (typeof LOCALES)[number];

const fetchAuthWithDeadline: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) {
    abortFromUpstream();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  }

  const timeout = setTimeout(
    () => controller.abort(new DOMException("Auth backend deadline exceeded", "TimeoutError")),
    AUTH_FETCH_TIMEOUT_MS,
  );

  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLocaleFromPathname(pathname: string): Locale | null {
  return (
    LOCALES.find(
      (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
    ) ?? null
  );
}

function stripLocaleFromPathname(pathname: string, locale: Locale): string {
  if (pathname === `/${locale}`) return "/";
  if (pathname.startsWith(`/${locale}/`))
    return pathname.slice(locale.length + 1);
  return pathname;
}

function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "127.0.0.1";
}

/**
 * Traffic that must never be volumetrically rate-limited.
 *
 * The threat model for the shield is the public internet. These sources are not
 * it, and throttling them breaks the system rather than protecting it:
 *
 *  - **Loopback / no forwarding header at all.** Service-to-service calls inside
 *    the Docker network (tank-vision-worker posting telemetry several times a
 *    second, MediaMTX hooks, the archive ingest) arrive with no
 *    x-forwarded-for, so they all shared ONE 400-req/min bucket keyed
 *    `ip:127.0.0.1`. Blocking that bucket does not stop an attacker; it stops
 *    the house watching itself.
 *  - **RFC1918 / ULA private addresses.** That is this building: the admin
 *    machine and, critically, the OBS instance whose browser source is the
 *    24/7 broadcast. An OBS browser source polls camera state, director state,
 *    attention and audio metrics continuously and can clear 400 req/min on its
 *    own — a 429 there replaces the live programme on Twitch, Kick, Trovo and
 *    YouTube with a JSON error page.
 *
 * A real flood always arrives from a routable public address, which is still
 * limited. This is a deliberate exemption, not an oversight.
 */
function isTrustedSourceIp(ip: string): boolean {
  const addr = ip.replace(/^::ffff:/i, "").trim();
  if (!addr || addr === "localhost") return true;
  if (addr === "127.0.0.1" || addr === "::1") return true;
  if (addr.startsWith("127.")) return true;
  if (addr.startsWith("10.")) return true;
  if (addr.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/i.test(addr)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(addr)) return true;
  return false;
}

/**
 * Is this request carrying a signed-in session?
 *
 * Cookie presence only — no network call, because this runs on the hot path of
 * every request. It does not prove the session is valid or that the user is an
 * admin, and it is not used for authorisation: it only selects a more generous
 * rate-limit tier. The worst case is an attacker sending a junk auth cookie to
 * buy a higher ceiling, which is a far smaller problem than throttling the
 * operator out of their own console mid-broadcast.
 */
function hasAuthSession(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-unenter-auth-token") && cookie.value) return true;
  }
  return false;
}

/**
 * The ceiling for a signed-in client.
 *
 * Thresholds are ~5x the anonymous tier because the workload genuinely is. The
 * house console, director configurator and camera grid each poll several
 * endpoints on short intervals, and an operator commonly has two or three of
 * them open at once; 400 req/min across all of that is an afternoon's normal
 * use, not an attack. The block is also much shorter — an operator who somehow
 * does trip it is mid-broadcast, and five minutes off-air is not an acceptable
 * price for a heuristic.
 */
const authenticatedRateLimiter = new SlidingWindowLimiter({
  maxRequestsBeforeChallenge: 600,
  maxRequestsBeforeBlock: 2_000,
  blockDurationMs: 30_000,
});

/** Anonymous traffic keeps the strict tier; a signed-in session gets the wider one. */
function limiterFor(request: NextRequest): SlidingWindowLimiter {
  return hasAuthSession(request) ? authenticatedRateLimiter : globalRateLimiter;
}

function shouldCheckShield(request: NextRequest, normalizedHost: string, clientIp: string): boolean {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api/shield") ||
    path.startsWith("/__status-api") ||
    path.startsWith("/storage/v1") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|mp3|mp4|m3u8|ts)$/i.test(path)
  ) {
    return false;
  }
  // Testing trigger via query param ?__shield=1 or header
  if (request.nextUrl.searchParams.has("__shield")) return true;
  if (request.headers.get("x-unt-shield") === "1") return true;

  // Global attack mode trigger
  if (process.env["SHIELD_MODE"] === "under_attack") return true;

  // ── Scope 1: LABS ZONE — always challenge unverified visitors on load.
  // Disabled for a few hours on 2026-09-04 after the solver hung past 5s,
  // but that was a workaround, not a fix — the real problem was
  // crypto.subtle.digest()'s per-attempt async dispatch cost, not the
  // trigger itself. Restored now that the solver is a synchronous SHA-256
  // (src/lib/shield/sha256.ts / mirrored in shield/template.ts) with no
  // per-attempt async overhead, verified correct against Node's own
  // crypto.createHash and fast enough (~450k hashes/sec, Node/V8 single
  // core) to clear difficulty 4 in well under a second on real hardware.
  const isLabs = getZoneFromHost(normalizedHost) === "labs";
  if (isLabs) return true;

  // ── Rate-limit burst trigger (Automated bot / brute force defense) ──────
  // Read the SAME tier the limiter itself used. Reading the anonymous bucket
  // for a signed-in operator would hand them a proof-of-work challenge on the
  // strict threshold they were deliberately exempted from, which is the same
  // lockout wearing a different hat.
  if (isTrustedSourceIp(clientIp)) return false;
  if (limiterFor(request).check(clientIp).challengeRequired) return true;

  return false;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  // Prefer x-forwarded-host (set by NPM/OpenResty) over host so the zone
  // resolver sees the original public hostname even when the reverse proxy
  // rewrites the Host header to the upstream service address.
  const rawHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    "";
  const normalizedHost = normalizeHost(rawHost);
  const canonicalHost = getCanonicalHost(normalizedHost);
  const isLocal = isLocalDevelopmentHost(normalizedHost);
  const clientIp = getClientIp(request);

  // ── 1. www → canonical redirect ───────────────────────────────────────────
  // Never applied to /api/*. Two reasons, both load-bearing:
  //
  //   1. Service-to-service calls arrive with a container hostname in the Host
  //      header (unt_tank, dev-tank, unt_mediamtx). getCanonicalHost has no
  //      idea what those are, so it resolves them to www.unenter.live and the
  //      caller is bounced off the private network to the public one.
  //   2. A 301 on a POST is silently destructive — most clients (BusyBox wget
  //      among them) re-issue as GET and drop the body, so the request "works"
  //      and does nothing.
  //
  // An API is called by machines that already know the URL they want; there is
  // nothing to canonicalise for SEO. Browsers hitting a page still redirect.
  const isApiPath = url.pathname.startsWith("/api/");

  if (!isLocal && !isApiPath && normalizedHost !== canonicalHost) {
    url.hostname = canonicalHost;
    url.port = ""; // strip internal container port — public URL has none
    return NextResponse.redirect(url, 301);
  }

  // ── 1a. WAF Threat Inspection (SQLi, Traversal, Malicious Scanners) ────────
  const wafCheck = inspectRequest(request.url, request.headers.get("user-agent"));
  if (!wafCheck.clean) {
    return new NextResponse(
      JSON.stringify({
        error: "Forbidden: Request blocked by Unenter Edge WAF",
        reason: wafCheck.reason,
        threat: wafCheck.threatType,
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Unt-Waf-Action": "BLOCK",
        },
      }
    );
  }

  // ── 1b. Rate Limiter (Subnet Aggregator & Hard DDoS Block) ─────────────────
  const isStatic =
    url.pathname.startsWith("/_next") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|mp3|mp4|m3u8|ts)$/i.test(url.pathname);

  // Trusted sources are exempt outright — see isTrustedSourceIp. Signed-in
  // sessions get a far higher ceiling than anonymous traffic: an operator with
  // the house console, the director configurator and a couple of camera tabs
  // open is legitimately the heaviest client on the site, and is exactly who
  // must never be locked out of it.
  const limiter = limiterFor(request);

  if (!isStatic && !url.pathname.startsWith("/api/shield") && !isTrustedSourceIp(clientIp)) {
    limiter.record(clientIp);
    const rateStatus = limiter.check(clientIp);
    if (rateStatus.isBlocked) {
      return new NextResponse(
        JSON.stringify({
          // Says per-client, because it IS per-client: aggregateBySubnet has
          // defaulted false since 2026-09-03. The old "Subnet rate limit"
          // wording sent an admin hunting for a network-wide cause when the
          // block was on their own single address.
          error: "Too Many Requests: rate limit exceeded for this client. Cooling down.",
          retryAfterMs: rateStatus.resetMs,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": Math.ceil(rateStatus.resetMs / 1000).toString(),
          },
        }
      );
    }
  }

  // ── 1c. Edge Shield Bot Verification (In-Place Interstitial) ─────────────
  if (shouldCheckShield(request, normalizedHost, clientIp)) {
    const clearanceCookie = request.cookies.get(SHIELD_COOKIE_NAME)?.value;
    const isVerified = clearanceCookie
      ? (await verifyClearanceToken(clearanceCookie, normalizedHost, clientIp)).valid
      : false;

    if (!isVerified) {
      // Difficulty is per-zone: labs (research) solves a harder puzzle than
      // tank (livestream). The clearance TTL that follows a successful solve
      // is resolved from the same policy inside signClearanceToken.
      const { difficulty } = getShieldPolicyForHost(normalizedHost);
      const { challenge, serialized } = await createShieldChallenge(
        normalizedHost,
        clientIp,
        difficulty
      );
      const html = renderShieldVerificationHtml(challenge, serialized);
      return new NextResponse(html, {
        status: 429,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Unenter-Ray": challenge.rayId,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }
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
  const zoneFromHost: string =
    isLocal && !isDevZoneHost(normalizedHost)
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
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
          sameSite: "lax",
          secure: true,
        });
      }
      return redirectResponse;
    }
  }

  // ── 3. Locale stripping ───────────────────────────────────────────────────
  // ── 4. Build mutated request headers ─────────────────────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ZONE_HEADER, zoneFromHost);
  requestHeaders.set(SITE_HOST_HEADER, canonicalHost);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);

  // Richer zone-request context for server components + the zone-aware 404.
  // One typed contract computed once here; downstream reads it instead of
  // recomputing zone facts from the host.
  const zoneCtx = buildZoneContext({
    host: normalizedHost,
    pathname: effectivePathname,
    isLocal,
  });
  requestHeaders.set(CORE_HOST_HEADER, zoneCtx.isCoreHost ? "1" : "0");
  if (zoneCtx.promotionStatus)
    requestHeaders.set(PROMOTION_STATUS_HEADER, zoneCtx.promotionStatus);
  if (zoneCtx.promotedToZone)
    requestHeaders.set(PROMOTION_ZONE_HEADER, zoneCtx.promotedToZone);

  // ── 4b. Agent Identity Headers ────────────────────────────────────────────
  // If the request carries an Authorization: Bearer <token> where the token
  // looks like an Agent Access Token (has a spiffe_id claim), inject lightweight
  // headers so server components can identify the acting agent without re-parsing.
  //
  // This is a DISPLAY / ROUTING hint only — NOT an authorization decision.
  // Actual cryptographic verification is the responsibility of the individual
  // API route or server component that handles the sensitive operation.
  //
  // We decode (not verify) in middleware because:
  //   a) Edge Runtime cannot load the CA RSA key cheaply on every request
  //   b) This runs on the hot path — we cannot afford the async key load
  //   c) The headers are informational; auth is enforced at the resource layer
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const rawToken = authHeader.slice(7);
      const parts = rawToken.split(".");
      if (parts.length === 3) {
        const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const pad = (4 - (padded.length % 4)) % 4;
        const payload = JSON.parse(atob(padded + "=".repeat(pad))) as Record<string, unknown>;
        // Only treat as an agent token if it has our custom spiffe_id claim
        if (typeof payload.spiffe_id === "string" && payload.spiffe_id.startsWith("spiffe://")) {
          requestHeaders.set("x-agent-spiffe-id", payload.spiffe_id);
          if (typeof payload.sub === "string" && payload.sub.startsWith("spiffe://")) {
            // Self-auth: sub is the agent itself
            requestHeaders.set("x-agent-mode", "self");
            requestHeaders.set("x-agent-id", payload.spiffe_id);
          } else if (typeof payload.sub === "string" && typeof payload.user_id === "string") {
            // Delegated: sub is the user, act.sub is the agent
            requestHeaders.set("x-agent-mode", "delegated");
            requestHeaders.set("x-agent-id", payload.spiffe_id);
            requestHeaders.set("x-agent-user-id", payload.user_id);
          }
        }
      }
    } catch {
      // Malformed bearer token — ignore silently, don't set agent headers
    }
  }

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
  const zonePrimaryPrefix =
    nonRootPrefixes.length === 1 ? nonRootPrefixes[0] : null;

  // Inside a flattened zone image (NEXT_PUBLIC_ZONE baked at build time), the
  // zone's overlay pages are ROOT-mounted — the static ZONES prefixes describe
  // the core monolith layout only. Injecting the prefix there 302s "/" into the
  // zone's [slug] route (e.g. blog.unenter.live/ → /blog → "Post Not Found").
  //
  // 2026-07-29: this check was already correct in source but the running
  // blog image kept 302-redirecting EVERY request — including _next/static/*
  // and public assets — to /blog/*, 404ing them all (unstyled page, broken
  // images). A `unaxis zone blog build` alone did not fix it; only rebuilt
  // after this exact file's content changed did the fix take. Conclusion:
  // Next's own incremental build cache can survive a "fresh" Docker build and
  // keep emitting a stale middleware bundle when none of the COPYed source
  // files changed since the cache was seeded. If a zone is behaving like an
  // older version of this file after a build, don't trust it — touch
  // middleware.ts (or `unaxis zone <key> rebuild` for a real --no-cache pass)
  // before assuming the bug is somewhere else.
  const isOwnZoneImage = process.env.NEXT_PUBLIC_ZONE === zoneFromHost;

  const needsZonePrefixRewrite =
    !isLocal &&
    !isOwnZoneImage &&
    normalizedHost === zoneConfig.host &&
    normalizedHost !== CORE_DOMAIN && // core (incl. www) never needs path-prefix injection
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
      url.pathname === "/"
        ? zonePrimaryPrefix
        : `${zonePrimaryPrefix}${url.pathname}`;
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
  response.headers.set(ZONE_HEADER, zoneFromHost);
  response.headers.set(SITE_HOST_HEADER, canonicalHost);
  response.headers.set(CORE_HOST_HEADER, zoneCtx.isCoreHost ? "1" : "0");

  // ── 6. Set locale cookie if missing / stale ───────────────────────────────
  if (locale) {
    const existing = request.cookies.get(LOCALE_COOKIE)?.value;
    if (existing !== locale) {
      response.cookies.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
        secure: !isLocal,
      });
    }
  }

  // ── 7. Supabase auth + protected route enforcement ───────────────────────
  const supabaseResponse = { current: response };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Must match utils/supabase/server.ts and utils/supabase/client.ts —
      // see the comment there. Without a pinned name, this client (built
      // from the internal kong:8000 URL) and the browser client (built from
      // the public db.unenter.live URL) derive different default cookie
      // names and never share a session.
      //
      // domain: shares the session across every *.unenter.live subdomain —
      // see utils/supabase/server.ts for the full story. Gated off for
      // local/dev-container hosts the same way the locale cookie's `secure`
      // flag is above (isLocal), since Domain=.unenter.live is invalid on
      // a bare `localhost` request.
      cookieOptions: {
        name: "sb-unenter-auth-token",
        domain: isLocal ? undefined : `.${CORE_DOMAIN}`,
      },
      global: {
        fetch: fetchAuthWithDeadline,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Refresh Supabase auth cookies on each request.
          // Must preserve any rewrite target so zone-subdomain routing isn't lost.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          requestHeaders.set("cookie", request.cookies.toString());
          const refreshed = createRoutedResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshed.cookies.set(name, value, {
              ...options,
              ...(isLocal ? {} : { domain: `.${CORE_DOMAIN}` }),
            }),
          );
          // Carry over our zone headers
          refreshed.headers.set(ZONE_HEADER, zoneFromHost);
          refreshed.headers.set(SITE_HOST_HEADER, canonicalHost);
          refreshed.headers.set(
            CORE_HOST_HEADER,
            zoneCtx.isCoreHost ? "1" : "0",
          );
          supabaseResponse.current = refreshed;
        },
      },
    },
  );

  // Public-first outage resilience: if the auth backend (kong) is unreachable,
  // an auth check must NEVER take the whole site down. Degrade to logged-out —
  // public pages keep serving; protected routes redirect to sign-in as usual.
  //
  // Race against a hard deadline, not just a try/catch. Confirmed live
  // 2026-09-02: a malformed stored session (missing its `.user` field) can
  // make @supabase/auth-js's internal session-recovery path throw inside a
  // detached promise that this call's own try/catch never sees — the request
  // hangs with no response at all, which nginx eventually reports as a 502.
  // The auto-recovery block below (purges stale cookies so the NEXT request
  // is clean) already exists for exactly this class of problem, but only
  // runs once `authError` is set — a hang that never resolves or rejects
  // skips it entirely, permanently stranding whichever visitor's cookie hit
  // it (nothing a real user would ever think to "clear cookies" over). The
  // race below guarantees this block is always reached within
  // AUTH_FETCH_TIMEOUT_MS regardless of why the underlying call misbehaves,
  // so any visitor who hits this self-heals on their very next request
  // instead of needing to know how to clear a browser cookie.
  let user: { id: string } | null = null;
  // "This token is definitively bad" and "I could not check right now" are
  // different facts and must not share a flag.
  //
  // They did, and the purge below acted on both — so a 4-second timeout during
  // a deploy (exactly when Kong and GoTrue are slowest) wiped every auth cookie
  // the visitor had. That is why a rebuild signed everyone out: not an expiry,
  // a restart being mistaken for a rejection.
  let authRejected = false;
  try {
    const { data, error } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth check deadline exceeded")), AUTH_FETCH_TIMEOUT_MS),
      ),
    ]);
    if (error) {
      // Only an explicit 401/403 means the credential itself was refused.
      // Anything else — 5xx, a socket error, GoTrue restarting — is the auth
      // backend being unavailable, and the session is very probably fine.
      const status = (error as { status?: number }).status;
      authRejected = status === 401 || status === 403;
    } else {
      user = data.user;
    }
  } catch {
    // Timeout or network failure. Degrade to signed-out for THIS request so
    // public pages keep serving, but never destroy the cookies over it.
    user = null;
  }

  const finalResponse = supabaseResponse.current;

  // Auto-recovery for stale/corrupted cookies (Webkit/Brave deploy recovery):
  // If an auth cookie is present in the request but Supabase fails/rejects it
  // (e.g. after a deploy, session invalidation, or corrupted cookie chunks),
  // immediately purge the stale cookies from the response (both domain and host-only)
  // so the client never enters an infinite redirect loop or HTTP 431 header overflow.
  if (!user && authRejected) {
    const authCookieNames = [
      "userRole",
      "userRoleUserId",
      "userDisplayName",
      "userPermissions",
      "rememberMe",
      "authAt",
      "lastPage",
      "sb-unenter-auth-token",
      "sb-unenter-auth-token-code-verifier",
      "sb-unenter-auth-token.0",
      "sb-unenter-auth-token.1",
      "sb-unenter-auth-token.2",
      "sb-unenter-auth-token.3",
      "sb-unenter-auth-token.4",
      "sb-unenter-auth-token.5",
    ];

    for (const name of authCookieNames) {
      if (request.cookies.has(name)) {
        finalResponse.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
        if (!isLocal) {
          finalResponse.cookies.set(name, "", {
            path: "/",
            domain: `.${CORE_DOMAIN}`,
            secure: true,
            sameSite: "lax",
            maxAge: 0,
            expires: new Date(0),
          });
        }
      }
    }
  }

  // Protect zones that require auth + individual protected routes.
  // Research checkout is gated at the route level (not the whole labs zone —
  // catalog browsing stays public) so a "researcher" must sign in only when
  // they try to check out, matching the shop's guest-checkout-allowed model.
  const isLabsResearchCheckout =
    zoneFromHost === "labs" &&
    effectivePathname.startsWith("/research-checkout");
  // Shared with the session policy so the auth gate and the freshness ceiling
  // cover exactly the same paths. Previously this was /admin only, which left
  // /director-configuration and /director returning 200 to anyone.
  const isTankBackstage =
    zoneFromHost === "tank" && isTankBackstagePath(effectivePathname);
  const routeIsProtected =
    zoneConfig.requiresAuth ||
    isProtectedRoute(effectivePathname) ||
    isLabsResearchCheckout ||
    isTankBackstage;

  // Per-zone session freshness. Every zone shares one session cookie, so a
  // zone cannot expire it — instead each zone decides how recent a sign-in has
  // to be before it will accept it. Tank has no limit (remember the viewer
  // until they clear cookies); core expires weekly because that is where admin
  // and billing live. See src/lib/auth/sessionPolicy.ts.
  //
  // Crucially this does NOT sign the user out — the shared session stays
  // valid, so core going stale never logs anyone out of Tank. It only sends
  // them to re-authenticate for the zone that asked.
  const authAtRaw = request.cookies.get("authAt")?.value;
  const parsedAuthAt = authAtRaw ? Number.parseInt(authAtRaw, 10) : Number.NaN;
  const freshness = evaluateSessionFreshness({
    zone: zoneCtx.isCoreHost ? "core" : sessionPolicyKey(zoneFromHost, effectivePathname),
    signedIn: Boolean(user),
    authAtSeconds: Number.isFinite(parsedAuthAt) ? parsedAuthAt : null,
  });

  const needsSignIn = routeIsProtected && !user;
  const needsReauth = routeIsProtected && Boolean(user) && !freshness.fresh;

  if (needsSignIn || needsReauth) {
    if (isLocal) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = "/sign-in";
      signInUrl.searchParams.set("next", url.pathname);
      if (needsReauth) signInUrl.searchParams.set("reason", "session-expired");
      return NextResponse.redirect(signInUrl);
    }

    const signInUrl = new URL(`https://auth.${CORE_DOMAIN}/sign-in`);
    const publicNextUrl = `https://${canonicalHost}${url.pathname}${url.search}`;
    signInUrl.searchParams.set("next", publicNextUrl);
    if (needsReauth) signInUrl.searchParams.set("reason", "session-expired");
    return NextResponse.redirect(signInUrl);
  }

  // ── 8. Global legacy cookie sanitation ──────────────────────────────────
  // Scrub legacy Tank UI cookies and heavy JSON bloat from HTTP headers so they
  // never bloat requests or trigger HTTP 431 / proxy buffer overflow errors.
  const LEGACY_COOKIE_NAMES = [
    "tank_mobile_chat_size",
    "tank_room_mode",
    "tank_room_slug",
    "tank_chat_target",
    "tank_room_origin",
    "tank_background_theme",
    "userPermissions",
  ];

  for (const name of LEGACY_COOKIE_NAMES) {
    if (request.cookies.has(name)) {
      finalResponse.cookies.delete(name);
      if (!isLocal) {
        finalResponse.cookies.set(name, "", {
          path: "/",
          domain: `.${CORE_DOMAIN}`,
          maxAge: 0,
          sameSite: "lax",
        });
      }
    }
  }

  return finalResponse;
}

// ── Matcher ───────────────────────────────────────────────────────────────────
// Skip Next.js internals, static assets, and common image/font extensions.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.ico|opengraph-image|twitter-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)$).*)",
  ],
};
