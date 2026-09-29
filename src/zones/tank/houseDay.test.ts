import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateHouseDay } from "./houseDay";

describe("calculateHouseDay", () => {
  const startedAt = "2026-09-13T20:00:00.000Z";

  test("starts at day one", () => {
    expect(calculateHouseDay(startedAt, new Date(startedAt))).toBe(1);
  });

  test("advances only after each complete 24-hour interval", () => {
    expect(calculateHouseDay(startedAt, new Date("2026-09-14T19:59:59.999Z"))).toBe(1);
    expect(calculateHouseDay(startedAt, new Date("2026-09-14T20:00:00.000Z"))).toBe(2);
  });

  test("fails closed for missing or invalid timestamps", () => {
    expect(calculateHouseDay(null, new Date())).toBeNull();
    expect(calculateHouseDay("not-a-date", new Date())).toBeNull();
  });

  test("the public experience uses the house reset anchor, not the season date", () => {
    const source = readFileSync(
      join(import.meta.dir, "public", "TankExperience.tsx"),
      "utf8",
    );

    expect(source).toContain("calculateHouseDay(houseDayStartedAt, now)");
    expect(source).toContain("seasonDay={houseDay}");
    expect(source).not.toContain("new Date(season.startsAt)");
  });
});
