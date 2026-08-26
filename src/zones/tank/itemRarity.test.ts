import { describe, expect, test } from "bun:test";
import { getRarityPresentation, RARITY_PRESENTATION, isItemRarity } from "./itemRarity";
import { ITEM_ACTION_DEFINITIONS } from "./server/chatRngEvents";

describe("Item rarity presentation", () => {
  test("every rarity the database stores has a presentation", () => {
    // These are the actual distinct values in tank_inventory_items.rarity.
    // A rarity with no entry renders as an unstyled card, which is how the
    // crate card ended up hardcoded purple for everything.
    for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) {
      expect(isItemRarity(rarity)).toBe(true);
      expect(RARITY_PRESENTATION[rarity as keyof typeof RARITY_PRESENTATION].text).toBeTruthy();
    }
  });

  test("each tier is visually distinct from the others", () => {
    // If two tiers share a colour the whole feature is decorative only.
    const colors = Object.values(RARITY_PRESENTATION).map((r) => r.text);
    expect(new Set(colors).size).toBe(colors.length);
  });

  test("only epic and above glow", () => {
    // Escalation has to mean something — if everything glows, nothing is rare.
    expect(RARITY_PRESENTATION.common.glow).toBe("");
    expect(RARITY_PRESENTATION.uncommon.glow).toBe("");
    expect(RARITY_PRESENTATION.rare.glow).toBe("");
    expect(RARITY_PRESENTATION.epic.glow).not.toBe("");
    expect(RARITY_PRESENTATION.legendary.glow).not.toBe("");
  });

  test("an unknown or missing rarity still renders", () => {
    // Rarity arrives from both the DB and code; a gap must degrade to a
    // readable card rather than an unstyled or crashing one.
    expect(getRarityPresentation(undefined).label).toBe("Common");
    expect(getRarityPresentation(null).label).toBe("Common");
    expect(getRarityPresentation("nonsense").label).toBe("Common");
    expect(getRarityPresentation("LEGENDARY").label).toBe("Legendary");
  });

  test("every usable item declares a rarity", () => {
    // A missing rarity would silently render every use as common.
    for (const [slug, def] of Object.entries(ITEM_ACTION_DEFINITIONS)) {
      expect(isItemRarity(def.rarity), `${slug} has no valid rarity`).toBe(true);
    }
  });
});
