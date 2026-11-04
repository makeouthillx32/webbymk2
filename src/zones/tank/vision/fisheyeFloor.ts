// src/zones/tank/vision/fisheyeFloor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Where a person standing in a real camera's frame is standing in the house.
//
// calibration.ts waits for someone to measure four floor points per camera,
// and nobody has. But every room has since been FITTED: scripts/tank-room-fit.py
// solves each real camera's fisheye lens (equidistant r = f(t + k t^3)) and its
// pose in the Blender house from the carpet edges and door jambs in the live
// frame (vault: Tank/room-geometry-fix-method). That is a full camera model,
// better than a homography for a fisheye, and it lands in the house's own
// coordinates, so every room shares ONE floor frame for free.
//
// This is a port of the script's floor maths (pix_to_cam, rot_xyz, and the
// ray/floor intersection), checked against its output in fisheyeFloor.test.ts.
//
// Conventions:
//   image = normalised 0..1, origin top-left (what the detector emits). The
//           solve works in a 1920x1080 frame; sub-streams are squeezed 16:9,
//           so normalised coordinates map onto it unchanged.
//   house = Blender world metres, Z up (x, y on the floor). three.js / glTF
//           is Y up: three (x, y, z) = house (x, z, -y). See toThreeFloor().
// ─────────────────────────────────────────────────────────────────────────────

export const FIT_WIDTH = 1920;
export const FIT_HEIGHT = 1080;

export type RoomCameraFit = {
  room: string;
  /** Camera position in the house, metres (Blender, Z up). */
  location: readonly [number, number, number];
  /** Blender XYZ euler, degrees. */
  rotationDeg: readonly [number, number, number];
  /** Equidistant fisheye focal length (px, at 1920x1080) and cubic term. */
  fPx: number;
  k: number;
};

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const triple = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every(finite) ? [v[0], v[1], v[2]] : null;

/** One fit from scripts/tank-room-fit.py's <room>.result.json, or null if malformed. */
export function parseRoomCameraFit(raw: unknown): RoomCameraFit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const location = triple(r.location);
  const rotationDeg = triple(r.rotation_deg);
  const fisheye = r.fisheye as { f_px?: unknown; k?: unknown } | undefined;
  if (typeof r.room !== "string" || !location || !rotationDeg || !finite(fisheye?.f_px) || !finite(fisheye?.k)) return null;
  if (fisheye.f_px <= 0 || location[2] <= 0) return null;
  return { room: r.room, location, rotationDeg, fPx: fisheye.f_px, k: fisheye.k };
}

/** camera-fits.json ({ rooms: { <room>: result } }) -> fits by room key. */
export function parseCameraFits(raw: unknown): Record<string, RoomCameraFit> {
  const out: Record<string, RoomCameraFit> = {};
  const rooms = raw && typeof raw === "object" ? (raw as { rooms?: unknown }).rooms : null;
  if (!rooms || typeof rooms !== "object") return out;
  for (const [key, value] of Object.entries(rooms as Record<string, unknown>)) {
    const fit = parseRoomCameraFit(value);
    if (fit && fit.room === key) out[key] = fit;
  }
  return out;
}

/** Blender XYZ euler -> rotation matrix whose columns are the camera axes in the world. */
function rotXYZ(rx: number, ry: number, rz: number): Mat3 {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  // Rz @ Ry @ Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const mulT = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

const rotations = new WeakMap<RoomCameraFit, Mat3>();
function rotationOf(fit: RoomCameraFit): Mat3 {
  let r = rotations.get(fit);
  if (!r) {
    const [rx, ry, rz] = fit.rotationDeg.map((d) => (d * Math.PI) / 180);
    r = rotXYZ(rx, ry, rz);
    rotations.set(fit, r);
  }
  return r;
}

/** Fit-frame pixel -> unit ray in camera space (x right, y up, looking -Z). */
function pixelToCameraRay(u: number, v: number, f: number, k: number): Vec3 {
  const dx = u - FIT_WIDTH / 2;
  const dy = FIT_HEIGHT / 2 - v;
  const r = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  let th = r / f;
  for (let i = 0; i < 12; i++) th -= (th + k * th ** 3 - r / f) / (1 + 3 * k * th ** 2);
  const s = Math.sin(th);
  return [s * Math.cos(phi), s * Math.sin(phi), -Math.cos(th)];
}

/** Rays that meet the floor further than this from the camera are horizon noise. */
export const MAX_FLOOR_DISTANCE_M = 15;

/**
 * Where an image point (normalised) meets the floor, in house metres, or null
 * when its ray never comes down to the floor (at or above the horizon) or does
 * so absurdly far away. Feed it the ground-contact point, never the head.
 */
export function imageToFloor(fit: RoomCameraFit, p: { x: number; y: number }): { x: number; y: number } | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const ray = mul(rotationOf(fit), pixelToCameraRay(p.x * FIT_WIDTH, p.y * FIT_HEIGHT, fit.fPx, fit.k));
  if (ray[2] >= -1e-6) return null;
  const t = -fit.location[2] / ray[2];
  const x = fit.location[0] + t * ray[0];
  const y = fit.location[1] + t * ray[1];
  if (Math.hypot(x - fit.location[0], y - fit.location[1]) > MAX_FLOOR_DISTANCE_M) return null;
  return { x, y };
}

/** The inverse: where a floor point shows up in the frame (normalised), or null if behind the lens. */
export function floorToImage(fit: RoomCameraFit, floor: { x: number; y: number }): { x: number; y: number } | null {
  const d = mulT(rotationOf(fit), [floor.x - fit.location[0], floor.y - fit.location[1], -fit.location[2]]);
  const n = Math.hypot(d[0], d[1], d[2]);
  const th = Math.acos(Math.max(-1, Math.min(1, -d[2] / n)));
  const phi = Math.atan2(d[1], d[0]);
  const r = fit.fPx * (th + fit.k * th ** 3);
  return { x: (FIT_WIDTH / 2 + r * Math.cos(phi)) / FIT_WIDTH, y: (FIT_HEIGHT / 2 - r * Math.sin(phi)) / FIT_HEIGHT };
}

/** House floor (Blender x, y) -> three.js ground plane (x, z). */
export function toThreeFloor(p: { x: number; y: number }): { x: number; z: number } {
  return { x: p.x, z: -p.y };
}
