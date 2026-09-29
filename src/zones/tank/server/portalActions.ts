"use server";

// src/zones/tank/server/portalActions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Room Portal Server Actions for Control Plane & Viewer Plane
// ─────────────────────────────────────────────────────────────────────────────

import {
  getRoomPortals,
  getAllRoomPortals,
  saveRoomPortal,
  deleteRoomPortal,
} from "./roomPortalsCatalog";
import type { RoomPortal } from "../vision/portalGeometry";

export async function fetchPortalsForRoom(roomSlug: string): Promise<RoomPortal[]> {
  return getRoomPortals(roomSlug);
}

export async function fetchAllPortals(): Promise<RoomPortal[]> {
  return getAllRoomPortals();
}

export async function upsertPortal(
  portal: Omit<RoomPortal, "id"> & { id?: string }
): Promise<{ ok: boolean; portal?: RoomPortal; error?: string }> {
  try {
    const saved = await saveRoomPortal(portal);
    return { ok: true, portal: saved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function removePortal(portalId: string): Promise<{ ok: boolean }> {
  try {
    const ok = await deleteRoomPortal(portalId);
    return { ok };
  } catch {
    return { ok: false };
  }
}
