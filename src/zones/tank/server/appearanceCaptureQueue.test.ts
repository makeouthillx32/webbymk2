import { beforeEach, describe, expect, test } from "bun:test";
import {
  CAPTURE_TTL_MS,
  claimCaptures,
  describeCaptures,
  enqueueCapture,
  recordOutcome,
  __resetCaptureQueue,
} from "./appearanceCaptureQueue";

// This queue is the only thing standing between "an operator clicked a name"
// and a row that permanently defines what that person looks like. Every test
// here is about a way the click could end up attached to the wrong thing.

beforeEach(() => __resetCaptureQueue());

describe("what gets accepted", () => {
  test("a known target on a named camera queues", () => {
    const result = enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.targetSlug).toBe("tyler");
    // Resolved from the catalog, so the worker cuts the crop for the right
    // roster without having to look the target up itself.
    expect(result.request.detectedClass).toBe("person");
  });

  test("a pet resolves to its own detector class, not to person", () => {
    const result = enqueueCapture({ targetSlug: "molly", cameraId: "cam-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.detectedClass).toBe("dog");
  });

  test("a slug the catalog does not carry is refused at the door", () => {
    // The invisible failure this prevents: a typo'd slug writes a row that is
    // loaded, counted and compared against nothing, forever. Identical on
    // screen to "this person was never enrolled".
    const result = enqueueCapture({ targetSlug: "tylerr", cameraId: "cam-1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not in the detection catalog");
  });

  test("a missing camera or target is refused", () => {
    expect(enqueueCapture({ targetSlug: "", cameraId: "cam-1" }).ok).toBe(false);
    expect(enqueueCapture({ targetSlug: "tyler", cameraId: "  " }).ok).toBe(false);
  });
});

describe("claiming", () => {
  test("a request is handed to the worker exactly once", () => {
    // Claiming twice would enrol one person from two different frames off a
    // single click, quietly doubling their roster entries.
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    expect(claimCaptures()).toHaveLength(1);
    expect(claimCaptures()).toHaveLength(0);
  });

  test("clicking enrol twice replaces the attempt rather than queueing two", () => {
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-2" });
    const claimed = claimCaptures();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].cameraId).toBe("cam-2");
  });

  test("two different people queue side by side", () => {
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    enqueueCapture({ targetSlug: "malia", cameraId: "cam-1" });
    expect(claimCaptures().map((c) => c.targetSlug).sort()).toEqual(["malia", "tyler"]);
  });
});

describe("expiry", () => {
  test("a request nobody claimed expires into a visible failure", () => {
    // A silent disappearance would read as "the click did nothing", which is
    // the single most confusing outcome for an operator standing in a room
    // waiting for their name to appear.
    const now = 1_000_000;
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1", now });
    const later = now + CAPTURE_TTL_MS + 1;

    expect(enqueueCapture({ targetSlug: "malia", cameraId: "cam-1", now: later }).ok).toBe(true);

    const state = describeCaptures(later);
    expect(state.pending.map((p) => p.targetSlug)).toEqual(["malia"]);
    const failed = state.recent.find((r) => r.status === "failed");
    expect(failed?.detail).toContain("Expired");
  });

  test("a request inside the window survives", () => {
    const now = 1_000_000;
    enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1", now });
    const state = describeCaptures(now + CAPTURE_TTL_MS - 1);
    expect(state.pending).toHaveLength(1);
  });
});

describe("outcomes", () => {
  test("a reported outcome is readable by the console", () => {
    const result = enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    claimCaptures();
    recordOutcome(result.request.id, "captured", "Captured from foyer at 0.91 confidence.");

    const state = describeCaptures();
    expect(state.pending).toHaveLength(0);
    expect(state.recent[0].status).toBe("captured");
    expect(state.recent[0].detail).toContain("foyer");
  });

  test("reporting the same outcome twice is harmless", () => {
    // The worker re-sends results when a telemetry post fails, so duplicates
    // are expected rather than exceptional.
    const result = enqueueCapture({ targetSlug: "tyler", cameraId: "cam-1" });
    if (!result.ok) throw new Error("expected enqueue to succeed");
    claimCaptures();
    recordOutcome(result.request.id, "captured", "first");
    recordOutcome(result.request.id, "captured", "first");
    expect(describeCaptures().recent).toHaveLength(1);
  });
});
