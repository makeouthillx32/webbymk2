// src/zones/tank/server/roomVisionPipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-Room Independent Vision & PTZ Pipeline
//
// Groundwork piping for dedicated room lovers watching specific camera feeds:
// Maintains independent, room-specific vision contexts, detection categorization
// (people, pets, trash, clutter), and local PTZ focus calculation.
// ─────────────────────────────────────────────────────────────────────────────

import type { CameraTelemetryInput } from "./directorVirtualAtlas";
import type { VirtualPtzState } from "../director-configuration/components/NavigationController";
import { calculateGroupPtzTarget } from "../director/groupFramingEngine";
import { calculateAnimalPtzTarget } from "../director/animalFramingEngine";

export type DetectionCategory = "people" | "pets" | "trash" | "clutter" | "waldo" | "unknown";

export type CategorizedDetectionBox = {
  id: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  label: string;
  category: DetectionCategory;
  confidence: number;
};

export type RoomVisionContext = {
  roomKey: string;
  cameraId: string;
  peopleCount: number;
  animalCount: number;
  clutterCount: number;
  detectedBoxes: CategorizedDetectionBox[];
  roomPtzState: VirtualPtzState;
  focusedEntity?: {
    label: string;
    category: DetectionCategory;
    targetPtz: VirtualPtzState;
  } | null;
  lastUpdated: number;
};

const g_roomVisionStore = new Map<string, RoomVisionContext>();

function categorizeLabel(label?: string): DetectionCategory {
  if (!label) return "unknown";
  const l = label.toLowerCase();
  if (l === "person" || l === "human" || l === "player" || l === "tyler" || l === "joe" || l === "malia") {
    return "people";
  }
  if (
    l === "dog" ||
    l === "cat" ||
    l === "pet" ||
    l === "animal" ||
    l === "buster" ||
    l === "kona" ||
    l === "mochi" ||
    l === "shadow"
  ) {
    return "pets";
  }
  if (l.includes("trash") || l.includes("can") || l.includes("bottle") || l.includes("cup")) {
    return "trash";
  }
  if (l.includes("box") || l.includes("clutter") || l.includes("toy") || l.includes("strap")) {
    return "clutter";
  }
  if (l.includes("waldo") || l.includes("secret") || l.includes("easter")) {
    return "waldo";
  }
  return "unknown";
}

/**
 * Updates room-level vision telemetry from inference feeds.
 */
export function updateRoomVisionTelemetry(
  roomKey: string,
  cameraId: string,
  telemetry: CameraTelemetryInput,
  now = Date.now()
): RoomVisionContext {
  const rawBoxes = telemetry.boundingBoxes ?? [];
  const categorized: CategorizedDetectionBox[] = rawBoxes.map((b, idx) => ({
    id: `${cameraId}_box_${idx}`,
    nx: b.nx,
    ny: b.ny,
    nw: b.nw,
    nh: b.nh,
    label: b.label || "Unknown",
    category: (b.category as DetectionCategory) || categorizeLabel(b.label),
    confidence: b.confidence ?? 0.75,
  }));

  const peopleBoxes = categorized.filter((b) => b.category === "people");
  const petBoxes = categorized.filter((b) => b.category === "pets");
  const clutterBoxes = categorized.filter((b) => b.category === "trash" || b.category === "clutter");

  // Determine local room PTZ crop
  let targetPtz: VirtualPtzState = { zoomFactor: 1.0, panOffsetX: 0, panOffsetY: 0, zoomSpeed: 5 };
  let focusedEntity: RoomVisionContext["focusedEntity"] = null;

  if (petBoxes.length > 0) {
    const animalResult = calculateAnimalPtzTarget(petBoxes);
    targetPtz = animalResult.targetPtz;
    focusedEntity = {
      label: petBoxes[0].label,
      category: "pets",
      targetPtz,
    };
  } else if (peopleBoxes.length > 0) {
    const groupResult = calculateGroupPtzTarget(peopleBoxes);
    targetPtz = groupResult.targetPtz;
    focusedEntity = {
      label: peopleBoxes.length === 1 ? peopleBoxes[0].label : `${peopleBoxes.length} People`,
      category: "people",
      targetPtz,
    };
  }

  const context: RoomVisionContext = {
    roomKey,
    cameraId,
    peopleCount: Math.max(telemetry.peopleCount ?? 0, peopleBoxes.length),
    animalCount: Math.max(telemetry.animalCount ?? 0, petBoxes.length),
    clutterCount: clutterBoxes.length,
    detectedBoxes: categorized,
    roomPtzState: targetPtz,
    focusedEntity,
    lastUpdated: now,
  };

  g_roomVisionStore.set(roomKey, context);
  return context;
}

/**
 * Retrieves the vision context for a specific room.
 */
export function getRoomVisionContext(roomKey: string): RoomVisionContext | null {
  return g_roomVisionStore.get(roomKey) || null;
}

/**
 * Lists all active room vision contexts across the house.
 */
export function listAllRoomVisionContexts(): RoomVisionContext[] {
  return Array.from(g_roomVisionStore.values());
}
