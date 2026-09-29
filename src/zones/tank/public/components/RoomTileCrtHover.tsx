"use client";

/**
 * Full-card CRT interruption used by the All Rooms matrix. The animation lives
 * in TankThemeStyles so it is injected once and can be shared by desktop and
 * mobile layouts without remounting a style tag for every camera.
 */
export function RoomTileCrtHover() {
  return (
    <span className="tank-room-crt-hover" aria-hidden="true">
      <span className="tank-room-crt-tear" />
      <span className="tank-room-crt-sweep" />
    </span>
  );
}
