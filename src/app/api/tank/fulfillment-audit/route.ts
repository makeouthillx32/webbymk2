import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import { createCommerceStripe } from "@/lib/stripe/commerce";
import {
  auditPurchase,
  auditSeasonPass,
  sortFindings,
  summarize,
  type AuditFinding,
  type LedgerRecord,
  type StripeChargeFacts,
  type StripeSubscriptionFacts,
} from "@/zones/tank/server/fulfillmentAudit";
import { resolveTankSubscriptionProduct } from "@/zones/tank/server/tankSubscriptionPolicy";
import type { SeasonPassTier } from "@/zones/tank/seasonPass";

// Reconciles what Stripe took against what Tank handed over.
//
// Staff only, and read-only by design: it reports, it never repairs. Every
// remedy here touches either a customer's money or their balance, and a job
// that silently "fixes" those is how you turn one missed webhook into a
// hundred duplicate grants. A human reads the list and decides.

export const dynamic = "force-dynamic";

/** Bounded so a staff click can never walk the whole history of the store. */
const PURCHASE_LIMIT = 200;

export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const admin = createAdminClient();
  let stripe: ReturnType<typeof createCommerceStripe>["stripe"];
  let mode: "test" | "live";
  try {
    ({ stripe, mode } = createCommerceStripe("tank"));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Stripe is not configured." }, { status: 500 });
  }

  const findings: AuditFinding[] = [];
  /** Members whose Stripe side could not be read — reported, never guessed at. */
  const unchecked: string[] = [];

  // ── one-off purchases ─────────────────────────────────────────────────────
  const { data: purchases } = await admin
    .from("tank_purchases")
    .select("id, user_id, product_key, amount_cents, stripe_mode, status, fulfilled_at, created_at, stripe_payment_intent_id")
    .order("created_at", { ascending: false })
    .limit(PURCHASE_LIMIT);

  const { data: ledgerRows } = await admin
    .from("tank_token_transactions")
    .select("purchase_id, stripe_invoice_id, user_id, amount")
    .not("purchase_id", "is", null);

  const ledger: LedgerRecord[] = (ledgerRows ?? []).map((r: any) => ({
    purchaseId: r.purchase_id,
    stripeInvoiceId: r.stripe_invoice_id,
    userId: r.user_id,
    amount: Number(r.amount) || 0,
  }));

  for (const row of purchases ?? []) {
    const p = row as any;
    // Only ask Stripe about the mode we are currently running: a test-mode row
    // cannot be looked up with a live key, and a failed lookup would otherwise
    // read as "this customer never paid".
    let charge: StripeChargeFacts | null = null;
    if (p.stripe_payment_intent_id && p.stripe_mode === mode) {
      try {
        const pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id);
        const refunded = pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge.refunded : false;
        charge = {
          status: refunded ? "refunded" : (pi.status === "succeeded" ? "succeeded" : pi.status === "canceled" ? "failed" : "pending"),
          amountCents: pi.amount ?? null,
          livemode: pi.livemode ?? null,
        };
      } catch {
        // Unreachable or missing — leave null so nobody is accused of not paying.
        unchecked.push(`purchase ${p.id}`);
      }
    }

    findings.push(
      ...auditPurchase(
        {
          id: p.id,
          userId: p.user_id,
          productKey: p.product_key,
          amountCents: p.amount_cents,
          stripeMode: p.stripe_mode,
          status: p.status,
          fulfilledAt: p.fulfilled_at,
          createdAt: p.created_at,
        },
        ledger,
        charge,
      ),
    );
  }

  // ── season passes ─────────────────────────────────────────────────────────
  const { data: profiles } = await admin
    .from("tank_profiles")
    .select(
      "user_id, season_pass_tier, season_pass_active, season_pass_status, season_pass_expires_at, season_pass_tokens_granted_at, stripe_subscription_id, stripe_customer_id, stripe_customer_mode",
    )
    .or("season_pass_active.eq.true,stripe_subscription_id.not.is.null");

  const { data: passGrants } = await admin
    .from("tank_token_transactions")
    .select("user_id, amount, created_at")
    .like("reason", "stripe_subscription:%");

  for (const row of profiles ?? []) {
    const pr = row as any;
    let subscription: StripeSubscriptionFacts | null = null;
    let reachable = true;

    if (pr.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(pr.stripe_subscription_id);
        const product = resolveTankSubscriptionProduct(sub.metadata?.product_key);
        subscription = {
          status: sub.status,
          tier: product?.tier ?? null,
          currentPeriodStart: periodStart(sub),
          livemode: sub.livemode ?? null,
        };
      } catch (error: any) {
        // "No such subscription" in THIS mode is a genuine finding; anything
        // else is our problem, not the member's, so skip rather than accuse.
        if (error?.code === "resource_missing") {
          subscription = null;
        } else {
          reachable = false;
          unchecked.push(`member ${pr.user_id}`);
        }
      }
    }
    if (!reachable) continue;

    const since = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart).getTime() : 0;
    const grantsThisPeriod = (passGrants ?? [])
      .filter((g: any) => g.user_id === pr.user_id && new Date(g.created_at).getTime() >= since)
      .reduce((sum: number, g: any) => sum + (Number(g.amount) || 0), 0);

    findings.push(
      ...auditSeasonPass(
        {
          userId: pr.user_id,
          tier: (pr.season_pass_tier as SeasonPassTier | null) ?? null,
          active: Boolean(pr.season_pass_active),
          status: pr.season_pass_status,
          expiresAt: pr.season_pass_expires_at,
          tokensGrantedAt: pr.season_pass_tokens_granted_at,
          stripeSubscriptionId: pr.stripe_subscription_id,
          stripeCustomerId: pr.stripe_customer_id,
          stripeCustomerMode: pr.stripe_customer_mode,
        },
        subscription,
        grantsThisPeriod,
        mode,
      ),
    );
  }

  const sorted = sortFindings(findings);
  return NextResponse.json({
    mode,
    checkedAt: new Date().toISOString(),
    purchasesChecked: purchases?.length ?? 0,
    passesChecked: profiles?.length ?? 0,
    unchecked,
    summary: summarize(sorted),
    findings: sorted,
  });
}

function periodStart(sub: any): string | null {
  const starts = (sub.items?.data ?? [])
    .map((i: any) => i.current_period_start)
    .filter((v: any) => typeof v === "number" && v > 0);
  if (starts.length === 0) return null;
  return new Date(Math.min(...starts) * 1000).toISOString();
}
