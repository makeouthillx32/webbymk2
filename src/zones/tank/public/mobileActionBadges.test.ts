import { describe, expect, it } from "bun:test";
import type { TankInventoryEntry } from "../server/gamification";
import {
  countNewInventoryItems,
  snapshotInventoryQuantities,
} from "./mobileActionBadges";

const item = (itemId: string, quantity: number): TankInventoryEntry => ({
  itemId,
  quantity,
  slug: itemId,
  name: itemId,
  description: null,
  rarity: "common",
  iconUrl: null,
});

describe("mobile action inventory badges", () => {
  it("counts only quantities gained after the acknowledged snapshot", () => {
    expect(
      countNewInventoryItems([item("a", 3), item("b", 1)], { a: 1, b: 1 }),
    ).toBe(2);
  });

  it("does not treat consumed items as new", () => {
    expect(countNewInventoryItems([item("a", 1)], { a: 4 })).toBe(0);
  });

  it("creates a stable acknowledgement snapshot", () => {
    expect(snapshotInventoryQuantities([item("a", 2), item("b", 5)])).toEqual({
      a: 2,
      b: 5,
    });
  });
});
