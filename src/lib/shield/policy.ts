// src/lib/shield/policy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolves the per-zone Shield policy for a hostname.
//
// Kept in its own module (not types.ts) so types.ts stays dependency-free —
// it is imported by the edge middleware, the verify route AND the browser-side
// challenge template, and dragging multiZone.ts into all three would widen the
// edge bundle for no reason.
// ─────────────────────────────────────────────────────────────────────────────

import { getZoneFromHost } from "@/lib/multiZone";
import {
  DEFAULT_SHIELD_POLICY,
  ZONE_SHIELD_POLICY,
  type ShieldZonePolicy,
} from "./types";

/**
 * Policy for a zone key (e.g. "labs", "tank").
 * Unknown / dynamically scaffolded zones fall back to the default.
 */
export function getShieldPolicyForZone(zone: string): ShieldZonePolicy {
  return ZONE_SHIELD_POLICY[zone] ?? DEFAULT_SHIELD_POLICY;
}

/**
 * Policy for a hostname (e.g. "labs.unenter.live").
 *
 * The Shield challenge and clearance token both carry `domain` — the full
 * host — so this is the lookup every caller actually has on hand. Localhost
 * and anything unrecognised get the default policy.
 */
export function getShieldPolicyForHost(host: string): ShieldZonePolicy {
  if (!host) return DEFAULT_SHIELD_POLICY;
  return getShieldPolicyForZone(getZoneFromHost(host));
}
