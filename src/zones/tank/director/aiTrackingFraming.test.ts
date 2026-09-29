// src/zones/tank/director/aiTrackingFraming.test.ts
import { describe, expect, test } from "bun:test";
import {
  calculateAiTrackingCrop,
  stepAiTrackingEngine,
  formatAiTrackingModeLabel,
  extractModeTargetBox,
  calculatePotentialNextRoom,
} from "./aiTrackingFraming";

describe("Autonomous AI Tracking & Advanced Framing Matrix", () => {
  const samplePersonBox = {
    x: 0.4,
    y: 0.2,
    width: 0.2,
    height: 0.7,
  };

  test("Normal Tracking frames full person body with standard margins", () => {
    const ptz = calculateAiTrackingCrop(samplePersonBox, "normal", "standard");
    expect(ptz.zoomFactor).toBeGreaterThan(1.0);
    expect(ptz.zoomFactor).toBeLessThanOrEqual(3.5);
    expect(ptz.panOffsetX).toBeGreaterThanOrEqual(0);
    expect(ptz.panOffsetY).toBeGreaterThanOrEqual(0);
    expect(ptz.speedMode).toBe("fine");
  });

  test("Upper Body framing crops higher zoom centered on top 55% of subject", () => {
    const normalPtz = calculateAiTrackingCrop(samplePersonBox, "normal", "standard");
    const upperPtz = calculateAiTrackingCrop(samplePersonBox, "upper_body", "standard");
    expect(upperPtz.zoomFactor).toBeGreaterThan(normalPtz.zoomFactor);
    expect(upperPtz.panOffsetY).toBeGreaterThanOrEqual(0);
  });

  test("Close-up framing achieves maximum zoom focused on head/face", () => {
    const upperPtz = calculateAiTrackingCrop(samplePersonBox, "upper_body", "standard");
    const closePtz = calculateAiTrackingCrop(samplePersonBox, "close_up", "standard");
    expect(closePtz.zoomFactor).toBeGreaterThan(upperPtz.zoomFactor);
  });

  test("Headless framing focuses on waist-down / feet (no head)", () => {
    const headlessPtz = calculateAiTrackingCrop(samplePersonBox, "headless", "standard");
    const upperPtz = calculateAiTrackingCrop(samplePersonBox, "upper_body", "standard");
    // Headless panOffsetY must be deeper down the frame than upper body
    expect(headlessPtz.panOffsetY).toBeGreaterThan(upperPtz.panOffsetY);
  });

  test("Lower Body framing focuses tightly on shins and floor", () => {
    const lowerPtz = calculateAiTrackingCrop(samplePersonBox, "lower_body", "standard");
    expect(lowerPtz.zoomFactor).toBeGreaterThan(1.5);
    expect(lowerPtz.panOffsetY).toBeGreaterThan(0);
  });

  test("Zone Tracking keeps framing clamped within safety margins", () => {
    const edgeBox = { x: 0.02, y: 0.02, width: 0.15, height: 0.4 };
    const zonePtz = calculateAiTrackingCrop(edgeBox, "zone", "standard");
    expect(zonePtz.zoomFactor).toBeGreaterThan(1.0);
    expect(zonePtz.panOffsetX).toBeGreaterThanOrEqual(0);
  });

  test("Sport tracking speed sets sport speedMode and higher velocity", () => {
    const sportPtz = calculateAiTrackingCrop(samplePersonBox, "normal", "sport");
    expect(sportPtz.speedMode).toBe("sport");
    expect(sportPtz.zoomSpeed).toBe(9);
  });

  test("stepAiTrackingEngine converges smoothly in Standard mode and snappily in Sport mode", () => {
    const start = { zoomFactor: 1.0, panOffsetX: 0, panOffsetY: 0, zoomSpeed: 5, speedMode: "fine" as const };
    const target = { zoomFactor: 2.5, panOffsetX: 1000, panOffsetY: 500, zoomSpeed: 5, speedMode: "fine" as const };

    const standardStep = stepAiTrackingEngine(start, target, "standard");
    const sportStep = stepAiTrackingEngine(start, target, "sport");

    // Sport should cover significantly more distance in a single step
    expect(sportStep.zoomFactor).toBeGreaterThan(standardStep.zoomFactor);
    expect(sportStep.panOffsetX).toBeGreaterThan(standardStep.panOffsetX);
  });

  test("formatAiTrackingModeLabel outputs correct human labels", () => {
    expect(formatAiTrackingModeLabel("normal")).toBe("Normal Tracking");
    expect(formatAiTrackingModeLabel("upper_body")).toBe("Upper Body");
    expect(formatAiTrackingModeLabel("close_up")).toBe("Close-up");
    expect(formatAiTrackingModeLabel("headless")).toBe("Headless (Feet)");
    expect(formatAiTrackingModeLabel("lower_body")).toBe("Lower Body");
    expect(formatAiTrackingModeLabel("zone")).toBe("Zone Tracking");
  });

  test("extractModeTargetBox extracts dog, cat, member, and group boxes properly", () => {
    const telemetry = {
      cameraId: "cam-1",
      peopleCount: 2,
      visibleFeetCount: 4,
      feetConfidence: 0.9,
      faceCount: 2,
      motionScore: 0.5,
      audioPeak: 60,
      isSpeaking: false,
      boundingBoxes: [
        { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.5, label: "person", targetName: "Alice" },
        { nx: 0.6, ny: 0.5, nw: 0.15, nh: 0.2, label: "dog", targetName: "Buster" },
        { nx: 0.8, ny: 0.7, nw: 0.1, nh: 0.12, label: "cat", targetName: "Mochi" },
      ],
    };

    const dogBox = extractModeTargetBox(telemetry as any, "dog");
    expect(dogBox).not.toBeNull();
    expect(dogBox?.x).toBe(0.6);

    const catBox = extractModeTargetBox(telemetry as any, "cat");
    expect(catBox).not.toBeNull();
    expect(catBox?.x).toBe(0.8);

    const memberBox = extractModeTargetBox(telemetry as any, "member");
    expect(memberBox).not.toBeNull();
    expect(memberBox?.x).toBe(0.1);

    const groupBox = extractModeTargetBox(telemetry as any, "group");
    expect(groupBox).not.toBeNull();
    expect(groupBox?.width).toBeGreaterThanOrEqual(0.2);
  });

  test("calculatePotentialNextRoom computes challenger room, score delta and predicted zoom", () => {
    const cameras = [
      { id: "cam-1", name: "Game Room" },
      { id: "cam-2", name: "Living Room" },
    ];
    const inputs = [
      {
        cameraId: "cam-1",
        peopleCount: 1,
        visibleFeetCount: 2,
        feetConfidence: 0.9,
        faceCount: 1,
        motionScore: 0.2,
        audioPeak: 30,
        isSpeaking: false,
      },
      {
        cameraId: "cam-2",
        peopleCount: 3,
        visibleFeetCount: 6,
        feetConfidence: 0.9,
        faceCount: 3,
        motionScore: 0.8,
        audioPeak: 85,
        isSpeaking: true,
        boundingBoxes: [{ nx: 0.3, ny: 0.2, nw: 0.25, nh: 0.6, label: "person" }],
      },
    ];

    // Unlocked follow mode
    const unlockedPrediction = calculatePotentialNextRoom({
      activeCameraId: "cam-1",
      activeRoomName: "Game Room",
      subjectMode: "speaker",
      framingMode: "upper_body",
      speedMode: "standard",
      inputs: inputs as any,
      cameras,
      isRoomLocked: false,
      shotStartedAt: Date.now() - 4000,
      challengerId: "cam-2",
      challengerSince: Date.now() - 2000,
      now: Date.now(),
    });

    expect(unlockedPrediction.challengerCameraId).toBe("cam-2");
    expect(unlockedPrediction.challengerRoomName).toBe("Living Room");
    expect(unlockedPrediction.scoreDelta).toBeGreaterThan(15);
    expect(unlockedPrediction.willCut).toBe(true);
    expect(unlockedPrediction.predictedZoom).toBeGreaterThan(1.0);
    expect(unlockedPrediction.isRoomLocked).toBe(false);

    // Locked to room mode
    const lockedPrediction = calculatePotentialNextRoom({
      activeCameraId: "cam-1",
      activeRoomName: "Game Room",
      subjectMode: "speaker",
      framingMode: "upper_body",
      speedMode: "standard",
      inputs: inputs as any,
      cameras,
      isRoomLocked: true,
      shotStartedAt: Date.now() - 4000,
      challengerId: "cam-2",
      challengerSince: Date.now() - 2000,
      now: Date.now(),
    });

    expect(lockedPrediction.isRoomLocked).toBe(true);
    expect(lockedPrediction.willCut).toBe(false);
    expect(lockedPrediction.cutReason).toContain("ROOM LOCKED");
  });
});
