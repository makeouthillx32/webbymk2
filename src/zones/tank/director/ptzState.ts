// src/zones/tank/director/ptzState.ts
// Pure PTZ state definitions with zero UI or server dependencies.

export type VirtualPtzState = {
  zoomFactor: number;
  panOffsetX: number;
  panOffsetY: number;
  zoomSpeed: number;
  speedMode: "fine" | "sport";
  /**
   * Gimbal smoothness 1-10 (slow start, slow stop): how the renderers glide to
   * this crop. Absent = DEFAULT_GIMBAL_SMOOTHNESS (director/gimbal.ts).
   */
  smoothness?: number;
};

export const DEFAULT_VIRTUAL_PTZ_STATE: VirtualPtzState = {
  zoomFactor: 1.0,
  panOffsetX: 0,
  panOffsetY: 0,
  zoomSpeed: 5,
  speedMode: "fine",
};
