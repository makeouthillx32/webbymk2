import { describe, expect, test } from "bun:test";
import { calculateCameraScore, DEFAULT_CAMERA_TILES, type CameraTelemetryInput } from "./directorVirtualAtlas";

// Why this file exists.
//
// "manual" is a valid SubjectMode, is offered in the director configurator, and
// was honoured by NOTHING. calculateCameraScore has no case for it, so it fell
// through to `default:` and scored exactly like an automatic mode — selecting
// manual changed a label and let the director carry on cutting by itself.
//
// The real fix lives in serverDirectorEngine (it now returns before the scoring
// loop when the mode is manual). These tests pin the property that made the bug
// invisible: manual is NOT distinguishable at the scoring layer, so anything
// that relies on scoring to implement it is already wrong.

const tile = DEFAULT_CAMERA_TILES[0];

const busy: CameraTelemetryInput = {
  cameraId: tile.cameraId,
  peopleCount: 4,
  visibleFeetCount: 4,
  feetConfidence: 0.9,
  faceCount: 2,
  motionScore: 0.9,
  audioPeak: 80,
  isSpeaking: true,
};

describe("manual is not expressible as a score", () => {
  test("manual scores a busy room just like an automatic mode would", () => {
    // The trap in one assertion. If manual could be implemented by scoring,
    // this would be 0 — it is not, so any caller that merely passes "manual"
    // into the scorer and acts on the result WILL keep cutting.
    const manual = calculateCameraScore(tile, busy, "manual");
    expect(manual.score).toBeGreaterThan(0);
  });

  test("manual is not meaningfully different from the default branch", () => {
    // Both fall into `default:`, which is precisely why selecting manual in the
    // configurator appeared to do nothing at all.
    const manual = calculateCameraScore(tile, busy, "manual");
    const person = calculateCameraScore(tile, busy, "person");
    expect(manual.score).toBe(person.score);
  });

  test("an empty room still scores zero — the scorer itself is fine", () => {
    const quiet: CameraTelemetryInput = {
      ...busy,
      peopleCount: 0,
      visibleFeetCount: 0,
      feetConfidence: 0,
      faceCount: 0,
      motionScore: 0,
      audioPeak: 0,
      isSpeaking: false,
    };
    expect(calculateCameraScore(tile, quiet, "manual").score).toBe(0);
  });
});

describe("the modes that DO discriminate still do", () => {
  test("speaker rewards a talking room over a silent one", () => {
    // Regression guard for the other half of this session: the vision worker
    // hardcoded audioPeak to 0, which made speaker mode score identically
    // everywhere. If audio ever stops reaching telemetry again, this is the
    // behaviour that silently disappears.
    const talking = calculateCameraScore(tile, busy, "speaker");
    const silent = calculateCameraScore(
      tile,
      { ...busy, audioPeak: 0, isSpeaking: false },
      "speaker",
    );
    expect(talking.score).toBeGreaterThan(silent.score);
  });

  test("group rewards a crowd super-linearly", () => {
    const two = calculateCameraScore(tile, { ...busy, peopleCount: 2 }, "group");
    const four = calculateCameraScore(tile, { ...busy, peopleCount: 4 }, "group");
    // Quadratic-ish density reward: doubling the people more than doubles the
    // group term.
    expect(four.breakdown.group).toBeGreaterThan(two.breakdown.group * 2);
  });

  test("feet mode discriminates once the worker actually sends feet", () => {
    // This was scoring 0 everywhere in production: the worker posted no
    // visibleFeetCount/feetConfidence, so the mode had nothing to rank on. It
    // now derives both from box geometry (a person whose box bottom is inside
    // the frame is standing fully in view).
    const feetVisible = calculateCameraScore(tile, busy, "feet");
    const feetCutOff = calculateCameraScore(
      tile,
      { ...busy, visibleFeetCount: 0, feetConfidence: 0 },
      "feet",
    );
    expect(feetVisible.score).toBeGreaterThan(feetCutOff.score);
  });

  test("face mode discriminates on resolvable faces", () => {
    const faces = calculateCameraScore(tile, busy, "face");
    const none = calculateCameraScore(tile, { ...busy, faceCount: 0 }, "face");
    expect(faces.score).toBeGreaterThan(none.score);
  });

  test("animals mode counts animals by CLASS, not by a hardcoded name list", () => {
    // The scorer used to test for "Buster"/"Kona"/"Mochi"/"Shadow" — pets that
    // no longer exist. A resolved individual arrives as targetName with label
    // still "dog"/"cat", so class matching must be what counts.
    const withPets = calculateCameraScore(
      tile,
      {
        ...busy,
        animalCount: 2,
        boundingBoxes: [
          { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.3, label: "dog", targetName: "MOLLY" },
          { nx: 0.5, ny: 0.1, nw: 0.2, nh: 0.3, label: "cat", targetName: "KITTY" },
        ],
      } as CameraTelemetryInput,
      "animals",
    );
    const without = calculateCameraScore(
      tile,
      { ...busy, animalCount: 0, boundingBoxes: [] } as CameraTelemetryInput,
      "animals",
    );
    expect(withPets.score).toBeGreaterThan(without.score);
  });
});
