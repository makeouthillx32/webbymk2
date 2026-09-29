import { describe, expect, test, beforeEach } from "bun:test";
import {
  recordMovementLog,
  recordMovementBatch,
  getRecentMovementLogs,
  __resetMovementLogs,
} from "./directorMovementLogStore";

describe("Director Kinematics & Movement Telemetry Harness (Silent Logs)", () => {
  beforeEach(() => {
    __resetMovementLogs();
  });

  test("records a single joystick vector movement event cleanly", () => {
    const entry = recordMovementLog({
      eventType: "joystick_vector",
      operator: {
        user: "Tyler",
        connectionType: "browser_web",
      },
      source: {
        roomId: "game-room",
        cameraName: "Game Room",
        panX: 100,
        panY: 50,
        zoom: 1.5,
      },
      trajectory: {
        vx: 0.5,
        vy: -0.2,
        deltaX: 12,
        deltaY: -5,
        deltaZoom: 0,
        easingCurve: "fine",
      },
    });

    expect(entry.id).toStartWith("mv-");
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.isoTime).toBeDefined();
    expect(entry.eventType).toBe("joystick_vector");

    const result = getRecentMovementLogs();
    expect(result.count).toBe(1);
    expect(result.totalRecorded).toBe(1);
    expect(result.summary.joystickVectors).toBe(1);
    expect(result.logs[0].source.roomId).toBe("game-room");
  });

  test("ingests batch telemetry entries and maintains max buffer bounds", () => {
    const batch = Array.from({ length: 25 }, (_, i) => ({
      eventType: i % 2 === 0 ? ("room_snap" as const) : ("ptz_zoom" as const),
      operator: {
        user: "Tyler",
        connectionType: "browser_web",
      },
      source: {
        roomId: "living-room",
        cameraName: "Living Room",
        panX: 0,
        panY: 0,
        zoom: 1.0,
      },
      trajectory: {
        vx: 0,
        vy: 0,
        deltaX: 0,
        deltaY: 0,
        deltaZoom: 0.1,
      },
    }));

    const ingested = recordMovementBatch(batch);
    expect(ingested).toBe(25);

    const result = getRecentMovementLogs(10);
    expect(result.count).toBe(10);
    expect(result.totalRecorded).toBe(25);
    expect(result.summary.roomSnaps).toBe(13);
    expect(result.summary.ptzZooms).toBe(12);
  });
});
