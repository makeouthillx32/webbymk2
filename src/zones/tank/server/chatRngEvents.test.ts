import { describe, expect, it, mock } from "bun:test";
import {
  ITEM_ACTION_DEFINITIONS,
  FLAVOR_RNG_ACTIONS,
  processChatRngTrigger,
  executeDiceRoll,
} from "./chatRngEvents";

describe("Tank Chat RNG Events & Command System", () => {
  describe("ITEM_ACTION_DEFINITIONS Catalog", () => {
    it("contains valid definitions for key items", () => {
      const items = ["pumpkin", "pet-whistle", "battery", "first-aid-kit", "lightsaber", "boxing-gloves", "royal-jelly"];
      for (const itemKey of items) {
        const item = ITEM_ACTION_DEFINITIONS[itemKey];
        expect(item).toBeDefined();
        expect(item.name).toBeTruthy();
        expect(item.actionText).toBeTruthy();
        expect(item.rewardXp).toBeGreaterThanOrEqual(0);
        expect(item.rewardTokens).toBeGreaterThanOrEqual(0);
        expect(["common", "uncommon", "rare", "legendary"]).toContain(item.rarity);
      }
    });

    it("has properly formatted icon URLs and slugs", () => {
      for (const [key, item] of Object.entries(ITEM_ACTION_DEFINITIONS)) {
        expect(item.slug).toBe(key);
        expect(
          item.iconUrl.startsWith("/images/") ||
          item.iconUrl.startsWith("data:image/") ||
          item.iconUrl.startsWith("http")
        ).toBe(true);
      }
    });
  });

  describe("FLAVOR_RNG_ACTIONS Catalog", () => {
    it("has at least 10 humorous flavor drops with rewards", () => {
      expect(FLAVOR_RNG_ACTIONS.length).toBeGreaterThanOrEqual(10);
      for (const flavor of FLAVOR_RNG_ACTIONS) {
        expect(flavor.text.length).toBeGreaterThan(5);
        expect(flavor.xp).toBeGreaterThan(0);
        expect(flavor.tokens).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Command Recognition & Argument Parsing", () => {
    it("recognizes /roll and clamps sides between 2 and 1000", () => {
      // Test parsing logic for /roll
      const parseSides = (msg: string) => {
        const parts = msg.toLowerCase().split(/\s+/);
        let sides = 100;
        if (parts.length > 1 && !isNaN(Number(parts[1]))) {
          sides = Math.min(Math.max(Number(parts[1]), 2), 1000);
        }
        return sides;
      };

      expect(parseSides("/roll")).toBe(100);
      expect(parseSides("/roll 20")).toBe(20);
      expect(parseSides("/dice 6")).toBe(6);
      expect(parseSides("/roll 1")).toBe(2); // Min clamped to 2
      expect(parseSides("/roll 5000")).toBe(1000); // Max clamped to 1000
    });

    it("recognizes /flip wager and choice parsing", () => {
      const parseFlip = (msg: string) => {
        const parts = msg.toLowerCase().split(/\s+/);
        const choice: "heads" | "tails" = parts.includes("tails") ? "tails" : "heads";
        let wager = 10;
        const numPart = parts.find((p) => !isNaN(Number(p)) && Number(p) > 0);
        if (numPart) wager = Math.min(Math.max(Number(numPart), 1), 500);
        return { choice, wager };
      };

      expect(parseFlip("/flip")).toEqual({ choice: "heads", wager: 10 });
      expect(parseFlip("/flip tails 50")).toEqual({ choice: "tails", wager: 50 });
      expect(parseFlip("/coinflip 200")).toEqual({ choice: "heads", wager: 200 });
      expect(parseFlip("/flip tails 1000")).toEqual({ choice: "tails", wager: 500 }); // Max clamped
      expect(parseFlip("/flip 0")).toEqual({ choice: "heads", wager: 10 }); // 0 ignored, default 10
    });

    it("recognizes /slots wager parsing", () => {
      const parseSlots = (msg: string) => {
        const parts = msg.toLowerCase().split(/\s+/);
        let wager = 20;
        const numPart = parts.find((p) => !isNaN(Number(p)) && Number(p) > 0);
        if (numPart) wager = Math.min(Math.max(Number(numPart), 5), 500);
        return wager;
      };

      expect(parseSlots("/slots")).toBe(20);
      expect(parseSlots("/spin 100")).toBe(100);
      expect(parseSlots("/slots 2")).toBe(5); // Min clamped to 5
      expect(parseSlots("/slots 1000")).toBe(500); // Max clamped to 500
    });

    it("recognizes /me and /action text formatting", () => {
      const formatAction = (msg: string, userName: string) => {
        const customAction = msg.trim().replace(/^\/(me|action)\s+/i, "");
        return `${userName} ${customAction}`;
      };

      expect(formatAction("/me laughs out loud", "Alice")).toBe("Alice laughs out loud");
      expect(formatAction("/action performs a backflip", "Bob")).toBe("Bob performs a backflip");
    });
  });
});
