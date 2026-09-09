import Stripe from "stripe";
import { createAdminClient } from "../src/utils/supabase/admin";
import { recordChargeFinancials } from "../src/lib/stripe/financialLedger";
import type { CommerceStripeMode } from "../src/lib/stripe/commerce";

const requestedMode = process.argv.find((value) => value.startsWith("--mode="))?.split("=")[1];
const mode: CommerceStripeMode = requestedMode === "live" ? "live" : "test";
const key = mode === "live" ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
const expectedPrefix = mode === "live" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;

if (!key || !expectedPrefix.test(key)) {
  throw new Error(`Stripe ${mode} key is missing or has the wrong mode.`);
}

const stripe = new Stripe(key);
const supabase = createAdminClient();
let reconciled = 0;
let ownerless = 0;

for await (const charge of stripe.charges.list({ limit: 100 })) {
  if (!charge.paid || !charge.captured) continue;
  if (await recordChargeFinancials(supabase, stripe, charge.id, mode)) reconciled += 1;
  else ownerless += 1;
}

process.stdout.write(JSON.stringify({ mode, reconciled, ownerless }) + "\n");
