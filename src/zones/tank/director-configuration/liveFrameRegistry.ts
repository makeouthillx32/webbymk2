// src/zones/tank/director-configuration/liveFrameRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lets detection read the frames the director console is ALREADY decoding.
//
// The console decoded every camera twice: six visible CameraPlayer tiles, plus
// six hidden <video> elements PeopleDetectionEngine opened for itself. Twelve
// live decodes for six cameras, in one tab, competing for the same hardware
// decoder — which is why the director stuttered while the public page, running
// half as many, stayed smooth.
//
// The original split was deliberate, and the comment explaining it is still
// right about the case it was written for: on a PUBLIC page, a frame-sampling
// bug must never be able to touch what a viewer sees. On the operator console
// that reasoning does not hold — the operator IS the viewer, there is no
// audience to protect, and the surface is titled "REAL FOOTAGE VIRTUAL MATRIX"
// precisely because it exists to be looked at and detected from.
//
// Sampling the visible tile is also strictly BETTER footage: the tiles carry
// the full source rung, where the hidden videos had dropped to the 720p
// sibling to stay affordable. Detection letterboxes to 640x640 either way, so
// the source rung loses nothing and costs nothing extra now that it is a
// stream we were decoding regardless.
//
// A module-scoped registry rather than prop-drilling through DirectorWorkspace:
// the producer (VirtualCanvas tiles) and the consumer (PeopleDetectionEngine)
// are siblings mounted by the same parent, and threading refs through it would
// couple three components to a detail none of them own.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the on-screen video for a camera, or null when it has no frame. */
export type LiveVideoGetter = () => HTMLVideoElement | null;

const registry = new Map<string, LiveVideoGetter>();

export function registerLiveVideo(cameraId: string, getter: LiveVideoGetter): void {
  if (!cameraId) return;
  registry.set(cameraId, getter);
}

/**
 * Unregister, but only if this exact getter is still the registered one.
 *
 * React can mount the replacement tile before unmounting the old one during a
 * re-key, so an unconditional delete would remove the NEW tile's getter and
 * leave detection permanently blind to that camera.
 */
export function unregisterLiveVideo(cameraId: string, getter?: LiveVideoGetter): void {
  if (!cameraId) return;
  if (getter && registry.get(cameraId) !== getter) return;
  registry.delete(cameraId);
}

/**
 * The visible, decoded frame source for a camera — null when that camera has
 * no tile on screen, or the tile has not been admitted a stream slot yet.
 * Callers fall back to their own source rather than treating null as an error.
 */
export function getLiveVideo(cameraId: string): HTMLVideoElement | null {
  const getter = registry.get(cameraId);
  if (!getter) return null;
  try {
    return getter();
  } catch {
    // A tile mid-unmount can throw on ref access. Never let that take down the
    // detection tick for every other camera.
    return null;
  }
}

/** Camera ids currently offering a visible frame source. Diagnostics only. */
export function liveVideoCameraIds(): string[] {
  return [...registry.keys()].sort();
}
