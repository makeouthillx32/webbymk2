import { describe, it, expect } from "bun:test";
import {
  calculateAnimalPtzTarget,
  stepAnimalFramingEngine,
  DEFAULT_ANIMAL_FRAMING_STATE,
  type AnimalDetectionBox,
} from "./animalFramingEngine";

describe("Autonomous AI PTZ Animal & Pet Framing Engine", () => {
  it("calculates optimal tight zoom for a solo dog (Buster)", () => {
    const animals: AnimalDetectionBox[] = [
      { nx: 0.35, ny: 0.55, nw: 0.15, nh: 0.20, label: "dog" },
    ];

    const result = calculateAnimalPtzTarget(animals);

    expect(result.framingType).toBe("SOLO_PET");
    expect(result.targetPtz.zoomFactor).toBeGreaterThanOrEqual(2.0);
    expect(result.targetPtz.zoomFactor).toBeLessThanOrEqual(3.2);

    // Pan offsets clamped in 3840x2160 canvas
    const cropW = 3840 / result.targetPtz.zoomFactor;
    const cropH = 2160 / result.targetPtz.zoomFactor;
    expect(result.targetPtz.panOffsetX).toBeGreaterThanOrEqual(0);
    expect(result.targetPtz.panOffsetX + cropW).toBeLessThanOrEqual(3840);
  });

  it("calculates compound cluster framing for 4 pets (2 dogs, 2 cats)", () => {
    const animals: AnimalDetectionBox[] = [
      { nx: 0.15, ny: 0.60, nw: 0.12, nh: 0.18, label: "Buster" },
      { nx: 0.28, ny: 0.62, nw: 0.10, nh: 0.15, label: "Kona" },
      { nx: 0.50, ny: 0.55, nw: 0.08, nh: 0.12, label: "Mochi" },
      { nx: 0.65, ny: 0.58, nw: 0.08, nh: 0.12, label: "Shadow" },
    ];

    const result = calculateAnimalPtzTarget(animals);

    expect(result.framingType).toBe("PET_CLUSTER");
    // Span from 0.15 to (0.65 + 0.08) = 0.73
    expect(result.animalBounds.xMin).toBe(0.15);
    expect(result.animalBounds.xMax).toBeCloseTo(0.73, 2);
    expect(result.targetPtz.zoomFactor).toBeGreaterThan(1.0);
  });

  it("applies calibration bobbing gesture while settling on pets", () => {
    const rawBoxes = [
      { nx: 0.4, ny: 0.5, nw: 0.15, nh: 0.2, label: "cat" },
    ];

    let state = DEFAULT_ANIMAL_FRAMING_STATE;
    const startTime = 150000;

    // t = 0 (converging)
    state = stepAnimalFramingEngine(state, rawBoxes, startTime, 0.08);
    expect(state.calibrationPhase).toBe("CONVERGING");

    // t = 800ms (bobbing calibration)
    state = stepAnimalFramingEngine(state, rawBoxes, startTime + 800, 0.08);
    expect(state.calibrationPhase).toBe("BOBBING_CALIBRATION");
    expect(state.detectedAnimals.length).toBe(1);

    // t = 2000ms (locked)
    state = stepAnimalFramingEngine(state, rawBoxes, startTime + 2000, 0.08);
    expect(state.calibrationPhase).toBe("LOCKED");
  });

  it("returns to wide frame when all animals leave the room", () => {
    const empty: AnimalDetectionBox[] = [];
    const target = calculateAnimalPtzTarget(empty);

    expect(target.targetPtz.zoomFactor).toBe(1.0);
    expect(target.framingType).toBe("WIDE");
  });
});
