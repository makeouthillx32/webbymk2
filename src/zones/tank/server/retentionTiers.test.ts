import { afterEach, describe, expect, test } from "bun:test";
import { browsableCutoff, resolveBrowsableDays, resolveHotWindowHours } from "./archiveDrain";

const saved = process.env.TANK_ARCHIVE_BROWSABLE_DAYS;
afterEach(() => {
  process.env.TANK_ARCHIVE_BROWSABLE_DAYS = saved;
});

describe("archive retention tiers", () => {
  test("defaults to a 4-day browsable window", () => {
    delete process.env.TANK_ARCHIVE_BROWSABLE_DAYS;
    expect(resolveBrowsableDays()).toBe(4);
  });

  test("honours zero rather than treating it as unset", () => {
    // "convert everything already drained" is a real instruction; substituting
    // the default would make the command look like it did nothing.
    process.env.TANK_ARCHIVE_BROWSABLE_DAYS = "0";
    expect(resolveBrowsableDays()).toBe(0);
  });

  test("ignores a non-numeric value instead of producing NaN", () => {
    process.env.TANK_ARCHIVE_BROWSABLE_DAYS = "four";
    expect(resolveBrowsableDays()).toBe(4);
  });

  test("cutoff is four days back from now", () => {
    delete process.env.TANK_ARCHIVE_BROWSABLE_DAYS;
    const now = new Date("2026-08-20T12:00:00Z");
    expect(browsableCutoff(now).toISOString()).toBe("2026-08-16T12:00:00.000Z");
  });

  test("browsable window is independent of the hot window", () => {
    // Draining moves bytes off Supabase; the browsable window decides what a
    // member can still find. Conflating them makes footage vanish from the UI
    // the moment it drains.
    delete process.env.TANK_ARCHIVE_BROWSABLE_DAYS;
    const now = new Date("2026-08-20T12:00:00Z");
    const hotHours = resolveHotWindowHours();
    const hotCut = new Date(now.getTime() - hotHours * 3600_000);
    expect(browsableCutoff(now).getTime()).toBeLessThan(hotCut.getTime());
  });
});
