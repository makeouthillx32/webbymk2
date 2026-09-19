// src/zones/tank/server/roomPortalsCatalog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Spatial Room Portals Catalog & Persistence Engine
//
// Manages shaped doorway mappings between rooms. Uses Supabase
// `tank_room_portals` when available with seamless in-memory fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { RoomPortal, PortalPolygon } from "../vision/portalGeometry";

// Built-in seed portals providing immediate out-of-the-box spatial navigation
const SEED_ROOM_PORTALS: RoomPortal[] = [
  {
    id: "portal-foyer-to-living",
    sourceRoomSlug: "foyer",
    targetRoomSlug: "living-room",
    title: "Living Room",
    description: "Main entryway to Living Room",
    polygon: [
      { nx: 0.42, ny: 0.22 },
      { nx: 0.58, ny: 0.22 },
      { nx: 0.62, ny: 0.88 },
      { nx: 0.38, ny: 0.88 },
    ],
    direction: "forward",
    displayMode: "invisible_hitbox",
    icon: "door",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "portal-living-to-foyer",
    sourceRoomSlug: "living-room",
    targetRoomSlug: "foyer",
    title: "Foyer",
    description: "Front entrance & hallway",
    polygon: [
      { nx: 0.08, ny: 0.28 },
      { nx: 0.22, ny: 0.26 },
      { nx: 0.25, ny: 0.9 },
      { nx: 0.05, ny: 0.92 },
    ],
    direction: "left",
    displayMode: "invisible_hitbox",
    icon: "door",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "portal-living-to-kitchen",
    sourceRoomSlug: "living-room",
    targetRoomSlug: "kitchen",
    title: "Kitchen",
    description: "Passage to kitchen & dining",
    polygon: [
      { nx: 0.76, ny: 0.25 },
      { nx: 0.92, ny: 0.28 },
      { nx: 0.95, ny: 0.92 },
      { nx: 0.74, ny: 0.9 },
    ],
    direction: "right",
    displayMode: "invisible_hitbox",
    icon: "door",
    enabled: true,
    sortOrder: 2,
  },
  {
    id: "portal-kitchen-to-living",
    sourceRoomSlug: "kitchen",
    targetRoomSlug: "living-room",
    title: "Living Room",
    description: "Return to Living Room",
    polygon: [
      { nx: 0.05, ny: 0.24 },
      { nx: 0.2, ny: 0.22 },
      { nx: 0.22, ny: 0.88 },
      { nx: 0.03, ny: 0.88 },
    ],
    direction: "left",
    displayMode: "invisible_hitbox",
    icon: "door",
    enabled: true,
    sortOrder: 1,
  },
];

// In-memory cache for live runtime mutations
let inMemoryPortals: RoomPortal[] = [...SEED_ROOM_PORTALS];

function isDatabaseEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getRoomPortals(sourceRoomSlug: string): Promise<RoomPortal[]> {
  if (isDatabaseEnabled()) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("tank_room_portals")
        .select("*")
        .eq("source_room_slug", sourceRoomSlug)
        .eq("enabled", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error(`[RoomPortals] getRoomPortals for "${sourceRoomSlug}" error:`, error.message);
      } else if (data && data.length > 0) {
        return data.map(mapRowToPortal);
      }
    } catch (err) {
      console.error(`[RoomPortals] getRoomPortals exception:`, err);
    }
  }

  // Fallback to in-memory store
  return inMemoryPortals.filter(
    (p) => p.sourceRoomSlug === sourceRoomSlug && p.enabled
  );
}

export async function getAllRoomPortals(): Promise<RoomPortal[]> {
  if (isDatabaseEnabled()) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("tank_room_portals")
        .select("*")
        .order("source_room_slug", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("[RoomPortals] getAllRoomPortals error:", error.message);
      } else if (data && data.length > 0) {
        return data.map(mapRowToPortal);
      }
    } catch (err) {
      console.error("[RoomPortals] getAllRoomPortals exception:", err);
    }
  }

  return [...inMemoryPortals];
}

export async function saveRoomPortal(
  portal: Omit<RoomPortal, "id"> & { id?: string }
): Promise<RoomPortal> {
  const portalId = portal.id || `portal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: RoomPortal = {
    ...portal,
    id: portalId,
    enabled: portal.enabled ?? true,
  };

  if (isDatabaseEnabled()) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("tank_room_portals").upsert(
        {
          id: record.id,
          source_room_slug: record.sourceRoomSlug,
          source_camera_id: record.sourceCameraId || null,
          target_room_slug: record.targetRoomSlug,
          title: record.title,
          description: record.description || null,
          polygon: record.polygon,
          direction: record.direction || "forward",
          display_mode: record.displayMode || "invisible_hitbox",
          icon: record.icon || "door",
          enabled: record.enabled,
          sort_order: record.sortOrder ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error("[RoomPortals] Database upsert failed:", error.message);
        throw new Error(`Database save failed: ${error.message}`);
      }

      // Broadcast real-time update to all active viewers
      try {
        const channel = admin.channel("tank:portals:update");
        void channel.send({
          type: "broadcast",
          event: "portal_changed",
          payload: { portal: record },
        });
      } catch {}
    } catch (err) {
      console.error("[RoomPortals] Exception in saveRoomPortal:", err);
      throw err;
    }
  }

  // Update in-memory fallback store
  const existingIdx = inMemoryPortals.findIndex((p) => p.id === record.id);
  if (existingIdx >= 0) {
    inMemoryPortals[existingIdx] = record;
  } else {
    inMemoryPortals.push(record);
  }

  return record;
}

export async function deleteRoomPortal(portalId: string): Promise<boolean> {
  if (isDatabaseEnabled()) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("tank_room_portals").delete().eq("id", portalId);
      if (error) {
        console.error("[RoomPortals] Database delete failed:", error.message);
        throw new Error(`Database delete failed: ${error.message}`);
      }
      try {
        const channel = admin.channel("tank:portals:update");
        void channel.send({
          type: "broadcast",
          event: "portal_deleted",
          payload: { portalId },
        });
      } catch {}
    } catch (err) {
      console.error("[RoomPortals] Exception in deleteRoomPortal:", err);
      throw err;
    }
  }

  inMemoryPortals = inMemoryPortals.filter((p) => p.id !== portalId);
  return true;
}

function mapRowToPortal(row: any): RoomPortal {
  return {
    id: row.id,
    sourceRoomSlug: row.source_room_slug,
    sourceCameraId: row.source_camera_id ?? undefined,
    targetRoomSlug: row.target_room_slug,
    title: row.title,
    description: row.description ?? undefined,
    polygon: row.polygon as PortalPolygon,
    direction: row.direction ?? "forward",
    displayMode: row.display_mode ?? "ambient",
    icon: row.icon ?? "door",
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order ?? 0,
  };
}
