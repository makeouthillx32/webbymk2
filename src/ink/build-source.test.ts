import { describe, expect, test } from "bun:test";
import { buildRefName } from "./build-source";

describe("buildRefName", () => {
  test("is a valid, sortable ref under refs/unaxis/builds", () => {
    const ref = buildRefName("tank", "g1a2b3c4-dirty", new Date("2026-09-30T23:10:05.123Z"));
    expect(ref).toBe("refs/unaxis/builds/tank/g1a2b3c4-dirty-20260930T231005Z");
  });

  test("strips characters git refuses in ref names", () => {
    const ref = buildRefName("my zone", "g..abc@{x}", new Date("2026-01-01T00:00:00Z"));
    expect(ref).not.toMatch(/\s|\.\.|@\{/);
    expect(ref.startsWith("refs/unaxis/builds/my-zone/")).toBe(true);
  });
});
