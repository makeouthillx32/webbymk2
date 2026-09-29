import { describe, expect, it } from "bun:test";
import { redeemSecretCodeAction } from "./rewardsSystem";

// The Prize Machine spin moved to spinTankPrizeMachine in actions.ts — it's
// session-authenticated and writes to the real database, so it isn't unit
// tested here the way the old fake, no-auth version was; that coverage was
// validating non-functional behavior anyway (see rewardsSystem.ts header).
describe("Tank Rewards & Promo Codes System", () => {
  it("redeems valid launch promotional code successfully", async () => {
    const res = await redeemSecretCodeAction("LAUNCH2026", "test-user-1");
    expect(res.success).toBe(true);
    expect(res.xpAwarded).toBe(500);
    expect(res.tokensAwarded).toBe(100);
    expect(res.itemAwarded).toBe("Founders Key");
  });

  it("rejects duplicate secret code redemptions", async () => {
    const res = await redeemSecretCodeAction("LAUNCH2026", "test-user-1");
    expect(res.success).toBe(false);
    expect(res.error).toContain("already redeemed");
  });

  it("rejects invalid code", async () => {
    const res = await redeemSecretCodeAction("NOTAREALCODE99", "test-user-1");
    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid or expired");
  });
});
