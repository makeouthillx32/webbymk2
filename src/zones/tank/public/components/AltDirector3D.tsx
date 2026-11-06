"use client";

// The alt director: while every room is off air, the Director's frame turns
// into the house itself — walk it with WASD / arrows (or the stick on a
// phone), and the shot cuts between the real room cameras as you move, the
// way the Director cuts between live rooms. Hallways no camera covers fall
// back to a follow camera with the upper walls dropped (dollhouse view).
//
// Loaded only through next/dynamic (no SSR) and only while the whole house is
// dark, so three.js never ships to a viewer watching a live feed.

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { roomSceneDecoderPath } from "../roomScenes";
import { objectName, prepareScene } from "./sceneMaterials";
import {
  floorAt,
  moveWithCollision,
  nearestHotspot,
  nearestSeat,
  seatLift as seatLiftFor,
  parseHouseMap,
  type HouseHotspot,
  type HouseSeat,
  type HouseMap,
} from "../altDirector/houseMap";
import { pickShot, type ShotCamera } from "../altDirector/cameraCuts";
import {
  CLIP_WALK_SPEED,
  DEFAULT_AVATAR,
  availableAvatars,
  faceAvatar,
  findAvatarRig,
  poseAvatarView,
  prepareAvatar,
  restoreAvatar,
} from "../altDirector/avatars";
import { loadHouseCastOnce } from "../altDirector/houseCastStore";
import { CastMirror } from "../altDirector/castMirror";
import { HouseFx } from "../pixel/houseFx";
import PixelRenderer from "./PixelRenderer";
import { mergeStaticMeshes } from "../altDirector/mergeStatic";
import {
  DEFAULT_STATIONS,
  STATION_NODES,
  barSpots,
  tableFov,
  tableSeats,
  tableView,
  tvFov,
  tvView,
  withStations,
  type HouseStations,
} from "../altDirector/houseStations";
import { PLAY_SECONDS, TABLE_CANVAS, TableQueue, describeTableGame, drawTableGame, type TableGame } from "../altDirector/tableGames";
import { TavernBar, barCast, type BarCast } from "../altDirector/tavernBar";
import { BASIS_GRACE_S, holdBasis, type Basis } from "../altDirector/walkBasis";
import { TV_CANVAS, TvFeed, drawTv } from "../altDirector/houseTv";
import { CRISP_LAYER } from "../pixel/pixelPass";
import { loadNpcPool, type TankNpcPool } from "../../tavern/npcs";
import type { TavernSnapshot } from "../../tavernTypes";
import type { ChatMessage } from "../../contracts";

type CameraMode = "director" | "follow";
type Input = { keys: Set<string>; stick: { x: number; y: number } };
type Hud = { place: string; shot: string; hotspot: HouseHotspot | null };
/** Shared between the HUD and the frame loop: watching the TV, and a pending sit/stand. */
type Effects = { tv: boolean; seat: string | null };
/**
 * How close a mirrored body's foot point must be to a seat to sit on it. A
 * seated person's box ends at their feet, just in front of the seat; a pet's
 * ends on the cushion, which the floor projection throws further from the
 * camera, so pets get more room.
 */
const CAST_SEAT_REACH = 0.75;
const CAST_PET_SEAT_REACH = 1.1;
/** Director cuts: a fresh shot holds at least this long while it can still see the walker. */
const SHOT_MIN_HOLD_S = 1.2;
/** Skates: how fast speed builds (per s), and how slowly it bleeds off when you let go. */
const GLIDE_ACCEL = 3;
const GLIDE_COAST = 1.3;
/** A seat in reach wins over a hotspot unless the hotspot is this much closer. */
const SEAT_PREFERENCE_M = 0.3;
import type { AltDirectorHud } from "../altDirector/hud";
export type { AltDirectorHud };

const WANDER_HINT = "The house is empty. Have a wander: click to walk around · WASD or arrows · E to look · C for camera";

const STAND_PROMPT: HouseHotspot = {
  id: "stand",
  label: "Stand up",
  blurb: "",
  effect: null,
  at: [0, 0, 0],
  r: 0,
  node: null,
  fx: null,
  room: null,
  seat: "stand",
};

const WALK_SPEED = 1.5; // m/s
const RUN_SPEED = 2.8;
const FOLLOW_DISTANCE = 3.1;
const FOLLOW_HEIGHT = 3.4;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
const INTERACT_KEYS = new Set(["KeyE", "Enter", "Space"]);
const WATCH_CUT_SECONDS = 8;

type AltDirector3DProps = {
  /** The house shell (house.glb). */
  url: string;
  /** The cast (cast.glb); null for an older single-file house. */
  castUrl?: string | null;
  /**
   * Signed-in viewers walk the house; everyone else watches it — the
   * Director cutting between the room cameras on its own.
   */
  canWalk: boolean;
  /** A preset from altDirector/avatars.ts; anything unknown falls back to Joe. */
  avatarId?: string;
  /**
   * The server director's game cam (a room key). Watchers see exactly this
   * shot, cut for everyone at once; a walker sees it until they start moving.
   * null/unknown falls back to the local tour.
   */
  programmeShot?: string | null;
  onSignIn?: () => void;
  reducedMotion?: boolean;
  onFailed?: () => void;
  className?: string;
  onHudChange?: (hud: AltDirectorHud) => void;
  cameraMode?: CameraMode;
  onCameraModeChange?: (mode: CameraMode) => void;
  hideOverlayHud?: boolean;
  /** Who they walk as, when the page owns the choice (the profile's "Walk as"). */
  avatarChoice?: string;
  /** The floating "Walk as" picker on the canvas; off when the profile hosts it. */
  avatarPicker?: boolean;
  /** The chat in view: its mini-game results replay on the living room's game table. */
  chatMessages?: readonly ChatMessage[];
  /** E at the kitchen bar: open the Tavern (the bartender game). */
  onOpenTavern?: () => void;
  /** Send a chat command for the walker ("/roll"): the house's buttons play through chat like typing. */
  onCommand?: (text: string) => void;
};

