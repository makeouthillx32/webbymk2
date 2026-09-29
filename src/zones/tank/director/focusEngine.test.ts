import { describe, it, expect } from "bun:test";
import {
  calculateBoundingBoxPtz,
  stepFocusEngine,
  DEFAULT_FOCUS_CONFIG,
  DEFAULT_FOCUS_ENGINE_STATE,
  type FocusSubject,
} from "./focusEngine";

describe("Autonomous AI Focus Engine (Zoom-Inspect-Memorize-Restore)", () => {
  it("calculates exact bounding box virtual PTZ crop and clamps within 3840x2160", () => {
    // Subject positioned in upper-right quadrant
    const box = {
      x: 0.6,
      y: 0.2,
      width: 0.2,
      height: 0.3,
    };

    const ptz = calculateBoundingBoxPtz(box, DEFAULT_FOCUS_CONFIG);

    expect(ptz.zoomFactor).toBeGreaterThan(1.5);
    expect(ptz.zoomFactor).toBeLessThanOrEqual(DEFAULT_FOCUS_CONFIG.maxZoom);

    const cropW = DEFAULT_FOCUS_CONFIG.canvasWidth / ptz.zoomFactor;
    const cropH = DEFAULT_FOCUS_CONFIG.canvasHeight / ptz.zoomFactor;

    // Pan + crop dimensions must never exceed canvas dimensions
    expect(ptz.panOffsetX).toBeGreaterThanOrEqual(0);
    expect(ptz.panOffsetX + cropW).toBeLessThanOrEqual(DEFAULT_FOCUS_CONFIG.canvasWidth + 1);
    expect(ptz.panOffsetY).toBeGreaterThanOrEqual(0);
    expect(ptz.panOffsetY + cropH).toBeLessThanOrEqual(DEFAULT_FOCUS_CONFIG.canvasHeight + 1);
  });

  it("inhibits Focus when subject is in motion (isMovement === true or velocity >= threshold)", () => {
    const movingSubject: FocusSubject = {
      id: "subj-1",
      cameraId: "cam-1",
      label: "person",
      confidence: 0.72, // Low confidence would normally trigger focus
      box: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
      isMovement: true,
      velocity: 0.08, // > 0.03 threshold
    };

    const nextState = stepFocusEngine(DEFAULT_FOCUS_ENGINE_STATE, [movingSubject], 1000);

    // Must stay IDLE_WIDE and not engage Focus while subject is running/walking
    expect(nextState.phase).toBe("IDLE_WIDE");
    expect(nextState.activeSubject).toBeNull();
  });

  it("enters SETTLING and ZOOMING_IN when subject is stagnant and confidence is low", () => {
    const stagnantSubject: FocusSubject = {
      id: "subj-2",
      cameraId: "cam-2",
      label: "person",
      confidence: 0.68,
      box: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
      isMovement: false,
      velocity: 0.005,
    };

    const startTime = 10000;
    // Step 1: Detect candidate and enter SETTLING
    const settlingState = stepFocusEngine(DEFAULT_FOCUS_ENGINE_STATE, [stagnantSubject], startTime);
    expect(settlingState.phase).toBe("SETTLING");
    expect(settlingState.activeSubject?.id).toBe("subj-2");

    // Step 2: Still settling before 800ms
    const duringSettle = stepFocusEngine(settlingState, [stagnantSubject], startTime + 400);
    expect(duringSettle.phase).toBe("SETTLING");

    // Step 3: Settle duration reached (>= 800ms) -> Enter ZOOMING_IN
    const zoomingState = stepFocusEngine(settlingState, [stagnantSubject], startTime + 850);
    expect(zoomingState.phase).toBe("ZOOMING_IN");
    expect(zoomingState.targetPtz.zoomFactor).toBeGreaterThan(1.0);
  });

  it("completes full lifecycle: Zoom In -> Inspect Dwell -> Zoom Out -> Cooldown", () => {
    const stagnantSubject: FocusSubject = {
      id: "subj-3",
      cameraId: "cam-1",
      label: "person",
      confidence: 0.65,
      box: { x: 0.3, y: 0.3, width: 0.25, height: 0.4 },
      isMovement: false,
      velocity: 0,
      identifiedName: "Tyler",
    };

    let t = 20000;
    let state = stepFocusEngine(DEFAULT_FOCUS_ENGINE_STATE, [stagnantSubject], t);
    expect(state.phase).toBe("SETTLING");

    // Advance past settle (800ms) -> ZOOMING_IN
    t += 850;
    state = stepFocusEngine(state, [stagnantSubject], t);
    expect(state.phase).toBe("ZOOMING_IN");

    // Advance past zoom-in (450ms) -> INSPECTING
    t += 460;
    state = stepFocusEngine(state, [stagnantSubject], t);
    expect(state.phase).toBe("INSPECTING");
    expect(state.currentPtz.zoomFactor).toBe(state.targetPtz.zoomFactor);

    // Advance past inspect dwell (1500ms) -> ZOOMING_OUT
    t += 1510;
    state = stepFocusEngine(state, [stagnantSubject], t);
    expect(state.phase).toBe("ZOOMING_OUT");
    expect(state.resolvedIdentity).toBe("Tyler");
    expect(state.inspectedConfidence).toBeGreaterThanOrEqual(0.9);

    // Advance past zoom-out (600ms) -> COOLDOWN
    t += 610;
    state = stepFocusEngine(state, [stagnantSubject], t);
    expect(state.phase).toBe("COOLDOWN");
    expect(state.currentPtz.zoomFactor).toBe(1.0);

    // Advance past cooldown (5000ms) -> IDLE_WIDE
    t += 5050;
    state = stepFocusEngine(state, [stagnantSubject], t);
    expect(state.phase).toBe("IDLE_WIDE");
    expect(state.activeSubject).toBeNull();
  });
});
