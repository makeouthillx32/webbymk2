import { describe, expect, test } from "bun:test";
import { resolveActiveOverlayFx } from "./overlayFx";

// The fx row is the whole chaos-item contract on the overlay side. The
// dangerous direction is silent: a stale row that keeps honouring an expired
// fx leaves the overlays stuck in a chaos skin with no broadcast ever coming
// to fix them. Expiry must be the client's own authority.

const NOW = 1_700_000_000_000;

describe("resolveActiveOverlayFx", () => {
  test("a live fx row resolves to the fx", () => {
    const fx = resolveActiveOverlayFx(
      { texture: "plate", expiresAt: NOW + 90_000, triggeredBy: "someone" },
      NOW,
    );
    expect(fx).toEqual({ texture: "plate", expiresAt: NOW + 90_000, triggeredBy: "someone" });
  });

  test("an expired fx row is null — the client is its own cleanup", () => {
    expect(
      resolveActiveOverlayFx({ texture: "metal", expiresAt: NOW - 1, triggeredBy: "someone" }, NOW),
    ).toBeNull();
  });

  test("an unknown texture id is null, not a broken skin", () => {
    expect(
      resolveActiveOverlayFx(
        { texture: "vaporwave", expiresAt: NOW + 90_000, triggeredBy: "someone" },
        NOW,
      ),
    ).toBeNull();
  });

  test("missing or malformed fields are null", () => {
    expect(resolveActiveOverlayFx({}, NOW)).toBeNull();
    expect(resolveActiveOverlayFx(null, NOW)).toBeNull();
    expect(
      resolveActiveOverlayFx({ texture: "metal", expiresAt: "soon", triggeredBy: "x" }, NOW),
    ).toBeNull();
  });

  test("a missing triggeredBy degrades to an anonymous fx, not a dropped one", () => {
    expect(
      resolveActiveOverlayFx({ texture: "aluminum", expiresAt: NOW + 90_000 }, NOW),
    ).toEqual({ texture: "aluminum", expiresAt: NOW + 90_000, triggeredBy: "" });
  });
});
