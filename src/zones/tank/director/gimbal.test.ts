import { describe, expect, test } from "bun:test";
import {
  FRAMING_AIM_TUNING,
  WIDE_AIM,
  aimToPtz,
  initialFramingAim,
  initialGimbal,
  isGimbalSettled,
  pickSubject,
  ptzToAim,
  smoothnessToSeconds,
  stepFramingAim,
  stepGimbal,
  type FramingAimState,
} from "./gimbal";

const dog = (x: number, y: number, w = 0.2, h = 0.12) => ({ x, y, width: w, height: h });

/** Run the gimbal at 60 fps for `seconds`, returning every zoom it passed through. */
function glide(from = WIDE_AIM, to = { zoom: 3, cx: 0.4, cy: 0.7 }, seconds = 6, smooth = 6) {
  let g = initialGimbal(from);
  const zooms: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    g = stepGimbal(g, to, 1 / 60, smoothnessToSeconds(smooth));
    zooms.push(g.zoom);
  }
  return { g, zooms };
}

describe("gimbal motion", () => {
  test("slow start and slow stop, and never past the target", () => {
    const { g, zooms } = glide();
    const steps = zooms.map((z, i) => z - (zooms[i - 1] ?? 1));
    const peak = Math.max(...steps);
    const peakAt = steps.indexOf(peak);
    expect(steps[0]).toBeLessThan(peak / 3); // eases in
    expect(steps[steps.length - 1]).toBeLessThan(peak / 20); // eases out
    expect(peakAt).toBeGreaterThan(0);
    expect(Math.max(...zooms)).toBeLessThanOrEqual(3); // no overshoot
    expect(isGimbalSettled(g, { zoom: 3, cx: 0.4, cy: 0.7 })).toBe(true);
  });

  test("the smoothness dial: 10 is slower than 1", () => {
    const quick = glide(WIDE_AIM, { zoom: 3, cx: 0.5, cy: 0.5 }, 0.5, 1).g.zoom;
    const slow = glide(WIDE_AIM, { zoom: 3, cx: 0.5, cy: 0.5 }, 0.5, 10).g.zoom;
    expect(quick).toBeGreaterThan(slow);
    expect(smoothnessToSeconds(1)).toBeLessThan(smoothnessToSeconds(10));
    expect(smoothnessToSeconds(10, "sport")).toBeCloseTo(smoothnessToSeconds(10) / 2);
    expect(smoothnessToSeconds(99)).toBe(smoothnessToSeconds(10));
  });

  test("the crop reaches every edge of the frame", () => {
    expect(aimToPtz({ zoom: 2, cx: 0, cy: 1 })).toMatchObject({ panOffsetX: 0, panOffsetY: 1080 });
    expect(aimToPtz({ zoom: 2, cx: 1, cy: 0 })).toMatchObject({ panOffsetX: 1920, panOffsetY: 0 });
    const back = ptzToAim(aimToPtz({ zoom: 2.5, cx: 0.4, cy: 0.6 }));
    expect(back.cx).toBeCloseTo(0.4, 3);
    expect(back.cy).toBeCloseTo(0.6, 3);
  });
});

describe("aiming at a dog lying still (the 2026-09-19 bounce)", () => {
  function run(frames: Array<ReturnType<typeof dog>[]>, stepMs = 1000) {
    let s: FramingAimState = initialFramingAim();
    const aims: number[] = [];
    frames.forEach((boxes, i) => {
      s = stepFramingAim(s, boxes, "normal", 1_000_000 + i * stepMs);
      aims.push(s.aim.zoom);
    });
    return { s, aims };
  }

  test("detection jitter does not move the aim", () => {
    const jitter = Array.from({ length: 20 }, (_, i) => [dog(0.4 + (i % 2) * 0.01, 0.6, 0.2 + (i % 3) * 0.015, 0.12)]);
    const { aims } = run(jitter);
    expect(new Set(aims.slice(1)).size).toBe(1);
  });

  test("a missed detection holds the shot; a long absence eases to wide", () => {
    const { aims } = run([[dog(0.4, 0.6)], [], [], [dog(0.4, 0.6)], ...Array.from({ length: 6 }, () => [])]);
    expect(aims[1]).toBe(aims[0]);
    expect(aims[2]).toBe(aims[0]);
    expect(aims[aims.length - 1]).toBe(1);
    expect(FRAMING_AIM_TUNING.lostHoldMs).toBeLessThan(6000);
  });

  test("a subject walking out of the middle of the shot re-centres it", () => {
    const { aims, s } = run([[dog(0.2, 0.6)], [dog(0.2, 0.6)], [dog(0.55, 0.6)], [dog(0.55, 0.6)]]);
    expect(aims[3]).toBe(aims[0]); // same zoom
    expect(s.aim.cx).toBeGreaterThan(0.4); // was 0.3: followed the move (through the smoothed box)
  });

  test("full camera means full camera, whatever the detector says", () => {
    const s = stepFramingAim(initialFramingAim(), [dog(0.4, 0.6)], "camera", 1);
    expect(s.aim).toEqual(WIDE_AIM);
  });

  test("a second dog walking past does not steal the shot", () => {
    const followed = dog(0.2, 0.6);
    const picked = pickSubject([dog(0.7, 0.3, 0.4, 0.3), dog(0.22, 0.61)], followed);
    expect(picked?.x).toBeCloseTo(0.22);
  });
});

describe("follow framing never zooms onto somebody else", () => {
  test("Tyler gone, Malia named: nothing to frame, so the shot holds then widens", async () => {
    const { extractModeCandidates } = await import("./aiTrackingFraming");
    const reading = {
      cameraId: "gr", peopleCount: 1, visibleFeetCount: 0, feetConfidence: 0, faceCount: 0, motionScore: 0, audioPeak: 0, isSpeaking: false,
      boundingBoxes: [{ nx: 0.4, ny: 0.3, nw: 0.2, nh: 0.4, label: "person", targetName: "malia" }],
    };
    expect(extractModeCandidates(reading, "member", "tyler")).toEqual([]);
    const withHim = { ...reading, boundingBoxes: [...reading.boundingBoxes, { nx: 0.1, ny: 0.3, nw: 0.2, nh: 0.4, label: "person" }] };
    expect(extractModeCandidates(withHim, "member", "tyler")).toHaveLength(1);
  });
});
