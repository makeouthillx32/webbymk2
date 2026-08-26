import { describe, expect, test } from "bun:test";
import { getDirectorModePresentation } from "./directorModePresentation";

// AUTO_TRACKING stopped meaning only "audio" the moment real subject-mode
// scoring landed in the engine — it can be speaker, crowd, feet, face, motion
// or chaos. Nerd stats showed "AUDIO TRACKING" for every one of them. The
// engine tags each cut's real mode at the front of `reason`; this is the
// contract that reads it back out.

describe("director mode label reflects the real subject mode", () => {
  test("speaker-driven cut shows SPEAKER, not audio", () => {
    const p = getDirectorModePresentation("AUTO_TRACKING", "[SPEAKER] Kitchen scored 87 · audio:52 speaking:35");
    expect(p.label).toBe("SPEAKER TRACKING");
  });

  test("crowd-driven cut shows GROUP", () => {
    const p = getDirectorModePresentation("AUTO_TRACKING", "[CROWD] Living Room scored 140 · people:135");
    expect(p.label).toBe("GROUP TRACKING");
  });

  test("feet-driven cut shows FEET", () => {
    const p = getDirectorModePresentation("AUTO_TRACKING", "[FEET] Garage scored 40 · feet:30");
    expect(p.label).toBe("FEET TRACKING");
  });

  test("an unparseable reason falls back rather than showing nothing", () => {
    const p = getDirectorModePresentation("AUTO_TRACKING", "garbled string");
    expect(p.label).toBe("AUTO TRACKING");
  });

  test("no reason at all (initial state) falls back the same way", () => {
    const p = getDirectorModePresentation("AUTO_TRACKING");
    expect(p.label).toBe("AUTO TRACKING");
  });

  test("other modes are untouched by the reason string", () => {
    expect(getDirectorModePresentation("STANDBY", "[SPEAKER] whatever").label).toBe("STANDBY");
    expect(getDirectorModePresentation("ATTENTION", "[SPEAKER] whatever").label).toBe("ATTENTION LOCK");
  });
});
