import { describe, expect, test } from "bun:test";
import {
  catchUpPlaybackRate,
  WHEP_RESYNC_SECONDS,
  WHEP_SYNC_TARGET_SECONDS,
  whepLatencyFromStats,
  whepNeedsHardResync,
  type InboundVideoStatsLike,
} from "./whepLatency";

// Six of these run at once in the grid, over a house where the cameras burn an
// OSD clock into the picture. Every wrong answer here is visible as six
// different times on screen, which is how a viewer found the original bug
// before we did.

const inboundVideo = (delay: number, emitted: number): InboundVideoStatsLike => ({
  type: "inbound-rtp",
  kind: "video",
  jitterBufferDelay: delay,
  jitterBufferEmittedCount: emitted,
});

describe("reading the real latency", () => {
  test("averages jitter buffer delay over emitted frames", () => {
    // 45s of accumulated delay across 100 frames = 0.45s per frame.
    expect(whepLatencyFromStats([inboundVideo(45, 100)])).toBeCloseTo(0.45, 5);
  });

  test("ignores audio and non-inbound entries", () => {
    const report: InboundVideoStatsLike[] = [
      { type: "outbound-rtp", kind: "video", jitterBufferDelay: 99, jitterBufferEmittedCount: 1 },
      { type: "inbound-rtp", kind: "audio", jitterBufferDelay: 99, jitterBufferEmittedCount: 1 },
      inboundVideo(2, 10),
    ];
    expect(whepLatencyFromStats(report)).toBeCloseTo(0.2, 5);
  });

  test("accepts mediaType as well as kind", () => {
    expect(
      whepLatencyFromStats([
        { type: "inbound-rtp", mediaType: "video", jitterBufferDelay: 1, jitterBufferEmittedCount: 4 },
      ]),
    ).toBeCloseTo(0.25, 5);
  });
});

describe("unknown is not zero", () => {
  test("no report reads as unknown", () => {
    expect(whepLatencyFromStats(null)).toBeNull();
    expect(whepLatencyFromStats(undefined)).toBeNull();
    expect(whepLatencyFromStats([])).toBeNull();
  });

  test("before the first frame, 0/0 reads as unknown rather than NaN", () => {
    // NaN compares false against every threshold, which silently disables
    // correction instead of deferring it — the failure mode this replaced.
    expect(whepLatencyFromStats([inboundVideo(0, 0)])).toBeNull();
  });

  test("missing fields read as unknown", () => {
    expect(whepLatencyFromStats([{ type: "inbound-rtp", kind: "video" }])).toBeNull();
  });

  test("nonsense values are refused, not passed through", () => {
    expect(whepLatencyFromStats([inboundVideo(Number.NaN, 10)])).toBeNull();
    expect(whepLatencyFromStats([inboundVideo(-5, 10)])).toBeNull();
  });
});

describe("easing a drifted tile back", () => {
  test("a tile already in sync is never nudged", () => {
    // Correcting noise is how a stable picture starts pulsing.
    expect(catchUpPlaybackRate(0)).toBe(1);
    expect(catchUpPlaybackRate(WHEP_SYNC_TARGET_SECONDS)).toBe(1);
  });

  test("unknown latency never changes playback rate", () => {
    expect(catchUpPlaybackRate(null)).toBe(1);
  });

  test("catch-up ramps in rather than snapping to the maximum", () => {
    const slight = catchUpPlaybackRate(WHEP_SYNC_TARGET_SECONDS + 0.2);
    const worse = catchUpPlaybackRate(WHEP_SYNC_TARGET_SECONDS + 0.8);
    expect(slight).toBeGreaterThan(1);
    expect(worse).toBeGreaterThan(slight);
  });

  test("never exceeds the cap, however far behind", () => {
    // Above ~1.1x the pitch shift is audible and motion looks wrong.
    expect(catchUpPlaybackRate(60)).toBeLessThanOrEqual(1.08);
    expect(catchUpPlaybackRate(WHEP_SYNC_TARGET_SECONDS + 1)).toBeCloseTo(1.08, 3);
  });
});

describe("when playing fast will not save it", () => {
  test("a wedged session is flagged for renegotiation", () => {
    expect(whepNeedsHardResync(WHEP_RESYNC_SECONDS + 1)).toBe(true);
  });

  test("normal drift is not", () => {
    expect(whepNeedsHardResync(1.2)).toBe(false);
    expect(whepNeedsHardResync(WHEP_RESYNC_SECONDS)).toBe(false);
  });

  test("unknown never triggers a reconnect", () => {
    // A tile that has not reported yet must not be torn down for it.
    expect(whepNeedsHardResync(null)).toBe(false);
  });
});
