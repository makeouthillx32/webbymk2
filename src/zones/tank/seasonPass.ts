// src/zones/tank/seasonPass.ts
// ─────────────────────────────────────────────────────────────────────────────
// Who can enter a gated room.
//
// GATING IS OPT-IN, AND THAT IS THE WHOLE DESIGN. A room with no
// `requiredPassTier` is open to everyone, which is every room that exists
// today. Only a room deliberately marked base or xl asks for anything. Nothing
// currently free becomes paid because this shipped.
//
// Pure, because the alternative is discovering the rule is wrong by locking a
// paying viewer out of a room they bought — or worse, leaving a private room
// open. Both are the kind of failure you find from a customer, not a log.
// ─────────────────────────────────────────────────────────────────────────────

export type SeasonPassTier = "base" | "xl";

/** What a viewer holds. */
export type ViewerPass = {
  tier: SeasonPassTier | null;
  /**
   * When the current period ends.
   *
   * Null means "no expiry recorded", which counts as ACTIVE — one-off
   * purchases predate the subscription model and must not be silently revoked.
   */
  expiresAt: Date | string | null;
};

/** What a room demands. Null is the default and means open. */
export type RoomGate = { requiredPassTier: SeasonPassTier | null };

/** xl satisfies a base requirement; base does not satisfy xl. */
const TIER_RANK: Record<SeasonPassTier, number> = { base: 1, xl: 2 };

export function isPassActive(pass: ViewerPass | null | undefined, now: Date = new Date()): boolean {
  if (!pass?.tier) return false;
  if (pass.expiresAt === null || pass.expiresAt === undefined) return true;

  const expiry = pass.expiresAt instanceof Date ? pass.expiresAt : new Date(pass.expiresAt);
  // An unparseable date is treated as active rather than locking a paying
  // viewer out over a malformed value. A stuck-open gate is recoverable; an
  // angry customer who paid is not.
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() > now.getTime();
}

export type RoomAccess =
  | { allowed: true }
  | { allowed: false; reason: "needs-pass" | "needs-upgrade" | "expired"; requiredTier: SeasonPassTier };

/**
 * Can this viewer enter this room?
 *
 * Distinguishes the three "no" cases because they need different words on
 * screen: someone with no pass needs a buy button, someone on base looking at
 * an xl room needs an upgrade, and someone whose pass lapsed needs renewal —
 * telling all three "buy a season pass" is wrong for two of them.
 */
export function canEnterRoom(
  room: RoomGate | null | undefined,
  pass: ViewerPass | null | undefined,
  now: Date = new Date(),
): RoomAccess {
  const required = room?.requiredPassTier ?? null;
  // The common case, and the one that must never accidentally deny: an ungated
  // room is open, signed in or not.
  if (!required) return { allowed: true };

  if (!pass?.tier) return { allowed: false, reason: "needs-pass", requiredTier: required };
  if (!isPassActive(pass, now)) {
    return { allowed: false, reason: "expired", requiredTier: required };
  }
  if (TIER_RANK[pass.tier] < TIER_RANK[required]) {
    return { allowed: false, reason: "needs-upgrade", requiredTier: required };
  }
  return { allowed: true };
}

/**
 * Monthly token allowance per tier.
 *
 * Set by the operator 2026-09-13. The 500/2500 that stood here first were my
 * placeholders, not a decision — these are the real figures.
 *
 * A pass is bought with MONEY and never with tokens. Nothing in the purchase
 * path debits a balance; the allowance below is a grant, one direction only.
 *
 * Granted at most once per period — see tank_profiles.season_pass_tokens_granted_at.
 */
export const SEASON_PASS_MONTHLY_TOKENS: Record<SeasonPassTier, number> = {
  base: 100,
  xl: 350,
};

/**
 * Is a monthly grant due?
 *
 * At-most-once by design: a duplicate webhook or a double-run of a scheduled
 * job must not mint currency. Returns false for an inactive pass, so a lapsed
 * subscriber stops accruing.
 */
export function isMonthlyGrantDue(
  pass: ViewerPass | null | undefined,
  lastGrantedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isPassActive(pass, now)) return false;
  if (!lastGrantedAt) return true;

  const last = lastGrantedAt instanceof Date ? lastGrantedAt : new Date(lastGrantedAt);
  // Unparseable: refuse rather than grant. Minting tokens on bad data is the
  // expensive direction to be wrong in.
  if (Number.isNaN(last.getTime())) return false;

  const days = (now.getTime() - last.getTime()) / 86_400_000;
  return days >= 30;
}
