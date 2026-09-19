import { describe, expect, test } from "bun:test";
import {
  FOLLOWABLE_MEMBERS,
  FOLLOW_TIMING,
  chooseFollowCamera,
  initialFollowState,
  isFollowableSlug,
  memberPresence,
  type FollowState,
} from "./followMember";

type Box = { nx: number; ny: number; nw: number; nh: number; label: string; targetName?: string; confidence?: number; facing?: "front" | "side" | "back" };
const person = (targetName?: string, nw = 0.1, nh = 0.3): Box => ({ nx: 0.2, ny: 0.2, nw, nh, label: "person", targetName, confidence: 0.9 });
const facing = (box: Box, side: "front" | "side" | "back"): Box => ({ ...box, facing: side });

const CAMS = ["game-room", "game-room-2", "foyer", "makeup", "kitchen", "living"];

/** Feed a sequence of per-second house snapshots through the follow logic, like the engine does. */
const CAMERA_ROOMS: Record<string, string> = {
  "game-room": "game-room", "game-room-2": "game-room-2", foyer: "foyer",
  makeup: "makeup-room", kitchen: "kitchen", living: "living-room",
};
// The Foyer -> Makeup Room doorway exactly as drawn in the Room Portal Studio.
const FOYER_TO_MAKEUP = [
  { nx: 0.3075, ny: 0.5575 }, { nx: 0.3302, ny: 0.3304 }, { nx: 0.3158, ny: 0.0118 }, { nx: 0.2519, ny: 0.0557 },
];
const DOORWAYS = [
  { sourceRoomSlug: "foyer", targetRoomSlug: "makeup-room", polygon: FOYER_TO_MAKEUP },
  { sourceRoomSlug: "foyer", targetRoomSlug: "living-room", polygon: [{ nx: 0.52, ny: 0.0 }, { nx: 0.57, ny: 0.0 }, { nx: 0.57, ny: 0.5 }, { nx: 0.52, ny: 0.5 }] },
  { sourceRoomSlug: "game-room-2", targetRoomSlug: "foyer", polygon: [{ nx: 0.07, ny: 0.03 }, { nx: 0.16, ny: 0.03 }, { nx: 0.16, ny: 0.33 }, { nx: 0.07, ny: 0.33 }] },
  { sourceRoomSlug: "game-room-2", targetRoomSlug: "game-room", polygon: [{ nx: 0.93, ny: 0.0 }, { nx: 0.99, ny: 0.0 }, { nx: 0.99, ny: 0.11 }, { nx: 0.93, ny: 0.11 }] },
  { sourceRoomSlug: "kitchen", targetRoomSlug: "living-room", polygon: [{ nx: 0.25, ny: 0.5 }, { nx: 0.41, ny: 0.5 }, { nx: 0.41, ny: 0.8 }, { nx: 0.25, ny: 0.8 }] },
];

function replay(
  frames: Array<Record<string, Box[]>>,
  opts: { start?: string; overlap?: string[][]; doorways?: typeof DOORWAYS } = {},
) {
  let state: FollowState = initialFollowState("tyler");
  let onAir = opts.start ?? "game-room-2";
  const log: Array<{ second: number; onAir: string; status: string }> = [];
  frames.forEach((snapshot, second) => {
    const now = 1_000_000 + second * 1000;
    const d = chooseFollowCamera({
      state,
      readings: CAMS.map((cameraId) => ({
        cameraId,
        telemetry: { boundingBoxes: snapshot[cameraId] ?? [], peopleCount: (snapshot[cameraId] ?? []).length },
      })),
      incumbentCameraId: onAir,
      now,
      eligibleCameraIds: CAMS,
      overlapGroups: opts.overlap ?? [["kitchen", "living"]],
      doorways: opts.doorways,
      cameraRooms: CAMERA_ROOMS,
    });
    state = d.state;
    if (d.cameraId) onAir = d.cameraId;
    log.push({ second, onAir, status: d.status });
  });
  return log;
}

const repeat = <T,>(n: number, value: T): T[] => Array.from({ length: n }, () => value);

