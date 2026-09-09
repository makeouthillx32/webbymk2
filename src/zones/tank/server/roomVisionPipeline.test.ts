import { describe, it, expect } from "bun:test";
import {
  updateRoomVisionTelemetry,
  getRoomVisionContext,
  listAllRoomVisionContexts,
} from "./roomVisionPipeline";
import type { CameraTelemetryInput } from "./directorVirtualAtlas";

describe("Per-Room Independent Vision & PTZ Pipeline", () => {
  it("categorizes bounding boxes and computes room-level pet focus for Kitchen (Mochi the Cat)", () => {
    const kitchenTelemetry: CameraTelemetryInput = {
      cameraId: "cam-kitchen",
      peopleCount: 0,
      visibleFeetCount: 0,
      feetConfidence: 0,
      faceCount: 0,
      motionScore: 0.4,
      audioPeak: 12,
      isSpeaking: false,
      boundingBoxes: [
        { nx: 0.4, ny: 0.5, nw: 0.15, nh: 0.18, label: "Mochi", confidence: 0.94 },
        { nx: 0.7, ny: 0.8, nw: 0.10, nh: 0.10, label: "Pizza Box", confidence: 0.88 },
      ],
    };

    const context = updateRoomVisionTelemetry("kitchen", "cam-kitchen", kitchenTelemetry);

    expect(context.roomKey).toBe("kitchen");
    expect(context.animalCount).toBe(1);
    expect(context.clutterCount).toBe(1);
    expect(context.focusedEntity?.category).toBe("pets");
    expect(context.focusedEntity?.label).toBe("Mochi");
    expect(context.roomPtzState.zoomFactor).toBeGreaterThan(1.5);
  });

  it("maintains isolated vision contexts across different rooms simultaneously", () => {
    // Living room has 2 people
    const lrTelemetry: CameraTelemetryInput = {
      cameraId: "cam-living-room",
      peopleCount: 2,
      visibleFeetCount: 4,
      feetConfidence: 0.9,
      faceCount: 2,
      motionScore: 0.6,
      audioPeak: 45,
      isSpeaking: true,
      boundingBoxes: [
        { nx: 0.2, ny: 0.4, nw: 0.15, nh: 0.35, label: "Tyler", confidence: 0.92 },
        { nx: 0.4, ny: 0.42, nw: 0.15, nh: 0.34, label: "Joe", confidence: 0.90 },
      ],
    };

    updateRoomVisionTelemetry("living-room", "cam-living-room", lrTelemetry);

    const kitchenCtx = getRoomVisionContext("kitchen");
    const lrCtx = getRoomVisionContext("living-room");

    expect(kitchenCtx?.focusedEntity?.category).toBe("pets");
    expect(lrCtx?.focusedEntity?.category).toBe("people");
    expect(lrCtx?.peopleCount).toBe(2);

    const all = listAllRoomVisionContexts();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
