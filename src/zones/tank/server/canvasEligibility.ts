import type { CameraProtocol } from "../contracts";
import type { CameraKind } from "./directorVirtualAtlas";

// Which cameras are allowed onto the detection canvas.
//
// Only IP cameras, deliberately, and only for now.
//
// The reason is how each source behaves when it stops: an IP camera's room
// stays on the canvas and shows NO SIGNAL, so a director can see it is down.
// Every other source — IRL cams, USB cams, OBS rooms, anything arriving via
// the SRT tool — makes its room *disappear* when it is not live. A room that
// vanishes cannot be reasoned about: the canvas silently reflows, detections
// for it stop arriving with no indication they ever should have, and the
// director cannot tell "nothing is happening there" from "that room is gone".
//
// A stable set of tiles is the whole premise of scoring rooms against each
// other, so until vanishing sources can hold their place, they stay off.

/**
 * Camera kind from its ingest protocol.
 *
 * Protocol is authoritative; the previous approach sniffed substrings out of
 * the camera id (`id.includes("irl")`) and fell through to "ipcam" for
 * anything it did not recognise — so an unfamiliar USB or OBS camera was
 * silently treated as an IP camera. For a rule whose entire job is to exclude,
 * the unknown case must never land on the permitted side.
 */
export function cameraKindFromProtocol(protocol?: CameraProtocol | null): CameraKind | "unknown" {
  switch (protocol) {
    case "ip-camera":
      return "ipcam";
    case "usb":
      return "usbcam";
    case "rtmp":
      return "obs";
    case "srt":
    case "srtla":
      return "irlcam";
    default:
      return "unknown";
  }
}

/**
 * Whether this camera may appear on the detection canvas.
 *
 * Fails closed: anything whose protocol cannot be identified is excluded.
 */
export function isCanvasEligible(camera: { protocol?: CameraProtocol | null }): boolean {
  return cameraKindFromProtocol(camera.protocol) === "ipcam";
}

/** Filters a camera list down to what belongs on the canvas. */
export function canvasEligibleCameras<T extends { protocol?: CameraProtocol | null }>(
  cameras: T[],
): T[] {
  return cameras.filter(isCanvasEligible);
}
