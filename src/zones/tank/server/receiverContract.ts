import type { CameraAudioMode } from "../contracts";
import { normalizeAudioMode } from "./audioPolicy";

export type ManagerCamera = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  streamUser?: unknown;
  streamKey?: unknown;
  enabled?: unknown;
  roomScope?: unknown;
  publicVisible?: unknown;
  audioMode?: unknown;
  audioSourceId?: unknown;
  audioSourceName?: unknown;
  tags?: unknown;
  // Per-camera SRT "video out" port on the SRT Receiver Manager host — see
  // receiverManager.ts for how this + config.server.lanHost become the
  // media gateway's source URL for any camera, with no per-camera wiring.
  videoOutPort?: unknown;
};

function scopeSlug(value: unknown) {
  if (typeof value !== "string") return "unscoped";
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unscoped"
  );
}

export function normalizeManagerCameraMedia(camera: ManagerCamera) {
  return {
    roomScope: scopeSlug(camera.roomScope),
    publicVisible: camera.publicVisible !== false && camera.enabled !== false,
    audioMode: normalizeAudioMode(camera.audioMode),
    audioSourceId:
      typeof camera.audioSourceId === "string" && camera.audioSourceId
        ? camera.audioSourceId
        : null,
    audioSourceName:
      typeof camera.audioSourceName === "string" && camera.audioSourceName
        ? camera.audioSourceName
        : null,
    tags: Array.isArray(camera.tags)
      ? [...new Set(
          camera.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        )]
      : [],
  } satisfies {
    roomScope: string;
    publicVisible: boolean;
    audioMode: CameraAudioMode;
    audioSourceId: string | null;
    audioSourceName: string | null;
    tags: string[];
  };
}
