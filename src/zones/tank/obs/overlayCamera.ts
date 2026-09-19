// src/zones/tank/obs/overlayCamera.ts
// ─────────────────────────────────────────────────────────────────────────────
// The only camera fields a director overlay needs to caption a shot.
//
// Deliberately structural and tiny rather than reusing `TankCamera`. The
// overlays are fed from two different places and the two do NOT carry the same
// shape:
//
//   - the composed OBS scene passes a `DiscoveredCamera` (that is what
//     `CameraDirectorySnapshot.cameras` actually contains)
//   - a standalone overlay page resolves its own camera from the same snapshot
//
// Typing the prop as `TankCamera` — which is what it was — demanded `health`,
// `viewers`, `isPublic` and `delivery`, none of which an overlay reads or has
// any business knowing. It simply failed to compile the moment the scene tried
// to pass what it had.
//
// `location` is optional for a real reason, not for convenience: it exists on
// `TankCamera` and NOT on `DiscoveredCamera`, so on the snapshot path it is
// always absent and the caption falls back. Making it required would be a lie
// about the data; making it optional keeps the fallback honest and visible.
// ─────────────────────────────────────────────────────────────────────────────

export type OverlayCamera = {
  id: string;
  name: string;
  /** Used to resolve a `?lock=` room, so optional for callers that cannot. */
  roomScope?: string | null;
  /** Present on TankCamera, absent on DiscoveredCamera. See the note above. */
  location?: string | null;
  playbackUrl?: string | null;
  playbackProtocol?: string | null;
};

/** What the HUD prints for a camera when it has one. */
export const OVERLAY_CAMERA_FALLBACK_LABEL = "TANK HOUSE";

/**
 * The caption for a shot.
 *
 * Kept here rather than inline in the HUD so the standalone overlay and the
 * composed scene cannot drift into labelling the same shot differently — the
 * entire point of splitting these out was one source of truth per overlay.
 */
export function overlayCameraLabel(
  camera: OverlayCamera | null | undefined,
  override?: string | null,
): string {
  const explicit = override?.trim();
  if (explicit) return explicit;
  if (!camera) return OVERLAY_CAMERA_FALLBACK_LABEL;
  const prefix = camera.location?.trim() || OVERLAY_CAMERA_FALLBACK_LABEL;
  return `${prefix} • ${camera.name}`;
}
