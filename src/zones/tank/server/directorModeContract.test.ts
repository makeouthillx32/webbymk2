import { describe, expect, test } from "bun:test";
import { isSubjectMode, SUBJECT_MODES } from "./directorTelemetryStore";

describe("durable Director mode contract", () => {
  test("accepts every mode offered by the configurator", () => {
    for (const mode of [
      "auto",
      "person",
      "speaker",
      "feet",
      "face",
      "member",
      "motion",
      "crowd",
      "group",
      "animals",
      "dog",
      "cat",
      "chaos",
      "manual",
      "rotation",
    ]) {
      expect(isSubjectMode(mode)).toBe(true);
      expect(SUBJECT_MODES).toContain(mode);
    }
  });

  test("rejects client defaults outside the server contract", () => {
    expect(isSubjectMode("AUTO_TRACKING")).toBe(false);
    expect(isSubjectMode("speaker ")).toBe(false);
    expect(isSubjectMode(1)).toBe(false);
    expect(isSubjectMode(null)).toBe(false);
  });
});
