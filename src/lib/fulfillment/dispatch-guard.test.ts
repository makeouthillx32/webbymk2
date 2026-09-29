import { afterEach, describe, expect, test } from "bun:test";
import {
  assertVendorDispatchAllowed,
  authorizeVendorDispatch,
  evaluateVendorDispatch,
  getVendorEnvironment,
} from "./dispatch-guard";

afterEach(() => {
  delete process.env.FULFILLMENT_APLIIQ_ENVIRONMENT;
  delete process.env.FULFILLMENT_GELATO_ENVIRONMENT;
});

describe("vendor dispatch mode guard", () => {
  test("blocks a test Stripe payment from a live vendor", () => {
    expect(evaluateVendorDispatch({
      stripeMode: "test",
      providerEnvironment: "live",
      providerSupportsSandbox: false,
      providerStatus: "test",
    })).toMatchObject({ allowed: false, code: "TEST_PAYMENT_LIVE_VENDOR_BLOCKED" });
  });

  test("allows test dispatch only into a verified provider sandbox", () => {
    expect(evaluateVendorDispatch({
      stripeMode: "test",
      providerEnvironment: "sandbox",
      providerSupportsSandbox: true,
      providerStatus: "test",
    })).toEqual({ allowed: true, code: "DISPATCH_ALLOWED" });

    expect(() => assertVendorDispatchAllowed({
      stripeMode: "test",
      providerEnvironment: "sandbox",
      providerSupportsSandbox: false,
      providerStatus: "test",
    })).toThrow("test stops before vendor dispatch");
  });

  test("allows live payments only against the live vendor environment", () => {
    expect(evaluateVendorDispatch({
      stripeMode: "live",
      providerEnvironment: "live",
      providerSupportsSandbox: false,
      providerStatus: "active",
    }).allowed).toBe(true);
    expect(evaluateVendorDispatch({
      stripeMode: "live",
      providerEnvironment: "sandbox",
      providerSupportsSandbox: true,
      providerStatus: "active",
    })).toMatchObject({ allowed: false, code: "LIVE_PAYMENT_SANDBOX_VENDOR_BLOCKED" });
  });

  test("requires providers to be explicitly enabled for the selected mode", () => {
    expect(evaluateVendorDispatch({
      stripeMode: "test",
      providerEnvironment: "sandbox",
      providerSupportsSandbox: true,
      providerStatus: "evaluating",
    })).toMatchObject({ allowed: false, code: "PROVIDER_NOT_TEST_ENABLED" });
    expect(evaluateVendorDispatch({
      stripeMode: "live",
      providerEnvironment: "live",
      providerSupportsSandbox: true,
      providerStatus: "test",
    })).toMatchObject({ allowed: false, code: "PROVIDER_NOT_LIVE" });
  });

  test("requires an explicit provider environment", () => {
    expect(() => getVendorEnvironment("apliiq")).toThrow("must be explicitly set");
    process.env.FULFILLMENT_APLIIQ_ENVIRONMENT = "live";
    expect(getVendorEnvironment("apliiq")).toBe("live");
  });

  test("audits an allowed sandbox decision before returning authorization", async () => {
    process.env.FULFILLMENT_GELATO_ENVIRONMENT = "sandbox";
    const attempts: any[] = [];
    const db = fakeDispatchDb({
      stripeMode: "test",
      provider: { provider_key: "gelato", status: "test", capabilities: { sandbox: true } },
      attempts,
    });

    await expect(authorizeVendorDispatch(db, {
      orderId: "order-test",
      providerId: "provider-gelato",
    })).resolves.toEqual({ stripeMode: "test", providerEnvironment: "sandbox" });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ decision: "allowed", reason_code: "DISPATCH_ALLOWED" });
  });

  test("records a block without creating any supplier order", async () => {
    process.env.FULFILLMENT_APLIIQ_ENVIRONMENT = "live";
    const attempts: any[] = [];
    const touchedTables: string[] = [];
    const db = fakeDispatchDb({
      stripeMode: "test",
      provider: { provider_key: "apliiq", status: "test", capabilities: {} },
      attempts,
      touchedTables,
    });

    await expect(authorizeVendorDispatch(db, {
      orderId: "order-test",
      providerId: "provider-apliiq",
    })).rejects.toThrow("cannot create live vendor orders");
    expect(attempts[0]).toMatchObject({
      decision: "blocked",
      reason_code: "TEST_PAYMENT_LIVE_VENDOR_BLOCKED",
    });
    expect(touchedTables).not.toContain("supplier_fulfillment_orders");
  });
});

function fakeDispatchDb(input: {
  stripeMode: "test" | "live" | null;
  provider: { provider_key: string; status: string; capabilities: Record<string, unknown> };
  attempts: any[];
  touchedTables?: string[];
}) {
  return {
    from(table: string) {
      input.touchedTables?.push(table);
      if (table === "supplier_dispatch_attempts") {
        return {
          insert: async (row: any) => {
            input.attempts.push(row);
            return { error: null };
          },
        };
      }
      const data = table === "orders"
        ? { stripe_mode: input.stripeMode }
        : input.provider;
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data, error: null }),
          }),
        }),
      };
    },
  };
}
