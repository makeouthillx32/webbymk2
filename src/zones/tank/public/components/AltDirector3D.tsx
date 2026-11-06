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
  parseHouseMap,
  type HouseHotspot,
  type HouseMap,
} from "../altDirector/houseMap";
import { pickShot, type ShotCamera } from "../altDirector/cameraCuts";
import { DEFAULT_AVATAR, faceAvatar, findAvatarRig, prepareAvatar, restoreAvatar } from "../altDirector/avatars";
import { loadHouseCastOnce } from "../altDirector/houseCastStore";
import { CastMirror } from "../altDirector/castMirror";
import { HouseFx } from "../pixel/houseFx";
import PixelRenderer from "./PixelRenderer";
import { mergeStaticMeshes } from "../altDirector/mergeStatic";

type CameraMode = "director" | "follow";
type Input = { keys: Set<string>; stick: { x: number; y: number } };
type Hud = { place: string; shot: string; hotspot: HouseHotspot | null };
type Effects = { tv: boolean };

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
};

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
}) {
  const gltf = useGLTF(url, roomSceneDecoderPath());
  // The cast (rigs, sprites, clips) ships as its own file so animating them
  // never re-ships the house. An older single-file house has the cast inside:
  // then this is the same cached load and nothing is added twice.
  const castGltf = useGLTF(castUrl ?? url, roomSceneDecoderPath());
  const separateCast = castGltf !== gltf;
  const { set, get, size } = useThree();
  useMemo(() => {
    prepareScene(gltf.scene);
    mergeStaticMeshes(
      gltf.scene,
      (mesh) => /^PX_TV_Screen/.test(objectName(mesh)),
      gltf.animations,
    );
  }, [gltf]);
  useMemo(() => prepareScene(castGltf.scene, { shell: false }), [castGltf.scene]);
  const map = useMemo(() => readMap(gltf.scene), [gltf.scene]);
  const shots = useMemo(() => findShots(gltf), [gltf]);
  const upperWalls = useMemo(() => {
    const list: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      if (o.userData?.tank_layer === "upper") list.push(o);
    });
    return list;
  }, [gltf.scene]);
  const tvScreen = useMemo(() => {
    let screen: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!screen && mesh.isMesh && /^PX_TV_Screen/.test(objectName(mesh))) screen = mesh;
    });
    if (screen && !(screen as THREE.Mesh).userData.offColor) {
      const mesh = screen as THREE.Mesh;
      // Its own material, so lighting the TV tints nothing else.
      mesh.material = (mesh.material as THREE.MeshBasicMaterial).clone();
      mesh.userData.offColor = (mesh.material as THREE.MeshBasicMaterial).color.clone();
    }
    return screen as THREE.Mesh | null;
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
  // The rest of the cast mirrors the real house (altDirector/castMirror.ts):
  // no skit, and a member no camera can see is not rendered. The visitor's
  // own body is theirs to move.
  const mirror = useMemo(
    () => new CastMirror(castGltf.scene, castGltf.animations, { skip: avatar?.rig ?? null }),
    [castGltf.scene, castGltf.animations, avatar],
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
    basis: null as { fx: number; fz: number } | null,
    upperShown: null as boolean | null,
    hudKey: "",
    walkTime: 0,
    placed: false,
    watchIndex: -1,
    nextCutAt: 0,
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
  }, [shots, follow, size.width, size.height]);

  useEffect(() => {
    loadHouseCastOnce();
  }, []);

  useEffect(() => {
    if (!avatar) return;
    // The rig's rehearsal poses, minus its blocking, play only while walking.
    const action = avatar.clip ? mixer.clipAction(avatar.clip) : null;
    if (action) {
      action.play();
      action.paused = true;
    }
    avatarAction.current = action;
    return () => {
      action?.stop();
      if (avatar.clip) mixer.uncacheAction(avatar.clip);
      avatarAction.current = null;
      restoreAvatar(avatar);
    };
  }, [avatar, mixer]);

  useEffect(() => {
    onReady();
  }, [onReady]);

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
    // held for as long as the visitor keeps moving: a cut mid-stride must not
    // flip which way "up" walks (the classic fixed-camera trap).
    const active = s.shot ? shots.find((shot) => shot.key === s.shot)?.camera ?? follow : follow;
    if (!s.shot) {
      s.basis = { fx: Math.sin(s.followYaw), fz: Math.cos(s.followYaw) };
    } else if (!moving || !s.basis) {
      active.getWorldDirection(scratch.dir);
      const length = Math.hypot(scratch.dir.x, scratch.dir.z) || 1;
      s.basis = { fx: scratch.dir.x / length, fz: scratch.dir.z / length };
    }
    const { fx, fz } = s.basis;
    const wx = fx * forward - fz * right;
    const wz = fz * forward + fx * right;
    if (moving) {
      const speed = held(keys, "ShiftLeft", "ShiftRight") || amount > 1.25 ? RUN_SPEED : WALK_SPEED;
      [s.x, s.z] = moveWithCollision(map, s.x, s.z, wx * speed * dt, wz * speed * dt);
      s.yaw = angleLerp(s.yaw, Math.atan2(wx, wz), dt * 12);
      s.walkTime += dt;
    }
    const bob = moving && animate ? Math.abs(Math.sin(s.walkTime * 9)) * 0.05 : 0;
    if (visitor.current) {
      visitor.current.visible = walker;
      visitor.current.position.set(s.x, 0, s.z);
      visitor.current.rotation.y = s.yaw;
      const body = visitor.current.getObjectByName("visitor-body");
      if (body) body.position.y = bob;
    }
    if (avatar) avatar.rig.position.set(s.x, avatar.baseY + bob, s.z);
    if (avatarAction.current) avatarAction.current.paused = !(moving && animate);

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
        s.shot = pickShot(shots, s.shot, scratch.head, scratch.feet, map, floor?.room ?? null);
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

    const camera = s.shot ? shots.find((shot) => shot.key === s.shot)?.camera ?? follow : follow;
    if (get().camera !== camera) set({ camera });

    // Paper-sprite rule: the cast are flat cards, so the visitor's card always
    // turns to whichever camera has the shot.
    camera.getWorldPosition(scratch.eye);
    if (avatar) faceAvatar(avatar, Math.atan2(scratch.eye.x - s.x, scratch.eye.z - s.z));

    // The mirrored cast: where the real people are, facing the shot.
    mirror.update(dt, scratch.eye, animate);
    houseFx.update(dt, mirror.members, scratch.eye, animate);

    // Dollhouse: on the follow camera the upper walls drop away.
    const showUpper = Boolean(s.shot);
    if (s.upperShown !== showUpper) {
      upperWalls.forEach((o) => {
        o.visible = showUpper;
      });
      s.upperShown = showUpper;
    }

    // The TV hotspot: a slow colour wash while it's on.
    if (tvScreen) {
      const material = tvScreen.material as THREE.MeshBasicMaterial;
      if (effects.current.tv) material.color.setHSL((clock.elapsedTime * 0.08) % 1, 0.7, 0.62);
      else material.color.copy(tvScreen.userData.offColor as THREE.Color);
    }

    const spot = walker ? nearestHotspot(map, s.x, s.z) : null;
    interact.current = spot;
    const shotName = s.shot ? shots.find((shot) => shot.key === s.shot)?.label ?? "Room cam" : "Follow cam";
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
}: AltDirector3DProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ keys: new Set(), stick: { x: 0, y: 0 } });
  const effects = useRef<Effects>({ tv: false });
  const interact = useRef<HouseHotspot | null>(null);
  const turn = useRef(0);
  const programme = useRef<string | null>(programmeShot);
  programme.current = programmeShot;
  const drag = useRef<{ id: number; x: number } | null>(null);
  const [mode, setMode] = useState<CameraMode>("director");
  const [hud, setHud] = useState<Hud>({ place: "The house", shot: "Follow cam", hotspot: null });
  const [note, setNote] = useState<HouseHotspot | null>(null);
  const [focused, setFocused] = useState(false);
  const [touch, setTouch] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

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
      hud: (next: Hud) => setHud(next),
    }),
    [onFailed],
  );

  useEffect(() => {
    if (canWalk) return;
    input.current.keys.clear();
    input.current.stick = { x: 0, y: 0 };
    setNote(null);
  }, [canWalk]);

  const activateHotspot = () => {
    const spot = interact.current;
    if (!spot || !canWalk) return;
    if (spot.effect === "tv") effects.current.tv = !effects.current.tv;
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
          if (!e.repeat) setMode((m) => (m === "director" ? "follow" : "director"));
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
              avatarId={avatarId}
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
            />
            <PixelRenderer />
          </Suspense>
        </Canvas>
      </SceneBoundary>

      {/* HUD */}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1 sm:left-3 sm:top-3">
        <div className="w-fit rounded border border-white/15 bg-black/55 px-2 py-1 text-white backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Alt Director</p>
          <p className="text-xs font-bold">{hud.place}</p>
          <p className="text-[10px] text-white/60">{hud.shot}</p>
        </div>
      </div>

      <div className={`pointer-events-none absolute right-2 top-2 sm:right-3 sm:top-3 ${canWalk ? "" : "hidden"}`}>
        <button
          type="button"
          className="pointer-events-auto rounded border border-white/20 bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMode((m) => (m === "director" ? "follow" : "director"));
            wrapper.current?.focus({ preventScroll: true });
          }}
          title="Switch camera (C)"
        >
          {mode === "director" ? "Camera: Director cuts" : "Camera: Follow"}
        </button>
      </div>

      {note && (
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

      {ready && canWalk && !focused && !touch && (
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
