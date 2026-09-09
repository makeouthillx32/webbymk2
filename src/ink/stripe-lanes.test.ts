import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readStripeLaneSnapshot,
  validateStripeLaneChange,
  writeStripeLaneMode,
} from "./stripe-lanes";
import { applyStripeLaneMode } from "./stripe-lane-apply";

const tempDirs: string[] = [];

function fixture(extra = "") {
  const dir = mkdtempSync(join(tmpdir(), "unaxis-stripe-lanes-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, ".env"), [
    "STRIPE_SECRET_KEY=sk_test_example",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_example",
    "STRIPE_WEBHOOK_SECRET=whsec_test_example",
    extra,
    "",
  ].join("\n"));
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("UNAXIS Stripe lane configuration", () => {
  test("switches one lane without changing the other lanes", () => {
    const dir = fixture();
    const initial = readStripeLaneSnapshot(dir);
    const updated = writeStripeLaneMode(initial, "shop", "test");

    expect(updated.statuses.every((status) => status.mode === "test")).toBe(true);
    expect(updated.original).toContain("STRIPE_SHOP_MODE=test");
    expect(updated.original).toContain("NEXT_PUBLIC_STRIPE_SHOP_MODE=test");
    expect(updated.original).not.toContain("STRIPE_LABS_MODE=");
  });

  test("live mode fails closed without explicit confirmation", () => {
    const snapshot = readStripeLaneSnapshot(fixture([
      "STRIPE_LIVE_SECRET_KEY=sk_live_example",
      "NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_example",
      "STRIPE_LIVE_WEBHOOK_SECRET=whsec_live_example",
    ].join("\n")));

    expect(() => validateStripeLaneChange(snapshot, "shop", "live", false)).toThrow("explicit TUI confirmation");
  });

  test("Labs and Tank live gates cannot be bypassed by ready keys", () => {
    const snapshot = readStripeLaneSnapshot(fixture([
      "STRIPE_LIVE_SECRET_KEY=sk_live_example",
      "NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_example",
      "STRIPE_LIVE_WEBHOOK_SECRET=whsec_live_example",
    ].join("\n")));

    expect(() => validateStripeLaneChange(snapshot, "labs", "live", true)).toThrow("Labs live approval");
    expect(() => validateStripeLaneChange(snapshot, "tank", "live", true)).toThrow("Tank live approval");
  });

  test("an all-lane failure restores env and reapplies the failed lane too", async () => {
    const dir = fixture("STRIPE_SHOP_MODE=live\nSTRIPE_LABS_MODE=live\nSTRIPE_POS_MODE=live\nSTRIPE_TANK_MODE=live");
    const original = readStripeLaneSnapshot(dir).original;
    const calls: string[] = [];
    let firstLabsAttempt = true;

    const code = await applyStripeLaneMode({
      target: "all",
      mode: "test",
      projectDir: dir,
      zones: [
        { key: "shop" },
        { key: "labs" },
        { key: "tank" },
      ] as any,
      applyService: async (lane) => {
        calls.push(lane);
        if (lane === "labs" && firstLabsAttempt) {
          firstLabsAttempt = false;
          return 1;
        }
        return 0;
      },
    });

    expect(code).toBe(1);
    expect(calls).toEqual(["shop", "labs", "labs", "shop"]);
    expect(readStripeLaneSnapshot(dir).original).toBe(original);
  });
});
