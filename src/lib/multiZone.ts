// src/lib/multiZone.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for multi-zone architecture.
//
// ZONE MAP
// ─────────────────────────────────────────────────────────────────────────────
//  Zone         Host                        Port   Owns
//  ──────────   ──────────────────────────  ─────  ───────────────────────────
//  unenter      www.unenter.live            3000   /, /about, /services, etc.
//  auth         auth.unenter.live           3000   /sign-in, /sign-up, /auth, /forgot-password, /reset-password
//  dashboard    dashboard.unenter.live      3001   /dashboard/**
//  shop         shop.unenter.live           3002   /shop, /products, /checkout
//  app          app.unenter.live            3003   /profile, /settings, /client
//
// NOTE: www.unenter.live is canonical for core — NPM routes www, not bare apex.
//       Bare apex (unenter.live) redirects to www. Never the other way around.
//
// All zones currently run as one Next.js instance. The proxy routes by Host
// header. When a zone is split into its own deployment, only its port changes
// in the proxy — nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const CORE_DOMAIN = "unenter.live" as const;
export const ZONE_HEADER = "x-unenter-zone" as const;
export const SITE_HOST_HEADER = "x-unenter-host" as const;

// ── Zone definitions ──────────────────────────────────────────────────────────

export type ZoneName =
  | "unenter"
  | "auth"
  | "blog"
  | "dashboard"
  | "shop"
  | "app"
  | "tank";

export interface ZoneConfig {
  /** Zone identifier */
  name: ZoneName;
  /** Canonical public hostname */
  host: string;
  /** Internal container/process port */
  port: number;
  /**
   * Route prefixes this zone owns.
   * The proxy and middleware use these to enforce ownership.
   * Order matters — more-specific prefixes first.
   */
  routePrefixes: string[];
  /** Require authenticated Supabase session for every route in this zone. */
  requiresAuth: boolean;
}

export const ZONES: Record<ZoneName, ZoneConfig> = {
  unenter: {
    name: "unenter",
    // Internal routing key only — NOT the public canonical URL.
    // The public URL is www.unenter.live (see getCanonicalHost).
    // Keeping this as bare CORE_DOMAIN so the middleware's zone-prefix-rewrite
    // guard (normalizedHost === zoneConfig.host) never fires for www requests.
    host: CORE_DOMAIN,
    port: 3000,
    routePrefixes: [
      "/",
      "/about",
      "/services",
      "/contact",
      "/jobs",
      "/blog",
      "/legal",
      "/en",
      "/de",
      "/share",
      "/error",
    ],
    requiresAuth: false,
  },

  auth: {
    name: "auth",
    host: `auth.${CORE_DOMAIN}`,
    port: 3000, // monolith for now — same flat-overlay pattern as blog/tank
    routePrefixes: [
      "/sign-in",
      "/sign-up",
      "/auth",
      "/forgot-password",
      "/reset-password",
      "/mfa-challenge",
    ],
    requiresAuth: false,
  },

  blog: {
    name: "blog",
    host: `blog.${CORE_DOMAIN}`,
    port: 3000, // monolith for now — update when split
    routePrefixes: ["/blog"],
    requiresAuth: false,
  },

  dashboard: {
    name: "dashboard",
    host: `dashboard.${CORE_DOMAIN}`,
    port: 3001,
    routePrefixes: ["/dashboard"],
    requiresAuth: true,
  },

  shop: {
    name: "shop",
    host: `shop.${CORE_DOMAIN}`,
    port: 3002,
    routePrefixes: [
      "/shop",
      "/products",
      "/checkout",
      "/collections",
      "/cart",
      "/u", // user-facing shop profile
    ],
    requiresAuth: false,
  },

  app: {
    name: "app",
    host: `app.${CORE_DOMAIN}`,
    port: 3003,
    routePrefixes: ["/profile", "/settings", "/client", "/protected"],
    requiresAuth: true,
  },

  tank: {
    name: "tank",
    host: `tank.${CORE_DOMAIN}`,
    port: 3000,
    routePrefixes: ["/"],
    requiresAuth: false,
  },
} as const;

