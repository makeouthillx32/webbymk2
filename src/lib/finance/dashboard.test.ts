import { describe, expect, test } from "bun:test";
import { financialGrowthRate, formatUsd, summarizeFinancialRows } from "./dashboardMath";

describe("financial dashboard summaries", () => {
  test("keeps live and test rows separate and fills missing lanes", () => {
    const summary = summarizeFinancialRows("live", [
      { mode: "live", lane: "shop", gross_cents: "1000", fee_cents: "59", refund_cents: 0, net_cents: "941", transaction_count: "1" },
      { mode: "test", lane: "shop", gross_cents: "5000", fee_cents: "175", refund_cents: 0, net_cents: "4825", transaction_count: "3" },
      { mode: "live", lane: "tank", gross_cents: 999, fee_cents: 59, refund_cents: 0, net_cents: 940, transaction_count: 1 },
    ]);

    expect(summary.netCents).toBe(1881);
    expect(summary.transactionCount).toBe(2);
    expect(summary.lanes).toHaveLength(4);
    expect(summary.lanes.find((lane) => lane.lane === "labs")?.netCents).toBe(0);
  });

  test("computes period growth and formats cents", () => {
    expect(financialGrowthRate(1500, 1000)).toBe(50);
    expect(financialGrowthRate(1000, 0)).toBe(100);
    expect(financialGrowthRate(0, 0)).toBe(0);
    expect(formatUsd(12345)).toBe("$123.45");
  });
});