/** What the game table's buttons (and keys 1 to 5) play, through chat. */
const TABLE_PLAYS = [
  { key: "Digit1", label: "Roll", emoji: "🎲", command: "/roll 20" },
  { key: "Digit2", label: "Flip", emoji: "🪙", command: "/flip heads 10" },
  { key: "Digit3", label: "Slots", emoji: "🎰", command: "/slots 20" },
  { key: "Digit4", label: "Roulette", emoji: "🔫", command: "/roulette" },
  { key: "Digit5", label: "Unbox", emoji: "📦", command: "/unbox" },
] as const;

/** How often the bar re-reads who is serving and who is waiting. */
const TAVERN_POLL_MS = 10_000;
/** The table cam redraws its felt at this rate while a game plays (pixel-art pacing). */
const TABLE_FPS = 15;
/** Watchers stay on the table this long after a game lands, before the director takes back over. */
const TABLE_LINGER_S = 1.2;

/**
 * Where the game stations sit, measured from the furniture before the scene's
 * static meshes are merged away. Kept on the scene, since the cached glTF is
 * merged only once and a remount can't measure it again.
 */
function measureStations(root: THREE.Object3D): HouseStations {
  const kept = root.userData.tankStations as HouseStations | undefined;
  if (kept) return kept;
  root.updateMatrixWorld(true);
  const found: Partial<HouseStations> = {};
  const box = new THREE.Box3();
  root.traverse((o) => {
    const name = String(o.userData?.name ?? o.name ?? "").replace(/_/g, " ");
    for (const key of Object.keys(STATION_NODES) as (keyof HouseStations)[]) {
      if (found[key] || !STATION_NODES[key].test(name) || !(o as THREE.Mesh).isMesh) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      found[key] = { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
    }
  });
  const stations = { ...DEFAULT_STATIONS, ...found };
  root.userData.tankStations = stations;
  return stations;
}

const held = (keys: Set<string>, ...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);

function shotLabel(camera: THREE.Object3D): string {
  const raw = String(camera.userData?.name ?? camera.parent?.userData?.name ?? camera.name ?? "");
  const room = raw.replace(/^TANK\s*[—–-]\s*/u, "").replace(/^The\s+/i, "").trim();
  return room ? `${room} cam` : "Room cam";
}

function findShots(gltf: { cameras: THREE.Camera[] }): ShotCamera[] {
  const shots: ShotCamera[] = [];
  for (const camera of gltf.cameras) {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) continue;
    const key = perspective.userData?.tank_room_key ?? perspective.parent?.userData?.tank_room_key;
    if (typeof key !== "string" || !key) continue;
    shots.push({ key, label: shotLabel(perspective), camera: perspective });
  }
  return shots;
}

function readMap(root: THREE.Object3D): HouseMap | null {
  let raw: unknown = null;
  root.traverse((object) => {
    if (raw === null && object.userData?.tank_house_map) raw = object.userData.tank_house_map;
  });
  return parseHouseMap(raw);
}

const angleLerp = (from: number, to: number, t: number) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.min(1, t);
};

// A ring at the visitor's feet so they stay findable from a high corner
// camera. The body is the cast sprite (avatars.ts); the capsule is only a
// stand-in for a house file that has no sprite rigs in it.
function Visitor({ groupRef, sprite }: { groupRef: React.RefObject<THREE.Group | null>; sprite: boolean }) {
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[0.24, 0.3, 32]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group name="visitor-body" visible={!sprite}>
        <mesh position={[0, 0.72, 0]}>
          <capsuleGeometry args={[0.17, 0.78, 6, 12]} />
          <meshBasicMaterial color="#f97316" />
        </mesh>
        <mesh position={[0, 1.38, 0]}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshBasicMaterial color="#fde7d1" />
        </mesh>
        <mesh position={[0, 1.4, 0.12]}>
          <boxGeometry args={[0.2, 0.06, 0.06]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
      </group>
    </group>
  );
}

