import { describe, expect, test } from "bun:test";
import { getFreshTelemetry, recordTelemetry } from "./directorTelemetryStore";

// Next bundles this store into every route that imports it. Its state must be
// ONE per process (globalThis), or the worker's readings land in the ingest
// route's copy and the director never sees a box (2026-11-04).
describe("telemetry store is shared across module copies", () => {
  test("readings live on globalThis, not in the module", () => {
    const reading = { cameraId: "cam-shared-test", peopleCount: 1, visibleFeetCount: 0, feetConfidence: 0, faceCount: 0, motionScore: 0, audioPeak: 0, isSpeaking: false, boundingBoxes: [{ nx: 0.4, ny: 0.4, nw: 0.1, nh: 0.4, label: "person", targetName: "tyler" }] };
    recordTelemetry([reading], null, "server");
    expect(globalThis.__tankTelemetryStore?.telemetry.get("cam-shared-test")?.telemetry.boundingBoxes?.[0].targetName).toBe("tyler");
    expect(getFreshTelemetry().some((r) => r.cameraId === "cam-shared-test")).toBe(true);
    globalThis.__tankTelemetryStore?.telemetry.delete("cam-shared-test");
  });
});
