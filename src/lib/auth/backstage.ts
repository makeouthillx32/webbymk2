// src/lib/auth/backstage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which Tank paths are operator surfaces rather than viewer surfaces.
//
// One list, used twice: middleware requires a sign-in for these, and the
// session policy gives them their own freshness ceiling (`tank:backstage`)
// while ordinary viewing stays signed in forever. Two copies of this list
// would eventually disagree, and the failure mode is silent — a path gated for
// auth but not for freshness, or the reverse.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tank operator paths.
 *
 * `/admin` was already here. `/director-configuration` and `/director` were
 * NOT, and both returned 200 to an unauthenticated request on production
 * (verified 2026-09-10) — the director console rendered its camera and room
 * layout to anyone who knew the URL. Every control on it was correctly
 * staff-gated at the API (mode → 403 "Staff only", pilot → requireAdmin), so
 * this was an information exposure rather than a way to steer the stream, but
 * the page had no business rendering at all.
 *
 * `/house` is deliberately absent: it gates itself server-side via
 * requireTankStaff(), which also does the role check. Adding it here would be
 * harmless but redundant.
 */
export const TANK_BACKSTAGE_PREFIXES = [
  "/admin",
  "/director-configuration",
  "/director",
] as const;

/**
 * NOT matched: `/obs/director`, `/obs/room-offline` and the rest of `/obs/*`.
 *
 * Those are OBS browser sources — they load in OBS's embedded browser with no
 * session at all and are meant to. Gating them would break every scene. The
 * prefix check below is exact-or-slash precisely so `/director` does not
 * swallow them, and `/directors-cut` or similar would not match either.
 */
export function isTankBackstagePath(pathname: string): boolean {
  return TANK_BACKSTAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The session-policy key for a request. Backstage surfaces get their own
 * ceiling so an operator console does not inherit "remember me forever" from
 * the viewing experience.
 */
export function sessionPolicyKey(zone: string, pathname: string): string {
  if (zone === "tank" && isTankBackstagePath(pathname)) return "tank:backstage";
  return zone;
}
