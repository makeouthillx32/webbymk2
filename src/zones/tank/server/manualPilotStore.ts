// src/zones/tank/server/manualPilotStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank Manual Pilot Operator Lease & Lock Store
//
// Ensures only ONE admin controls the manual pilot at a time, tracks connection
// types (browser_web, touchdesigner, osc, gamepad), enforces an 8s auto-renew
// heartbeat lease, and synchronizes real-time PTZ coordinates to the platform.
// ─────────────────────────────────────────────────────────────────────────────

import type { VirtualPtzState } from "../director-configuration/components/NavigationController";
import { createAdminClient } from "@/utils/supabase/admin";

export type PilotConnectionType = "browser_web" | "touchdesigner" | "osc" | "gamepad";

export type ManualPilotLease = {
  pilotUser: string;
  pilotId: string;
  connectionType: PilotConnectionType;
  claimedAt: number;
  lastHeartbeat: number;
  expiresAt: number;
  activeCameraId: string;
  activeRoomKey: string;
  ptzState: VirtualPtzState;
};

export const PILOT_LEASE_TTL_MS = 8000; // 8 second heartbeat lease timeout

const MANUAL_PILOT_SETTING_KEY = "director_manual_pilot_lease";

function parsePilotLease(value: unknown): ManualPilotLease | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lease = value as Partial<ManualPilotLease>;
  if (
    typeof lease.pilotUser !== "string" ||
    typeof lease.pilotId !== "string" ||
    typeof lease.connectionType !== "string" ||
    typeof lease.claimedAt !== "number" ||
    typeof lease.lastHeartbeat !== "number" ||
    typeof lease.expiresAt !== "number" ||
    typeof lease.activeCameraId !== "string" ||
    typeof lease.activeRoomKey !== "string" ||
    !lease.ptzState ||
    typeof lease.ptzState !== "object"
  ) {
    return null;
  }
  return lease as ManualPilotLease;
}

/**
 * Returns the currently active, valid pilot lease, or null if expired or idle.
 */
export async function getActivePilotLease(): Promise<ManualPilotLease | null> {
  const lease = await getStoredPilotLease();
  if (!lease || Date.now() > lease.expiresAt) return null;
  return lease;
}

async function getStoredPilotLease(): Promise<ManualPilotLease | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", MANUAL_PILOT_SETTING_KEY)
    .maybeSingle();

  if (error) throw error;
  return parsePilotLease(data?.value);
}

export type ClaimPilotRequest = {
  pilotUser: string;
  pilotId: string;
  connectionType: PilotConnectionType;
  activeCameraId: string;
  activeRoomKey: string;
  ptzState?: Partial<VirtualPtzState>;
  forceTakeover?: boolean;
};

export type ClaimPilotResult = {
  success: boolean;
  lease: ManualPilotLease | null;
  activePilot: ManualPilotLease | null;
  isOwner: boolean;
  message: string;
};

/**
 * Claims or renews the manual pilot control lease for an admin session.
 */
export async function claimOrRenewPilotLease(req: ClaimPilotRequest): Promise<ClaimPilotResult> {
  const now = Date.now();
  const stored = await getStoredPilotLease();
  const existing = stored && stored.expiresAt >= now ? stored : null;

  const defaultPtz: VirtualPtzState = {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
    speedMode: "fine",
  };

  const nextPtz: VirtualPtzState = {
    ...defaultPtz,
    ...(existing?.ptzState || {}),
    ...(req.ptzState || {}),
  };

  // If another admin currently holds a valid lease and this isn't a forced takeover
  if (existing && existing.pilotId !== req.pilotId && !req.forceTakeover) {
    return {
      success: false,
      lease: null,
      activePilot: existing,
      isOwner: false,
      message: `Manual Pilot currently locked by ${existing.pilotUser} (${existing.connectionType})`,
    };
  }

  // Grant or renew the lease
  const lease: ManualPilotLease = {
    pilotUser: req.pilotUser || "Admin",
    pilotId: req.pilotId,
    connectionType: req.connectionType || "browser_web",
    claimedAt: existing?.pilotId === req.pilotId ? existing.claimedAt : now,
    lastHeartbeat: now,
    expiresAt: now + PILOT_LEASE_TTL_MS,
    activeCameraId: req.activeCameraId,
    activeRoomKey: req.activeRoomKey,
    ptzState: nextPtz,
  };

  const admin = createAdminClient();
  const row = {
    key: MANUAL_PILOT_SETTING_KEY,
    value: lease,
    updated_at: new Date(now).toISOString(),
  };

  if (!stored) {
    const { error } = await admin.from("tank_platform_settings").insert(row);
    if (error) {
      const winner = await getActivePilotLease();
      if (winner && winner.pilotId !== req.pilotId && !req.forceTakeover) {
        return {
          success: false,
          lease: null,
          activePilot: winner,
          isOwner: false,
          message: `Manual Pilot currently locked by ${winner.pilotUser} (${winner.connectionType})`,
        };
      }
      throw error;
    }
  } else {
    let update = admin
      .from("tank_platform_settings")
      .update(row)
      .eq("key", MANUAL_PILOT_SETTING_KEY);
    if (!req.forceTakeover) {
      update = update.eq("value->>pilotId", stored.pilotId);
    }
    const { data, error } = await update.select("value").maybeSingle();
    if (error) throw error;
    if (!data) {
      const winner = await getActivePilotLease();
      return {
        success: false,
        lease: null,
        activePilot: winner,
        isOwner: false,
        message: winner
          ? `Manual Pilot currently locked by ${winner.pilotUser} (${winner.connectionType})`
          : "Manual Pilot changed owners; retry the claim.",
      };
    }
  }

  return {
    success: true,
    lease,
    activePilot: lease,
    isOwner: true,
    message: `Manual Pilot lock acquired by ${lease.pilotUser} via ${lease.connectionType}`,
  };
}

/**
 * Releases the manual pilot lock if owned by the requesting session.
 */
export async function releasePilotLease(pilotId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_platform_settings")
    .delete()
    .eq("key", MANUAL_PILOT_SETTING_KEY)
    .eq("value->>pilotId", pilotId)
    .select("key")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
