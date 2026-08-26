// src/lib/zoneContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only helper. Reads the ZoneRequestContext that middleware.ts computed
// and exposed via headers, so server components, route handlers, and the
// zone-aware 404 all share ONE source of truth instead of re-deriving zone
// facts from the Host header. Falls back to recomputing from host + pathname
// when the middleware headers aren't present (e.g. header-less render paths).
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from "next/headers";
import {
  buildZoneContext,
  isLocalDevelopmentHost,
  normalizeHost,
  ZONE_HEADER,
  SITE_HOST_HEADER,
  CORE_HOST_HEADER,
  PROMOTION_STATUS_HEADER,
  PROMOTION_ZONE_HEADER,
  type ZoneRequestContext,
  type PromotionStatus,
  type ZoneName,
} from "@/lib/multiZone";

/**
 * Resolve the current request's zone context on the server.
 *
 * @param pathname Only used by the fallback path when middleware headers are
 *                 absent. In normal requests the headers carry everything.
 */
export async function getZoneContext(
  pathname?: string,
): Promise<ZoneRequestContext> {
  const h = await headers();

  const host = normalizeHost(
    h.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      h.get("host") ||
      "",
  );

  const zone           = h.get(ZONE_HEADER);
  const canonicalHost  = h.get(SITE_HOST_HEADER);
  const coreHostHeader = h.get(CORE_HOST_HEADER);

  // Middleware headers present → trust them (already computed once per request).
  if (zone && canonicalHost && coreHostHeader != null) {
    return {
      zone,
      host,
      canonicalHost,
      isCoreHost: coreHostHeader === "1",
      isLocal:    isLocalDevelopmentHost(host),
      promotionStatus: (h.get(PROMOTION_STATUS_HEADER) as PromotionStatus) ?? undefined,
      promotedToZone:  (h.get(PROMOTION_ZONE_HEADER)   as ZoneName)        ?? undefined,
    };
  }

  // Fallback: recompute from primitives.
  return buildZoneContext({
    host,
    pathname: pathname ?? "/",
    isLocal:  isLocalDevelopmentHost(host),
  });
}
