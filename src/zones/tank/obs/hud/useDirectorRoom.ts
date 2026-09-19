"use client";

import { useMemo } from "react";
import { useTankCameras } from "../../public/useTankCameras";
import { useServerDirector } from "../../director/useServerDirector";
import type { OverlayCamera } from "../overlayCamera";

/**
 * The room an overlay should be showing.
 *
 * FOLLOWS THE DIRECTOR BY DEFAULT, which is the point. Every piece of the HUD
 * exists to describe whatever is on the programme, so "which room" is not a
 * per-overlay decision — it is one answer that all of them share. This hook is
 * that answer, in one place.
 *
 * It was previously re-typed inside the HUD, the VU meter and the audio source,
 * with the same four-branch fallback each time. Three copies of a rule is three
 * chances for one of them to drift and caption a different room than its
 * neighbour is metering — which is exactly the class of bug these overlays keep
 * producing.
 *
 * THERE IS NO LOCK. Pinning an overlay to a fixed room was removed 2026-09-13:
 * these overlays exist to describe the Director Programme, and every one of
 * them that could be pinned was a way to caption or meter a room the programme
 * was not showing. Removing the option removes the failure.
 */
export function useDirectorRoom(): {
  camera: OverlayCamera | null;
  /** Every camera currently live, for callers that need the full list. */
  cameras: OverlayCamera[];
} {
  const { snapshot } = useTankCameras();

  const cameras = useMemo(() => {
    // Only cameras a room actually claims. A camera present in the registry but
    // in no room is not on air and must never be captioned as if it were.
    const liveCameraIds = new Set((snapshot?.rooms ?? []).flatMap((room) => room.cameraIds));
    return (snapshot?.cameras ?? []).filter((cam) => liveCameraIds.has(cam.id));
  }, [snapshot]);

  const serverDirector = useServerDirector();

  const camera = useMemo<OverlayCamera | null>(() => {
    if (serverDirector.activeCameraId) {
      return cameras.find((c) => c.id === serverDirector.activeCameraId) ?? null;
    }
    // Before the director has reported, the first live camera beats captioning
    // nothing — an empty HUD reads as broken rather than as starting up.
    return cameras[0] ?? null;
  }, [cameras, serverDirector.activeCameraId]);

  return { camera, cameras };
}
