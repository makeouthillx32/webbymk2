import { describe, expect, test } from "bun:test";
import { buildCalibration, CalibrationSet, type CameraCalibration } from "./calibration";
import { FloorTracker, type Observation } from "./floorTracker";
import type { Correspondence } from "./homography";
import type { RoomPortal } from "./portalGeometry";

// The claim being tested: a person walking between two cameras keeps ONE id.
// That is the whole justification for calibration, so it is tested against a
// real homography rather than a stubbed projection.

/** Maps image 0..1 onto a `width` x `depth` metre floor patch at `originX`. */
function quad(originX: number, width: number, depth: number): Correspondence[] {
  return [
    { image: { x: 0, y: 0 }, floor: { x: originX, y: depth } },
    { image: { x: 1, y: 0 }, floor: { x: originX + width, y: depth } },
    { image: { x: 1, y: 1 }, floor: { x: originX + width, y: 0 } },
    { image: { x: 0, y: 1 }, floor: { x: originX, y: 0 } },
  ];
}

function calib(cameraId: string, roomScope: string, points: Correspondence[]): CameraCalibration {
  const result = buildCalibration({ cameraId, roomScope, correspondences: points });
  if (!result.ok) throw new Error(result.error);
  return result.calibration;
}

// Two cameras covering one long room, overlapping in the middle:
//   WEST sees x 0..6, EAST sees x 4..10. Both share the "hall" frame.
const WEST = calib("cam-west", "hall", quad(0, 6, 4));
const EAST = calib("cam-east", "hall", quad(4, 6, 4));

const obs = (over: Partial<Observation> & Pick<Observation, "cameraId">): Observation => ({
  roomScope: "hall",
  label: "person",
  confidence: 0.9,
  nx: 0.45,
  ny: 0.4,
  nw: 0.1,
  nh: 0.5,
  ...over,
});

/** Places a detection whose ground contact lands at image (u, v). */
const at = (cameraId: string, u: number, v: number, over: Partial<Observation> = {}) =>
  obs({ cameraId, nx: u - 0.05, ny: v - 0.5, nw: 0.1, nh: 0.5, ...over });

describe("cross-camera identity — the point of calibration", () => {
  test("one person walking from WEST into EAST keeps the same track id", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));

    // Deep in WEST's view only: image x 0.5 -> floor x 3.
    let tracks = tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    expect(tracks).toHaveLength(1);
    const id = tracks[0].id;
    expect(tracks[0].floor!.x).toBeCloseTo(3, 6);

    // Walks right, now in the overlap: WEST x 0.833 -> floor 5, EAST x 0.167 -> floor 5.
    // BOTH cameras see them in the same frame. Two detections, still one person.
    tracks = tracker.update(
      [at("cam-west", 0.8333333, 0.9), at("cam-east", 0.1666667, 0.9)],
      2_000,
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(id);
    expect(tracks[0].cameraIds.sort()).toEqual(["cam-east", "cam-west"]);

    // Out of WEST entirely, EAST only. Floor x 5 -> 7: two metres in one
    // second, a brisk walk and inside MAX_PLAUSIBLE_SPEED_MPS. (x 8 would be
    // 3 m/s — a run — and the speed gate correctly refuses to call that the
    // same person.)
    tracks = tracker.update([at("cam-east", 0.5, 0.9)], 3_000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(id);
    expect(tracks[0].floor!.x).toBeCloseTo(7, 5);
  });

  test("two people in the overlap stay two tracks, not one", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));
    // floor x 5 and floor x 9 — four metres apart, well beyond the radius.
    const tracks = tracker.update(
      [at("cam-east", 0.1666667, 0.9), at("cam-east", 0.8333333, 0.9)],
      1_000,
    );
    expect(tracks).toHaveLength(2);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2);
  });

  test("a name, once resolved, survives the handover to the other camera", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));
    tracker.update([at("cam-west", 0.5, 0.9, { targetName: "TYLER" })], 1_000);
    // The next frame resolves no name (resolveDetection refuses to guess) —
    // absence of evidence must not erase the identity.
    const tracks = tracker.update([at("cam-east", 0.1666667, 0.9)], 2_000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].targetName).toBe("TYLER");
  });

  test("a dog and a person at the same spot never merge", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));
    const tracks = tracker.update(
      [at("cam-west", 0.5, 0.9), at("cam-west", 0.5, 0.9, { label: "dog" })],
      1_000,
    );
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.label).sort()).toEqual(["dog", "person"]);
  });
});

