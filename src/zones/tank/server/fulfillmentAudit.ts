// src/zones/tank/server/fulfillmentAudit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Does what the customer paid for match what they actually got?
//
// Stripe is the source of truth for MONEY. Supabase is the source of truth for
// ENTITLEMENT. Everything between them is a webhook, and a webhook is a network
// call that can be dropped, delayed, delivered twice, or answered with a 500.
// Every failure below has already happened here at least once in some form:
// a partial index made the token grant throw for every delivery while the pass
// activated anyway, and a test-mode customer id silently broke live checkout.
//
// This module is PURE on purpose. The checks are the part that has to be right,
// and they should be provable without a Stripe account, a database, or a card.
// The caller gathers both sides; this decides what is wrong and how bad it is.
//
// Two directions of error, and they are NOT symmetric:
//   - Paid and did not receive  -> the customer is out of pocket. Loudest.
//   - Received and did not pay  -> we are out of pocket. Quieter, still real.
// A check that cannot tell which direction it is looking at is not finished.
// ─────────────────────────────────────────────────────────────────────────────

import { SEASON_PASS_MONTHLY_TOKENS, type SeasonPassTier } from "../seasonPass";
import { TANK_PRODUCTS, type TankProductKey } from "../tankProducts";

export type AuditSeverity = "critical" | "warning" | "info";

export type AuditFinding = {
  /** Stable machine code — safe to alert, filter, and count on. */
  code: AuditFindingCode;
  severity: AuditSeverity;
  /** Who is affected, when known. */
  userId: string | null;
  /** The purchase, subscription, or invoice this is about. */
  subject: string;
  /** One sentence a human can act on, in the operator's language. */
  detail: string;
  /** What to do about it. Null when it needs a judgement call, not a fix. */
  remedy: string | null;
};

export type AuditFindingCode =
  | "paid_not_fulfilled"
  | "paid_no_tokens"
  | "tokens_without_purchase"
  | "duplicate_grant"
  | "grant_amount_mismatch"
  | "charged_amount_mismatch"
  | "stuck_pending"
  | "refunded_but_granted"
  | "entitled_without_subscription"
  | "subscription_without_entitlement"
  | "tier_mismatch"
  | "expired_but_active"
  | "missing_monthly_grant"
  | "customer_mode_mismatch"
  | "irl_awaiting_booking"
  | "mode_mismatch";

/** What the database believes about one purchase. */
export type PurchaseRecord = {
  id: string;
  userId: string;
  productKey: string;
  amountCents: number;
  stripeMode: "test" | "live";
  status: string;
  fulfilledAt: string | null;
  createdAt: string;
};

/** What the ledger recorded against that purchase. */
export type LedgerRecord = {
  purchaseId: string | null;
  stripeInvoiceId: string | null;
  userId: string;
  amount: number;
};

/** What Stripe says actually happened to the money. */
export type StripeChargeFacts = {
  /** Null when Stripe has no matching object at all. */
  status: "succeeded" | "refunded" | "failed" | "pending" | null;
  amountCents: number | null;
  livemode: boolean | null;
};

const MINUTES = 60_000;
/**
 * How long a purchase may sit `pending` before it is a problem rather than a
 * person still typing their card in. Stripe's own retry schedule runs for days,
 * so this is about spotting the stall early, not about giving up.
 */
export const STUCK_PENDING_MS = 30 * MINUTES;

/**
 * How long a paid real-world booking may sit unacknowledged before it stops
 * being "we'll get to it" and becomes a customer who paid thousands and heard
 * nothing back.
 */
export const IRL_ACK_MS = 48 * 60 * MINUTES;

function tokensFor(productKey: string): number | null {
  const product = TANK_PRODUCTS[productKey as TankProductKey];
  return product?.tokens ?? null;
}

function catalogAmount(productKey: string): number | null {
  return TANK_PRODUCTS[productKey as TankProductKey]?.amountCents ?? null;
}

/**
 * Audit a single one-off purchase (token packs, room_vip) against Stripe and
 * the ledger.
 *
 * `charge` may be null when Stripe was not reachable — that is explicitly NOT
 * treated as "no charge exists", because assuming absence from a failed lookup
 * would report every customer as unpaid the moment the API blips.
 */
