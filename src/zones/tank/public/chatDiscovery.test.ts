import { describe, expect, test } from "bun:test";
import {
  findActiveMention,
  getMentionSuggestions,
  insertMention,
} from "./chatDiscovery";

describe("Tank chat discovery", () => {
  test("finds an active mention at the caret", () => {
    expect(findActiveMention("hello @tan")).toEqual({
      start: 6,
      end: 10,
      query: "tan",
    });
    expect(findActiveMention("email@example.com")).toBeNull();
  });

  test("ranks prefix matches and removes duplicate participants", () => {
    expect(
      getMentionSuggestions(
        [
          { userId: "2", name: "Captain Tank" },
          { userId: "1", name: "Tank Master" },
          { userId: "1", name: "Tank Master" },
          { userId: "3", name: "Tanker" },
        ],
        "tank",
        "3",
      ).map((candidate) => candidate.name),
    ).toEqual(["Tank Master", "Captain Tank"]);
  });

  test("inserts a selected display name without losing text after the caret", () => {
    const input = "hey @ta later";
    const active = findActiveMention(input, 7);
    expect(active).not.toBeNull();
    expect(insertMention(input, active!, "Tank Master")).toEqual({
      value: "hey @Tank Master later",
      caretPosition: 17,
    });
  });
});
