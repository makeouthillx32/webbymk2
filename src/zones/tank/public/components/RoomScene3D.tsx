"use client";

// The off-air stand-in: the room's Blender scene seen from the same spot as
// its real camera, with a small drag-to-look. Cast sprites appear only where
// the live cameras see their person in this room (altDirector/castMirror.ts).
// Loaded only through next/dynamic (no SSR) and only when a room is dark, so
// three.js never ships to a viewer who is watching a live feed.

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { roomSceneDecoderPath } from "../roomScenes";
import { prepareScene } from "./sceneMaterials";
import { CastMirror } from "../altDirector/castMirror";
import { loadHouseCastOnce } from "../altDirector/houseCastStore";
import { HouseFx } from "../pixel/houseFx";
import PixelRenderer from "./PixelRenderer";

type Look = { x: number; y: number };
const LOOK_LIMIT = THREE.MathUtils.degToRad(10);

type RoomScene3DProps = {
  url: string;
  roomKey: string;
  reducedMotion?: boolean;
  onReady?: () => void;
  onFailed?: () => void;
  className?: string;
};

function roomCamera(cameras: THREE.Camera[], roomKey: string): THREE.PerspectiveCamera | null {
  const perspective = cameras.filter((c): c is THREE.PerspectiveCamera => (c as THREE.PerspectiveCamera).isPerspectiveCamera);
  return (
    perspective.find((c) => c.userData?.tank_room_key === roomKey || c.parent?.userData?.tank_room_key === roomKey) ??
    perspective.find((c) => /TANK/.test(c.name) || /TANK/.test(c.parent?.name ?? "")) ??
    perspective[0] ??
    null
  );
}

function RoomModel({ url, roomKey, look, animate, onReady }: { url: string; roomKey: string; look: React.MutableRefObject<Look>; animate: boolean; onReady?: () => void }) {
  const gltf = useGLTF(url, roomSceneDecoderPath());
  const { set, size } = useThree();
  useMemo(() => prepareScene(gltf.scene), [gltf.scene]);
  const camera = useMemo(() => roomCamera(gltf.cameras, roomKey), [gltf.cameras, roomKey]);
  const base = useMemo(() => camera?.quaternion.clone() ?? null, [camera]);
  const mirror = useMemo(() => new CastMirror(gltf.scene, gltf.animations, { room: roomKey }), [gltf.scene, gltf.animations, roomKey]);
  const fx = useMemo(() => new HouseFx(), []);
  const eye = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useEffect(() => {
    if (!camera) return;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    set({ camera });
  }, [camera, set, size.width, size.height]);

  useEffect(() => () => mirror.dispose(), [mirror]);
  useEffect(() => () => fx.dispose(), [fx]);
  useEffect(() => {
    loadHouseCastOnce();
  }, []);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame(({ clock }, delta) => {
    if (!camera || !base) return;
    camera.getWorldPosition(eye);
    mirror.update(Math.min(delta, 0.1), eye, animate);
    fx.update(Math.min(delta, 0.1), mirror.members, eye, animate);
    // A slow sway so the room reads as a place, not a screenshot.
    const sway = animate ? Math.sin(clock.elapsedTime * 0.25) * THREE.MathUtils.degToRad(1.2) : 0;
    euler.set(look.current.y, look.current.x + sway, 0);
    camera.quaternion.copy(base).multiply(offset.setFromEuler(euler));
  });

  return (
    <>
      <primitive object={gltf.scene} />
      <primitive object={fx.group} />
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

export default function RoomScene3D({ url, roomKey, reducedMotion = false, onReady, onFailed, className = "" }: RoomScene3DProps) {
  const look = useRef<Look>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    setReady(false);
    look.current = { x: 0, y: 0 };
  }, [url]);

  const handleReady = useMemo(
    () => () => {
      setReady(true);
      onReady?.();
    },
    [onReady],
  );

  return (
    <div
      data-tank-room-scene={roomKey}
      className={`absolute inset-0 touch-none transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"} ${className}`}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        look.current = {
          x: THREE.MathUtils.clamp(look.current.x - dx * 0.003, -LOOK_LIMIT, LOOK_LIMIT),
          y: THREE.MathUtils.clamp(look.current.y - dy * 0.003, -LOOK_LIMIT, LOOK_LIMIT),
        };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
    >
      <SceneBoundary key={url} onFailed={onFailed}>
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
            <RoomModel url={url} roomKey={roomKey} look={look} animate={!reducedMotion} onReady={handleReady} />
            <PixelRenderer />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
