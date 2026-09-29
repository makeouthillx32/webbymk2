import { describe, expect, test } from "bun:test";
import { isSystemPillMessage } from "./chatMessagePresentation";

describe("Tank chat message presentation", () => {
  test("an external human stays a normal chat row without a Tank user id", () => {
    expect(
      isSystemPillMessage({
        user: "robuhh",
        userId: undefined,
        messageType: "text",
        role: "viewer",
      }),
    ).toBe(false);
  });

  test("a legacy human message without a user id also stays a normal row", () => {
    expect(
      isSystemPillMessage({
        user: "older-viewer",
        userId: undefined,
        messageType: "text",
        role: undefined,
      }),
    ).toBe(false);
  });

  test("real system and announcement messages remain centered pills", () => {
    expect(
      isSystemPillMessage({
        user: "SYSTEM",
        userId: undefined,
        messageType: "system",
        role: "system",
      }),
    ).toBe(true);
    expect(
      isSystemPillMessage({
        user: "Tank",
        userId: undefined,
        messageType: "announcement",
        role: undefined,
      }),
    ).toBe(true);
  });
});
