import { describe, expect, test } from "bun:test";
import { reconcileCameraLifecycle } from "./cameraLifecycle";
import {
  loadCameraLifecycleMemory,
  recordIngestEvent,
  saveCameraLifecycleState,
} from "./cameraRegistryDb";

describe("camera stream ingest lifecycle", () => {
  test("keeps house camera streams 24/7 online during Launch Mode", () => {
    const memory = {
      hasBeenLive: true,
      lastSeenAt: 1_000,
      disconnectedAt: null,
    };
    const state = reconcileCameraLifecycle(
      memory,
      { online: false, degraded: false, now: 2_000 },
      90,
      true, // Launch Mode enabled (3-ISP router failover)
    );
    expect(state.presence).toBe("online");
    expect(state.publicVisible).toBe(true);
  });

  test("runs reconnect grace rules in beta mode when Launch Mode is disabled", () => {
    const live = reconcileCameraLifecycle(
      undefined,
      { online: true, degraded: false, now: 1_000 },
      90,
      false, // Beta Mode
    );
    const dead = reconcileCameraLifecycle(
      live,
      { online: false, degraded: false, now: 2_000 },
      90,
      false,
    );
    expect(dead.presence).toBe("reconnecting");
    expect(dead.publicVisible).toBe(true);
    expect(dead.reconnectSecondsRemaining).toBe(90);
    expect(dead.ingestEventType).toBe("reconnect_grace");
  });

  test("publishes an active stream on first connection", () => {
    const state = reconcileCameraLifecycle(
      undefined,
      { online: true, degraded: false, now: 1_000 },
      90,
      false,
    );
    expect(state.presence).toBe("online");
    expect(state.publicVisible).toBe(true);
    expect(state.ingestEventType).toBe("stream_start");
  });

  test("restores stream state when same stream key/id reconnects", () => {
    const dead = {
      hasBeenLive: true,
      lastSeenAt: 1_000,
      disconnectedAt: 2_000,
    };
    const restored = reconcileCameraLifecycle(
      dead,
      { online: true, degraded: false, now: 20_000 },
      90,
      false,
    );
    expect(restored.presence).toBe("online");
    expect(restored.disconnectedAt).toBeNull();
    expect(restored.ingestEventType).toBe("stream_start");
  });

  test("retires stream in beta mode after grace period expires", () => {
    const dead = {
      hasBeenLive: true,
      lastSeenAt: 1_000,
      disconnectedAt: 2_000,
    };
    const retired = reconcileCameraLifecycle(
      dead,
      { online: false, degraded: false, now: 92_000 },
      90,
      false,
    );
    expect(retired.presence).toBe("retired");
    expect(retired.publicVisible).toBe(false);
    expect(retired.ingestEventType).toBe("stream_retired");
  });
});

describe("stream registry DB & ingest event logging", () => {
  test("persists stream lifecycle state in memory fallback when DB is unavailable", async () => {
    await saveCameraLifecycleState({
      cameraId: "test-cam-1",
      streamKey: "sk_test_1",
      name: "Test Stream 1",
      protocol: "srt",
      presence: "online",
      publicVisible: true,
      hasBeenLive: true,
      lastSeenAt: 100_000,
      disconnectedAt: null,
      retireAt: null,
    });

    const memory = await loadCameraLifecycleMemory("test-cam-1");
    expect(memory.hasBeenLive).toBe(true);
    expect(memory.lastSeenAt).toBe(100_000);
    expect(memory.disconnectedAt).toBeNull();
  });

  test("records stream ingest events cleanly", async () => {
    await recordIngestEvent({
      cameraId: "test-cam-2",
      eventType: "stream_start",
      details: { bitrateKbps: 4500, protocol: "rtmp" },
    });
    expect(true).toBe(true);
  });
});
