import type { OutboundBroadcastDestination } from "./contracts";
import { buildMediaMtxForwards } from "./destinationConfig";

export const DIRECTOR_PROGRAM_MEDIA_PATH = "obs/director";

/**
 * Produces only the forward field for a MediaMTX path PATCH. Applying this is
 * intentionally kept separate: the existing obs/director auth and lifecycle
 * hooks must be preserved when the control-plane integration is wired.
 */
export function buildDirectorProgramForwardPatch(
  destinations: OutboundBroadcastDestination[],
) {
  return {
    forward: buildMediaMtxForwards(destinations),
  };
}
