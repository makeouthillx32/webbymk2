import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetTelemetry,
  getServerAppearanceStatus,
  recordServerAppearanceStatus,
} from "./directorTelemetryStore";

afterEach(() => __resetTelemetry());

describe("server appearance status", () => {
  test("surfaces only bounded counts and readiness metadata", () => {
    recordServerAppearanceStatus(
      {
        signatures: 17,
        classes: ["person", "cat", "dog"],
        targets: { tyler: 1, kitty: 1, "../../bad": 999 },
        rejected: ["old vector"],
        seed: {
          configured: 17,
          existing: 0,
          inserted: 17,
          ready: true,
          byTarget: { tyler: 1, kitty: 1 },
          error: null,
        },
      },
      1_000,
    );

    expect(getServerAppearanceStatus(1_001)).toMatchObject({
      signatures: 17,
      targets: { tyler: 1, kitty: 1 },
      seed: { configured: 17, inserted: 17, ready: true },
    });
    expect(getServerAppearanceStatus(1_001)?.targets).not.toHaveProperty(
      "../../bad",
    );
  });

  test("goes unavailable when the worker report is stale", () => {
    recordServerAppearanceStatus({ signatures: 17 }, 1_000);
    expect(getServerAppearanceStatus(20_000)).toBeNull();
  });
});
