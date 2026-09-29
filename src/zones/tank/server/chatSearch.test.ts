import { describe, expect, test } from "bun:test";
import { normalizeChatSearchQuery } from "./chatSearch";

describe("Tank chat search query policy", () => {
  test("trims input and removes SQL wildcard characters", () => {
    expect(normalizeChatSearchQuery("  100%_tank  ")).toBe("100tank");
  });

  test("caps a query before it reaches the database", () => {
    expect(normalizeChatSearchQuery("a".repeat(100))).toHaveLength(64);
  });
});
