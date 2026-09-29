import { describe, it, expect } from "bun:test";
import { computeTouchPayload } from "./useInvisibleTouchTelemetry";

describe("Invisible Viewport Touch Telemetry", () => {
  const mockRect = { left: 100, top: 50, width: 800, height: 450 };

  it("calculates exact normalized coordinates at the center of the video", () => {
    // clientX = 100 + 400 = 500, clientY = 50 + 225 = 275
    const payload = computeTouchPayload({
      clientX: 500,
      clientY: 275,
      rect: mockRect,
      camSlug: "living-room",
      timestamp: 123456789,
    });

    expect(payload).not.toBeNull();
    expect(payload?.nx).toBe(0.5);
    expect(payload?.ny).toBe(0.5);
    expect(payload?.zoneIndex).toBe(1); // Center third
    expect(payload?.gridId).toBe("h_5_5");
    expect(payload?.camSlug).toBe("living-room");
    expect(payload?.pointerType).toBe("touch");
    expect(payload?.timestamp).toBe(123456789);
  });

  it("calculates left third (zone 0) and top-left corner", () => {
    const payload = computeTouchPayload({
      clientX: 100,
      clientY: 50,
      rect: mockRect,
      pointerType: "mouse",
      camSlug: "kitchen",
    });

    expect(payload).not.toBeNull();
    expect(payload?.nx).toBe(0);
    expect(payload?.ny).toBe(0);
    expect(payload?.zoneIndex).toBe(0); // Left third
    expect(payload?.gridId).toBe("h_0_0");
    expect(payload?.pointerType).toBe("mouse");
  });

  it("calculates right third (zone 2) and bottom-right corner", () => {
    const payload = computeTouchPayload({
      clientX: 900,
      clientY: 500,
      rect: mockRect,
      camSlug: "bedroom",
    });

    expect(payload).not.toBeNull();
    expect(payload?.nx).toBe(1);
    expect(payload?.ny).toBe(1);
    expect(payload?.zoneIndex).toBe(2); // Right third
    expect(payload?.gridId).toBe("h_9_9");
  });

  it("clamps coordinates safely if pointer lands slightly outside bounding box", () => {
    const payload = computeTouchPayload({
      clientX: 50, // 50px to the left of the player
      clientY: 600, // 100px below the player
      rect: mockRect,
    });

    expect(payload).not.toBeNull();
    expect(payload?.nx).toBe(0);
    expect(payload?.ny).toBe(1);
    expect(payload?.zoneIndex).toBe(0);
    expect(payload?.gridId).toBe("h_0_9");
  });

  it("returns null for degenerate zero-size rects", () => {
    const payload = computeTouchPayload({
      clientX: 100,
      clientY: 100,
      rect: { left: 0, top: 0, width: 0, height: 0 },
    });

    expect(payload).toBeNull();
  });
});
