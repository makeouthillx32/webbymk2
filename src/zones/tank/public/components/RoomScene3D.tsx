"use client";

// The off-air stand-in: the room's Blender scene seen from the same spot as
// its real camera, with the house cast idling and a small drag-to-look.
// Loaded only through next/dynamic (no SSR) and only when a room is dark, so
// three.js never ships to a viewer who is watching a live feed.

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { roomSceneDecoderPath } from "../roomScenes";

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

// Blender's pixel look is emission-only and unlit. glTF carries it as an
// emissive texture on a lit material; rebuild it as unlit. Only the cast's
// sprites are cut-outs — the house textures carry alpha Blender ignores, and
// cutting them would punch holes in the walls.
function toUnlit(material: THREE.Material, cutout: boolean): THREE.Material {
  const m = material as THREE.MeshStandardMaterial;
  const map = m.emissiveMap ?? m.map ?? null;
  const emissive = m.emissive && m.emissive.getHex() !== 0 ? m.emissive.clone() : null;
  const color = emissive ?? (map ? new THREE.Color(1, 1, 1) : (m.color?.clone() ?? new THREE.Color(1, 1, 1)));
  const basic = new THREE.MeshBasicMaterial({ map, color, side: m.side, alphaTest: cutout ? 0.5 : 0 });
  basic.name = m.name;
  return basic;
}

function prepareScene(root: THREE.Object3D) {
  if (root.userData.tankPrepared) return;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const cutout = (mesh as THREE.SkinnedMesh).isSkinnedMesh || /sprite/i.test(mesh.name);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => toUnlit(m, cutout))
      : toUnlit(mesh.material, cutout);
    mesh.frustumCulled = !(mesh as THREE.SkinnedMesh).isSkinnedMesh;
  });
  root.userData.tankPrepared = true;
}

function roomCamera(cameras: THREE.Camera[], roomKey: string): THREE.PerspectiveCamera | null {
  const perspective = cameras.filter((c): c is THREE.PerspectiveCamera => (c as THREE.PerspectiveCamera).isPerspectiveCamera);
  return (
    perspective.find((c) => c.userData?.tank_room_key === roomKey || c.parent?.userData?.tank_room_key === roomKey) ??
    perspective.find((c) => /TANK/.test(c.name) || /TANK/.test(c.parent?.name ?? "")) ??
    perspective[0] ??
    null
  );
}

function pickClips(clips: THREE.AnimationClip[]) {
  const matching = (re: RegExp) => clips.filter((c) => re.test(c.name));
  const skit = matching(/Skit_Rehearsal/i);
  if (skit.length) return skit;
  const idle = matching(/idle|loop/i);
  return idle.length ? idle : clips.slice(0, 1);
}

function RoomModel({ url, roomKey, look, animate, onReady }: { url: string; roomKey: string; look: React.MutableRefObject<Look>; animate: boolean; onReady?: () => void }) {
  const gltf = useGLTF(url, roomSceneDecoderPath());
  const { set, size } = useThree();
  useMemo(() => prepareScene(gltf.scene), [gltf.scene]);
  const camera = useMemo(() => roomCamera(gltf.cameras, roomKey), [gltf.cameras, roomKey]);
  const base = useMemo(() => camera?.quaternion.clone() ?? null, [camera]);
  const { actions } = useAnimations(gltf.animations, gltf.scene);
  const offset = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useEffect(() => {
    if (!camera) return;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    set({ camera });
  }, [camera, set, size.width, size.height]);

  useEffect(() => {
    const clips = new Set(pickClips(gltf.animations).map((c) => c.name));
    const playing = Object.entries(actions).filter(([name]) => clips.has(name));
    if (animate) playing.forEach(([, action]) => action?.reset().play());
    return () => playing.forEach(([, action]) => action?.stop());
  }, [actions, animate, gltf.animations]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame(({ clock }) => {
    if (!camera || !base) return;
    // A slow sway so the room reads as a place, not a screenshot.
    const sway = animate ? Math.sin(clock.elapsedTime * 0.25) * THREE.MathUtils.degToRad(1.2) : 0;
    euler.set(look.current.y, look.current.x + sway, 0);
    camera.quaternion.copy(base).multiply(offset.setFromEuler(euler));
  });

  return <primitive object={gltf.scene} />;
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
          dpr={[1, 1.5]}
          frameloop={visible ? "always" : "never"}
          gl={{ antialias: false, powerPreference: "low-power" }}
          onCreated={({ scene }) => {
            scene.background = new THREE.Color(0x05070a);
          }}
        >
          <Suspense fallback={null}>
            <RoomModel url={url} roomKey={roomKey} look={look} animate={!reducedMotion} onReady={handleReady} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
