// The alt director keeps directing: as a visitor walks the dark house, the
// shot cuts to whichever real room camera (the "TANK — …" cameras exported
// with the house) can see them — fixed angles, cut not panned. A camera keeps
// the shot while it still sees the visitor, so walking along a frame edge
// never ping-pongs between two angles. Where no camera sees them (hallways),
// the walker falls back to its own follow camera.

import * as THREE from "three";
import { segmentHitsWall, type HouseMap } from "./houseMap";

export type ShotCamera = { key: string; label: string; camera: THREE.PerspectiveCamera };

const EDGE = 0.9; // keep the visitor inside the inner 90% of the frame
const projected = new THREE.Vector3();
const mount = new THREE.Vector3();

/** How well a camera frames the visitor: 0..1 (1 = dead centre), or null. */
export function shotScore(shot: ShotCamera, head: THREE.Vector3, feet: THREE.Vector3, map: HouseMap): number | null {
  const camera = shot.camera;
  camera.updateMatrixWorld();
  let centre = 1;
  for (const point of [head, feet]) {
    projected.copy(point).project(camera);
    if (projected.z < -1 || projected.z > 1) return null;
    if (Math.abs(projected.x) > EDGE || Math.abs(projected.y) > EDGE) return null;
    centre = Math.min(centre, 1 - Math.max(Math.abs(projected.x), Math.abs(projected.y)) / EDGE);
  }
  // Cameras hang on walls: start the sight line a little in front of the lens
  // so the camera's own wall doesn't count as "in the way".
  camera.getWorldPosition(mount);
  const dx = head.x - mount.x;
  const dz = head.z - mount.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.4) return null;
  const sx = mount.x + (dx / length) * 0.35;
  const sz = mount.z + (dz / length) * 0.35;
  if (segmentHitsWall(map.walls, sx, sz, head.x, head.z)) return null;
  return centre;
}

const belongsTo = (key: string, room: string | null) => Boolean(room) && (key === room || key.startsWith(`${room}-`));

/**
 * The camera to cut to, or null for the follow camera. The current camera
 * holds while it sees the visitor and is either in their room or the only
 * view going; otherwise the best-framed camera of the room they're standing
 * in wins, then any camera that sees them.
 */
export function pickShot(
  shots: readonly ShotCamera[],
  currentKey: string | null,
  head: THREE.Vector3,
  feet: THREE.Vector3,
  map: HouseMap,
  room: string | null,
): string | null {
  let current: { key: string; inRoom: boolean } | null = null;
  let bestInRoom: { key: string; score: number } | null = null;
  let best: { key: string; score: number } | null = null;
  for (const shot of shots) {
    const score = shotScore(shot, head, feet, map);
    if (score === null) continue;
    const inRoom = belongsTo(shot.key, room);
    if (shot.key === currentKey) current = { key: shot.key, inRoom };
    if (inRoom && (!bestInRoom || score > bestInRoom.score)) bestInRoom = { key: shot.key, score };
    if (!best || score > best.score) best = { key: shot.key, score };
  }
  if (current && (current.inRoom || !bestInRoom)) return current.key;
  return bestInRoom?.key ?? best?.key ?? null;
}
