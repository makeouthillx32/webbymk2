"use client";

// Tiny diagnostic bus for CameraPlayer, gated behind ?debug=camera. Lets a
// player instance log engine-selection decisions and stream lifecycle
// events (video element errors, WHEP/ICE state, HLS.js errors) somewhere
// visible ON THE FAILING DEVICE ITSELF — the whole point being iOS Safari
// has no remote inspector without a paired Mac, so "check devtools" isn't
// an option there. TankCameraDebugHud renders whatever lands here.

export type CameraDebugLine = {
  t: number;
  cameraId: string;
  msg: string;
};

let enabled: boolean | null = null;
const lines: CameraDebugLine[] = [];
const listeners = new Set<(lines: CameraDebugLine[]) => void>();
const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

export function isCameraDebugEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === "undefined") return false;
  enabled = new URLSearchParams(window.location.search).get("debug") === "camera";
  return enabled;
}

export function logCameraDebug(cameraId: string, msg: string): void {
  if (!isCameraDebugEnabled()) return;
  const t = (typeof performance !== "undefined" ? performance.now() : 0) - startedAt;
  const line: CameraDebugLine = { t, cameraId, msg };
  lines.push(line);
  if (lines.length > 200) lines.shift();
  for (const l of listeners) l([...lines]);
}

export function subscribeCameraDebug(fn: (lines: CameraDebugLine[]) => void): () => void {
  listeners.add(fn);
  fn([...lines]);
  return () => listeners.delete(fn);
}