describe("FOLLOWABLE_MEMBERS", () => {
  test("lists housemates and pets, not trash or guests", () => {
    const slugs = FOLLOWABLE_MEMBERS.map((m) => m.slug);
    for (const s of ["tyler", "joe", "malia", "molly", "olly", "james", "kitty"]) expect(slugs).toContain(s);
    expect(slugs).not.toContain("empty_can");
    expect(slugs).not.toContain("trisha");
    expect(isFollowableSlug("tyler")).toBe(true);
    expect(isFollowableSlug("food_bag")).toBe(false);
  });
});

describe("memberPresence", () => {
  test("finds the member on a box even when the camera's single best match is someone else", () => {
    const p = memberPresence(
      { boundingBoxes: [person("MALIA", 0.2, 0.5), person("TYLER", 0.1, 0.3)], targetMemberDetected: "malia", targetMemberConfidence: 0.9 },
      "tyler",
    );
    expect(p.present).toBe(true);
    expect(p.boxArea).toBeCloseTo(0.03);
  });
});

describe("the first live walk, 2026-09-16, replayed", () => {
  test("Game Room 2 -> Foyer (called JOE) -> Makeup Room (unnamed) stays a FOLLOW, not an auto guess", () => {
    const log = replay([
      ...repeat(10, { "game-room-2": [person("TYLER")] }),
      ...repeat(6, {}), // hallway: nobody in view
      ...repeat(60, { foyer: [person("JOE")] }), // the detector's wrong name
      ...repeat(4, {}),
      ...repeat(40, { makeup: [person()] }),
    ]);
    expect(log[9]).toMatchObject({ onAir: "game-room-2", status: "locked" });
    const foyer = log.find((l) => l.onAir === "foyer")!;
    expect(foyer.status).toBe("handoff");
    // Sixty seconds in the Foyer with the wrong name is still following the body.
    expect(log[70]).toMatchObject({ onAir: "foyer", status: "tracking" });
    const makeup = log.find((l) => l.onAir === "makeup")!;
    expect(makeup.status).toBe("handoff");
    expect(log[log.length - 1]).toMatchObject({ onAir: "makeup", status: "tracking" });
  });

  test("a stray TYLER in another room does not pull the shot while the followed body is still in view", () => {
    const log = replay(
      [
        ...repeat(10, { "game-room-2": [person("TYLER")] }),
        // Tyler stays in Game Room 2; the Game Room camera names someone TYLER for 6 seconds.
        ...repeat(6, { "game-room-2": [person()], "game-room": [person("TYLER")] }),
        ...repeat(10, { "game-room-2": [person()] }),
      ],
    );
    expect(log.every((l) => l.onAir === "game-room-2")).toBe(true);
  });

  test("a name elsewhere that persists does take the shot", () => {
    const log = replay([
      ...repeat(10, { "game-room-2": [person("TYLER")] }),
      ...repeat(FOLLOW_TIMING.namePersistMs / 1000 + 3, { "game-room-2": [person()], "game-room": [person("TYLER")] }),
    ]);
    expect(log[log.length - 1]).toMatchObject({ onAir: "game-room", status: "locked" });
  });

  test("kitchen and living room: moves to the clearly bigger view of the same body, once, without flapping", () => {
    const log = replay(
      [
        ...repeat(10, { kitchen: [person("TYLER", 0.08, 0.25)] }),
        // Walks into the living room: the living-room camera now sees him far bigger.
        ...repeat(12, { kitchen: [person(undefined, 0.05, 0.15)], living: [person(undefined, 0.15, 0.5)] }),
        // Briefly faces the kitchen camera: kitchen view grows, but not 1.6x the living view.
        ...repeat(3, { kitchen: [person(undefined, 0.1, 0.35)], living: [person(undefined, 0.14, 0.45)] }),
        ...repeat(6, { kitchen: [person(undefined, 0.05, 0.15)], living: [person(undefined, 0.15, 0.5)] }),
      ],
      { start: "kitchen" },
    );
    const switchSecond = log.findIndex((l) => l.onAir === "living");
    expect(log[switchSecond].status).toBe("better-angle");
    expect(switchSecond).toBeGreaterThanOrEqual(10 + FOLLOW_TIMING.betterAnglePersistMs / 1000);
    expect(log.slice(switchSecond).every((l) => l.onAir === "living")).toBe(true);
  });

  test("a single missed detection is not the member leaving", () => {
    const log = replay([
      ...repeat(10, { foyer: [person("TYLER")] }),
      {}, // one empty reading
      ...repeat(5, { foyer: [person()], makeup: [person()] }), // someone else appears elsewhere
    ], { start: "foyer" });
    expect(log.every((l) => l.onAir === "foyer")).toBe(true);
    expect(log[log.length - 1].status).toBe("tracking");
  });

  test("two rooms gaining someone at once is ambiguous: hold", () => {
    const log = replay([
      ...repeat(5, { foyer: [person("TYLER")] }),
      ...repeat(4, {}),
      ...repeat(5, { makeup: [person()], kitchen: [person()] }),
    ], { start: "foyer" });
    expect(log[log.length - 1]).toMatchObject({ onAir: "foyer", status: "searching" });
  });

  test("an arrival long after the member left view is not them", () => {
    const window = FOLLOW_TIMING.handoffWindowMs / 1000;
    const log = replay([
      ...repeat(5, { foyer: [person("TYLER")] }),
      ...repeat(window + 5, {}),
      ...repeat(5, { makeup: [person()] }),
    ], { start: "foyer" });
    expect(log[log.length - 1].onAir).toBe("foyer");
  });
});

