// src/zones/tank/director/ptzFraming.ts
// ─────────────────────────────────────────────────────────────────────────────
// Geometry for the director's virtual PTZ — the digital crop applied to a
// camera's full frame when the operator is piloting manually.
//
// WHAT IT CAN AND CANNOT DO, because this bounds everything below:
//
// Virtual PTZ is a CROP, not a lens. It buys real detail only while the crop it
// takes is still at least as large as the pixels being broadcast. A 4K source
// pushed out at 1080p has a free 2x: the crop is 1920x1080 of genuine sensor
// pixels mapped 1:1 to the output. Past that ratio every further step is
// upscaling, and no rendering technique recovers detail that was never
// captured. If the OBS browser source is itself 4K, the free range is 1x — any
// zoom at all is magnification.
//
// So the goal here is narrow and achievable: make sure the crop costs ONE
// resample instead of two, and that the one it costs is the browser's video
// scaler rather than a compositor upscale of an already-rasterised layer.
//
// WHY LAYOUT AND NOT `transform: scale()`.
//
// The scene previously applied `transform: scale(z) translate(...)` to a
// <video> laid out at the browser-source size. That asks the compositor to
// magnify a layer that has already been rasterised at 1:1 with the source —
// the sharpest pixels in the pipeline are produced and then blown up. Sizing
// the element itself instead lets the frame go through the normal video scaler
// once, straight from the decoded frame to the final size, which is the same
// path ordinary playback uses.
//
// It also removes a second resample that was easy to miss: the element carries
// `object-fit: cover`, so any mismatch between the browser-source aspect and
// the camera's fits the frame ONCE, and the transform then resampled that
// result AGAIN. One pass is strictly better than two, whatever the compositor
// happens to do on a given GPU.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The coordinate space the PTZ controller works in.
 *
 * Pan offsets arrive as pixels in a nominal 4K frame (see ManualPtzController),
 * NOT in the actual camera's resolution — every house camera is 3840x2160
 * today, so the two coincide. If a camera of a different size is ever added,
 * this is the assumption that breaks: the pan clamp would be computed against
 * the wrong frame and the crop would run off the edge of the picture.
 */
export const PTZ_SOURCE_WIDTH = 3840;
export const PTZ_SOURCE_HEIGHT = 2160;

/**
 * The automatic group/focus engines can legitimately reach 3.5x. Manual
 * controls still stop at 3x, but the programme renderer must not silently
 * flatten an AI-composed 3.47x shot to 3x on the public and OBS outputs.
 */
export const PTZ_MAX_ZOOM = 3.5;

export type PtzInput = {
  zoomFactor?: number | null;
  panOffsetX?: number | null;
  panOffsetY?: number | null;
};

/**
 * Percentages, all relative to the CONTAINING BLOCK (the scene viewport).
 *
 * That is the CSS rule for an absolutely positioned box and it is the detail
 * most likely to be got wrong here: `width` and `left` resolve against the
 * container, not against the element's own size.
 */
export type PtzFraming = {
  zoom: number;
  widthPercent: number;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
};

export type PtzVideoStyle = {
  position: "absolute";
  width: string;
  height: string;
  left: string;
  top: string;
  right: "auto";
  bottom: "auto";
  maxWidth: "none";
  maxHeight: "none";
  transform: "none";
  transformOrigin: "top left";
  willChange: "left, top, width, height";
  transition?: string;
};

/**
 * Resolve a PTZ state into a crop.
 *
 * Returns null when there is nothing to do — zoom at or below 1x. That case
 * deliberately produces NO inline geometry at all, so the overwhelmingly common
 * path (the director cutting between rooms automatically) renders through the
 * element's plain stylesheet rules exactly as it always has. A framing that
 * "happens to equal 100%" would still be an inline override, and inline
 * overrides are how a rendering regression reaches air unnoticed.
 */
export function computePtzFraming(ptz: PtzInput | null | undefined): PtzFraming | null {
  if (!ptz) return null;

  const zoom = clamp(numberOr(ptz.zoomFactor, 1), 1, PTZ_MAX_ZOOM);
  if (zoom <= 1) return null;

  // How far the crop can travel before it leaves the frame. At zoom z the crop
  // is 1/z of the picture, so the remaining (1 - 1/z) is the pan range.
  const maxPanX = PTZ_SOURCE_WIDTH - PTZ_SOURCE_WIDTH / zoom;
  const maxPanY = PTZ_SOURCE_HEIGHT - PTZ_SOURCE_HEIGHT / zoom;
  const panX = clamp(numberOr(ptz.panOffsetX, 0), 0, maxPanX);
  const panY = clamp(numberOr(ptz.panOffsetY, 0), 0, maxPanY);

  // The element is laid out `zoom` times the container, so source pixel `panX`
  // sits at panX * zoom container-pixels along it. Shifting left by that amount
  // brings the crop's top-left corner to the viewport origin.
  return {
    zoom,
    widthPercent: zoom * 100,
    heightPercent: zoom * 100,
    // `+ 0` normalises negative zero. `-(0/w)*z*100` is -0, which stringifies
    // into CSS as "-0%" and, worse, is not Object.is-equal to 0 — so a memo
    // comparing framings would see a change on every recompute at pan 0.
    leftPercent: -(panX / PTZ_SOURCE_WIDTH) * zoom * 100 + 0,
    topPercent: -(panY / PTZ_SOURCE_HEIGHT) * zoom * 100 + 0,
  };
}

/**
 * The one CSS representation used by the staff preview, public Director and
 * OBS browser source. Keeping this here prevents three subtly different crop
 * formulas from putting three different pictures on air.
 */
export function computePtzVideoStyle(
  ptz: PtzInput | null | undefined,
  transition?: string,
): PtzVideoStyle | undefined {
  const framing = computePtzFraming(ptz);
  if (!framing) return undefined;
  return {
    position: "absolute",
    width: `${framing.widthPercent}%`,
    height: `${framing.heightPercent}%`,
    left: `${framing.leftPercent}%`,
    top: `${framing.topPercent}%`,
    right: "auto",
    bottom: "auto",
    maxWidth: "none",
    maxHeight: "none",
    transform: "none",
    transformOrigin: "top left",
    willChange: "left, top, width, height",
    ...(transition ? { transition } : {}),
  };
}

/**
 * How much of the crop is real detail rather than magnification.
 *
 * 1 means every broadcast pixel is backed by a captured one. Below 1 the shot
 * is being upscaled by that factor, which is the honest measure of "this will
 * look soft" — and it depends on the OUTPUT size, not on the zoom alone.
 *
 * Exposed so the operator console can say so plainly instead of leaving someone
 * to wonder why 2.5x looks worse than 2x on a 4K output but identical on 1080p.
 */
export function ptzDetailRatio(zoom: number, outputWidth: number): number {
  if (!Number.isFinite(outputWidth) || outputWidth <= 0) return 1;
  const croppedSourceWidth = PTZ_SOURCE_WIDTH / clamp(zoom, 1, PTZ_MAX_ZOOM);
  return Math.min(1, croppedSourceWidth / outputWidth);
}

function numberOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
