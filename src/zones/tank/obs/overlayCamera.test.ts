import { describe, expect, test } from "bun:test";
import {
  overlayCameraLabel,
  OVERLAY_CAMERA_FALLBACK_LABEL,
  type OverlayCamera,
} from "./overlayCamera";

// This label goes on the broadcast. It is also the one piece of text that is
// now rendered from two places — the composed director scene and the standalone
// HUD browser source — so the whole point is that they cannot disagree.

const withLocation: OverlayCamera = {
  id: "cam-1",
  name: "Game Room",
  roomScope: "game-room",
  location: "TYLER'S HOUSE",
};

// What the snapshot path actually provides: DiscoveredCamera has no `location`.
const fromSnapshot: OverlayCamera = {
  id: "cam-2",
  name: "The Foyer",
  roomScope: "foyer",
};

describe("captioning a shot", () => {
  test("a camera that knows its location is prefixed with it", () => {
    expect(overlayCameraLabel(withLocation)).toBe("TYLER'S HOUSE • Game Room");
  });

  test("a snapshot camera falls back rather than printing undefined", () => {
    // The live path. DiscoveredCamera carries no location, so this fallback is
    // not an edge case — it is what the stream shows every time.
    expect(overlayCameraLabel(fromSnapshot)).toBe(`${OVERLAY_CAMERA_FALLBACK_LABEL} • The Foyer`);
  });

  test("no camera at all still produces a label, never an empty tag", () => {
    // An empty black pill in the corner of the broadcast looks like a rendering
    // fault; the house name looks intentional.
    expect(overlayCameraLabel(null)).toBe(OVERLAY_CAMERA_FALLBACK_LABEL);
    expect(overlayCameraLabel(undefined)).toBe(OVERLAY_CAMERA_FALLBACK_LABEL);
  });

  test("an explicit ?label= wins outright", () => {
    // The operator asked for specific words on air. Nothing derived should
    // override that.
    expect(overlayCameraLabel(withLocation, "LIVE FROM THE KITCHEN")).toBe("LIVE FROM THE KITCHEN");
    expect(overlayCameraLabel(null, "STANDBY")).toBe("STANDBY");
  });

  test("a blank or whitespace label is ignored, not printed", () => {
    // `?label=` with nothing after it is a typo, not a request for an empty tag.
    expect(overlayCameraLabel(withLocation, "")).toBe("TYLER'S HOUSE • Game Room");
    expect(overlayCameraLabel(withLocation, "   ")).toBe("TYLER'S HOUSE • Game Room");
    expect(overlayCameraLabel(withLocation, null)).toBe("TYLER'S HOUSE • Game Room");
  });

  test("a blank location is treated as absent", () => {
    expect(overlayCameraLabel({ id: "c", name: "Kitchen", location: "  " })).toBe(
      `${OVERLAY_CAMERA_FALLBACK_LABEL} • Kitchen`,
    );
  });

  test("the composed scene and the standalone overlay agree", () => {
    // The regression this file exists for: two call sites, one answer.
    const composed = overlayCameraLabel(fromSnapshot, null);
    const standalone = overlayCameraLabel({ ...fromSnapshot }, null);
    expect(composed).toBe(standalone);
  });
});
