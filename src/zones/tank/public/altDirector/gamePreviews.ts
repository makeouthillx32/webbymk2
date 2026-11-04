// Mini game previews: the "All rooms" tiles' stand-in for a live thumbnail
// while a room is off air — the room's Blender scene through its game cam
// ("TANK — <room>"), with the cast rehearsing, like a tiny live preview.
//
// One WebGL renderer for every tile on the page. The roster deliberately
// stopped mounting a player per tile (six 4K decodes heated phones), and six
// WebGL contexts would be the same mistake again. Instead one small offscreen
// renderer draws one room per frame, round-robin, and copies the picture into
// each tile's own 2D canvas. Each room's animation advances by its real
// elapsed time, so it plays at the right speed, just at a thumbnail's frame
// rate. Off-screen tiles and hidden tabs cost nothing.
//
// Client-only, and imported dynamically by components/GamePreview.tsx, so
// three.js never ships to a page with nothing to preview.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { roomSceneDecoderPath } from "../roomScenes";
import { prepareScene } from "../components/sceneMaterials";
import { CastMirror } from "./castMirror";
import { loadHouseCastOnce } from "./houseCastStore";
import { PixelPass } from "../pixel/pixelPass";

const WIDTH = 384;
const HEIGHT = 216;
/** Total renders per second across all rooms (each room gets a share). */
const RENDERS_PER_SECOND = 24;

type Room = {
  status: "loading" | "ready" | "failed";
  scene?: THREE.Object3D;
  camera?: THREE.PerspectiveCamera;
  /** No skit: cast sprites only where the live cameras see their person in this room. */
  mirror?: CastMirror;
  lastRenderAt: number;
  rendered: boolean;
};

type Tile = { roomKey: string; url: string; canvas: HTMLCanvasElement; visible: boolean; drawnFrom: string | null };

let renderer: THREE.WebGLRenderer | null = null;
/** The house's pixel look, at 2 screen px per art px on a tile. */
let pass: PixelPass | null = null;
let loader: GLTFLoader | null = null;
const rooms = new Map<string, Room>();
const tiles = new Set<Tile>();
let turn = 0;
let raf = 0;
let lastTickAt = 0;
let stillsOnly = false;

function roomCamera(root: THREE.Object3D, cameras: THREE.Camera[], roomKey: string): THREE.PerspectiveCamera | null {
  const perspective = cameras.filter((c): c is THREE.PerspectiveCamera => (c as THREE.PerspectiveCamera).isPerspectiveCamera);
  const found =
    perspective.find((c) => c.userData?.tank_room_key === roomKey || c.parent?.userData?.tank_room_key === roomKey) ??
    perspective.find((c) => /TANK/.test(c.name) || /TANK/.test(c.parent?.name ?? "")) ??
    perspective[0] ??
    null;
  if (!found) return null;
  // Its own copy: the same GLB may be on screen elsewhere (the hero's room
  // scene) with a different aspect ratio.
  root.updateMatrixWorld(true);
  const camera = found.clone();
  found.getWorldPosition(camera.position);
  found.getWorldQuaternion(camera.quaternion);
  camera.aspect = WIDTH / HEIGHT;
  camera.updateProjectionMatrix();
  return camera;
}

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power", preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x05070a, 1);
    pass = new PixelPass();
    pass.setSize(WIDTH, HEIGHT, 2);
    const draco = new DRACOLoader();
    draco.setDecoderPath(roomSceneDecoderPath());
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    return renderer;
  } catch {
    renderer = null;
    return null;
  }
}

function load(roomKey: string, url: string) {
  const key = url;
  if (rooms.has(key) || !loader) return;
  const room: Room = { status: "loading", lastRenderAt: 0, rendered: false };
  rooms.set(key, room);
  loader.load(
    url,
    (gltf) => {
      prepareScene(gltf.scene);
      const camera = roomCamera(gltf.scene, gltf.cameras, roomKey);
      if (!camera) {
        room.status = "failed";
        return;
      }
      const mirror = new CastMirror(gltf.scene, gltf.animations, { room: roomKey });
      Object.assign(room, { status: "ready", scene: gltf.scene, camera, mirror, lastRenderAt: performance.now() });
      schedule();
    },
    undefined,
    () => {
      room.status = "failed";
    },
  );
}

function wanted(): Map<string, Tile[]> {
  const byUrl = new Map<string, Tile[]>();
  for (const tile of tiles) {
    if (!tile.visible) continue;
    const list = byUrl.get(tile.url);
    if (list) list.push(tile);
    else byUrl.set(tile.url, [tile]);
  }
  return byUrl;
}

function draw(url: string, targets: Tile[]) {
  const room = rooms.get(url);
  if (!renderer || !room || room.status !== "ready" || !room.scene || !room.camera) return;
  const now = performance.now();
  room.mirror?.update(Math.min(1, (now - room.lastRenderAt) / 1000), room.camera.position, !stillsOnly);
  room.lastRenderAt = now;
  if (pass) pass.render(renderer, room.scene, room.camera);
  else renderer.render(room.scene, room.camera);
  room.rendered = true;
  for (const tile of targets) {
    const context = tile.canvas.getContext("2d");
    if (!context) continue;
    context.imageSmoothingEnabled = false;
    context.drawImage(renderer.domElement, 0, 0, tile.canvas.width, tile.canvas.height);
    tile.drawnFrom = url;
  }
}

function tick(at: number) {
  raf = 0;
  if (document.visibilityState === "hidden") return;
  const byUrl = wanted();
  if (byUrl.size === 0) return;
  // A tile that just switched rooms (the Director tile following the game
  // cam) is drawn at once rather than waiting for its turn.
  for (const [url, list] of byUrl) {
    const stale = list.filter((tile) => tile.drawnFrom !== url);
    if (stale.length && rooms.get(url)?.status === "ready") draw(url, list);
  }
  if (at - lastTickAt >= 1000 / RENDERS_PER_SECOND) {
    lastTickAt = at;
    const urls = [...byUrl.keys()].filter((url) => rooms.get(url)?.status === "ready" && (!stillsOnly || !rooms.get(url)?.rendered));
    if (urls.length) {
      const url = urls[turn % urls.length];
      turn += 1;
      draw(url, byUrl.get(url) ?? []);
    }
  }
  schedule();
}

function schedule() {
  if (!raf && typeof window !== "undefined") raf = window.requestAnimationFrame(tick);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", schedule);
}

/** Reduced motion: each room renders once, as a still. */
export function setGamePreviewStillsOnly(value: boolean) {
  stillsOnly = value;
}

/**
 * Show `roomKey`'s game cam in `canvas` until the returned function is
 * called. Returns null when WebGL isn't available (the tile keeps its
 * ordinary fallback).
 */
export function attachGamePreview(
  roomKey: string,
  url: string,
  canvas: HTMLCanvasElement,
): { setVisible: (visible: boolean) => void; detach: () => void } | null {
  if (!ensureRenderer()) return null;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const tile: Tile = { roomKey, url, canvas, visible: true, drawnFrom: null };
  tiles.add(tile);
  loadHouseCastOnce();
  load(roomKey, url);
  schedule();
  return {
    setVisible(visible) {
      tile.visible = visible;
      if (visible) schedule();
    },
    detach() {
      tiles.delete(tile);
    },
  };
}
