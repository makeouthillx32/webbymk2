"use client";

import { useEffect, useState } from "react";
import { isCameraDebugEnabled, subscribeCameraDebug, type CameraDebugLine } from "../cameraDebug";

// Renders whatever CameraPlayer logged via cameraDebug.ts, directly on the
// page. Inert unless ?debug=camera is in the URL. This is the only way to
// get a real trace off an iPhone for this bug — iOS Safari has no remote
// inspector without a paired Mac, so this HUD IS the devtools here.
export function TankCameraDebugHud() {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<CameraDebugLine[]>([]);

  useEffect(() => {
    setEnabled(isCameraDebugEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return subscribeCameraDebug(setLines);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[99999] max-h-[40vh] overflow-y-auto bg-black/95 p-2 font-mono text-[10px] leading-tight text-cyan-300"
      style={{ WebkitUserSelect: "text", userSelect: "text" }}
    >
      <div className="mb-1 text-amber-400">
        CAMERA DEBUG HUD — screenshot or screen-record this, then send it back
      </div>
      {lines.length === 0 && <div className="text-slate-500">Waiting for a camera player to mount…</div>}
      {lines.map((l, i) => (
        <div key={i}>
          [{(l.t / 1000).toFixed(2)}s] [{l.cameraId}] {l.msg}
        </div>
      ))}
    </div>
  );
}

export default TankCameraDebugHud;