function HouseWorld({
  url,
  castUrl,
  walker,
  avatarId,
  programme,
  input,
  mode,
  effects,
  interact,
  turn,
  animate,
  onHud,
  onReady,
  onBroken,
  onAvatars,
  tableQueue,
  onTableResult,
  tavern,
  tvFeed,
}: {
  url: string;
  castUrl: string | null;
  walker: boolean;
  avatarId: string;
  programme: React.MutableRefObject<string | null>;
  input: React.MutableRefObject<Input>;
  turn: React.MutableRefObject<number>;
  mode: CameraMode;
  effects: React.MutableRefObject<Effects>;
  interact: React.MutableRefObject<HouseHotspot | null>;
  animate: boolean;
  onHud: (hud: Hud) => void;
  onReady: () => void;
  onBroken: () => void;
  /** The avatars this cast actually has, for the picker. */
  onAvatars: (list: { id: string; label: string }[]) => void;
  tableQueue: TableQueue;
  /** A table game has landed: its result, for the HUD line. */
  onTableResult: (game: TableGame) => void;
  tavern: { cast: BarCast; pool: TankNpcPool | null };
  tvFeed: TvFeed;
}) {
  const gltf = useGLTF(url, roomSceneDecoderPath());
  // The cast (rigs, sprites, clips) ships as its own file so animating them
  // never re-ships the house. An older single-file house has the cast inside:
  // then this is the same cached load and nothing is added twice.
  const castGltf = useGLTF(castUrl ?? url, roomSceneDecoderPath());
  const separateCast = castGltf !== gltf;
  const { set, get, size } = useThree();
  const stations = useMemo(() => {
    const measured = measureStations(gltf.scene);
    prepareScene(gltf.scene);
    mergeStaticMeshes(
      gltf.scene,
      (mesh) => /^PX_TV_Screen/.test(objectName(mesh)),
      gltf.animations,
    );
    return measured;
  }, [gltf]);
  useMemo(() => prepareScene(castGltf.scene, { shell: false }), [castGltf.scene]);
  // The walk map, plus the game stations' hotspots (the bar, the game table).
  const map = useMemo(() => {
    const read = readMap(gltf.scene);
    return read ? withStations(read, stations) : null;
  }, [gltf.scene, stations]);
  const atTable = useMemo(() => (map ? tableSeats(map.seats, stations) : new Set<string>()), [map, stations]);
  // The game table: a felt mat on the coffee table, and a camera straight above it.
  const table = useMemo(() => {
    const view = tableView(stations);
    const canvas = document.createElement("canvas");
    canvas.width = TABLE_CANVAS.width;
    canvas.height = TABLE_CANVAS.height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(view.mat.width, view.mat.depth),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 }),
    );
    mat.name = "Game table mat";
    // Flat on the table, its top edge away from the couch (the table cam's up).
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(...view.mat.at);
    mat.layers.enable(CRISP_LAYER);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 20);
    camera.up.set(0, 0, -1);
    camera.position.set(...view.eye);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
    return { view, canvas, ctx: canvas.getContext("2d"), texture, mat, camera, drawn: "" };
  }, [stations]);
  useEffect(
    () => () => {
      table.texture.dispose();
      table.mat.geometry.dispose();
      (table.mat.material as THREE.Material).dispose();
    },
    [table],
  );
  // Tank TV: the chat's commands, on the living room TV, and a camera square on to it.
  const tv = useMemo(() => {
    const view = tvView(stations);
    const canvas = document.createElement("canvas");
    canvas.width = TV_CANVAS.width;
    canvas.height = TV_CANVAS.height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const picture = new THREE.Mesh(
      new THREE.PlaneGeometry(view.screen.width, view.screen.height),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    picture.name = "Tank TV picture";
    picture.rotation.y = view.screen.yaw;
    picture.position.set(...view.screen.at);
    picture.layers.enable(CRISP_LAYER);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
    camera.position.set(...view.eye);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
    return { view, ctx: canvas.getContext("2d"), texture, picture, camera, drawn: "" };
  }, [stations]);
  useEffect(
    () => () => {
      tv.texture.dispose();
      tv.picture.geometry.dispose();
      (tv.picture.material as THREE.Material).dispose();
    },
    [tv],
  );
  const bar = useMemo(() => new TavernBar(barSpots(stations)), [stations]);
  useEffect(() => () => bar.dispose(), [bar]);
  useEffect(() => {
    bar.set(tavern.cast, tavern.pool);
  }, [bar, tavern]);
  const shots = useMemo(() => findShots(gltf), [gltf]);
  const upperWalls = useMemo(() => {
    const list: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      if (o.userData?.tank_layer === "upper") list.push(o);
    });
    return list;
  }, [gltf.scene]);
  const follow = useMemo(() => new THREE.PerspectiveCamera(55, 1, 0.05, 80), []);
  const visitor = useRef<THREE.Group>(null);
  const { mixer } = useAnimations(castGltf.animations, castGltf.scene);
  // The visitor's body: a cast member's own rig, lifted out of the cast.
  const avatar = useMemo(() => {
    if (!walker) return null;
    const found = findAvatarRig(castGltf.scene, avatarId);
    return found ? prepareAvatar(found, castGltf.animations) : null;
  }, [walker, avatarId, castGltf.scene, castGltf.animations]);
  const avatarAction = useRef<THREE.AnimationAction | null>(null);
  const idleAction = useRef<THREE.AnimationAction | null>(null);
  const sitAction = useRef<THREE.AnimationAction | null>(null);
  /** 0 standing (Idle) … 1 walking (Walk), eased so the two blend. */
  const walkBlend = useRef(0);
  /** 0 on their feet … 1 seated, eased the same way. */
  const sitBlend = useRef(0);
  // The rest of the cast mirrors the real house (altDirector/castMirror.ts):
  // no skit, and a member no camera can see is not rendered. The visitor's
  // own body is theirs to move.
  const mirror = useMemo(
    () =>
      new CastMirror(castGltf.scene, castGltf.animations, {
        skip: avatar?.rig ?? null,
        // The real people (and pets) sit where the house has seats.
        seatFor: (x, z, room, kind, taken) =>
          nearestSeat(map, x, z, { reach: kind === "human" ? CAST_SEAT_REACH : CAST_PET_SEAT_REACH, room, skip: taken }),
      }),
    [castGltf.scene, castGltf.animations, avatar, map],
  );
  useEffect(() => () => mirror.dispose(), [mirror]);
  const houseFx = useMemo(() => new HouseFx(), []);
  useEffect(() => () => houseFx.dispose(), [houseFx]);
  const scratch = useMemo(
    () => ({
      head: new THREE.Vector3(),
      feet: new THREE.Vector3(),
      look: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      want: new THREE.Vector3(),
      eye: new THREE.Vector3(),
    }),
    [],
  );
  const state = useRef({
    x: map?.spawn[0] ?? 0,
    z: map?.spawn[1] ?? 0,
    yaw: map?.spawn[2] ?? 0,
    followYaw: map?.spawn[2] ?? 0,
    shot: null as string | null,
    basis: null as Basis | null,
    /** The input direction the walk direction is held for (see walkBasis.ts). */
    basisInput: null as [number, number] | null,
    /** Until when the walk direction stays as it was (a pause at a doorway mustn't flip it). */
    basisUntil: 0,
    /** When the camera last cut (shots hold a moment so a doorway seam can't flicker them). */
    shotAt: 0,
    upperShown: null as boolean | null,
    hudKey: "",
    walkTime: 0,
    /** Velocity (m/s): instant on foot, eased on skates. */
    vx: 0,
    vz: 0,
    /** The seat they're on, and where they stood before sitting down. */
    seat: null as HouseSeat | null,
    standX: 0,
    standZ: 0,
    placed: false,
    watchIndex: -1,
    nextCutAt: 0,
    /** Watchers: the table cam holds until then. */
    tableUntil: 0,
    /** Watchers: the TV cam holds until then. */
    tvUntil: 0,
    /** The table game whose result has been announced. */
    announced: "",
  });

  useEffect(() => {
    if (!map) onBroken();
  }, [map, onBroken]);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    for (const shot of shots) {
      shot.camera.aspect = aspect;
      shot.camera.updateProjectionMatrix();
    }
    follow.aspect = aspect;
    follow.updateProjectionMatrix();
    table.camera.aspect = aspect;
    table.camera.fov = tableFov(table.view, aspect);
    table.camera.updateProjectionMatrix();
    tv.camera.aspect = aspect;
    tv.camera.fov = tvFov(tv.view, aspect);
    tv.camera.updateProjectionMatrix();
  }, [shots, follow, table, tv, size.width, size.height]);

  useEffect(() => {
    loadHouseCastOnce();
  }, []);

  useEffect(() => {
    if (!avatar) return;
    // A rig with Walk + Idle clips plays both and blends between them; an
    // older rig plays its rehearsal poses, minus its blocking, only while walking.
    const action = avatar.clip ? mixer.clipAction(avatar.clip) : null;
    const idle = avatar.idle ? mixer.clipAction(avatar.idle) : null;
    const sit = avatar.sit && idle ? mixer.clipAction(avatar.sit) : null;
    if (sit) {
      sit.play();
      sit.setEffectiveWeight(0);
    }
    if (action) {
      action.play();
      action.paused = !idle;
      if (idle) action.setEffectiveWeight(0);
    }
    if (idle) {
      idle.play();
      idle.setEffectiveWeight(1);
    }
    walkBlend.current = 0;
    sitBlend.current = 0;
    avatarAction.current = action;
    idleAction.current = idle;
    sitAction.current = sit;
    return () => {
      action?.stop();
      idle?.stop();
      sit?.stop();
      if (avatar.clip) mixer.uncacheAction(avatar.clip);
      if (avatar.idle) mixer.uncacheAction(avatar.idle);
      if (avatar.sit) mixer.uncacheAction(avatar.sit);
      avatarAction.current = null;
      idleAction.current = null;
      sitAction.current = null;
      restoreAvatar(avatar);
    };
  }, [avatar, mixer]);

  // Swapping avatars (or first stepping in): a poof covers the change.
  const lastAvatar = useRef<string | null>(null);
  useEffect(() => {
    const id = avatar?.id ?? null;
    if (id && lastAvatar.current && lastAvatar.current !== id && animate) {
      houseFx.poof(state.current.x, state.current.z);
    }
    lastAvatar.current = id;
  }, [avatar, animate, houseFx]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useEffect(() => {
    onAvatars(availableAvatars(castGltf.scene));
  }, [castGltf.scene, onAvatars]);

  useFrame(({ clock }, rawDelta) => {
    if (!map) return;
    const dt = Math.min(rawDelta, 0.05);
    const s = state.current;
    const { keys, stick } = input.current;
    if (turn.current) {
      s.followYaw -= turn.current;
      turn.current = 0;
    }

    // Screen-relative input: forward = away from the camera. Watchers have none.
    let forward = walker ? held(keys, "KeyW", "ArrowUp") - held(keys, "KeyS", "ArrowDown") - stick.y : 0;
    let right = walker ? held(keys, "KeyD", "ArrowRight") - held(keys, "KeyA", "ArrowLeft") + stick.x : 0;
    const amount = Math.hypot(forward, right);
    if (amount > 1) {
      forward /= amount;
      right /= amount;
    }
    const moving = amount > 0.08;

    // The basis is the camera's facing on the ground. On a fixed camera it is
    // held while the visitor keeps pushing the same way (and through a short
    // pause): a cut mid-stride must not flip which way "up" walks. Steering
    // somewhere new re-reads the camera, so left is left on the screen in
    // front of them (see walkBasis.ts).
    const active = s.shot ? shots.find((shot) => shot.key === s.shot)?.camera ?? follow : follow;
    if (!s.shot) {
      s.basis = { fx: Math.sin(s.followYaw), fz: Math.cos(s.followYaw) };
      s.basisInput = null;
      if (moving) s.basisUntil = clock.elapsedTime + BASIS_GRACE_S;
    } else {
      active.getWorldDirection(scratch.dir);
      const length = Math.hypot(scratch.dir.x, scratch.dir.z) || 1;
      const hold = holdBasis(
        { basis: s.basis, input: s.basisInput, until: s.basisUntil },
        { fx: scratch.dir.x / length, fz: scratch.dir.z / length },
        forward,
        right,
        moving,
        clock.elapsedTime,
      );
      s.basis = hold.basis;
      s.basisInput = hold.input;
      s.basisUntil = hold.until;
    }
    const { fx, fz } = s.basis ?? { fx: 0, fz: 1 };
    const wx = fx * forward - fz * right;
    const wz = fz * forward + fx * right;
    const speed = held(keys, "ShiftLeft", "ShiftRight") || amount > 1.25 ? RUN_SPEED : WALK_SPEED;

    // Sitting: E by a seat sits down facing out; E again, or walking off, stands
    // them back up where they were.
    const request = effects.current.seat;
    effects.current.seat = null;
    if (s.seat && (request === "stand" || moving || !walker)) {
      s.x = s.standX;
      s.z = s.standZ;
      s.seat = null;
    } else if (request && request !== "stand" && walker && !s.seat) {
      const seat = map.seats.find((candidate) => candidate.id === request);
      if (seat) {
        s.standX = s.x;
        s.standZ = s.z;
        s.seat = seat;
        s.x = seat.at[0];
        s.z = seat.at[2];
        s.yaw = seat.yaw;
        s.vx = 0;
        s.vz = 0;
      }
    }

    // On skates speed builds and bleeds off; on foot it is instant.
    const glide = avatar?.gait === "glide";
    const targetX = moving ? wx * speed : 0;
    const targetZ = moving ? wz * speed : 0;
    if (glide) {
      const rate = Math.min(1, dt * (moving ? GLIDE_ACCEL : GLIDE_COAST));
      s.vx += (targetX - s.vx) * rate;
      s.vz += (targetZ - s.vz) * rate;
    } else {
      s.vx = targetX;
      s.vz = targetZ;
    }
    const pace = Math.hypot(s.vx, s.vz);
    const stepping = !s.seat && (moving || (glide && pace > 0.2));
    if (!s.seat && pace > 0.01) {
      const [nx, nz] = moveWithCollision(map, s.x, s.z, s.vx * dt, s.vz * dt);
      // A wall stops a coasting skater dead.
      if (glide && !moving && Math.hypot(nx - s.x, nz - s.z) < pace * dt * 0.5) {
        s.vx = 0;
        s.vz = 0;
      }
      s.x = nx;
      s.z = nz;
    }
    if (stepping) {
      if (moving) s.yaw = angleLerp(s.yaw, Math.atan2(wx, wz), dt * 12);
      s.walkTime += dt;
    }
    // A rig with real Walk/Idle clips bobs inside its clip; flat cards get a code bob.
    const bob = stepping && animate && !avatar?.animated ? Math.abs(Math.sin(s.walkTime * 9)) * 0.05 : 0;
    // Seated: a paper-doll's Sit clip puts its hip at SIT_HIP_M, so a taller seat
    // lifts it; a flat card sinks into the seat and the cushion hides its legs.
    let seatLift = 0;
    if (s.seat && avatar) {
      seatLift = seatLiftFor(s.seat.at[1], sitAction.current ? "sit-clip" : "flat");
    }
    if (visitor.current) {
      visitor.current.visible = walker;
      visitor.current.position.set(s.x, 0, s.z);
      visitor.current.rotation.y = s.yaw;
      const body = visitor.current.getObjectByName("visitor-body");
      if (body) body.position.y = bob;
    }
    if (avatar) {
      // A walk-only avatar waits hidden in the cast until it is worn.
      avatar.rig.visible = true;
      avatar.rig.position.set(s.x, avatar.baseY + bob + seatLift, s.z);
    }
    if (idleAction.current && avatarAction.current) {
      const walk = avatarAction.current;
      const idle = idleAction.current;
      const sit = sitAction.current;
      walk.paused = idle.paused = !animate;
      if (sit) sit.paused = !animate;
      walkBlend.current += ((stepping ? 1 : 0) - walkBlend.current) * Math.min(1, dt * 10);
      sitBlend.current += ((s.seat && sit ? 1 : 0) - sitBlend.current) * Math.min(1, dt * 12);
      const up = 1 - sitBlend.current;
      walk.setEffectiveWeight(walkBlend.current * up);
      idle.setEffectiveWeight((1 - walkBlend.current) * up);
      sit?.setEffectiveWeight(sitBlend.current);
      // Skates roll at whatever speed they carry; feet keep step with the walk.
      walk.timeScale = stepping ? (glide ? pace : speed) / CLIP_WALK_SPEED : 1;
    } else if (avatarAction.current) {
      avatarAction.current.paused = !(stepping && animate);
    }

    // Pick the shot. The server director's game cam when it has one, so every
    // watcher sees the same cut at the same moment; otherwise the local tour,
    // a cut to the next room camera every few seconds.
    const floor = walker ? floorAt(map, s.x, s.z) : null;
    const directed = programme.current && shots.some((shot) => shot.key === programme.current) ? programme.current : null;
    if (!walker) {
      if (directed) {
        s.shot = directed;
      } else {
        if (shots.length && (s.watchIndex < 0 || clock.elapsedTime >= s.nextCutAt)) {
          s.watchIndex = (s.watchIndex + 1) % shots.length;
          s.nextCutAt = clock.elapsedTime + WATCH_CUT_SECONDS;
        }
        s.shot = shots[s.watchIndex]?.key ?? null;
      }
    } else if (mode === "director") {
      if (directed && s.walkTime === 0) {
        // Not walking yet: watch the director's game cam like everyone else.
        s.shot = directed;
      } else {
        scratch.head.set(s.x, 1.35, s.z);
        scratch.feet.set(s.x, 0.1, s.z);
        const next = pickShot(shots, s.shot, scratch.head, scratch.feet, map, floor?.room ?? null, clock.elapsedTime - s.shotAt < SHOT_MIN_HOLD_S);
        if (next !== s.shot) s.shotAt = clock.elapsedTime;
        s.shot = next;
      }
    } else {
      s.shot = null;
    }

    // Follow camera trails behind and above, eased so it doesn't jitter.
    scratch.want.set(s.x - Math.sin(s.followYaw) * FOLLOW_DISTANCE, FOLLOW_HEIGHT, s.z - Math.cos(s.followYaw) * FOLLOW_DISTANCE);
    if (!s.placed) {
      follow.position.copy(scratch.want);
      s.placed = true;
    } else {
      follow.position.lerp(scratch.want, Math.min(1, dt * 6));
    }
    scratch.look.set(s.x, 0.8, s.z);
    follow.lookAt(scratch.look);

    // The game table. Its felt redraws while a game plays; sitting at the
    // table (or, for watchers, any game being played) puts the shot on it.
    const playing = tableQueue.tick(clock.elapsedTime);
    const drawKey = playing ? `${playing.game.id}:${Math.floor(playing.t * (animate ? TABLE_FPS : 1))}` : "idle";
    if (drawKey !== table.drawn && table.ctx) {
      // Reduced motion: no tumble, straight to the result.
      drawTableGame(table.ctx, playing?.game ?? null, playing ? (animate ? playing.t : PLAY_SECONDS[playing.game.kind]) : 0);
      table.texture.needsUpdate = true;
      table.drawn = drawKey;
    }
    if (playing && playing.t >= PLAY_SECONDS[playing.game.kind] && s.announced !== playing.game.id) {
      s.announced = playing.game.id;
      onTableResult(playing.game);
    }
    if (playing) s.tableUntil = clock.elapsedTime + TABLE_LINGER_S;
    const onTable = walker ? Boolean(s.seat && atTable.has(s.seat.id)) : clock.elapsedTime < s.tableUntil;

    // Tank TV, the same way: its picture follows the chat; a walker watches it
    // with E (walking off stops), and watchers cut to it while a card is up.
    const nowMs = Date.now();
    const showing = tvFeed.tick(clock.elapsedTime);
    const tvKey = showing ? `${showing.card.id}:${Math.floor(showing.t * (animate ? TABLE_FPS : 1))}` : `idle:${Math.floor(nowMs / (animate ? 250 : 1000))}`;
    if (tvKey !== tv.drawn && tv.ctx) {
      drawTv(tv.ctx, showing?.card ?? null, showing ? (animate ? showing.t : 99) : 0, tvFeed.live(nowMs), nowMs);
      tv.texture.needsUpdate = true;
      tv.drawn = tvKey;
    }
    if (walker && moving) effects.current.tv = false;
    if (showing) s.tvUntil = clock.elapsedTime + TABLE_LINGER_S;
    const onTv = !onTable && (walker ? effects.current.tv : clock.elapsedTime < s.tvUntil);

    const camera = onTable ? table.camera : onTv ? tv.camera : s.shot ? shots.find((shot) => shot.key === s.shot)?.camera ?? follow : follow;
    if (get().camera !== camera) set({ camera });

    // Paper-sprite rule: the cast are flat cards, so the visitor's card always
    // turns to whichever camera has the shot.
    camera.getWorldPosition(scratch.eye);
    if (avatar) {
      const toCamera = Math.atan2(scratch.eye.x - s.x, scratch.eye.z - s.z);
      faceAvatar(avatar, toCamera);
      // Directional avatars: the front, side or back card, by where they walk.
      poseAvatarView(avatar, s.yaw, toCamera, stepping, s.walkTime, animate);
    }

    // The mirrored cast: where the real people are, facing the shot.
    mirror.update(dt, scratch.eye, animate);
    bar.update(dt, animate);
    // The visitor counts as a member for the effects: dust at their feet as
    // they walk, a "spotted" pop when they first step in.
    houseFx.update(
      dt,
      walker && avatar ? [...mirror.members, { id: "visitor", kind: "human", x: s.x, z: s.z, walking: stepping, seated: Boolean(s.seat) }] : mirror.members,
      scratch.eye,
      animate,
    );

    // Dollhouse: on the follow camera the upper walls drop away.
    const showUpper = onTable || onTv || Boolean(s.shot);
    if (s.upperShown !== showUpper) {
      upperWalls.forEach((o) => {
        o.visible = showUpper;
      });
      s.upperShown = showUpper;
    }


    // What E does here: stand up, sit on the seat in reach, else the nearest hotspot.
    let spot: HouseHotspot | null = null;
    if (walker && s.seat) spot = STAND_PROMPT;
    else if (walker) {
      const seat = avatar ? nearestSeat(map, s.x, s.z) : null;
      const near = nearestHotspot(map, s.x, s.z);
      // A seat wins (a chair's own hotspot sits right on it) unless something
      // else is clearly closer, like the monitor in front of the gaming chair.
      const seatDistance = seat ? Math.hypot(seat.at[0] - s.x, seat.at[2] - s.z) : Infinity;
      const spotDistance = near ? Math.hypot(near.at[0] - s.x, near.at[2] - s.z) : Infinity;
      spot = seat && seatDistance <= spotDistance + SEAT_PREFERENCE_M
        ? { ...STAND_PROMPT, id: `seat-${seat.id}`, label: `Sit · ${seat.label}`, seat: seat.id, room: seat.room }
        : near;
    }
    interact.current = spot;
    const shotName = onTable ? "Table cam" : onTv ? "TV cam" : s.shot ? shots.find((shot) => shot.key === s.shot)?.label ?? "Room cam" : "Follow cam";
    const place = floor?.label ?? (walker ? "The house" : shotName.replace(/ cam$/, ""));
    const hudKey = `${place}|${shotName}|${spot?.id ?? ""}`;
    if (hudKey !== s.hudKey) {
      s.hudKey = hudKey;
      onHud({ place, shot: shotName, hotspot: spot });
    }
  });

  return (
    <>
      <primitive object={gltf.scene} />
      {separateCast && <primitive object={castGltf.scene} />}
      <primitive object={houseFx.group} />
      <primitive object={table.mat} />
      <primitive object={tv.picture} />
      <primitive object={bar.group} />
      <Visitor groupRef={visitor} sprite={Boolean(avatar)} />
    </>
  );
}

