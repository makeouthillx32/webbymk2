import { describe, expect, test } from "bun:test";
import { buildArchivePlayback, locateInPlayback, wallClockAt } from "./archivePlayback";

const seg = (start: string, dur: number, url: string | null = `/f/${start}`) => ({ playbackUrl: url, segmentStart: start, durationSeconds: dur });

describe("archive playback is one recording per room per day", () => {
  test("a day's master file wins over its segments", () => {
    const p = buildArchivePlayback(
      { url: "/f/master", startedAt: "2026-10-01T00:00:00Z", durationSeconds: 86_400 },
      [seg("2026-10-01T00:00:00Z", 600)],
    )!;
    expect(p.kind).toBe("master");
    expect(p.parts).toHaveLength(1);
    expect(p.durationSeconds).toBe(86_400);
  });

  test("without a master, segments become one timeline in time order", () => {
    const p = buildArchivePlayback(null, [
      seg("2026-10-01T00:10:00Z", 600),
      seg("2026-10-01T00:00:00Z", 600),
      seg("2026-10-01T00:20:00Z", 300),
    ])!;
    expect(p.kind).toBe("stitched");
    expect(p.parts.map((x) => x.offsetSeconds)).toEqual([0, 600, 1200]);
    expect(p.durationSeconds).toBe(1500);
    expect(p.startedAt).toBe("2026-10-01T00:00:00Z");
  });

  test("0-second stubs and segments with no file are not footage", () => {
    const p = buildArchivePlayback(null, [seg("2026-10-01T00:00:00Z", 0), seg("2026-10-01T00:01:00Z", 60, null)]);
    expect(p).toBeNull();
  });

  test("seeking the day timeline lands in the right part", () => {
    const p = buildArchivePlayback(null, [seg("2026-10-01T00:00:00Z", 600), seg("2026-10-01T00:30:00Z", 600)])!;
    expect(locateInPlayback(p, 0)).toEqual({ index: 0, offset: 0 });
    expect(locateInPlayback(p, 650)).toEqual({ index: 1, offset: 50 });
    expect(locateInPlayback(p, 99_999).index).toBe(1);
    // The clock follows the real recording time, gaps included.
    expect(wallClockAt(p, 650).toISOString()).toBe("2026-10-01T00:30:50.000Z");
  });
});
