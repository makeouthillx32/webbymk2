// src/lib/multiZone.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for multi-zone architecture.
//
// ZONE MAP
// ─────────────────────────────────────────────────────────────────────────────
//  Zone         Host                        Port   Owns
//  ──────────   ──────────────────────────  ─────  ───────────────────────────
//  unenter      unenter.live                3000   /, /about, /services, etc.
//  dashboard    dashboard.unenter.live      3001   /dashboard/**
//  shop         shop.unenter.live           3002   /shop, /products, /checkout
//  app          app.unenter.live            3003   /profile, /settings, /client
//
// All zones currently run as one Next.js instance. The proxy routes by Host
// header. When a zone is split into its own deployment, only its port changes
// in the proxy — nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const CORE_DOMAIN  = "unenter.live" as const;
export const ZONE_HEADER  = "x-unenter-zone"  as const;
export const SITE_HOST_HEADER = "x-unenter-host" as const;

// ── Zone definitions ──────────────────────────────────────────────────────────

export type ZoneName = "unenter" | "blog" | "dashboard" | "shop" | "app";

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
    name:         "unenter",
    host:         CORE_DOMAIN,
    port:         3000,
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
      // auth flows live on core domain
      "/sign-in",
      "/sign-up",
      "/auth",
      "/forgot-password",
      "/reset-password",
    ],
    requiresAuth: false,
  },

  blog: {
    name:         "blog",
    host:         `blog.${CORE_DOMAIN}`,
    port:         3000,  // monolith for now — update when split
    routePrefixes: ["/blog"],
    requiresAuth: false,
  },

  dashboard: {
    name:         "dashboard",
    host:         `dashboard.${CORE_DOMAIN}`,
    port:         3001,
    routePrefixes: ["/dashboard"],
    requiresAuth: true,
  },

  shop: {
    name:         "shop",
    host:         `shop.${CORE_DOMAIN}`,
    port:         3002,
    routePrefixes: [
      "/shop",
      "/products",
      "/checkout",
      "/collections",
      "/cart",
      "/u",           // user-facing shop profile
    ],
    requiresAuth: false,
  },

  app: {
    name:         "app",
    host:         `app.${CORE_DOMAIN}`,
    port:         3003,
    routePrefixes: [
      "/profile",
      "/settings",
      "/client",
      "/protected",
    ],
    requiresAuth: true,
  },
} as const;

// ── Host / zone resolution ────────────────────────────────────────────────────

function stripPort(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return stripPort(host);
}

/** Returns the zone for a given public host. Defaults to "unenter". */
export function getZoneFromHost(host: string | null | undefined): ZoneName {
  const h = normalizeHost(host);
  for (const zone of Object.values(ZONES)) {
    if (h === zone.host) return zone.name;
  }
  // www redirect → core
  if (h === `www.${CORE_DOMAIN}`) return "unenter";
  return "unenter";
}

/** Strips www, resolves to canonical host. */
export function getCanonicalHost(host: string | null | undefined): string {
  const h = normalizeHost(host);
  if (h === `www.${CORE_DOMAIN}`) return CORE_DOMAIN;
  // Known zone host → return as-is
  for (const zone of Object.values(ZONES)) {
    if (h === zone.host) return h;
  }
  return CORE_DOMAIN;
}

/** Given a URL pathname, returns the zone that owns it. */
export function getZoneFromPathname(pathname: string): ZoneName {
  // Check specific zones first (dashboard, shop, app before unenter)
  const ordered: ZoneName[] = ["dashboard", "shop", "app", "unenter"];
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

export function isLocalDevelopmentHost(host: string): boolean {
  return (
    host === "localhost"    ||
    host === "127.0.0.1"   ||
    host === "0.0.0.0"
  );
}

// ── Supabase URL helpers ──────────────────────────────────────────────────────

export function getBrowserSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL_BROWSER or NEXT_PUBLIC_SUPABASE_URL");
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
