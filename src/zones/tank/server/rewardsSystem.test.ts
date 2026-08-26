import { describe, expect, it } from "bun:test";
import {
  redeemSecretCodeAction,
  spinPrizeMachineAction,
} from "./rewardsSystem";

describe("Tank Rewards, Prize Machine & Promo Codes System", () => {
  it("spins prize machine and selects a valid weighted drop item", async () => {
    const res = await spinPrizeMachineAction("test-user-1", true);
    expect(res.success).toBe(true);
    expect(res.prize).toBeDefined();
    expect(["item", "tokens", "xp"]).toContain(res.prize!.type);
  });

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