describe("mapped doorways", () => {
  const at = (nx: number, ny: number, targetName?: string): Box => ({ nx, ny, nw: 0.08, nh: 0.3, label: "person", targetName, confidence: 0.9 });

  test("walking through the Foyer's Makeup Room doorway hands off there even when two rooms gain someone", () => {
    const log = replay([
      ...repeat(5, { foyer: [at(0.6, 0.4, "TYLER")] }),
      ...repeat(3, { foyer: [at(0.26, 0.2)] }), // standing in the drawn doorway
      ...repeat(4, {}),
      ...repeat(4, { makeup: [person()], kitchen: [person()] }),
    ], { start: "foyer", doorways: DOORWAYS });
    const cut = log.find((l) => l.onAir === "makeup")!;
    expect(cut.status).toBe("handoff");
  });

  test("without doorway evidence, an arrival in a room not connected to theirs is not them", () => {
    const log = replay([
      ...repeat(5, { "game-room-2": [at(0.5, 0.5, "TYLER")] }),
      ...repeat(4, {}),
      ...repeat(5, { kitchen: [person()] }), // kitchen has no doorway to Game Room 2
    ], { doorways: DOORWAYS });
    expect(log.every((l) => l.onAir === "game-room-2")).toBe(true);
  });

  test("without doorway evidence, a single arrival in a connected room still hands off", () => {
    const log = replay([
      ...repeat(5, { "game-room-2": [at(0.5, 0.5, "TYLER")] }),
      ...repeat(4, {}),
      ...repeat(5, { foyer: [person()] }),
    ], { doorways: DOORWAYS });
    expect(log[log.length - 1]).toMatchObject({ onAir: "foyer" });
  });

  test("doorway handoff respects handoffMinDwellMs and does not ping-pong on mutual threshold", () => {
    // Tyler in Foyer near doorway to Makeup, hands off to Makeup.
    // If Makeup immediately sees someone in the doorway back to Foyer, it must NOT cut back within 4s.
    const log = replay([
      ...repeat(5, { foyer: [at(0.26, 0.2, "TYLER")] }), // in doorway to makeup
      ...repeat(3, {}), // foyer empties
      { makeup: [person()] }, // handoff cut to makeup happens here
      // Next 3 seconds: makeup sees person in doorway back to foyer, and foyer sees movement
      { makeup: [at(0.5, 0.5)], foyer: [person()] },
      { makeup: [at(0.5, 0.5)], foyer: [person()] },
      { makeup: [at(0.5, 0.5)], foyer: [person()] },
    ], { start: "foyer", doorways: DOORWAYS });

    // Handoff to makeup occurred
    const firstMakeupCut = log.findIndex((l) => l.onAir === "makeup");
    expect(firstMakeupCut).toBeGreaterThanOrEqual(8);
    // During the 3 seconds immediately after the cut, it MUST hold makeup and not ping-pong back to foyer
    for (let s = firstMakeupCut; s < firstMakeupCut + 3; s++) {
      expect(log[s].onAir).toBe("makeup");
    }
  });
});

