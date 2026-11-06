// The alt director keeps directing: as a visitor walks the dark house, the
// shot cuts to whichever real room camera (the "TANK — …" cameras exported
// with the house) can see them — fixed angles, cut not panned. The camera of
// the room they're standing in wins whenever it sees any of them. A camera keeps
// the shot while it still sees the visitor, so walking along a frame edge
// never ping-pongs between two angles. Where no camera sees them (hallways),
// the walker falls back to its own follow camera.
//
// A camera must also see where the visitor is heading: a fixed angle that
// frames them but not the doorway they're walking at is no help, so while
// they walk, a point just ahead of them has to be in frame too, or the
// shot goes to one that has it, or to the follow (avatar) camera.

import * as THREE from "three";
import { segmentHitsWall, type HouseMap } from "./houseMap";

export type ShotCamera = { key: string; label: string; camera: THREE.PerspectiveCamera };

const EDGE = 0.95; // a point this close to the frame's edge still counts as in shot
const projected = new THREE.Vector3();
const mount = new THREE.Vector3();
const chest = new THREE.Vector3();

/**
 * How well a camera frames the visitor: 0..1, or null if it can't see them.
 *
 * Room cameras hang high in corners and look down, so up close the feet (or,
 * far off, the head) leave the frame long before the visitor does. Head or
 * chest in frame is enough to take the shot; the score rewards seeing more of
 * the body (head, chest, feet) and having it nearer the centre.
 */
export function shotScore(shot: ShotCamera, head: THREE.Vector3, feet: THREE.Vector3, map: HouseMap): number | null {
  const camera = shot.camera;
  camera.updateMatrixWorld();
  chest.lerpVectors(feet, head, 0.62);
  let seen = 0;
  let centre = 0;
  let upper = false;
  for (const point of [head, chest, feet]) {
    projected.copy(point).project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const edge = Math.max(Math.abs(projected.x), Math.abs(projected.y));
    if (edge > EDGE) continue;
    seen += 1;
    centre = Math.max(centre, 1 - edge / EDGE);
    if (point !== feet) upper = true;
  }
  if (!upper) return null;
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
  return 0.5 * (seen / 3) + 0.5 * centre;
}

/** Ahead of the visitor: in frame for the shot they're on (a touch of slack), well in frame to cut to a new one. */
const AHEAD_EDGE_HOLD = 1.05;
const AHEAD_EDGE_CUT = 0.85;

/** Whether a point is in front of the camera and inside its frame (to `edge`, 1 = the frame's border). */
export function inFrame(camera: THREE.PerspectiveCamera, point: THREE.Vector3, edge = EDGE): boolean {
  camera.updateMatrixWorld();
  projected.copy(point).project(camera);
  if (projected.z < -1 || projected.z > 1) return false;
  return Math.max(Math.abs(projected.x), Math.abs(projected.y)) <= edge;
}

const belongsTo = (key: string, room: string | null) => Boolean(room) && (key === room || key.startsWith(`${room}-`));

/**
 * The camera to cut to, or null for the follow camera.
 *
 * In a room with its own camera, that camera has the shot whenever it sees
 * any of the visitor (the current one holds if it's one of them). If none of
 * the room's cameras can see them (right under the lens, behind it), the
 * follow camera takes over: a camera across the house showing a speck in a
 * doorway is no help for walking. Hallways and rooms without a camera use
 * whichever camera sees them, holding the current one while it does.
 */
export function pickShot(
  shots: readonly ShotCamera[],
  currentKey: string | null,
  head: THREE.Vector3,
  feet: THREE.Vector3,
  map: HouseMap,
  room: string | null,
  /** Just cut: keep the current shot while it can still see them (no flicker on a doorway seam). */
  hold = false,
  /** Walking: a point just ahead of them, which the shot must see as well. */
  ahead: THREE.Vector3 | null = null,
): string | null {
  const roomHasCamera = shots.some((shot) => belongsTo(shot.key, room));
  let currentSees = false;
  let bestInRoom: { key: string; score: number } | null = null;
  let best: { key: string; score: number } | null = null;
  for (const shot of shots) {
    const score = shotScore(shot, head, feet, map);
    if (score === null) continue;
    if (ahead && !inFrame(shot.camera, ahead, shot.key === currentKey ? AHEAD_EDGE_HOLD : AHEAD_EDGE_CUT)) continue;
    if (shot.key === currentKey) currentSees = true;
    if (belongsTo(shot.key, room) && (!bestInRoom || score > bestInRoom.score)) bestInRoom = { key: shot.key, score };
    if (!best || score > best.score) best = { key: shot.key, score };
  }
  if (hold && currentSees && currentKey) return currentKey;
  if (roomHasCamera) {
    if (currentSees && currentKey && belongsTo(currentKey, room)) return currentKey;
    return bestInRoom?.key ?? null;
  }
  if (currentSees) return currentKey;
  return best?.key ?? null;
}