// ── Promotion registry ──────────────────────────────────────────────────────
// A "Zone Promotion" is an intentional mapping of a Core-domain path to a
// dedicated zone subdomain (e.g. unenter.live/shop → shop.unenter.live).
//
// This registry is the BRAIN of routing. Middleware (the gate) reads it to
// decide what happens to an old Core path; the 404 (the fallback) reads it to
// offer useful recovery. It is plain data — no runtime cost, trivially testable.
//
// The lifecycle the user described, encoded as `status`:
//   • Before a zone is live  → status: "first-class"  → Core path stays served.
//   • Once the zone is live   → status: "redirect"     → Core path 308s to the zone.
// So "if no zone then /shop is available; if zone then redirect" is just data:
// flip the status when the subdomain goes live. Nothing else changes.

export type PromotionStatus =
  | "first-class" // Core keeps serving this path; the zone is an alias, not a move.
  | "compat" // Core still serves it, but UI links should point at the zone.
  | "handoff" // Core renders <MovedToZone> — a soft, user-acknowledged move.
  | "redirect" // Middleware 308-redirects Core → zone host (the section moved).
  | "deprecated"; // Explicitly legacy: scheduled for removal, no longer first-class.

export interface ZonePromotion {
  /** Core path prefix being promoted. Matches `path === from` or `path/...`. */
  from: string;
  /** Destination zone key (must exist in ZONES, or be a live scaffolded zone). */
  toZone: ZoneName;
  /** How the old Core path behaves. See PromotionStatus. */
  status: PromotionStatus;
  /**
   * Where `from` lands on the zone. Defaults to `from` (identity — same path on
   * the zone host). Override when the zone serves the section at a different
   * mount point. The shop landing moved to the zone ROOT, so it maps "/shop"→"/".
   * Any sub-path after `from` is preserved and appended.
   */
  toPath?: string;
}

/**
 * Live promotions. Shop is our first functional promoted zone — its storefront
 * paths now live at shop.unenter.live. The landing maps to the zone root; the
 * other storefront sections keep their path on the zone host.
 *
 * NOT promoted here (intentionally first-class / shared): "/u" — the public
 * profile + the /u/img and /u/doc service-role streaming routes are consumed
 * server-to-server on Core too, so redirecting them would break image/doc fetch.
 *
 * Auth is the second promoted zone — auth.unenter.live now owns the shared
 * (auth-pages) route group and src/app/auth/* handlers exclusively; Core's
 * copies redirect there instead of serving in parallel.
 */
export const ZONE_PROMOTIONS: ZonePromotion[] = [
  { from: "/shop", toZone: "shop", status: "redirect", toPath: "/" },
  { from: "/products", toZone: "shop", status: "redirect" },
  { from: "/collections", toZone: "shop", status: "redirect" },
  { from: "/checkout", toZone: "shop", status: "redirect" },
  { from: "/cart", toZone: "shop", status: "redirect" },
  { from: "/sign-in", toZone: "auth", status: "redirect" },
  { from: "/sign-up", toZone: "auth", status: "redirect" },
  { from: "/auth", toZone: "auth", status: "redirect" },
  { from: "/forgot-password", toZone: "auth", status: "redirect" },
  { from: "/reset-password", toZone: "auth", status: "redirect" },
];

/** Find the promotion entry that owns this pathname (longest `from` wins). */
export function getPromotionForPath(pathname: string): ZonePromotion | null {
  let best: ZonePromotion | null = null;
  for (const p of ZONE_PROMOTIONS) {
    if (pathname === p.from || pathname.startsWith(`${p.from}/`)) {
      if (!best || p.from.length > best.from.length) best = p;
    }
  }
  return best;
}

/** Join a zone base path with the remainder after the matched `from` prefix. */
function joinZonePath(base: string, rest: string): string {
  if (base === "/" || base === "") return rest || "/";
  return rest ? `${base}${rest}` : base;
}

/**
 * Resolve a Core path to its promoted-zone redirect target, or null when no
 * `redirect` promotion applies. ONLY the caller (middleware) decides host
 * context — this is a pure path/zone computation.
 *
 *   resolvePromotionRedirect("/shop")        → { zone:"shop", path:"/" }
 *   resolvePromotionRedirect("/shop/sale")   → { zone:"shop", path:"/sale" }
 *   resolvePromotionRedirect("/products")    → { zone:"shop", path:"/products" }
 *   resolvePromotionRedirect("/products/42") → { zone:"shop", path:"/products/42" }
 *   resolvePromotionRedirect("/about")       → null
 */
export function resolvePromotionRedirect(
  pathname: string,
): { zone: ZoneName; path: string } | null {
  const p = getPromotionForPath(pathname);
  if (!p || p.status !== "redirect") return null;
  const rest = pathname.slice(p.from.length); // "" or "/sub/path"
  const base = p.toPath ?? p.from;
  return { zone: p.toZone, path: joinZonePath(base, rest) };
}