describe("two cameras on one room: the front is the shot", () => {
  const GAME_ROOMS = [["game-room", "game-room-2"], ["kitchen", "living"]];

  test("named on both, custody shows the back: cuts to the camera he faces, once it persists", () => {
    const log = replay(
      [
        ...repeat(10, { "game-room-2": [facing(person("TYLER"), "front")] }),
        // Turns around: Game Room 2 now has his back (and a bigger box), Game Room his face.
        ...repeat(10, { "game-room-2": [facing(person("TYLER", 0.2, 0.5), "back")], "game-room": [facing(person("TYLER", 0.08, 0.2), "front")] }),
      ],
      { overlap: GAME_ROOMS },
    );
    const cutAt = log.findIndex((l) => l.onAir === "game-room");
    expect(log[cutAt].status).toBe("better-angle");
    expect(cutAt).toBeGreaterThanOrEqual(10 + FOLLOW_TIMING.betterAnglePersistMs / 1000);
    expect(log[log.length - 1].onAir).toBe("game-room");
  });

  test("a glance back for a second or two does not flip the shot", () => {
    const log = replay(
      [
        ...repeat(10, { "game-room-2": [facing(person("TYLER"), "front")] }),
        ...repeat(2, { "game-room-2": [facing(person("TYLER"), "back")], "game-room": [facing(person("TYLER"), "front")] }),
        ...repeat(10, { "game-room-2": [facing(person("TYLER"), "front")], "game-room": [facing(person("TYLER"), "back")] }),
      ],
      { overlap: GAME_ROOMS },
    );
    expect(log.every((l) => l.onAir === "game-room-2")).toBe(true);
  });

  test("a big back loses to a smaller front when following an unnamed body", () => {
    const log = replay(
      [
        ...repeat(10, { kitchen: [facing(person("TYLER"), "front")] }),
        ...repeat(12, { kitchen: [facing(person(undefined, 0.2, 0.5), "back")], living: [facing(person(undefined, 0.08, 0.2), "front")] }),
      ],
      { start: "kitchen", overlap: GAME_ROOMS },
    );
    expect(log[log.length - 1]).toMatchObject({ onAir: "living" });
  });

  test("first sighting on both cameras goes straight to the front", () => {
    const log = replay(
      [{ "game-room-2": [facing(person("TYLER", 0.3, 0.6), "back")], "game-room": [facing(person("TYLER", 0.1, 0.2), "front")] }],
      { start: "foyer", overlap: GAME_ROOMS },
    );
    expect(log[0].onAir).toBe("game-room");
  });
});

describe("the 2026-09-19 kitchen walk: Malia stays at her desk", () => {
  test("Tyler leaves the Game Room, Malia stays -- the follow goes with Tyler, not her", () => {
    const log = replay(
      [
        ...repeat(10, { "game-room": [person("TYLER"), person("MALIA")] }),
        // Out of the room: only Malia (named) is left at the desks.
        ...repeat(3, { "game-room": [person("MALIA")] }),
        // He turns up in the kitchen as an unnamed body.
        ...repeat(10, { "game-room": [person("MALIA")], kitchen: [person()] }),
      ],
      { start: "game-room" },
    );
    expect(log[9].onAir).toBe("game-room");
    expect(log[log.length - 1].onAir).toBe("kitchen");
  });

  test("a name elsewhere that flickers still takes the shot once it has persisted", () => {
    // Custody holds an unnamed body the whole time, so only the name can move the shot.
    const flicker = (i: number) => (i % 3 === 2 ? { "game-room": [person()] } : { "game-room": [person()], kitchen: [person("TYLER")] });
    const log = replay(
      [...repeat(10, { "game-room": [person("TYLER")] }), ...Array.from({ length: 14 }, (_, i) => flicker(i))],
      { start: "game-room" },
    );
    expect(log[log.length - 1].onAir).toBe("kitchen");
  });

  test("an unnamed body still keeps the follow (it may be him, turned away)", () => {
    const log = replay(
      [...repeat(10, { "game-room": [person("TYLER")] }), ...repeat(20, { "game-room": [person()], kitchen: [person()] })],
      { start: "game-room" },
    );
    expect(log.every((l) => l.onAir === "game-room")).toBe(true);
  });
});
