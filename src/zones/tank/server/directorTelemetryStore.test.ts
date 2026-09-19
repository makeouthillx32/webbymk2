import { beforeEach, describe, expect, test } from "bun:test";
import {
  __resetTelemetry,
  audioExcess,
  getFreshTelemetry,
  getIdentityOverlays,
  getTelemetryFor,
  getTelemetrySnapshot,
  IDENTITY_TTL_MS,
  recordIdentity,
  recordTelemetry,
} from "./directorTelemetryStore";
import type { CameraTelemetryInput } from "./directorVirtualAtlas";

const reading = (cameraId: string, over: Partial<CameraTelemetryInput> = {}): CameraTelemetryInput => ({
  cameraId,
  peopleCount: 0,
  visibleFeetCount: 0,
  feetConfidence: 0,
  faceCount: 0,
  motionScore: 0,
  audioPeak: 0,
  isSpeaking: false,
  ...over,
});

beforeEach(() => __resetTelemetry());

describe("fallback telemetry never erases a detection", () => {
  test("a detector reading survives the director's bitrate fallback tick", () => {
    recordTelemetry(
      [reading("game-room-2", { peopleCount: 1, boundingBoxes: [{ nx: 0.4, ny: 0.3, nw: 0.1, nh: 0.4, label: "person", targetName: "TYLER" }] })],
      null,
      "server",
    );
    recordTelemetry([reading("game-room-2", { motionScore: 0.02 })], null, "fallback");

    const t = getTelemetryFor("game-room-2");
    expect(t?.peopleCount).toBe(1);
    expect(t?.boundingBoxes?.[0]?.targetName).toBe("TYLER");
    expect(getTelemetrySnapshot()[0]?.origin).toBe("server");
  });

  test("the fallback fills a camera no detector is reporting on", () => {
    recordTelemetry([reading("foyer", { motionScore: 0.14 })], null, "fallback");
    expect(getTelemetryFor("foyer")?.motionScore).toBe(0.14);
  });

  test("a detector reading replaces the fallback", () => {
    recordTelemetry([reading("kitchen")], null, "fallback");
    recordTelemetry([reading("kitchen", { peopleCount: 2 })], null, "server");
    expect(getTelemetryFor("kitchen")?.peopleCount).toBe(2);
  });

  test("the fallback's hard-zero audio does not drag the room's audio baseline down", () => {
    for (let i = 0; i < 20; i++) recordTelemetry([reading("living", { audioPeak: 60 })], null, "server");
    const before = audioExcess("living", 70);
    for (let i = 0; i < 20; i++) recordTelemetry([reading("living")], null, "fallback");
    expect(audioExcess("living", 70)).toBe(before);
  });
});

describe("the learner's naming rides on top of the worker's reading", () => {
  const named = (cameraId: string, name: string) =>
    reading(cameraId, {
      peopleCount: 1,
      targetMemberDetected: name,
      targetMemberConfidence: 0.8,
      boundingBoxes: [{ nx: 0.4, ny: 0.3, nw: 0.1, nh: 0.4, label: "person", targetName: name, confidence: 0.8 }],
    });

  test("the name survives the worker's next reading, and the audio survives the name", () => {
    recordTelemetry([reading("kitchen", { audioPeak: 64, isSpeaking: true, peopleCount: 1 })], null, "server");
    recordTelemetry([named("kitchen", "MALIA")], null, "learner");
    // The worker keeps posting; it must not un-name the room.
    recordTelemetry([reading("kitchen", { audioPeak: 70, isSpeaking: true, peopleCount: 1 })], null, "server");

    const t = getTelemetryFor("kitchen");
    expect(t?.targetMemberDetected).toBe("MALIA");
    expect(t?.boundingBoxes?.[0]?.targetName).toBe("MALIA");
    expect(t?.audioPeak).toBe(70);
    expect(t?.isSpeaking).toBe(true);
  });

  test("a name the learner has stopped refreshing expires", () => {
    const t0 = Date.now();
    recordTelemetry([reading("foyer", { audioPeak: 20 })], null, "server");
    recordIdentity([named("foyer", "JOE")], t0);
    expect(getTelemetryFor("foyer", t0 + 1_000)?.targetMemberDetected).toBe("JOE");
    recordTelemetry([reading("foyer", { audioPeak: 20 })], null, "server");
    expect(getTelemetryFor("foyer", t0 + IDENTITY_TTL_MS + 1)?.targetMemberDetected ?? null).toBeNull();
  });

  test("with no worker at all the learner alone still shows the director a person", () => {
    recordTelemetry([named("living-room", "TYLER")], null, "learner");
    const t = getTelemetryFor("living-room");
    expect(t?.peopleCount).toBe(1);
    expect(t?.targetMemberDetected).toBe("TYLER");
    expect(t?.audioPeak).toBe(0);
    expect(getFreshTelemetry().some((r) => r.cameraId === "living-room")).toBe(true);
    expect(getIdentityOverlays()[0]?.names).toEqual(["TYLER"]);
  });

  test("the learner never becomes a reading of its own, so it cannot fake audio", () => {
    recordTelemetry([named("game-room", "OLLY")], null, "learner");
    expect(getTelemetrySnapshot().length).toBe(0);
  });
});

describe("the learner names bodies but cannot un-see them (2026-09-19 Foyer walk)", () => {
  const box = (nx: number, extra: Record<string, unknown> = {}) => ({ nx, ny: 0.3, nw: 0.1, nh: 0.4, label: "person", confidence: 0.8, ...extra });

  test("a walker the learner missed stays in the reading", () => {
    recordTelemetry([reading("foyer-walk", { peopleCount: 1, boundingBoxes: [box(0.5)] })], null, "server");
    recordTelemetry([reading("foyer-walk", { peopleCount: 0, boundingBoxes: [] })], null, "learner");
    const t = getTelemetryFor("foyer-walk");
    expect(t?.peopleCount).toBe(1);
    expect(t?.boundingBoxes).toHaveLength(1);
    expect(t?.boundingBoxes?.[0]?.targetName).toBeUndefined();
  });

  test("the same body seen by both is one box, wearing the learner's name", () => {
    recordTelemetry([reading("gr-both", { peopleCount: 1, boundingBoxes: [box(0.4, { targetName: "JOE" })] })], null, "server");
    recordTelemetry([reading("gr-both", { peopleCount: 1, boundingBoxes: [box(0.41, { targetName: "tyler" })] })], null, "learner");
    const t = getTelemetryFor("gr-both");
    expect(t?.boundingBoxes).toHaveLength(1);
    expect(t?.boundingBoxes?.[0]?.targetName).toBe("tyler");
    expect(t?.peopleCount).toBe(1);
  });

  test("what the learner recognised as the rack stays hidden", () => {
    recordTelemetry([reading("gr2-rack", { peopleCount: 1, boundingBoxes: [box(0.7)] })], null, "server");
    recordTelemetry([reading("gr2-rack", { peopleCount: 0, boundingBoxes: [box(0.7, { label: "suppressed" })] })], null, "learner");
    const t = getTelemetryFor("gr2-rack");
    expect(t?.boundingBoxes ?? []).toHaveLength(0);
    expect(t?.peopleCount).toBe(0);
  });
});