export function auditPurchase(
  purchase: PurchaseRecord,
  ledger: LedgerRecord[],
  charge: StripeChargeFacts | null,
  now: Date = new Date(),
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const subject = `purchase ${purchase.id}`;
  const base = { userId: purchase.userId, subject };
  const rows = ledger.filter((l) => l.purchaseId === purchase.id);
  const granted = rows.reduce((sum, l) => sum + l.amount, 0);
  const expected = tokensFor(purchase.productKey);

  // ── money says paid ───────────────────────────────────────────────────────
  if (charge?.status === "succeeded") {
    if (purchase.status !== "paid") {
      findings.push({
        ...base,
        code: "paid_not_fulfilled",
        severity: "critical",
        detail: `Stripe took ${fmt(charge.amountCents)} but the purchase is still "${purchase.status}".`,
        remedy: "Replay the payment_intent.succeeded event, or fulfil by hand and mark it paid.",
      });
    }
    if (expected !== null && rows.length === 0) {
      findings.push({
        ...base,
        code: "paid_no_tokens",
        severity: "critical",
        detail: `Paid for ${expected} tokens and the ledger has no row — the customer received nothing.`,
        remedy: `Insert a ledger row for ${expected} tokens keyed to this purchase id (idempotent).`,
      });
    }
    if (charge.amountCents !== null && charge.amountCents !== purchase.amountCents) {
      findings.push({
        ...base,
        code: "charged_amount_mismatch",
        severity: "critical",
        detail: `Stripe charged ${fmt(charge.amountCents)}; the purchase row says ${fmt(purchase.amountCents)}.`,
        remedy: "Do not adjust silently — reconcile against the Stripe charge before touching anything.",
      });
    }
    const listed = catalogAmount(purchase.productKey);
    if (listed !== null && listed !== purchase.amountCents) {
      findings.push({
        ...base,
        code: "charged_amount_mismatch",
        severity: "warning",
        detail: `Charged ${fmt(purchase.amountCents)} but the catalog now lists ${fmt(listed)} for ${purchase.productKey}.`,
        remedy: "Expected after a deliberate price change; confirm the change was intended.",
      });
    }
  }

  // ── money says refunded ───────────────────────────────────────────────────
  if (charge?.status === "refunded" && granted > 0) {
    findings.push({
      ...base,
      code: "refunded_but_granted",
      severity: "warning",
      detail: `Refunded, but ${granted} tokens were granted and are still spendable.`,
      remedy: "Decide deliberately whether to claw back — spent tokens cannot be un-spent.",
    });
  }

  // ── ledger integrity, independent of Stripe ───────────────────────────────
  if (rows.length > 1) {
    findings.push({
      ...base,
      code: "duplicate_grant",
      severity: "critical",
      detail: `${rows.length} ledger rows for one purchase (${granted} tokens total) — idempotency is not holding.`,
      remedy: "Check the unique index on tank_token_transactions.purchase_id before refunding the surplus.",
    });
  }
  if (expected !== null && rows.length === 1 && granted !== expected) {
    findings.push({
      ...base,
      code: "grant_amount_mismatch",
      severity: "critical",
      detail: `Granted ${granted} tokens for a pack worth ${expected}.`,
      remedy: "Correct the ledger row to the catalog figure.",
    });
  }
  if (purchase.status === "paid" && expected !== null && rows.length === 0) {
    findings.push({
      ...base,
      code: "paid_no_tokens",
      severity: "critical",
      detail: "Marked paid with no ledger row — fulfilment did not complete.",
      remedy: `Grant ${expected} tokens keyed to this purchase id.`,
    });
  }

  // ── real-world bookings ───────────────────────────────────────────────────
  // Tank B&B and the other Big Tanktoys cannot be delivered by code, so a paid
  // row with no fulfilment time is someone waiting on a human. At $2,500 a
  // forgotten booking is the most expensive failure in this file, and the only
  // one that is invisible from the money side — Stripe is perfectly happy.
  if (TANK_PRODUCTS[purchase.productKey as TankProductKey]?.irlFulfilment && purchase.status === "paid") {
    if (!purchase.fulfilledAt) {
      const waited = now.getTime() - new Date(purchase.createdAt).getTime();
      const overdue = Number.isFinite(waited) && waited > IRL_ACK_MS;
      findings.push({
        ...base,
        code: "irl_awaiting_booking",
        severity: overdue ? "critical" : "warning",
        detail: overdue
          ? `${fmt(purchase.amountCents)} paid ${Math.round(waited / (24 * 60 * MINUTES))} days ago and still not booked.`
          : `${fmt(purchase.amountCents)} paid — awaiting staff to arrange the stay.`,
        remedy: "Contact the buyer and schedule it, then set fulfilled_at once it is agreed.",
      });
    }
  }

  // ── stalled ───────────────────────────────────────────────────────────────
  if (purchase.status === "pending") {
    const age = now.getTime() - new Date(purchase.createdAt).getTime();
    if (Number.isFinite(age) && age > STUCK_PENDING_MS) {
      findings.push({
        ...base,
        code: "stuck_pending",
        severity: charge?.status === "succeeded" ? "critical" : "warning",
        detail:
          charge?.status === "succeeded"
            ? "Stripe succeeded but this has been pending for over 30 minutes — the webhook is not landing."
            : `Pending for ${Math.round(age / MINUTES)} minutes with no successful charge — probably abandoned.`,
        remedy:
          charge?.status === "succeeded"
            ? "Check webhook deliveries for failures, then replay."
            : "Safe to mark failed once the session has expired.",
      });
    }
  }

  // ── mode ──────────────────────────────────────────────────────────────────
  if (charge?.livemode !== null && charge?.livemode !== undefined) {
    const chargeMode = charge.livemode ? "live" : "test";
    if (chargeMode !== purchase.stripeMode) {
      findings.push({
        ...base,
        code: "mode_mismatch",
        severity: "critical",
        detail: `Recorded as ${purchase.stripeMode} but the Stripe object is ${chargeMode}.`,
        remedy: "Real money may be recorded as test revenue; reconcile before reporting on it.",
      });
    }
  }

  return findings;
}

