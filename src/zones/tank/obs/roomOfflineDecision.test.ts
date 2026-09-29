import { describe, expect, test } from "bun:test";
import {
  parseTrigger,
  shouldShowOverlay,
  type OverlayStatus,
  type OverlayTrigger,
} from "./roomOfflineDecision";

// Every `true` from shouldShowOverlay paints a full-screen card over a live OBS
// scene. The asymmetry is the whole point: a missed overlay is cosmetic, a
// false one blacks out the broadcast. So the bias is always toward hiding.

const live: OverlayStatus = {
  offline: false,
  anyOnline: true,
  cameraStateKnown: true,
  known: true,
};

describe("shouldShowOverlay — the room kill-switch (default trigger)", () => {
  test("a live room stays uncovered", () => {
    expect(shouldShowOverlay(live, "off")).toBe(false);
  });

  test("a switched-off room is covered", () => {
    expect(shouldShowOverlay({ ...live, offline: true }, "off")).toBe(true);
  });

  test("the kill-switch is trusted even when the camera read failed", () => {
    // offline comes from a cheap DB read that does not need the directory, so
    // this stays accurate when the snapshot times out.
    expect(
      shouldShowOverlay({ ...live, offline: true, cameraStateKnown: false }, "off"),
    ).toBe(true);
  });

  test("a room with no feed is NOT covered in this mode", () => {
    // "off" means the operator flipped the switch, not that the feed dropped.
    expect(shouldShowOverlay({ ...live, anyOnline: false }, "off")).toBe(false);
  });
});

describe("shouldShowOverlay — no-signal trigger", () => {
  test("a dead feed is covered", () => {
    expect(shouldShowOverlay({ ...live, anyOnline: false }, "nosignal")).toBe(true);
  });

  test("a live feed is not", () => {
    expect(shouldShowOverlay(live, "nosignal")).toBe(false);
  });

  test("FAILS HIDDEN: an unverified camera state never covers the broadcast", () => {
    // The dangerous case. If the server could not read the directory it reports
    // anyOnline optimistically AND flags cameraStateKnown false; either alone
    // must be enough to keep the card off.
    expect(
      shouldShowOverlay({ ...live, anyOnline: false, cameraStateKnown: false }, "nosignal"),
    ).toBe(false);
  });

  test("a switched-off room is not covered in this mode", () => {
    expect(shouldShowOverlay({ ...live, offline: true }, "nosignal")).toBe(false);
  });
});

describe("shouldShowOverlay — both", () => {
  test("covers a switched-off room", () => {
    expect(shouldShowOverlay({ ...live, offline: true }, "both")).toBe(true);
  });

  test("covers a dead feed", () => {
    expect(shouldShowOverlay({ ...live, anyOnline: false }, "both")).toBe(true);
  });

  test("leaves a healthy room alone", () => {
    expect(shouldShowOverlay(live, "both")).toBe(false);
  });

  test("FAILS HIDDEN on an unverified camera state, but still honours the switch", () => {
    const unverified = { ...live, anyOnline: false, cameraStateKnown: false };
    expect(shouldShowOverlay(unverified, "both")).toBe(false);
    expect(shouldShowOverlay({ ...unverified, offline: true }, "both")).toBe(true);
  });
});

describe("shouldShowOverlay — fail-hidden guarantees", () => {
  test("no status at all (first paint, failed fetch) stays hidden", () => {
    for (const trigger of ["off", "nosignal", "both"] as OverlayTrigger[]) {
      expect(shouldShowOverlay(null, trigger)).toBe(false);
    }
  });

  test("an unknown room stays hidden even if it looks offline", () => {
    // A typo'd room key must not black out the scene it was added to.
    for (const trigger of ["off", "nosignal", "both"] as OverlayTrigger[]) {
      expect(
        shouldShowOverlay({ offline: true, anyOnline: false, known: false }, trigger),
      ).toBe(false);
    }
  });

  test("preview overrides everything, including an unknown room", () => {
    expect(shouldShowOverlay(null, "off", true)).toBe(true);
    expect(shouldShowOverlay({ ...live, known: false }, "nosignal", true)).toBe(true);
  });

  test("a missing cameraStateKnown is treated as known, not as broken", () => {
    // Older/partial payloads: absent means the field was never sent, which is
    // only the case when the server did read the directory.
    const { cameraStateKnown: _omitted, ...withoutFlag } = live;
    expect(shouldShowOverlay({ ...withoutFlag, anyOnline: false }, "nosignal")).toBe(true);
  });
});

describe("parseTrigger", () => {
  test("defaults to the kill-switch", () => {
    expect(parseTrigger(null)).toBe("off");
    expect(parseTrigger(undefined)).toBe("off");
    expect(parseTrigger("")).toBe("off");
  });

  test("accepts the documented values, case-insensitively", () => {
    expect(parseTrigger("nosignal")).toBe("nosignal");
    expect(parseTrigger("BOTH")).toBe("both");
    expect(parseTrigger("Off")).toBe("off");
  });

  test("anything unrecognised falls back to the narrowest trigger", () => {
    expect(parseTrigger("everything")).toBe("off");
    expect(parseTrigger("1")).toBe("off");
  });
});