// ── Zone request context ──────────────────────────────────────────────────────
// A single typed contract that middleware computes once and server/client code
// reads back, instead of every layer recomputing zone facts from the host.

export interface ZoneRequestContext {
  /** Resolved zone key for this request. */
  zone: string;
  /** Normalized request host (no port). */
  host: string;
  /** Canonical host this request should be served from. */
  canonicalHost: string;
  /** True when the request is on the Core domain (www/apex), not a zone subdomain. */
  isCoreHost: boolean;
  /** True for localhost / dev.* hosts (path-based zone detection). */
  isLocal: boolean;
  /** If the current path is a promoted Core path, its promotion status. */
  promotionStatus?: PromotionStatus;
  /** If promoted, the destination zone key. */
  promotedToZone?: ZoneName;
}

/**
 * Build the zone request context from primitive request facts. Pure — safe to
 * call from middleware (Edge) and to mirror into headers for downstream readers.
 */
export function buildZoneContext(args: {
  host: string | null | undefined;
  pathname: string;
  isLocal: boolean;
}): ZoneRequestContext {
  const host = normalizeHost(args.host);
  const canonicalHost = getCanonicalHost(host);
  // Public dev containers have a real zone-bearing hostname
  // (dev.<zone>.unenter.live). Only bare localhost-style requests need
  // path-based detection; otherwise every dev zone's root resolves to Core.
  const usesPathZone = args.isLocal && !isDevZoneHost(host);
  const zone = usesPathZone
    ? getZoneFromPathname(args.pathname)
    : getZoneFromHost(host);
  const isCoreHost =
    host === CORE_DOMAIN ||
    host === `www.${CORE_DOMAIN}` ||
    (usesPathZone && getZoneFromPathname(args.pathname) === "unenter") ||
    zone === "unenter";

  const promo = getPromotionForPath(args.pathname);
  return {
    zone,
    host,
    canonicalHost,
    isCoreHost,
    isLocal: args.isLocal,
    promotionStatus: promo?.status,
    promotedToZone: promo?.toZone,
  };
}

// ── Promotion context headers ──────────────────────────────────────────────
// Middleware sets these so server components / the 404 can read the same facts.
export const CORE_HOST_HEADER = "x-unenter-core-host" as const; // "1" | "0"
export const PROMOTION_STATUS_HEADER = "x-unenter-promotion" as const; // PromotionStatus
export const PROMOTION_ZONE_HEADER = "x-unenter-promoted-to" as const; // ZoneName

// ── Host / zone resolution ────────────────────────────────────────────────────

function stripPort(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return stripPort(host);
}

/**
 * Returns the zone key for a given public host.
 *
 * For zones in the static ZONES map, returns the ZoneName.
 * For dynamically scaffolded zones (not in ZONES but on *.unenter.live),
 * returns the subdomain key — e.g. "logs" for logs.unenter.live.
 * Falls back to "unenter" for anything unrecognised.
 */
export function getZoneFromHost(host: string | null | undefined): string {
  const h = normalizeHost(host);

  // Direct match against known zone hosts
  for (const zone of Object.values(ZONES)) {
    if (h === zone.host) return zone.name;
  }

  // www redirect → core
  if (h === `www.${CORE_DOMAIN}`) return "unenter";

  // Dev-subdomain fallback: strip "dev." prefix and re-resolve.
  // e.g.  dev.blog.unenter.live  →  blog.unenter.live  →  "blog"
  //       dev.unenter.live       →  unenter.live        →  "unenter"
  // This is belt-and-suspenders — isLocalDevelopmentHost should catch these
  // first so the middleware uses path-based detection, but if it ever reaches
  // getZoneFromHost we still return the right zone instead of "unenter".
  if (h.startsWith("dev.")) {
    const stripped = h.slice(4); // remove "dev."
    for (const zone of Object.values(ZONES)) {
      if (stripped === zone.host) return zone.name;
    }
    if (stripped === CORE_DOMAIN) return "unenter";
  }

  // Dynamic zone: any *.unenter.live subdomain not in the static map is a
  // scaffolded zone. Return the subdomain key so the zone header is accurate.
  if (h.endsWith(`.${CORE_DOMAIN}`)) {
    const key = h.slice(0, h.length - CORE_DOMAIN.length - 1);
    if (key && key !== "www") return key;
  }

  return "unenter";
}

