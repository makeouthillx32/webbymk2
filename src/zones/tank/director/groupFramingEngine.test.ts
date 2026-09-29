import { describe, it, expect } from "bun:test";
import {
  calculateGroupPtzTarget,
  stepGroupFramingEngine,
  DEFAULT_GROUP_FRAMING_STATE,
  type GroupMemberBox,
} from "./groupFramingEngine";

describe("Autonomous AI PTZ Group Framing Engine", () => {
  it("calculates compound enclosing bounding box and optimal PTZ zoom for 3 people in a cluster", () => {
    // 3 people sitting together on a couch on the left side of the room
    const members: GroupMemberBox[] = [
      { nx: 0.15, ny: 0.40, nw: 0.12, nh: 0.35, label: "person" },
      { nx: 0.28, ny: 0.42, nw: 0.10, nh: 0.33, label: "person" },
      { nx: 0.38, ny: 0.38, nw: 0.14, nh: 0.37, label: "person" },
    ];

    const result = calculateGroupPtzTarget(members);

    // Group span: x from 0.15 to (0.38 + 0.14) = 0.52 (width = 0.37)
    // y from 0.38 to 0.75 (height = 0.37)
    expect(result.groupBounds.xMin).toBe(0.15);
    expect(result.groupBounds.xMax).toBeCloseTo(0.52, 2);

    // Zoom should frame the 0.37 span tightly (~2.0x zoom)
    expect(result.targetPtz.zoomFactor).toBeGreaterThan(1.5);
    expect(result.targetPtz.zoomFactor).toBeLessThanOrEqual(3.5);

    // Pan offsets must be clamped inside 3840x2160
    const cropW = 3840 / result.targetPtz.zoomFactor;
    const cropH = 2160 / result.targetPtz.zoomFactor;
    expect(result.targetPtz.panOffsetX).toBeGreaterThanOrEqual(0);
    expect(result.targetPtz.panOffsetX + cropW).toBeLessThanOrEqual(3840);
    expect(result.targetPtz.panOffsetY).toBeGreaterThanOrEqual(0);
    expect(result.targetPtz.panOffsetY + cropH).toBeLessThanOrEqual(2160);
  });

  it("applies calibration bobbing/breathing gesture during settling phase", () => {
    const members: GroupMemberBox[] = [
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.3, label: "person" },
    ];

    let state = DEFAULT_GROUP_FRAMING_STATE;
    const startTime = 100000;

    // Step at t = 0 (converging)
    state = stepGroupFramingEngine(state, members, startTime, 0.08);
    expect(state.calibrationPhase).toBe("CONVERGING");

    // Step at t = 800ms (settling bobbing phase)
    state = stepGroupFramingEngine(state, members, startTime + 800, 0.08);
    expect(state.calibrationPhase).toBe("BOBBING_CALIBRATION");
    expect(state.currentPtz.zoomFactor).toBeGreaterThan(1.0);

    // Step at t = 2000ms (settling complete, locked phase)
    state = stepGroupFramingEngine(state, members, startTime + 2000, 0.08);
    expect(state.calibrationPhase).toBe("LOCKED");
  });

  it("returns to wide 1.0x frame when all people leave the room", () => {
    const emptyMembers: GroupMemberBox[] = [];
    const target = calculateGroupPtzTarget(emptyMembers);

    expect(target.targetPtz.zoomFactor).toBe(1.0);
    expect(target.targetPtz.panOffsetX).toBe(0);
    expect(target.targetPtz.panOffsetY).toBe(0);
  });
});
