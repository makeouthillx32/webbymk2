// src/zones/tank/obs/overlayFx.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolving the active "chaos" overlay fx, if any.
//
// Chaos items are inventory items that, when used, temporarily re-skin the HUD
// and VU overlays. The active fx is stored as the "fx" row of
// tank_overlay_settings and reaches the overlays through the same fetch +
// realtime broadcast path as every other overlay setting — so a browser source
// that is already running picks it up live, and one started mid-fx picks it up
// on load. No new transport.
//
// The row carries its own expiry (epoch ms) rather than relying on anyone to
// clear it, so a crashed server or a dropped broadcast can never leave an
// overlay stuck in a chaos skin: the client simply stops honouring the row the
// moment `expiresAt` passes. Storage is not a scheduler.
// ─────────────────────────────────────────────────────────────────────────────

import { isOverlayTexture, type OverlayTextureId } from "./overlaySkin";
import type { OverlaySettings } from "./overlaySettings";

export type ActiveOverlayFx = {
  texture: OverlayTextureId;
  expiresAt: number;
  triggeredBy: string;
} | null;

/**
 * The fx currently in force, or null when there is none.
 *
 * Pure on purpose: the decision "is this row still a live fx" is exactly the
 * kind of small rule that gets re-typed wrong at three call sites, and it is
 * testable without a DOM.
 */
export function resolveActiveOverlayFx(
  settings: OverlaySettings | null | undefined,
  now: number,
): ActiveOverlayFx {
  if (!settings) return null;

  const texture = settings.texture;
  const expiresAt = settings.expiresAt;
  if (typeof texture !== "string" || !isOverlayTexture(texture)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= now) return null;

  const triggeredBy = typeof settings.triggeredBy === "string" ? settings.triggeredBy : "";
  return { texture, expiresAt, triggeredBy };
}
