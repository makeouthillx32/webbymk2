import { describe, expect, test } from "bun:test";
import { resolveTankDisplayName } from "./identity";

describe("Tank identity precedence", () => {
  test("keeps a completed Tank username over provider names", () => {
    expect(resolveTankDisplayName({
      tankDisplayName: "Tank Handle",
      coreDisplayName: "Tank Handle",
      authDisplayName: "Google Person",
      providerFullName: "Google Person",
      email: "person@example.com",
    })).toBe("Tank Handle");
  });

  test("falls back cleanly for a brand-new OAuth user", () => {
    expect(resolveTankDisplayName({ providerFullName: "New Person", email: "new@example.com" }))
      .toBe("New Person");
  });
});
