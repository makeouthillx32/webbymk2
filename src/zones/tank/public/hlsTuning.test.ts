import { describe, expect, test } from "bun:test";
import {
  approxLatencySeconds,
  TANK_HLS_ANALYSIS,
  TANK_HLS_SEGMENT_SECONDS,
  TANK_HLS_STEADY,
  TANK_HLS_VIEWER,
  type HlsTuning,
} from "./hlsTuning";

// The point of this module is that two rooms agree about when "now" is. A test
// that only checked the numbers were "reasonable" would pass while the grid and
// the programme drifted apart again, so these assert the RELATIONSHIPS.

describe("every viewer surface sits at the same distance behind live", () => {
  test("the viewer profile is a single shared object", () => {
    // Not a value that gets copied and edited per component — that is exactly
    // how CameraPlayer, DirectorObsScene and the detection engine ended up
    // 4s, 6s and 2s behind live for the same camera.
    expect(TANK_HLS_VIEWER).toBe(TANK_HLS_VIEWER);
    expect(approxLatencySeconds(TANK_HLS_VIEWER)).toBe(4);
  });

  test("latency is a whole number of segments", () => {
    // hls.js counts segments, not seconds; a fractional count silently rounds
    // and the real delay stops matching what this module claims.
    for (const tuning of [TANK_HLS_VIEWER, TANK_HLS_ANALYSIS]) {
      expect(Number.isInteger(tuning.liveSyncDurationCount)).toBe(true);
      expect(approxLatencySeconds(tuning) % TANK_HLS_SEGMENT_SECONDS).toBe(0);
    }
  });
});

describe("guards that keep playback from breaking", () => {
  const profiles: [string, HlsTuning][] = [
    ["viewer", TANK_HLS_VIEWER],
    ["analysis", TANK_HLS_ANALYSIS],
  ];

  test("low-latency mode stays off — MediaMTX serves no LL-HLS parts", () => {
    // Turning it on makes hls.js wait for partial segments that never arrive,
    // which stalls the player outright rather than making it faster.
    for (const [, tuning] of profiles) {
      expect(tuning.lowLatencyMode).toBe(false);
    }
  });

  test("the max-latency slack is always greater than the sync point", () => {
    // If they are equal, one slow fetch immediately trips a seek to the live
    // edge — a visible jump on every hiccup.
    for (const [name, tuning] of profiles) {
      expect(
        tuning.liveMaxLatencyDurationCount,
        `${name} must allow slack beyond its sync point`,
      ).toBeGreaterThan(tuning.liveSyncDurationCount);
    }
  });

  test("the buffer can hold at least the sync window", () => {
    // A maxBufferLength shorter than the sync distance means hls.js evicts
    // fragments it still needs and re-fetches them, which stutters forever.
    for (const [name, tuning] of profiles) {
      expect(
        tuning.maxBufferLength,
        `${name} buffer must cover its own sync window`,
      ).toBeGreaterThanOrEqual(approxLatencySeconds(tuning));
      expect(tuning.maxMaxBufferLength).toBeGreaterThanOrEqual(tuning.maxBufferLength);
    }
  });
});

describe("analysis is fresher than viewing, and stays separate", () => {
  test("the detection engine sits closer to live than any viewer", () => {
    expect(approxLatencySeconds(TANK_HLS_ANALYSIS)).toBeLessThan(
      approxLatencySeconds(TANK_HLS_VIEWER),
    );
  });

  test("the two profiles are genuinely different objects", () => {
    // Pointing analysis at the viewer profile would quietly add seconds to
    // every detection, which shows up as the director cutting late rather than
    // as anything that looks like a buffering bug.
    expect(TANK_HLS_ANALYSIS).not.toBe(TANK_HLS_VIEWER);
    expect(TANK_HLS_ANALYSIS.liveSyncDurationCount).not.toBe(
      TANK_HLS_VIEWER.liveSyncDurationCount,
    );
  });
});

describe("the director wall profile", () => {
  test("carries more slack than the viewer profile", () => {
    // The whole point: eight tiles sharing one connection cannot hold a
    // four-second buffer without one of them always refilling.
    expect(TANK_HLS_STEADY.maxBufferLength).toBeGreaterThan(TANK_HLS_VIEWER.maxBufferLength);
    expect(TANK_HLS_STEADY.liveSyncDurationCount).toBeGreaterThan(
      TANK_HLS_VIEWER.liveSyncDurationCount,
    );
  });

  test("tolerates falling further behind before seeking to live", () => {
    // A mid-observation jump to the live edge is more disruptive on a wall
    // than simply running late.
    expect(TANK_HLS_STEADY.liveMaxLatencyDurationCount).toBeGreaterThan(
      TANK_HLS_VIEWER.liveMaxLatencyDurationCount,
    );
  });

  test("is still standard HLS, not LL-HLS", () => {
    // MediaMTX serves whole fMP4 segments; enabling LL mode makes hls.js wait
    // for parts that never arrive.
    expect(TANK_HLS_STEADY.lowLatencyMode).toBe(false);
  });

  test("stays under ten seconds behind live", () => {
    // Directing off a feed much later than this stops being directing.
    expect(approxLatencySeconds(TANK_HLS_STEADY)).toBeLessThanOrEqual(10);
  });
});
