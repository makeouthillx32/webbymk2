import { describe, expect, test } from "bun:test";
import {
  auditPurchase,
  auditSeasonPass,
  summarize,
  sortFindings,
  IRL_ACK_MS,
  STUCK_PENDING_MS,
  type LedgerRecord,
  type PassRecord,
  type PurchaseRecord,
} from "./fulfillmentAudit";

// These checks exist because each of them has a real customer on the other end.
// The bar is not "does it return an array" — it is whether the finding tells the
// operator which direction the money went wrong, because "paid and got nothing"
// and "got it free" need opposite responses.

const NOW = new Date("2026-09-14T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const purchase = (over: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: "p1",
  userId: "u1",
  productKey: "tokens_500",
  amountCents: 499,
  stripeMode: "live",
  status: "paid",
  fulfilledAt: NOW.toISOString(),
  createdAt: ago(60_000),
  ...over,
});

const grant = (over: Partial<LedgerRecord> = {}): LedgerRecord => ({
  purchaseId: "p1",
  stripeInvoiceId: null,
  userId: "u1",
  amount: 500,
  ...over,
});

const codes = (fs: { code: string }[]) => fs.map((f) => f.code).sort();

describe("the happy path stays silent", () => {
  test("paid, granted the catalog amount, nothing reported", () => {
    const findings = auditPurchase(
      purchase(),
      [grant()],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    expect(findings).toEqual([]);
    expect(summarize(findings).clean).toBe(true);
  });
});

describe("paid and received nothing — the loudest failure", () => {
  test("charge succeeded but the row never left pending", () => {
    const findings = auditPurchase(
      purchase({ status: "pending", fulfilledAt: null, createdAt: ago(STUCK_PENDING_MS + 60_000) }),
      [],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    expect(codes(findings)).toContain("paid_not_fulfilled");
    expect(findings.every((f) => f.severity === "critical")).toBe(true);
  });

  test("marked paid with an empty ledger", () => {
    // Exactly the partial-index bug: activation landed, the grant threw.
    const findings = auditPurchase(
      purchase(),
      [],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    expect(codes(findings)).toContain("paid_no_tokens");
    expect(findings.find((f) => f.code === "paid_no_tokens")?.remedy).toContain("500");
  });
});

describe("received more than was paid for", () => {
  test("two ledger rows for one purchase is critical", () => {
    const findings = auditPurchase(
      purchase(),
      [grant(), grant()],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    const dup = findings.find((f) => f.code === "duplicate_grant");
    expect(dup?.severity).toBe("critical");
    // Points at the cause we have actually hit, not a generic "investigate".
    expect(dup?.remedy).toContain("unique index");
  });

  test("granted the wrong number of tokens", () => {
    const findings = auditPurchase(
      purchase(),
      [grant({ amount: 5000 })],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    expect(codes(findings)).toContain("grant_amount_mismatch");
  });
});

describe("money and records disagreeing", () => {
  test("charged a different amount than recorded", () => {
    const findings = auditPurchase(
      purchase(),
      [grant()],
      { status: "succeeded", amountCents: 1299, livemode: true },
      NOW,
    );
    const f = findings.find((x) => x.code === "charged_amount_mismatch");
    expect(f?.severity).toBe("critical");
    // Never auto-correct a figure that came off a real card.
    expect(f?.remedy).toContain("Do not adjust silently");
  });

  test("a live charge recorded as test revenue", () => {
    const findings = auditPurchase(
      purchase({ stripeMode: "test" }),
      [grant()],
      { status: "succeeded", amountCents: 499, livemode: true },
      NOW,
    );
    expect(codes(findings)).toContain("mode_mismatch");
  });

  test("refunded but the tokens are still spendable", () => {
    const findings = auditPurchase(
      purchase(),
      [grant()],
      { status: "refunded", amountCents: 499, livemode: true },
      NOW,
    );
    const f = findings.find((x) => x.code === "refunded_but_granted");
    expect(f?.severity).toBe("warning");
    expect(f?.remedy).toContain("cannot be un-spent");
  });
});

describe("an unreachable Stripe is not an absent charge", () => {
  test("null charge facts never accuse anyone of not paying", () => {
    // If a lookup failure read as 'no charge exists', one API blip would report
    // every customer in the system as unpaid.
    const findings = auditPurchase(purchase(), [grant()], null, NOW);
    expect(codes(findings)).not.toContain("paid_not_fulfilled");
    expect(codes(findings)).not.toContain("mode_mismatch");
    expect(findings).toEqual([]);
  });
});

describe("abandoned versus stalled", () => {
  test("a fresh pending purchase is somebody still typing", () => {
    expect(auditPurchase(purchase({ status: "pending", fulfilledAt: null }), [], null, NOW)).toEqual([]);
  });

  test("old pending with no charge is abandoned, not an emergency", () => {
    const findings = auditPurchase(
      purchase({ status: "pending", fulfilledAt: null, createdAt: ago(STUCK_PENDING_MS + 60_000) }),
      [],
      { status: null, amountCents: null, livemode: null },
      NOW,
    );
    const f = findings.find((x) => x.code === "stuck_pending");
    expect(f?.severity).toBe("warning");
  });
});

describe("real-world bookings cannot be fulfilled by code", () => {
  const bnb = (over: Partial<PurchaseRecord> = {}) =>
    purchase({ productKey: "tank_bnb", amountCents: 250_000, fulfilledAt: null, ...over });

  test("a fresh booking is flagged as awaiting staff, not as an error", () => {
    const findings = auditPurchase(bnb(), [], { status: "succeeded", amountCents: 250_000, livemode: true }, NOW);
    const f = findings.find((x) => x.code === "irl_awaiting_booking");
    expect(f?.severity).toBe("warning");
    expect(f?.detail).toContain("$2500.00");
  });

  test("unbooked after two days is critical", () => {
    // Nothing on the money side looks wrong here — Stripe is perfectly happy.
    // This is the only signal that someone paid thousands and heard nothing.
    const findings = auditPurchase(
      bnb({ createdAt: ago(IRL_ACK_MS + 60_000) }),
      [],
      { status: "succeeded", amountCents: 250_000, livemode: true },
      NOW,
    );
    expect(findings.find((x) => x.code === "irl_awaiting_booking")?.severity).toBe("critical");
  });

  test("a booked stay is silent", () => {
    const findings = auditPurchase(
      bnb({ fulfilledAt: NOW.toISOString() }),
      [],
      { status: "succeeded", amountCents: 250_000, livemode: true },
      NOW,
    );
    expect(codes(findings)).not.toContain("irl_awaiting_booking");
  });

  test("an IRL item is never reported as missing tokens", () => {
    // It grants no tokens by design; a token check firing here would be noise
    // that trains staff to ignore the list.
    const findings = auditPurchase(bnb(), [], { status: "succeeded", amountCents: 250_000, livemode: true }, NOW);
    expect(codes(findings)).not.toContain("paid_no_tokens");
  });
});

// ── season passes ───────────────────────────────────────────────────────────

const pass = (over: Partial<PassRecord> = {}): PassRecord => ({
  userId: "u1",
  tier: "base",
  active: true,
  status: "active",
  expiresAt: "2026-10-13T00:00:00Z",
  tokensGrantedAt: NOW.toISOString(),
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  stripeCustomerMode: "live",
  ...over,
});

describe("season pass entitlement matches billing", () => {
  test("billed and entitled with the right tokens is silent", () => {
    const findings = auditSeasonPass(
      pass(),
      { status: "active", tier: "base", currentPeriodStart: "2026-09-13T00:00:00Z", livemode: true },
      100,
      "live",
      NOW,
    );
    expect(findings).toEqual([]);
  });

  test("billing with no pass is critical — the customer is paying for nothing", () => {
    const findings = auditSeasonPass(
      pass({ active: false, tier: null }),
      { status: "active", tier: "base", currentPeriodStart: null, livemode: true },
      0,
      "live",
      NOW,
    );
    const f = findings.find((x) => x.code === "paid_not_fulfilled");
    expect(f?.severity).toBe("critical");
  });

  test("a pass with no subscription behind it is unpaid access", () => {
    const findings = auditSeasonPass(pass(), null, 100, "live", NOW);
    expect(codes(findings)).toContain("entitled_without_subscription");
  });

  test("canceled in Stripe but still active here", () => {
    const findings = auditSeasonPass(
      pass(),
      { status: "canceled", tier: "base", currentPeriodStart: null, livemode: true },
      100,
      "live",
      NOW,
    );
    expect(codes(findings)).toContain("subscription_without_entitlement");
  });

  test("tier drift between Stripe and the profile", () => {
    const findings = auditSeasonPass(
      pass({ tier: "base" }),
      { status: "active", tier: "xl", currentPeriodStart: null, livemode: true },
      100,
      "live",
      NOW,
    );
    const f = findings.find((x) => x.code === "tier_mismatch");
    expect(f?.severity).toBe("critical");
    // Names the actual mechanism, since tier comes from metadata not the price.
    expect(f?.remedy).toContain("metadata");
  });

  test("active past its expiry", () => {
    const findings = auditSeasonPass(
      pass({ expiresAt: "2026-08-01T00:00:00Z" }),
      { status: "active", tier: "base", currentPeriodStart: null, livemode: true },
      100,
      "live",
      NOW,
    );
    expect(codes(findings)).toContain("expired_but_active");
  });
});

describe("the monthly grant", () => {
  test("billed but granted nothing is critical", () => {
    const findings = auditSeasonPass(
      pass(),
      { status: "active", tier: "base", currentPeriodStart: "2026-09-13T00:00:00Z", livemode: true },
      0,
      "live",
      NOW,
    );
    const f = findings.find((x) => x.code === "missing_monthly_grant");
    expect(f?.severity).toBe("critical");
    expect(f?.detail).toContain("0 of 100");
  });

  test("granted more than the tier allows", () => {
    const findings = auditSeasonPass(
      pass(),
      { status: "active", tier: "base", currentPeriodStart: null, livemode: true },
      450,
      "live",
      NOW,
    );
    const f = findings.find((x) => x.code === "duplicate_grant");
    expect(f?.severity).toBe("critical");
    expect(f?.remedy).toContain("partial index");
  });

  test("xl is measured against 350, not 100", () => {
    const clean = auditSeasonPass(
      pass({ tier: "xl" }),
      { status: "active", tier: "xl", currentPeriodStart: null, livemode: true },
      350,
      "live",
      NOW,
    );
    expect(clean).toEqual([]);
  });
});

describe("customer mode", () => {
  test("a customer from the other mode is flagged but not alarming", () => {
    // This broke live checkout outright before the guard existed; with it, the
    // only consequence is a fresh customer object.
    const findings = auditSeasonPass(
      pass({ stripeCustomerMode: "test" }),
      { status: "active", tier: "base", currentPeriodStart: null, livemode: true },
      100,
      "live",
      NOW,
    );
    const f = findings.find((x) => x.code === "customer_mode_mismatch");
    expect(f?.severity).toBe("warning");
  });
});

describe("triage ordering", () => {
  test("critical findings sort above warnings", () => {
    const sorted = sortFindings([
      { code: "expired_but_active", severity: "warning", userId: null, subject: "s", detail: "d", remedy: null },
      { code: "paid_no_tokens", severity: "critical", userId: null, subject: "s", detail: "d", remedy: null },
    ]);
    expect(sorted[0].severity).toBe("critical");
  });

  test("summary counts by severity and only calls empty clean", () => {
    const s = summarize([
      { code: "paid_no_tokens", severity: "critical", userId: null, subject: "s", detail: "d", remedy: null },
      { code: "expired_but_active", severity: "warning", userId: null, subject: "s", detail: "d", remedy: null },
    ]);
    expect(s).toEqual({ critical: 1, warning: 1, info: 0, clean: false });
  });
});
