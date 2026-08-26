"use client";

// components/MovedToZone.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Zone-aware "this has moved" notice.
//
// When a section that used to live on a core path (e.g. unenter.live/shop) is
// migrated to its own subdomain zone (shop.unenter.live), drop this on the old
// page. The PARENT passes the destination `zone` — everything else (the old
// label, the new host + URL) is derived from the canonical ZONES map in
// @/lib/multiZone, so it stays correct if a zone's host ever changes.
//
//   <MovedToZone zone="shop" />                       // unenter.live/shop → shop.unenter.live
//   <MovedToZone zone="shop" from="/shop" to="/" />   // explicit
//   <MovedToZone zone="shop" redirect />              // + auto-redirect
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  CORE_DOMAIN,
  ZONES,
  getZoneBaseUrl,
  type ZoneName,
} from "@/lib/multiZone";

export interface MovedToZoneProps {
  /** Destination zone — the variable the parent passes. e.g. "shop". */
  zone: ZoneName;
  /**
   * Old path on the core domain, shown in the "from" label. Defaults to the
   * zone's first non-root route prefix (e.g. shop → "/shop").
   */
  from?: string;
  /**
   * Destination path on the zone host. Defaults to "/" — the migrated section
   * serves at the zone root (e.g. /shop content now lives at shop.unenter.live/).
   * Pass a deep path to map a specific link across.
   */
  to?: string;
  /** Auto-redirect to the new URL after `delayMs`. Off by default — notice only. */
  redirect?: boolean;
  /** Redirect delay in ms (only used when `redirect` is true). */
  delayMs?: number;
}

export default function MovedToZone({
  zone,
  from,
  to = "/",
  redirect = false,
  delayMs = 4000,
}: MovedToZoneProps) {
  const config = ZONES[zone];
  const newHost = config?.host ?? `${zone}.${CORE_DOMAIN}`;

  // From label: core domain + the old path (defaults to the zone's primary prefix).
  const fromPath = from ?? config?.routePrefixes.find((p) => p !== "/") ?? "/";
  const fromLabel = `${CORE_DOMAIN}${fromPath === "/" ? "" : fromPath}`;

  // Destination: zone base URL + path. "/" maps to the bare host for a clean label.
  const cleanTo = to === "/" ? "" : to;
  const newUrl = `${getZoneBaseUrl(zone)}${cleanTo}`;
  const newLabel = `${newHost}${cleanTo}`;

  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(delayMs / 1000));

  useEffect(() => {
    if (!redirect || typeof window === "undefined") return;
    const tick = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    const go = setTimeout(() => {
      window.location.href = newUrl;
    }, delayMs);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [redirect, delayMs, newUrl]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto my-10 max-w-xl rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--card-foreground)] shadow-[var(--shadow-lg)]"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        This page has moved
      </p>

      <p className="mt-3 text-base leading-relaxed">
        <span className="text-[var(--muted-foreground)] line-through">{fromLabel}</span>
        <span className="mx-2 text-[var(--muted-foreground)]">is now</span>
        <strong className="text-[var(--foreground)]">{newLabel}</strong>
      </p>

      <a
        href={newUrl}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-5 py-3 font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
      >
        Go to {newHost} →
      </a>

      {redirect && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Redirecting in {secondsLeft}s…
        </p>
      )}
    </div>
  );
}
