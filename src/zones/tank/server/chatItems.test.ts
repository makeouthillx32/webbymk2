import { describe, expect, it } from "bun:test";
import { ITEM_ACTION_DEFINITIONS } from "./chatRngEvents";

describe("Tank In-Game Item Usage & Console Events", () => {
  it("defines the pumpkin item with devastating kick action", () => {
    const pumpkin = ITEM_ACTION_DEFINITIONS["pumpkin"];
    expect(pumpkin).toBeDefined();
    expect(pumpkin.name).toBe("Pumpkin");
    expect(pumpkin.actionText).toContain("lands a devastating kick on their pumpkin");
    expect(pumpkin.rewardXp).toBeGreaterThan(0);
    expect(pumpkin.rewardTokens).toBeGreaterThan(0);
  });

  it("contains valid action text and rewards across all inventory item definitions", () => {
    for (const [slug, def] of Object.entries(ITEM_ACTION_DEFINITIONS)) {
      expect(def.slug).toBe(slug);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.actionText.length).toBeGreaterThan(0);
      expect(def.rewardXp).toBeGreaterThanOrEqual(0);
    }
  });
});