/**
 * Returns the ZoneConfig for a known zone, or a safe default config for
 * dynamically scaffolded zones not in the static ZONES map.
 *
 * Use this instead of ZONES[key] wherever code must handle any zone —
 * middleware, layout resolution, auth checks, etc.
 */
export function getZoneConfig(key: string): ZoneConfig {
  if (key in ZONES) return ZONES[key as ZoneName];
  // Dynamic zone default: public, root-mounted, no auth required.
  return {
    name: key as ZoneName,
    host: `${key}.${CORE_DOMAIN}`,
    port: 3000,
    routePrefixes: ["/"],
    requiresAuth: false,
  };
}

/**
 * Resolve the canonical public host.
 *
 * www.unenter.live is canonical — NPM only has a proxy host for www, not bare
 * apex.  Bare apex requests are rare (direct-IP, old bookmarks) and should
 * redirect to www.  All other zone subdomains are their own canonical.
 */
export function getCanonicalHost(host: string | null | undefined): string {
  const h = normalizeHost(host);
  // Both www and bare apex → canonical is www
  if (h === CORE_DOMAIN || h === `www.${CORE_DOMAIN}`)
    return `www.${CORE_DOMAIN}`;
  // Known zone host → return as-is
  for (const zone of Object.values(ZONES)) {
    if (h === zone.host) return h;
  }
  // Any other subdomain of the core domain is canonical for itself —
  // handles dynamically scaffolded zones that aren't in the static ZONES map.
  // Without this, new zones redirect to www.unenter.live on their first request.
  if (h.endsWith(`.${CORE_DOMAIN}`)) return h;
  return `www.${CORE_DOMAIN}`;
}

/** Given a URL pathname, returns the zone that owns it. */
export function getZoneFromPathname(pathname: string): ZoneName {
  // Check specific zones first (dashboard, shop, app, auth before unenter)
  const ordered: ZoneName[] = ["dashboard", "shop", "app", "auth", "unenter"];
  for (const name of ordered) {
    const zone = ZONES[name];
    for (const prefix of zone.routePrefixes) {
      if (prefix === "/") continue; // unenter's "/" is a catch-all — check last
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return name;
      }
    }
  }
  return "unenter"; // default
}

/** Returns the canonical base URL for a zone. */
export function getZoneBaseUrl(zoneName: ZoneName): string {
  return `https://${ZONES[zoneName].host}`;
}

/**
 * Determines whether a href navigates to a different zone.
 * Use this to decide whether to use <a> (cross-zone) vs <Link> (same-zone).
 */
export function isCrossZoneHref(currentZone: ZoneName, href: string): boolean {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    // Absolute URL — compare hostname
    try {
      const url = new URL(href);
      return getZoneFromHost(url.hostname) !== currentZone;
    } catch {
      return false;
    }
  }
  if (!href.startsWith("/")) return false;
  return getZoneFromPathname(href) !== currentZone;
}

/**
 * Builds a full cross-zone URL.
 * e.g. crossZoneUrl("dashboard", "/dashboard/123") → "https://dashboard.unenter.live/dashboard/123"
 */
export function crossZoneUrl(zone: ZoneName, pathname: string): string {
  return `${getZoneBaseUrl(zone)}${pathname}`;
}

// ── Local-dev helpers ─────────────────────────────────────────────────────────

export function isDevZoneHost(host: string): boolean {
  return (
    host.startsWith("dev.") &&
    (host === `dev.${CORE_DOMAIN}` || host.endsWith(`.${CORE_DOMAIN}`))
  );
}

export function isLocalDevelopmentHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    // Any dev.* subdomain under the core domain — covers ALL dev containers:
    //   dev.unenter.live        (core dev container)
    //   dev.blog.unenter.live   (blog zone dev container)
    //   dev.shop.unenter.live   (shop zone dev container)
    //   dev.dashboard.unenter.live  (dashboard zone dev container)
    // These get path-based zone detection in middleware (not host-based) so
    // they are never incorrectly redirected to the canonical production host.
    isDevZoneHost(host)
  );
}

// ── Supabase URL helpers ──────────────────────────────────────────────────────

export function getBrowserSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url)
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL_BROWSER or NEXT_PUBLIC_SUPABASE_URL",
    );
  return url;
}

export function getStorageBaseUrl(): string {
  return getBrowserSupabaseUrl().replace(/\/+$/, "");
}

export function getSiteUrl(requestHost?: string | null): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  const h = normalizeHost(requestHost);
  if (!h) return `https://${CORE_DOMAIN}`;
  return `https://${h}`;
}
