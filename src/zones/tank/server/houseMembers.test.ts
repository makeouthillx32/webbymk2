import { describe, expect, test } from "bun:test";
import { classifySubject, MEMBER_MATCH_THRESHOLD, subjectLabel, type HouseMember } from "./houseMembers";

// The rule that matters: a body that matches nobody enrolled is a GUEST, and a
// weak match is never given a name. Naming the wrong housemate on screen is
// acted on; an unknown gets checked.

const MEMBERS: HouseMember[] = [
  { id: "m1", displayName: "Tyler", detectorLabel: "member_01" },
];

describe("house member classification", () => {
  test("nobody in frame is not a guest", () => {
    expect(classifySubject({ peopleCount: 0, targetMemberDetected: null, targetMemberConfidence: 0 }))
      .toBe("unresolved");
  });

  test("a body matching nobody enrolled is a guest", () => {
    expect(classifySubject({ peopleCount: 1, targetMemberDetected: null, targetMemberConfidence: 0 }))
      .toBe("guest");
  });

  test("a confident match is a house member", () => {
    expect(classifySubject({ peopleCount: 1, targetMemberDetected: "member_01", targetMemberConfidence: 0.95 }))
      .toBe("house_member");
  });

  test("a weak match is never named", () => {
    const weak = MEMBER_MATCH_THRESHOLD - 0.01;
    expect(classifySubject({ peopleCount: 1, targetMemberDetected: "member_01", targetMemberConfidence: weak }))
      .toBe("unresolved");
  });

  test("the threshold is strict enough to be worth having", () => {
    // A coin-flip match must not clear it.
    expect(MEMBER_MATCH_THRESHOLD).toBeGreaterThan(0.75);
  });

  test("labels resolve to the display name, and unresolved is not an error", () => {
    expect(subjectLabel("house_member", MEMBERS, "member_01")).toBe("TYLER");
    expect(subjectLabel("guest", MEMBERS, null)).toBe("GUEST");
    expect(subjectLabel("unresolved", MEMBERS, null)).toBe("PERSON");
  });
});