/** What the database believes about someone's pass. */
export type PassRecord = {
  userId: string;
  tier: SeasonPassTier | null;
  active: boolean;
  status: string | null;
  expiresAt: string | null;
  tokensGrantedAt: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripeCustomerMode: string | null;
};

/** What Stripe says about that subscription. */
export type StripeSubscriptionFacts = {
  /** Null when Stripe has no such subscription. */
  status: string | null;
  tier: SeasonPassTier | null;
  currentPeriodStart: string | null;
  livemode: boolean | null;
};

const ENTITLING = new Set(["active", "trialing"]);

/**
 * Audit one member's season pass.
 *
 * `subscription` null means Stripe has no such subscription — which is a real
 * finding when we are handing out perks for it. A caller that simply could not
 * reach Stripe must not pass null; it should skip the member entirely.
 */
export function auditSeasonPass(
  pass: PassRecord,
  subscription: StripeSubscriptionFacts | null,
  grantsThisPeriod: number,
  currentMode: "test" | "live",
  now: Date = new Date(),
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const subject = pass.stripeSubscriptionId ?? `member ${pass.userId}`;
  const base = { userId: pass.userId, subject };
  const stripeEntitles = Boolean(subscription && ENTITLING.has(subscription.status ?? ""));

  // Perks without money coming in.
  if (pass.active && !stripeEntitles) {
    findings.push({
      ...base,
      code: subscription ? "subscription_without_entitlement" : "entitled_without_subscription",
      severity: "warning",
      detail: subscription
        ? `Pass is active here but Stripe says the subscription is "${subscription.status}".`
        : "Pass is active here but Stripe has no matching subscription at all.",
      remedy: "Confirm against Stripe, then deactivate — this is unpaid access until it is.",
    });
  }

  // Money coming in without perks. This is the one a customer complains about.
  if (!pass.active && stripeEntitles) {
    findings.push({
      ...base,
      code: "paid_not_fulfilled",
      severity: "critical",
      detail: "Stripe is billing an active subscription but the member has no pass.",
      remedy: "Replay the invoice.paid event to re-sync the profile.",
    });
  }

  if (stripeEntitles && subscription?.tier && pass.tier && subscription.tier !== pass.tier) {
    findings.push({
      ...base,
      code: "tier_mismatch",
      severity: "critical",
      detail: `Stripe is billing ${subscription.tier} but the member holds ${pass.tier}.`,
      remedy:
        "Tier comes from subscription metadata, not the price — check the metadata was updated alongside any price change.",
    });
  }

  if (pass.active && pass.expiresAt) {
    const expiry = new Date(pass.expiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()) {
      findings.push({
        ...base,
        code: "expired_but_active",
        severity: "warning",
        detail: `Still marked active though the period ended ${pass.expiresAt}.`,
        remedy: "A renewal webhook was probably missed; re-sync from Stripe.",
      });
    }
  }

  // The exact failure that silently ate a grant: entitled, billed, no tokens.
  if (stripeEntitles && pass.tier) {
    const owed = SEASON_PASS_MONTHLY_TOKENS[pass.tier];
    if (grantsThisPeriod === 0) {
      findings.push({
        ...base,
        code: "missing_monthly_grant",
        severity: "critical",
        detail: `Billed for ${pass.tier} this period and received 0 of ${owed} tokens.`,
        remedy: "Replay invoice.paid; the grant is keyed to the invoice id so it cannot double up.",
      });
    } else if (grantsThisPeriod > owed) {
      findings.push({
        ...base,
        code: "duplicate_grant",
        severity: "critical",
        detail: `Received ${grantsThisPeriod} tokens this period for a ${pass.tier} pass worth ${owed}.`,
        remedy: "Check the unique index on stripe_invoice_id — a partial index does not satisfy ON CONFLICT.",
      });
    }
  }

  // Cost us a live checkout once already.
  if (pass.stripeCustomerId && pass.stripeCustomerMode && pass.stripeCustomerMode !== currentMode) {
    findings.push({
      ...base,
      code: "customer_mode_mismatch",
      severity: "warning",
      detail: `Customer id belongs to ${pass.stripeCustomerMode} mode while Tank is running in ${currentMode}.`,
      remedy: "Harmless — checkout creates a fresh customer for this mode rather than reusing it.",
    });
  }

  return findings;
}

/** Worst-first, because a triage list is read from the top. */
const ORDER: Record<AuditSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export type AuditSummary = {
  critical: number;
  warning: number;
  info: number;
  /** True only when nothing at all was found — the only state worth relaxing about. */
  clean: boolean;
};

export function summarize(findings: AuditFinding[]): AuditSummary {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return { critical, warning, info, clean: findings.length === 0 };
}

function fmt(cents: number | null): string {
  if (cents === null) return "an unknown amount";
  return `$${(cents / 100).toFixed(2)}`;
}
