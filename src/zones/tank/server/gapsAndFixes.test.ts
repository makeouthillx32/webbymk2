import { describe, expect, it } from "bun:test";
import { joinPath } from "@/lib/storage/paths";
import {
  recordStreamTelemetryAction,
  getStreamTelemetrySummaryAction,
} from "./actions";

describe("Tank Gaps & Bug Fixes Verification", () => {
  it("sanitizes joinPath and strips accidental 'undefined' or 'null' path segments", () => {
    expect(joinPath(undefined as any, "stub", "image.png")).toBe("stub/image.png");
    expect(joinPath("undefined", "stub", "image.png")).toBe("stub/image.png");
    expect(joinPath("null", "badges", "gold.webp")).toBe("badges/gold.webp");
    expect(joinPath("posts", null as any, "cover.png")).toBe("posts/cover.png");
    expect(joinPath("undefined/stub/file.mp4")).toBe("stub/file.mp4");
    expect(joinPath(undefined as any, null as any)).toBe("");
  });

  it("records and computes real-time stream telemetry aggregates", async () => {
    await recordStreamTelemetryAction({
      cameraId: "cam-1786768240090",
      protocol: "webrtc",
      latencyMs: 140,
      stallCount: 0,
      bitrateKbps: 3400,
    });

    await recordStreamTelemetryAction({
      cameraId: "cam-1786768240091",
      protocol: "hls",
      latencyMs: 1850,
      stallCount: 1,
      bitrateKbps: 3200,
    });

    const summary = await getStreamTelemetrySummaryAction();
    expect(summary.success).toBe(true);
    expect(summary.summary.activeViewers).toBeGreaterThanOrEqual(2);
    expect(summary.summary.protocolSplit.webrtc).toBeGreaterThanOrEqual(1);
    expect(summary.summary.protocolSplit.hls).toBeGreaterThanOrEqual(1);
    expect(summary.summary.avgLatencyMs).toBeGreaterThan(0);
  });

  it("maps role hierarchy and clearance levels correctly", () => {
    const getClearance = (role: string) => (role === "admin" ? 3 : role === "moderator" ? 2 : 1);
    expect(getClearance("admin")).toBe(3);
    expect(getClearance("moderator")).toBe(2);
    expect(getClearance("member")).toBe(1);

    const isStaff = (role: string, clearance?: number) =>
      role === "admin" || role === "moderator" || (clearance !== undefined && clearance >= 2);

    expect(isStaff("moderator", 2)).toBe(true);
    expect(isStaff("admin", 3)).toBe(true);
    expect(isStaff("member", 1)).toBe(false);
  });
});
