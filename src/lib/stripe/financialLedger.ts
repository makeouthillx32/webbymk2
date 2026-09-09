import Stripe from "stripe";
import type { CommerceStripeMode, PaymentLane } from "./commerce";

type FinancialOwner = {
  lane: PaymentLane;
  orderId: string | null;
  tankPurchaseId: string | null;
};

function validLane(value: string | undefined): PaymentLane | null {
  return value === "shop" || value === "labs" || value === "pos" || value === "tank"
    ? value
    : null;
}

function laneForOrderSource(value: string | null | undefined): PaymentLane {
  if (value === "research") return "labs";
  if (value === "pos") return "pos";
  return "shop";
}

async function resolveOwner(
  supabase: any,
  stripe: Stripe,
  paymentIntent: string | Stripe.PaymentIntent | null,
): Promise<FinancialOwner | null> {
  if (!paymentIntent) return null;
  const intent = typeof paymentIntent === "string"
    ? await stripe.paymentIntents.retrieve(paymentIntent)
    : paymentIntent;
  const metadata = intent.metadata ?? {};
  const metadataLane = validLane(metadata.payment_lane);

  if (metadata.tank_purchase_id) {
    return { lane: "tank", orderId: null, tankPurchaseId: metadata.tank_purchase_id };
  }
  if (metadata.order_id) {
    return {
      lane: metadataLane ?? laneForOrderSource(metadata.order_source),
      orderId: metadata.order_id,
      tankPurchaseId: null,
    };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_source")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  if (order) {
    return { lane: metadataLane ?? laneForOrderSource(order.order_source), orderId: order.id, tankPurchaseId: null };
  }

  const { data: tankPurchase } = await supabase
    .from("tank_purchases")
    .select("id")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  return tankPurchase
    ? { lane: "tank", orderId: null, tankPurchaseId: tankPurchase.id }
    : null;
}

async function expandedBalanceTransaction(
  stripe: Stripe,
  value: string | Stripe.BalanceTransaction | null,
): Promise<Stripe.BalanceTransaction | null> {
  if (!value) return null;
  return typeof value === "string" ? stripe.balanceTransactions.retrieve(value) : value;
}

async function upsertFinancialEntry(
  supabase: any,
  mode: CommerceStripeMode,
  owner: FinancialOwner,
  balanceTransaction: Stripe.BalanceTransaction,
  values: {
    entryType: "charge" | "refund";
    chargeId: string;
    paymentIntentId: string;
    refundId?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("payment_financial_entries").upsert({
    stripe_balance_transaction_id: balanceTransaction.id,
    stripe_charge_id: values.chargeId,
    stripe_payment_intent_id: values.paymentIntentId,
    stripe_refund_id: values.refundId ?? null,
    lane: owner.lane,
    mode,
    entry_type: values.entryType,
    amount_cents: balanceTransaction.amount,
    fee_cents: balanceTransaction.fee,
    net_cents: balanceTransaction.net,
    currency: balanceTransaction.currency.toLowerCase(),
    stripe_status: balanceTransaction.status,
    reporting_category: balanceTransaction.reporting_category,
    order_id: owner.orderId,
    tank_purchase_id: owner.tankPurchaseId,
    occurred_at: new Date(balanceTransaction.created * 1_000).toISOString(),
    available_on: new Date(balanceTransaction.available_on * 1_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "mode,stripe_balance_transaction_id" });

  if (error) throw new Error(`Could not record Stripe funds: ${error.message}`);
}

export async function recordChargeFinancials(
  supabase: any,
  stripe: Stripe,
  chargeInput: string | Stripe.Charge,
  mode: CommerceStripeMode,
): Promise<boolean> {
  const charge = typeof chargeInput === "string"
    ? await stripe.charges.retrieve(chargeInput, { expand: ["balance_transaction"] })
    : chargeInput;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) return false;

  const owner = await resolveOwner(supabase, stripe, charge.payment_intent);
  const balanceTransaction = await expandedBalanceTransaction(stripe, charge.balance_transaction);
  if (!owner || !balanceTransaction) return false;

  await upsertFinancialEntry(supabase, mode, owner, balanceTransaction, {
    entryType: "charge",
    chargeId: charge.id,
    paymentIntentId,
  });
  return true;
}

export async function recordPaymentIntentFinancials(
  supabase: any,
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
  mode: CommerceStripeMode,
): Promise<void> {
  const latestCharge = paymentIntent.latest_charge;
  if (!latestCharge) return;
  await recordChargeFinancials(supabase, stripe, latestCharge, mode);
}

export async function recordRefundFinancials(
  supabase: any,
  stripe: Stripe,
  charge: Stripe.Charge,
  mode: CommerceStripeMode,
): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const owner = await resolveOwner(supabase, stripe, charge.payment_intent);
  if (!owner) return;

  for (const candidate of charge.refunds?.data ?? []) {
    const refund = await stripe.refunds.retrieve(candidate.id, { expand: ["balance_transaction"] });
    if (refund.status !== "succeeded") continue;
    const balanceTransaction = await expandedBalanceTransaction(stripe, refund.balance_transaction);
    if (!balanceTransaction) continue;
    await upsertFinancialEntry(supabase, mode, owner, balanceTransaction, {
      entryType: "refund",
      chargeId: charge.id,
      paymentIntentId,
      refundId: refund.id,
    });
  }
}
