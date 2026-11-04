// src/lib/legalLinks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Where a zone's privacy / terms links go. Pages in static_pages are zone-
// scoped (see lib/landing/static-pages.resolve.ts): only Labs has its own
// privacy-policy / terms-and-conditions rows. The core site serves the
// platform-wide /privacy and /terms; every other zone (shop, blog, docs, …)
// links to those on the core site rather than to a page it doesn't have —
// and never to another zone's policy.
// ─────────────────────────────────────────────────────────────────────────────

import { CORE_DOMAIN, crossZoneUrl } from "@/lib/multiZone";

// The core site's public origin. NOT NEXT_PUBLIC_SITE_URL: that is each
// container's OWN site URL (the shop image's server render resolved it to
// dev.unenter.live), so it can't name the core site.
const CORE_ORIGIN = `https://www.${CORE_DOMAIN}`;

function isCore(zone: string | undefined): boolean {
  return !zone || zone === "unenter";
}

export function coreSiteHref(path: string): string {
  return `${CORE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function privacyPolicyHref(zone: string | undefined = process.env.NEXT_PUBLIC_ZONE): string {
  if (zone === "labs") return "/pages/privacy-policy";
  if (isCore(zone)) return "/privacy";
  return coreSiteHref("/privacy");
}

export function termsHref(zone: string | undefined = process.env.NEXT_PUBLIC_ZONE): string {
  if (zone === "labs") return "/pages/terms-and-conditions";
  if (isCore(zone)) return "/terms";
  return coreSiteHref("/terms");
}

/**
 * Shop's own apparel shipping / returns pages. Relative on the shop zone; any
 * other zone that renders the shop footer (core) links to the shop zone's
 * page rather than to its own, which doesn't exist.
 */
export function shopPolicyHref(
  slug: "shipping" | "returns",
  zone: string | undefined = process.env.NEXT_PUBLIC_ZONE,
): string {
  const path = `/pages/${slug}`;
  return zone === "shop" ? path : crossZoneUrl("shop", path);
}

/** True when `href` leaves the current zone (rendered as a plain <a>). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
