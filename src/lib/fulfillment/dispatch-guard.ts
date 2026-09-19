import type { CommerceStripeMode } from "@/lib/stripe/commerce";

export type VendorEnvironment = "sandbox" | "live";
export type FulfillmentProviderStatus = "evaluating" | "test" | "active" | "paused" | "disabled";

export type VendorDispatchDecision =
  | { allowed: true; code: "DISPATCH_ALLOWED" }
  | {
      allowed: false;
      code:
        | "TEST_PAYMENT_LIVE_VENDOR_BLOCKED"
        | "PROVIDER_SANDBOX_UNAVAILABLE"
        | "LIVE_PAYMENT_SANDBOX_VENDOR_BLOCKED"
        | "PROVIDER_NOT_TEST_ENABLED"
        | "PROVIDER_NOT_LIVE";
      reason: string;
    };

export function evaluateVendorDispatch(input: {
  stripeMode: CommerceStripeMode;
  providerEnvironment: VendorEnvironment;
  providerSupportsSandbox: boolean;
  providerStatus: FulfillmentProviderStatus;
}): VendorDispatchDecision {
  if (input.stripeMode === "test") {
    if (input.providerEnvironment !== "sandbox") {
      return {
        allowed: false,
        code: "TEST_PAYMENT_LIVE_VENDOR_BLOCKED",
        reason: "Stripe test payments cannot create live vendor orders or shipments.",
      };
    }
    if (!input.providerSupportsSandbox) {
      return {
        allowed: false,
        code: "PROVIDER_SANDBOX_UNAVAILABLE",
        reason: "This provider has no verified sandbox, so the test stops before vendor dispatch.",
      };
    }
    if (input.providerStatus !== "test" && input.providerStatus !== "active") {
      return {
        allowed: false,
        code: "PROVIDER_NOT_TEST_ENABLED",
        reason: "This provider has not been enabled for sandbox testing.",
      };
    }
    return { allowed: true, code: "DISPATCH_ALLOWED" };
  }

  if (input.providerEnvironment !== "live") {
    return {
      allowed: false,
      code: "LIVE_PAYMENT_SANDBOX_VENDOR_BLOCKED",
      reason: "A live customer payment cannot be fulfilled by a sandbox vendor order.",
    };
  }
  if (input.providerStatus !== "active") {
    return {
      allowed: false,
      code: "PROVIDER_NOT_LIVE",
      reason: "A live customer payment requires an active fulfillment provider.",
    };
  }

  return { allowed: true, code: "DISPATCH_ALLOWED" };
}

export function assertVendorDispatchAllowed(
  input: Parameters<typeof evaluateVendorDispatch>[0],
): void {
  const decision = evaluateVendorDispatch(input);
  if (decision.allowed === false) {
    const error = new Error(decision.reason);
    error.name = decision.code;
    throw error;
  }
}

export function getVendorEnvironment(providerKey: string): VendorEnvironment {
  const envKey = `FULFILLMENT_${providerKey.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_ENVIRONMENT`;
  const value = process.env[envKey]?.trim().toLowerCase();
  if (value !== "sandbox" && value !== "live") {
    throw new Error(`${envKey} must be explicitly set to sandbox or live`);
  }
  return value;
}

/**
 * Required doorway before any provider order-creation HTTP request.
 * It records the decision first and fails closed if the audit cannot be saved.
 * A blocked attempt never receives an external order ID and never creates a
 * supplier_fulfillment_orders row.
 */
export async function authorizeVendorDispatch(
  supabase: any,
  input: { orderId: string; providerId: string },
): Promise<{ stripeMode: CommerceStripeMode; providerEnvironment: VendorEnvironment }> {
  const [{ data: order, error: orderError }, { data: provider, error: providerError }] = await Promise.all([
    supabase.from("orders").select("stripe_mode").eq("id", input.orderId).single(),
    supabase
      .from("fulfillment_providers")
      .select("provider_key, status, capabilities")
      .eq("id", input.providerId)
      .single(),
  ]);
  if (orderError || !order) throw new Error(orderError?.message ?? "Shop order not found");
  if (providerError || !provider) throw new Error(providerError?.message ?? "Fulfillment provider not found");

  const stripeMode = order.stripe_mode;
  if (stripeMode !== "test" && stripeMode !== "live") {
    throw new Error("Vendor dispatch blocked: Shop order has no verified Stripe mode");
  }
  const providerEnvironment = getVendorEnvironment(provider.provider_key);
  const decision = evaluateVendorDispatch({
    stripeMode,
    providerEnvironment,
    providerSupportsSandbox: provider.capabilities?.sandbox === true,
    providerStatus: provider.status,
  });
  const auditReason = decision.allowed === true
    ? "Mode and provider environment are compatible."
    : decision.reason;

  const { error: auditError } = await supabase.from("supplier_dispatch_attempts").insert({
    provider_id: input.providerId,
    order_id: input.orderId,
    payment_mode: stripeMode,
    requested_environment: providerEnvironment,
    decision: decision.allowed ? "allowed" : "blocked",
    reason_code: decision.code,
    reason: auditReason,
  });
  if (auditError) throw new Error(`Vendor dispatch blocked: audit write failed: ${auditError.message}`);

  assertVendorDispatchAllowed({
    stripeMode,
    providerEnvironment,
    providerSupportsSandbox: provider.capabilities?.sandbox === true,
    providerStatus: provider.status,
  });
  return { stripeMode, providerEnvironment };
}
