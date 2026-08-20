import type { CameraDirectorySnapshot } from "../contracts";

/**
 * The viewer-safe view of the camera directory: admin audio routing and per
 * camera credential fingerprints removed, non-public cameras dropped.
 *
 * The return type is declared rather than inferred so this stays substitutable
 * for the snapshot everywhere it is consumed — otherwise the stripping silently
 * produces a different shape and callers only find out at the assignment.
 */
export function toPublicCameraDirectory(snapshot: CameraDirectorySnapshot): CameraDirectorySnapshot {
  const { audioSources: _adminAudioSources, ...publicSnapshot } = snapshot;
  return {
    ...publicSnapshot,
    cameras: snapshot.cameras
      .filter((camera) => camera.publicVisible)
      .map(({ keyFingerprint: _credentialFingerprint, ...camera }) => camera),
  };
}