describe("room frames are not comparable", () => {
  test("same coordinates in different rooms are different people", () => {
    // Each room is calibrated to its own origin, so floor (2,2) in the kitchen
    // and floor (2,2) in the foyer are unrelated. Merging them would teleport
    // people between rooms.
    const kitchen = calib("cam-kitchen", "kitchen", quad(0, 6, 4));
    const foyer = calib("cam-foyer", "foyer", quad(0, 6, 4));
    const tracker = new FloorTracker(new CalibrationSet([kitchen, foyer]));

    const tracks = tracker.update(
      [
        at("cam-kitchen", 0.5, 0.9, { roomScope: "kitchen" }),
        at("cam-foyer", 0.5, 0.9, { roomScope: "foyer" }),
      ],
      1_000,
    );
    expect(tracks).toHaveLength(2);
  });
});

describe("uncalibrated cameras keep working", () => {
  test("with NO calibration at all, tracking still runs per-camera", () => {
    // Today's state: zero cameras calibrated. This must not be a regression.
    const tracker = new FloorTracker(new CalibrationSet([]));

    let tracks = tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].floor).toBeNull();
    const id = tracks[0].id;

    // A small move on the same camera stays the same track.
    tracks = tracker.update([at("cam-west", 0.55, 0.9)], 2_000);
    expect(tracks[0].id).toBe(id);
  });

  test("uncalibrated cameras CANNOT merge across cameras — and must not pretend to", () => {
    const tracker = new FloorTracker(new CalibrationSet([]));
    tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    const tracks = tracker.update(
      [at("cam-west", 0.5, 0.9), at("cam-east", 0.5, 0.9)],
      2_000,
    );
    // Identical image coordinates on two different cameras mean nothing to each
    // other. Two tracks is the honest answer.
    expect(tracks).toHaveLength(2);
  });

  test("a half-calibrated house works: calibrated cameras merge, others do not", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST]));
    const tracks = tracker.update(
      [at("cam-west", 0.8333333, 0.9), at("cam-east", 0.1666667, 0.9)],
      1_000,
    );
    // WEST has a floor position, EAST does not, so they cannot be matched.
    expect(tracks).toHaveLength(2);
    expect(tracks.find((t) => t.cameraId === "cam-west")!.floor).not.toBeNull();
    expect(tracks.find((t) => t.cameraId === "cam-east")!.floor).toBeNull();
  });
});

describe("tracks live and die sensibly", () => {
  test("a track survives a gap in observation — occlusion is not death", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST]));
    const id = tracker.update([at("cam-west", 0.5, 0.9)], 1_000)[0].id;

    // Four seconds behind the sofa, inside the 5s TTL.
    const tracks = tracker.update([at("cam-west", 0.5, 0.9)], 5_000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(id);
  });

  test("a track past its TTL is dropped rather than lingering forever", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST]));
    tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    const tracks = tracker.update([], 20_000);
    expect(tracks).toHaveLength(0);
    expect(tracker.size).toBe(0);
  });

  test("observation count and first-seen are preserved across the handover", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));
    tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    tracker.update([at("cam-west", 0.8333333, 0.9)], 2_000);
    const tracks = tracker.update([at("cam-east", 0.1666667, 0.9)], 3_000);

    expect(tracks[0].observations).toBe(3);
    expect(tracks[0].firstSeenAt).toBe(1_000);
    expect(tracks[0].lastSeenAt).toBe(3_000);
  });

  test("multiCameraTracks reports exactly the ones that crossed", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST, EAST]));
    tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    expect(tracker.multiCameraTracks()).toHaveLength(0);
    tracker.update([at("cam-east", 0.1666667, 0.9)], 2_000);
    // Not yet — floor x 3 then floor x 5 is 2m, beyond the 1.2m radius.
    // Walk it properly instead.
    const t2 = new FloorTracker(new CalibrationSet([WEST, EAST]));
    t2.update([at("cam-west", 0.8333333, 0.9)], 1_000);
    t2.update([at("cam-east", 0.1666667, 0.9)], 2_000);
    expect(t2.multiCameraTracks()).toHaveLength(1);
  });

  test("an empty frame does not invent or destroy anything", () => {
    const tracker = new FloorTracker(new CalibrationSet([WEST]));
    tracker.update([at("cam-west", 0.5, 0.9)], 1_000);
    const tracks = tracker.update([], 1_500);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].observations).toBe(1);
  });
});

