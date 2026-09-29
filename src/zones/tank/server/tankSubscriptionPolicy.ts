import {
  SEASON_PASS_MONTHLY_TOKENS,
  type SeasonPassTier,
} from "../seasonPass";

export type TankSubscriptionProduct = {
  productKey: "season_pass" | "season_pass_xl";
  tier: SeasonPassTier;
  monthlyTokens: number;
};

export function resolveTankSubscriptionProduct(
  productKey: string | null | undefined,
): TankSubscriptionProduct | null {
  if (productKey === "season_pass") {
    return {
      productKey,
      tier: "base",
      monthlyTokens: SEASON_PASS_MONTHLY_TOKENS.base,
    };
  }
  if (productKey === "season_pass_xl") {
    return {
      productKey,
      tier: "xl",
      monthlyTokens: SEASON_PASS_MONTHLY_TOKENS.xl,
    };
  }
  return null;
}

export function isEntitledSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

export function isTerminalSubscriptionStatus(status: string): boolean {
  return status === "canceled" || status === "unpaid" || status === "incomplete_expired";
}

export function latestSubscriptionPeriodEnd(
  unixSeconds: Array<number | null | undefined>,
): string | null {
  const periodEnd = Math.max(0, ...unixSeconds.map((value) => value ?? 0));
  return periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null;
}

/** Tier ranking. xl outranks base; there is nothing above xl. */
const TIER_RANK: Record<SeasonPassTier, number> = { base: 1, xl: 2 };

export type UpgradeDecision =
  | { allowed: true; from: SeasonPassTier; to: SeasonPassTier }
  | {
      allowed: false;
      reason: "no-subscription" | "not-entitled" | "same-tier" | "downgrade-unsupported";
    };

/**
 * May this subscription move to `target`?
 *
 * Refuses anything that is not a strict upgrade. A downgrade is not merely
 * unimplemented — it owes the customer money back, and silently swapping the
 * price without a refund path would quietly overcharge them for the remainder
 * of a period they already paid for at the higher rate.
 *
 * past_due is deliberately NOT upgradable: raising the price on a subscription
 * whose last payment already failed just makes the next failure bigger.
 */
export function canUpgradeSubscription(
  currentTier: SeasonPassTier | null | undefined,
  target: SeasonPassTier,
  status: string | null | undefined,
): UpgradeDecision {
  if (!currentTier) return { allowed: false, reason: "no-subscription" };
  if (!isEntitledSubscriptionStatus(status ?? "")) {
    return { allowed: false, reason: "not-entitled" };
  }
  if (currentTier === target) return { allowed: false, reason: "same-tier" };
  if (TIER_RANK[target] < TIER_RANK[currentTier]) {
    return { allowed: false, reason: "downgrade-unsupported" };
  }
  return { allowed: true, from: currentTier, to: target };
}

/**
 * How many tokens this invoice still owes, given what the period already paid out.
 *
 * Upgrading mid-period invoices immediately, so invoice.paid fires a second
 * time inside one billing period. Granting the new tier's full allowance there
 * would hand out base + xl (100 + 350) for a single month. Granting nothing
 * would cheat someone who genuinely upgraded. The difference is the honest
 * answer, and it falls out of subtraction rather than a special upgrade branch.
 *
 * Clamped at zero so a duplicate delivery, or a downgrade that somehow reaches
 * this code, can never mint or reverse currency.
 */
export function tokensStillOwedForPeriod(
  tier: SeasonPassTier,
  alreadyGrantedThisPeriod: number,
): number {
  const allowance = SEASON_PASS_MONTHLY_TOKENS[tier];
  const already = Number.isFinite(alreadyGrantedThisPeriod)
    ? Math.max(0, alreadyGrantedThisPeriod)
    : 0;
  return Math.max(0, allowance - already);
}

/** Start of the current period, mirroring latestSubscriptionPeriodEnd. */
export function earliestSubscriptionPeriodStart(
  unixSeconds: Array<number | null | undefined>,
): string | null {
  const values = unixSeconds.filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (values.length === 0) return null;
  return new Date(Math.min(...values) * 1000).toISOString();
}