class SceneBoundary extends Component<{ onFailed?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailed?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Stick({ input }: { input: React.MutableRefObject<Input> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const update = (clientX: number, clientY: number) => {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width / 2;
    let x = (clientX - rect.left - radius) / radius;
    let y = (clientY - rect.top - radius) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    input.current.stick = { x, y };
    setKnob({ x, y });
  };
  const release = () => {
    pointer.current = null;
    input.current.stick = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  };
  return (
    <div
      ref={base}
      data-alt-director-stick
      className="pointer-events-auto relative h-24 w-24 touch-none rounded-full border border-white/25 bg-black/35 backdrop-blur-sm"
      onPointerDown={(e) => {
        e.stopPropagation();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-1/2 h-10 w-10 rounded-full border border-white/40 bg-orange-500/80"
        style={{ transform: `translate(calc(-50% + ${knob.x * 28}px), calc(-50% + ${knob.y * 28}px))` }}
      />
    </div>
  );
}

const AVATAR_STORAGE_KEY = "tank.altDirector.avatar";

/** A table game's result as a HUD note. */
function gameNote(game: TableGame): HouseHotspot {
  return { ...STAND_PROMPT, id: `table-${game.id}`, label: "Game table", blurb: describeTableGame(game), seat: undefined };
}

/** What the bar says when you walk up to it. */
function tavernBlurb(snapshot: TavernSnapshot | null): string {
  if (!snapshot) return "The Tavern. Opening it in chat.";
  if (!snapshot.enabled) return "The Tavern is closed tonight.";
  const waiting = snapshot.chits.filter((c) => c.outcome === "pending").length;
  const orders = waiting === 1 ? "1 order waiting" : `${waiting} orders waiting`;
  if (snapshot.shift) return `${snapshot.shift.bartenderName} has the apron. ${orders}. Opening the Tavern in chat.`;
  return `Nobody is behind the bar. ${orders}. Grab the apron in the Tavern.`;
}

export default function AltDirector3D({
  url,
  castUrl = null,
  canWalk,
  avatarId = DEFAULT_AVATAR,
  programmeShot = null,
  onSignIn,
  reducedMotion = false,
  onFailed,
  className = "",
  onHudChange,
  cameraMode: cameraModeProp,
  onCameraModeChange,
  hideOverlayHud = false,
  avatarChoice,
  avatarPicker = true,
  chatMessages,
  onOpenTavern,
  onCommand,
}: AltDirector3DProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ keys: new Set(), stick: { x: 0, y: 0 } });
  const effects = useRef<Effects>({ tv: false, seat: null });
  const interact = useRef<HouseHotspot | null>(null);
  const turn = useRef(0);
  const programme = useRef<string | null>(programmeShot);
  programme.current = programmeShot;
  const drag = useRef<{ id: number; x: number } | null>(null);
  const [internalMode, setInternalMode] = useState<CameraMode>("director");
  const mode = cameraModeProp ?? internalMode;
  const toggleMode = () => {
    const next = mode === "director" ? "follow" : "director";
    setInternalMode(next);
    onCameraModeChange?.(next);
  };
  const [hud, setHud] = useState<Hud>({ place: "The house", shot: "Follow cam", hotspot: null });
  const [note, setNote] = useState<HouseHotspot | null>(null);
  const [focused, setFocused] = useState(false);
  const [touch, setTouch] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  // Which cast sprite the visitor walks as. Remembered on this device; the
  // list is whatever rigs the published cast actually has.
  const [chosenAvatar, setChosenAvatar] = useState<string>(avatarId);
  const [avatarList, setAvatarList] = useState<{ id: string; label: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AVATAR_STORAGE_KEY);
      if (saved) setChosenAvatar(saved);
    } catch {
      // Private mode: Joe it is.
    }
  }, []);
  const chooseAvatar = (id: string) => {
    setChosenAvatar(id);
    setPickerOpen(false);
    try {
      window.localStorage.setItem(AVATAR_STORAGE_KEY, id);
    } catch {
      // Not remembered; still worn for this visit.
    }
    wrapper.current?.focus({ preventScroll: true });
  };
  // The game table replays the chat's mini-games, in order.
  const tableQueue = useMemo(() => new TableQueue(), []);
  const tvFeed = useMemo(() => new TvFeed(), []);
  useEffect(() => {
    if (!chatMessages?.length) return;
    tableQueue.offer(chatMessages, Date.now());
    tvFeed.offer(chatMessages, Date.now());
  }, [chatMessages, tableQueue, tvFeed]);
  // The bar: who has the apron and who is waiting, from the public Tavern snapshot.
  const [tavern, setTavern] = useState<{ cast: BarCast; pool: TankNpcPool | null }>({ cast: { bartender: null, guests: [] }, pool: null });
  const tavernSnapshot = useRef<TavernSnapshot | null>(null);
  useEffect(() => {
    if (!ready || !visible) return;
    let live = true;
    const refresh = async () => {
      try {
        const [res, pool] = await Promise.all([fetch("/api/tank/tavern"), loadNpcPool()]);
        const snapshot = res.ok ? ((await res.json()) as TavernSnapshot) : null;
        if (!live) return;
        tavernSnapshot.current = snapshot;
        const cast = barCast(snapshot);
        setTavern((previous) =>
          previous.pool === pool && JSON.stringify(previous.cast) === JSON.stringify(cast) ? previous : { cast, pool },
        );
      } catch {
        // The bar just stays as it was.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, TAVERN_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [ready, visible]);

  const wanted = avatarChoice ?? chosenAvatar;
  const wornAvatar = avatarList.some((a) => a.id === wanted) ? wanted : DEFAULT_AVATAR;

  useEffect(() => {
    setTouch(window.matchMedia?.("(pointer: coarse)").matches === true);
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 6000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const handlers = useMemo(
    () => ({
      ready: () => setReady(true),
      broken: () => onFailed?.(),
      avatars: (list: { id: string; label: string }[]) => setAvatarList(list),
      hud: (next: Hud) => setHud(next),
      tableResult: (game: TableGame) => setNote(gameNote(game)),
    }),
    [onFailed],
  );

  const wandering = ready && canWalk && !focused && !touch;
  // Seated at the game table: the games are a button (or a number key) away.
  const atTableNow = ready && canWalk && hud.shot === "Table cam";
  useEffect(() => {
    onHudChange?.({
      place: hud.place,
      shot: hud.shot,
      hint: wandering ? WANDER_HINT : null,
      note: note ? { label: note.label, blurb: note.blurb } : null,
    });
  }, [onHudChange, hud.place, hud.shot, wandering, note]);

  useEffect(() => {
    if (canWalk) return;
    input.current.keys.clear();
    input.current.stick = { x: 0, y: 0 };
    setNote(null);
  }, [canWalk]);

  const activateHotspot = () => {
    const spot = interact.current;
    if (!spot || !canWalk) return;
    if (spot.seat) {
      effects.current.seat = spot.seat;
      return;
    }
    if (spot.effect === "tv") {
      effects.current.tv = !effects.current.tv;
      setNote({
        ...spot,
        blurb: effects.current.tv
          ? "Tank TV: items, drops, level-ups, quests and house events from chat play here. Walk off to stop watching."
          : "Back to the house.",
      });
      return;
    }
    if (spot.effect === "tavern") {
      setNote({ ...spot, blurb: tavernBlurb(tavernSnapshot.current) });
      onOpenTavern?.();
      return;
    }
    setNote(spot);
  };

  return (
    <div
      ref={wrapper}
      data-alt-director={canWalk ? "walk" : "watch"}
      tabIndex={canWalk ? 0 : undefined}
      aria-label={
        canWalk
          ? "Alt Director: walk around the house. Use W A S D or the arrow keys to move, E to interact, C to switch camera."
          : "Alt Director: a tour of the house while every room is off air."
      }
      // pan-y: a phone can still scroll the page past the hero; sideways
      // drags turn the camera and the stick captures its own touches.
      className={`absolute inset-0 touch-pan-y outline-none transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"} ${className}`}
      // The hero's tap-for-XP handler and the page's D / I shortcuts must not
      // fire while someone is walking around in here.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (!canWalk) return;
        if (MOVE_KEYS.has(e.code)) {
          e.preventDefault();
          e.stopPropagation();
          input.current.keys.add(e.code);
        } else if (INTERACT_KEYS.has(e.code)) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) activateHotspot();
        } else if (e.code === "KeyC") {
          e.stopPropagation();
          if (!e.repeat) toggleMode();
        } else if (atTableNow && onCommand) {
          const play = TABLE_PLAYS.find((p) => p.key === e.code);
          if (play && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            onCommand(play.command);
          }
        }
      }}
      onKeyUp={(e) => {
        input.current.keys.delete(e.code);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        input.current.keys.clear();
      }}
      onPointerDown={(e) => {
        if (!canWalk) return;
        wrapper.current?.focus({ preventScroll: true });
        drag.current = { id: e.pointerId, x: e.clientX };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x;
        drag.current = { id: e.pointerId, x: e.clientX };
        turn.current += dx * 0.006;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
    >
      <SceneBoundary key={`${url}|${castUrl ?? ""}`} onFailed={onFailed}>
        <Canvas
          flat
          dpr={1}
          style={{ imageRendering: "pixelated" }}
          frameloop={visible ? "always" : "never"}
          gl={{ antialias: false, powerPreference: "low-power" }}
          onCreated={({ scene }) => {
            scene.background = new THREE.Color(0x05070a);
          }}
        >
          <Suspense fallback={null}>
            <HouseWorld
              url={url}
              castUrl={castUrl}
              walker={canWalk}
              avatarId={wornAvatar}
              programme={programme}
              input={input}
              mode={mode}
              effects={effects}
              interact={interact}
              turn={turn}
              animate={!reducedMotion}
              onHud={handlers.hud}
              onReady={handlers.ready}
              onBroken={handlers.broken}
              onAvatars={handlers.avatars}
              tableQueue={tableQueue}
              onTableResult={handlers.tableResult}
              tavern={tavern}
              tvFeed={tvFeed}
            />
            <PixelRenderer />
          </Suspense>
        </Canvas>
      </SceneBoundary>

      {/* HUD (hidden when parent hosts the HUD in the UI footer) */}
      {!hideOverlayHud && (
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1 sm:left-3 sm:top-3">
          <div className="w-fit rounded border border-white/15 bg-black/55 px-2 py-1 text-white backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Alt Director</p>
            <p className="text-xs font-bold">{hud.place}</p>
            <p className="text-[10px] text-white/60">{hud.shot}</p>
          </div>
        </div>
      )}

      {!hideOverlayHud && (
        <div className={`pointer-events-none absolute right-2 top-2 sm:right-3 sm:top-3 ${canWalk ? "" : "hidden"}`}>
          <button
            type="button"
            className="pointer-events-auto rounded border border-white/20 bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleMode();
              wrapper.current?.focus({ preventScroll: true });
            }}
            title="Switch camera (C)"
          >
            {mode === "director" ? "Camera: Director cuts" : "Camera: Follow"}
          </button>
        </div>
      )}

      {atTableNow && onCommand && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2 sm:bottom-3">
          <div className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded border border-white/15 bg-black/60 p-1 backdrop-blur-sm">
            {TABLE_PLAYS.map((play, i) => (
              <button
                key={play.command}
                type="button"
                className="rounded border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-orange-500/30"
                title={`${play.command} (${i + 1})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCommand(play.command);
                  wrapper.current?.focus({ preventScroll: true });
                }}
              >
                <span aria-hidden="true">{play.emoji}</span> {play.label}
                <span className="ml-1 hidden text-white/40 sm:inline">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {avatarPicker && canWalk && ready && avatarList.length > 1 && (
        <div
          className={`pointer-events-none absolute right-2 sm:right-3 ${hideOverlayHud ? "top-2 sm:top-3" : "top-10 sm:top-12"} flex flex-col items-end gap-1`}
        >
          <button
            type="button"
            className="pointer-events-auto rounded border border-white/20 bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
            aria-expanded={pickerOpen}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((open) => !open);
            }}
            title="Choose who you walk as"
          >
            Walk as: {avatarList.find((a) => a.id === wornAvatar)?.label ?? "Joe"}
          </button>
          {pickerOpen && (
            <div
              role="listbox"
              aria-label="Avatars"
              className="pointer-events-auto grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-white/15 bg-black/75 p-1.5 backdrop-blur-sm"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {avatarList.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={a.id === wornAvatar}
                  className={`rounded px-2 py-1 text-left text-[11px] font-bold transition ${a.id === wornAvatar ? "bg-orange-600 text-white" : "text-white/85 hover:bg-white/10"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    chooseAvatar(a.id);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {note && !hideOverlayHud && (
        <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-3 sm:top-16">
          <div className="max-w-sm rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-center text-white backdrop-blur-sm">
            <p className="text-xs font-bold">{note.label}</p>
            <p className="mt-0.5 text-xs text-white/75">{note.blurb}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 sm:p-3">
        <div>{touch && canWalk && <Stick input={input} />}</div>
        {hud.hotspot && (
          <button
            type="button"
            className="pointer-events-auto rounded-lg border border-orange-300/60 bg-orange-600/90 px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-orange-500"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              activateHotspot();
              wrapper.current?.focus({ preventScroll: true });
            }}
          >
            {touch ? hud.hotspot.label : `E · ${hud.hotspot.label}`}
          </button>
        )}
      </div>

      {ready && !canWalk && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-3">
          <div className="pointer-events-auto flex max-w-[calc(100%-0.5rem)] items-center gap-3 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-white backdrop-blur-sm">
            <p className="text-xs">
              <span className="font-bold">The house is off air.</span>{" "}
              <span className="text-white/70">Sign in to walk around it.</span>
            </p>
            {onSignIn && (
              <button
                type="button"
                className="shrink-0 rounded bg-[#ff4d00] px-3 py-1 text-xs font-black text-white shadow"
                onClick={(e) => {
                  e.stopPropagation();
                  onSignIn();
                }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}

      {wandering && !hideOverlayHud && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-lg border border-white/15 bg-black/60 px-4 py-3 text-center text-white backdrop-blur-sm">
            <p className="text-sm font-bold">The house is empty. Have a wander.</p>
            <p className="mt-1 text-xs text-white/70">Click to walk around · WASD or arrows · E to look · C for camera</p>
          </div>
        </div>
      )}
    </div>
  );
}
