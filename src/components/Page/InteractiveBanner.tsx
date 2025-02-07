"use client";
import { Suspense, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/utils/cn";
import Loading from "../Common/Loading";

/**
 * InteractiveBanner:
 * ------------------
 * The main exported component that contains a starry video background,
 * a clickable overlay, and a 3D scene with your glTF model.
 */
export default function InteractiveBanner() {
  const [isOverlayVisible, setIsOverlayVisible] = useState(true);

  return (
    <div className="relative h-[80dvh] w-full overflow-hidden">
      {/* Video Background */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/images/starry-background4K_1.webm"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{
          opacity: 100,  // Reduce visual intensity for GPU efficiency
          filter: "blur(0px)", // Slight blur reduces sharp pixel processing
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.1)", // Scale to avoid video cuts on mobile screens
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-transparent to-slate-900"></div>

      {/* Scene Overlay */}
      {isOverlayVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
          <button
            onClick={() => setIsOverlayVisible(false)}
            className="rounded-lg bg-white px-6 py-3 text-lg font-semibold text-black transition-transform hover:scale-105"
          >
            Click to Explore 3D Scene
          </button>
        </div>
      )}

      {/* 3D Scene */}
      <ThreeFiber />

      {/* Controls */}
      <Controls handleOverlayClick={setIsOverlayVisible} />
    </div>
  );
}
/**
 * ThreeFiber:
 * -----------
 * Sets up the 3D scene, including your model, rotating box, 
 * environment lighting, and the ParticleSystem.
 */
function ThreeFiber() {
  return (
    <Canvas>
      {/* Lights */}
      <ambientLight intensity={Math.PI / 2} />
      <spotLight
        position={[10, 10, 10]}
        angle={0.15}
        penumbra={1}
        decay={0}
        intensity={Math.PI}
      />
      <pointLight position={[-10, 10, -10]} decay={0} intensity={Math.PI} />

      {/* Environment Reflection */}
      <Environment preset="city" />

      {/* 3D Model */}
      <UnenterModel />

      {/* Optional Rotating Box */}
      <Box position={[5, 0, 0]} />

      {/* Procedural Particles */}
      <ParticleSystem spawnRate={2} />

      <OrbitControls />
    </Canvas>
  );
}

/**
 * Box:
 * ----
 * A simple demo box to show interaction (hover & click).
 */
function Box(props: any) {
  const ref = useRef<any>(null);
  const [hovered, hover] = useState(false);
  const [clicked, click] = useState(false);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta;
      ref.current.rotation.y += delta / 4;
    }
  });

  return (
    <mesh
      {...props}
      ref={ref}
      scale={clicked ? 1.5 : 1}
      onClick={() => click(!clicked)}
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "orange" : "steelblue"} />
    </mesh>
  );
}

/**
 * UnenterModel:
 * -------------
 * Loads the unenter.glb model and applies a metallic material. 
 * Also scales the model down on mobile screens.
 */
function UnenterModel() {
  const { scene } = useGLTF("./models/unenter.glb");
  const [modelScale, setModelScale] = useState<[number, number, number]>([1, 1, 1]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Simple mobile check
      if (window.innerWidth < 640) {
        setModelScale([0.6, 0.6, 0.6]);
      } else {
        setModelScale([1, 1, 1]);
      }
    }
  }, []);

  // Apply chrome-like material to every mesh in the GLTF scene
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.material = new THREE.MeshStandardMaterial({
        color: "silver",
        metalness: 1,
        roughness: 0,
        envMapIntensity: 1.0,
      });
    }
  });

  return <primitive object={scene} scale={modelScale} position={[0, 0, 0]} />;
}

/**
 * ParticleSystem:
 * ---------------
 * Creates random particles that last ~4 seconds and float around 
 * behind/in front of the main GLB model. 
 */