describe("doorway spatial-temporal handover & height gating", () => {
  const FOYER_DOORWAY: RoomPortal = {
    id: "portal-foyer-to-living",
    sourceRoomSlug: "foyer",
    targetRoomSlug: "living",
    title: "To Living Room",
    enabled: true,
    polygon: [
      { nx: 0.7, ny: 0.2 },
      { nx: 0.95, ny: 0.2 },
      { nx: 0.95, ny: 0.9 },
      { nx: 0.7, ny: 0.9 },
    ],
  };

  test("individual identity in foyer enters doorway and is handed over to living room track", () => {
    const tracker = new FloorTracker(new CalibrationSet([]), {
      portals: [FOYER_DOORWAY],
      handoverWindowMs: 4_000,
    });

    // Tyler is tracked in foyer walking into the doorway area (nx: 0.75, ny: 0.3)
    const tylerFoyer: Observation = {
      cameraId: "cam-foyer",
      roomScope: "foyer",
      label: "person",
      confidence: 0.95,
      nx: 0.75,
      ny: 0.3,
      nw: 0.15,
      nh: 0.5,
      targetName: "TYLER",
    };

    const tracks1 = tracker.update([tylerFoyer], 1_000);
    expect(tracks1).toHaveLength(1);
    expect(tracks1[0].targetName).toBe("TYLER");
    expect(tracker.activeHandovers()).toHaveLength(1);
    expect(tracker.activeHandovers()[0].targetRoomSlug).toBe("living");

    // Next frame (1.5s later): foyer is empty. Living room sees a new anonymous person track
    const anonLiving: Observation = {
      cameraId: "cam-living",
      roomScope: "living",
      label: "person",
      confidence: 0.92,
      nx: 0.1,
      ny: 0.4,
      nw: 0.12,
      nh: 0.55,
    };

    const tracks2 = tracker.update([anonLiving], 2_500);
    // Anon living track inherited "TYLER" from the doorway handover!
    const livingTrack = tracks2.find((t) => t.roomScope === "living");
    expect(livingTrack).toBeDefined();
    expect(livingTrack?.targetName).toBe("TYLER");
    expect(tracker.activeHandovers()).toHaveLength(0); // Handover consumed
  });

  test("anthropometric height gate rejects handover if candidate height mismatches resident", () => {
    const tracker = new FloorTracker(new CalibrationSet([]), {
      portals: [FOYER_DOORWAY],
      handoverWindowMs: 4_000,
    });

    // Joe (188 cm) enters the doorway in foyer
    const joeFoyer: Observation = {
      cameraId: "cam-foyer",
      roomScope: "foyer",
      label: "person",
      confidence: 0.95,
      nx: 0.75,
      ny: 0.3,
      nw: 0.15,
      nh: 0.6,
      targetName: "JOE",
      estimatedHeightCm: 188,
    };

    tracker.update([joeFoyer], 1_000);
    expect(tracker.activeHandovers()).toHaveLength(1);

    // An observation appears in living room, but with estimated height 160 cm (Malia/child, Δh = 28 cm > 18 cm)
    const petitePersonLiving: Observation = {
      cameraId: "cam-living",
      roomScope: "living",
      label: "person",
      confidence: 0.90,
      nx: 0.1,
      ny: 0.4,
      nw: 0.12,
      nh: 0.4,
      estimatedHeightCm: 160,
    };

    const tracks = tracker.update([petitePersonLiving], 2_000);
    const livingTrack = tracks.find((t) => t.roomScope === "living");
    // Height gate rejected the handover!
    expect(livingTrack?.targetName).toBeUndefined();
    expect(tracker.activeHandovers()).toHaveLength(1); // Handover still pending for actual Joe
  });

  test("anthropometric height gate permits handover when candidate height matches resident", () => {
    const tracker = new FloorTracker(new CalibrationSet([]), {
      portals: [FOYER_DOORWAY],
      handoverWindowMs: 4_000,
    });

    // Tyler (178 cm) enters the doorway in foyer
    const tylerFoyer: Observation = {
      cameraId: "cam-foyer",
      roomScope: "foyer",
      label: "person",
      confidence: 0.95,
      nx: 0.75,
      ny: 0.3,
      nw: 0.15,
      nh: 0.5,
      targetName: "TYLER",
      estimatedHeightCm: 178,
    };

    tracker.update([tylerFoyer], 1_000);

    // Candidate in living room estimated at 175 cm (Δh = 3 cm <= 18 cm)
    const tylerLiving: Observation = {
      cameraId: "cam-living",
      roomScope: "living",
      label: "person",
      confidence: 0.92,
      nx: 0.1,
      ny: 0.4,
      nw: 0.12,
      nh: 0.52,
      estimatedHeightCm: 175,
    };

    const tracks = tracker.update([tylerLiving], 2_200);
    const livingTrack = tracks.find((t) => t.roomScope === "living");
    expect(livingTrack?.targetName).toBe("TYLER");
  });
});
