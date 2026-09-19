// src/zones/tank/director/chaosDirectorCatalog.ts
// Pure Chaos Director definitions, decoupled item definitions, and catalog.
// Zero UI or server dependencies so it can be safely consumed by both client and server.

import type { SubjectMode, FramingMode } from "../server/directorVirtualAtlas";

export type TrackingSpeed = "standard" | "sport";

export type DirectorItemOverride = {
  id?: string;
  active: boolean;
  itemSlug: string;
  itemName: string;
  triggeredBy: string;
  startedAt: number;
  expiresAt: number;
  durationSeconds: number;
  // Decoupled capability slots:
  targetMode?: SubjectMode; // Backwards compatible alias for targetDetectionMode
  targetDetectionMode?: SubjectMode;
  targetFramingMode?: FramingMode;
  targetRoomKey?: string;
  targetCameraId?: string;
  targetSpeed?: TrackingSpeed;
  chaosHopIntervalMs?: number; // E.g. 4000ms rapid room hop
  overrideRoomLock?: boolean;  // True if knocks operator room lock off its rocker
};

export type DecoupledDirectorPolicy = {
  hasActiveOverride: boolean;
  activeOverrides: DirectorItemOverride[];
  effectiveDetectionMode: SubjectMode | null;
  effectiveFramingMode: FramingMode | null;
  effectiveRoomKey: string | null;
  effectiveCameraId: string | null;
  effectiveSpeed: TrackingSpeed | null;
  chaosHopIntervalMs: number | null;
  overrideRoomLock: boolean;
  timeRemainingSeconds: number;
  reason: string;
};

export type DirectorPolicyDecision = {
  effectiveMode: SubjectMode;
  activeOverrideType: "ADMIN_LOCK" | "ITEM_OVERRIDE" | "OPERATOR_MODE" | "AUTO_HEURISTIC";
  activeOverrideReason: string;
  timeRemainingSeconds?: number;
  targetCameraId?: string;
  targetRoomKey?: string;
  targetFramingMode?: FramingMode;
  targetSpeed?: TrackingSpeed;
  chaosHopIntervalMs?: number;
  overrideRoomLock?: boolean;
};

export type ActiveChaosItemPayload = {
  itemSlug: string;
  itemName: string;
  triggeredBy: string;
  durationSeconds: number;
  timeRemainingSeconds: number;
  targetDetectionMode?: string;
  targetFramingMode?: string;
  targetRoomKey?: string;
  targetCameraId?: string;
  overrideRoomLock?: boolean;
  chaosHopIntervalMs?: number;
};

export type ChaosDirectorItemDefinition = {
  slug: string;
  name: string;
  description: string;
  category: "room" | "detection" | "framing" | "chaos" | "compound";
  defaultDurationSeconds: number;
  targetRoomKey?: string;
  targetDetectionMode?: SubjectMode;
  targetFramingMode?: FramingMode;
  targetSpeed?: TrackingSpeed;
  chaosHopIntervalMs?: number;
  overrideRoomLock?: boolean;
  badge: string;
};

export const CHAOS_DIRECTOR_CATALOG: ChaosDirectorItemDefinition[] = [
  {
    slug: "room-spotlight",
    name: "Room Spotlight",
    description: "Pins the Director to a designated room for 60s while keeping active AI PTZ within that room.",
    category: "room",
    defaultDurationSeconds: 60,
    badge: "ROOM HIJACK",
  },
  {
    slug: "pet-whistle",
    name: "Canine Whistle",
    description: "Forces detection style to Dog Focus for 60s. The Director hunts and frames dogs across the house.",
    category: "detection",
    targetDetectionMode: "dog",
    defaultDurationSeconds: 60,
    badge: "DOG FOCUS",
  },
  {
    slug: "cat-laser",
    name: "Laser Pointer Frenzy",
    description: "Forces detection style to Cat Focus for 60s. Snaps immediately to feline roamers.",
    category: "detection",
    targetDetectionMode: "cat",
    defaultDurationSeconds: 60,
    badge: "CAT TRACKER",
  },
  {
    slug: "sneaker-cam",
    name: "Sneaker Cam / Headless Heist",
    description: "Forces detection to Feet Detection and framing to Headless for 45s (waist-down sneakers and floor).",
    category: "compound",
    targetDetectionMode: "feet",
    targetFramingMode: "headless",
    defaultDurationSeconds: 45,
    badge: "HEADLESS CAM",
  },
  {
    slug: "paparazzi-zoom",
    name: "Paparazzi Zoom",
    description: "Knocks framing into ultra-tight Close-up with Sport snap tracking velocity for 30s.",
    category: "framing",
    targetFramingMode: "close_up",
    targetSpeed: "sport",
    defaultDurationSeconds: 30,
    badge: "TIGHT CLOSE-UP",
  },
  {
    slug: "chaos-cyclone",
    name: "Chaos Cyclone",
    description: "Knocks the Director completely off its rocker! Rapidly hops rooms every 4.5s with chaos detection and sport snap speed for 30s.",
    category: "chaos",
    targetDetectionMode: "chaos",
    targetSpeed: "sport",
    chaosHopIntervalMs: 4500,
    overrideRoomLock: true,
    defaultDurationSeconds: 30,
    badge: "RAPID SHUFFLE",
  },
  {
    slug: "viewer-mutiny",
    name: "Viewer Mutiny",
    description: "Spectator mutiny! Overrides operator room lock and forces wide Group Cluster PTZ for 60s.",
    category: "compound",
    targetDetectionMode: "group",
    targetFramingMode: "group",
    overrideRoomLock: true,
    defaultDurationSeconds: 60,
    badge: "MUTINY LOCK",
  },
  {
    slug: "sound-hound",
    name: "Sound Hound",
    description: "Snaps framing to highest voice activity and audio peaks for 45s.",
    category: "detection",
    targetDetectionMode: "speaker",
    defaultDurationSeconds: 45,
    badge: "AUDIO SPIKE",
  },
];