interface Particle {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface ParticleSystemProps {
  spawnRate: number;
}

export function ParticleSystem({ spawnRate }: ParticleSystemProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  // Adjust ring radii as needed (units in your 3D scene)
  const SPAWN_RING_RADIUS = 0.5;   // Red circle
  const PURPLE_RING_RADIUS = 1.2; // 1st despawn ring
  const GREEN_RING_RADIUS = 2.0;  // 2nd despawn ring
  const BLUE_RING_RADIUS = 3.0;   // Final despawn ring

  // Probability (0–1) that a star despawns upon crossing a ring
  const PURPLE_DESPAWN_CHANCE = 0.3; 
  const GREEN_DESPAWN_CHANCE = 0.5; 

  useFrame((state, delta) => {
    // Spawn new particles at a certain rate
    if (Math.random() < spawnRate * delta) {
      const id = Date.now() + Math.random();

      // Spawn exactly on the spawn ring in the XY plane
      // Random angle in [0..2π]
      const theta = Math.random() * Math.PI * 2;
      const x = SPAWN_RING_RADIUS * Math.cos(theta);
      const y = SPAWN_RING_RADIUS * Math.sin(theta);

      // Position the star on the ring at z=0
      const position = new THREE.Vector3(x, y, 0);

      // Velocity points radially outward (from center)
      // Speed is gently small for slow outward motion
      const speed = 0.05 + Math.random() * 0.1; 
      // Direction is position normalized
      const direction = position.clone().normalize().multiplyScalar(speed);

      const particle: Particle = { id, position, velocity: direction };
      setParticles((prev) => [...prev, particle]);
    }

    // Update positions + ring-based despawn logic
    setParticles((prev) => {
      const updated: Particle[] = [];

      for (let p of prev) {
        // Move the star outward
        const newPos = p.position.clone().add(p.velocity.clone().multiplyScalar(delta));
        p = { ...p, position: newPos };

        // Calculate distance from center
        const dist = newPos.length();

        // Check ring crossings in order:
        if (dist >= BLUE_RING_RADIUS) {
          // Force despawn at the blue ring (final ring)
          continue;
        } else if (dist >= GREEN_RING_RADIUS) {
          // 2nd despawn ring: chance to despawn
          if (Math.random() < GREEN_DESPAWN_CHANCE) continue;
        } else if (dist >= PURPLE_RING_RADIUS) {
          // 1st despawn ring: chance to despawn
          if (Math.random() < PURPLE_DESPAWN_CHANCE) continue;
        }

        // Keep the star if it didn't despawn
        updated.push(p);
      }
      return updated;
    });
  });

  return (
    <>
      {particles.map((p) => (
        <mesh key={p.id} position={[p.position.x, p.position.y, p.position.z]}>
          {/* Tiny geometry so the stars look small */}
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.0} />
        </mesh>
      ))}
    </>
  );
}


/**
 * Controls:
 * ---------
 * UI overlays for toggling the scene overlay and showing a 'toast' pop-up.
 */
function Controls({
  handleOverlayClick,
}: {
  handleOverlayClick: (value: boolean) => void;
}) {
  const [showToast, setShowToast] = useState(false);

  return (
    <>
      {/* Toast (?) Button */}
      <button
        className={cn(
          "size-12 rounded-full bg-primary text-2xl text-white opacity-50",
          "dark:bg-white dark:text-black",
          "transition-opacity duration-300 hover:opacity-100",
          "absolute bottom-4 right-4"
        )}
        onClick={() => setShowToast(true)}
      >
        ?
      </button>

      {/* Overlay Reset (X) Button */}
      <button
        className={cn(
          "size-10 rounded-full bg-primary text-xl text-white opacity-30",
          "dark:bg-white dark:text-black",
          "transition-opacity duration-300 hover:opacity-100",
          "absolute right-4 top-4"
        )}
        onClick={() => handleOverlayClick(true)}
      >
        X
      </button>

      {/* Toast Notification */}
      {showToast && (
        <div
          className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg cursor-pointer"
          onClick={() => setShowToast(false)}
        >
          Made with Three Fiber!
        </div>
      )}
    </>
  );
}
