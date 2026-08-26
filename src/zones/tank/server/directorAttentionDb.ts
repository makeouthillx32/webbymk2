// src/zones/tank/server/directorAttentionDb.ts
// ─────────────────────────────────────────────────────────────────────────────
// Director Attention State Database & Realtime Store
//
// Manages moderator overrides for Director Attention locks in Supabase
// (stored in `tank_platform_settings` under key "director_attention").
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { DirectorAttentionLock } from "../director/directorMetrics";

const SETTING_KEY = "director_attention";

export const DEFAULT_DIRECTOR_ATTENTION: DirectorAttentionLock = {
  active: false,
  targetType: "room",
  targetId: "director",
  targetLabel: "Auto Director (House-Wide)",
  expiresAt: null,
  durationMinutes: "indefinite",
  lockedBy: "System",
  multiCameraMode: "audio_peak",
  startedAt: Date.now(),
};

/**
 * Retrieves the currently active Director Attention lock from Supabase.
 * Checks for expiration automatically.
 */
export async function getDirectorAttention(): Promise<DirectorAttentionLock> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (error || !data || !data.value) {
      return DEFAULT_DIRECTOR_ATTENTION;
    }

    const lock = data.value as DirectorAttentionLock;

    // Check if expired
    if (lock.active && lock.expiresAt && Date.now() > lock.expiresAt) {
      // Auto-clear expired lock asynchronously
      await releaseDirectorAttention("Timer Expired");
      return DEFAULT_DIRECTOR_ATTENTION;
    }

    return lock;
  } catch (err) {
    console.error("[DirectorAttentionDb] Failed to fetch director attention:", err);
    return DEFAULT_DIRECTOR_ATTENTION;
  }
}

/**
 * Request-independent read for the long-lived Director clock. The normal
 * getter intentionally uses the signed-in request client; a module timer has
 * no request cookies and must not try to manufacture that context.
 */
export async function getDirectorAttentionForWorker(): Promise<DirectorAttentionLock> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_platform_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (error || !data?.value) return DEFAULT_DIRECTOR_ATTENTION;
    const lock = data.value as DirectorAttentionLock;
    return lock.active && lock.expiresAt && Date.now() > lock.expiresAt
      ? DEFAULT_DIRECTOR_ATTENTION
      : lock;
  } catch (err) {
    console.error("[DirectorAttentionDb] Worker read failed:", err);
    return DEFAULT_DIRECTOR_ATTENTION;
  }
}

/**
 * Sets a new Director Attention lock.
 */
export async function setDirectorAttention(params: {
  targetType: "room" | "camera" | "irl";
  targetId: string;
  targetLabel: string;
  durationMinutes: number | "indefinite";
  operatorName: string;
  multiCameraMode?: "audio_peak" | "round_robin" | "fixed_primary";
}): Promise<{ success: boolean; lock: DirectorAttentionLock; error?: string }> {
  try {
    const now = Date.now();
    const expiresAt =
      params.durationMinutes === "indefinite"
        ? null
        : now + params.durationMinutes * 60 * 1000;

    const lock: DirectorAttentionLock = {
      active: true,
      targetType: params.targetType,
      targetId: params.targetId,
      targetLabel: params.targetLabel,
      expiresAt,
      durationMinutes: params.durationMinutes,
      lockedBy: params.operatorName,
      multiCameraMode: params.multiCameraMode ?? "audio_peak",
      startedAt: now,
    };

    const supabase = await createClient();
    const { error } = await supabase.from("tank_platform_settings").upsert(
      {
        key: SETTING_KEY,
        value: lock,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return { success: false, lock: DEFAULT_DIRECTOR_ATTENTION, error: error.message };
    }

    return { success: true, lock };
  } catch (err) {
    return {
      success: false,
      lock: DEFAULT_DIRECTOR_ATTENTION,
      error: err instanceof Error ? err.message : "Failed to set director attention",
    };
  }
}

/**
 * Releases the active Director Attention lock and returns to auto-director.
 */
export async function releaseDirectorAttention(
  operatorName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const lock: DirectorAttentionLock = {
      ...DEFAULT_DIRECTOR_ATTENTION,
      lockedBy: operatorName,
      startedAt: Date.now(),
    };

    const { error } = await supabase.from("tank_platform_settings").upsert(
      {
        key: SETTING_KEY,
        value: lock,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to release director attention",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Director Feed Priorities (IRL Cam & OBS Studio Auto-Switch Toggles)
// ─────────────────────────────────────────────────────────────────────────────

export type DirectorFeedPriorities = {
  irlPriority: boolean;
  obsPriority: boolean;
  autoSwitchOnLive: boolean;
  updatedAt?: number;
  updatedBy?: string;
};

export const DEFAULT_DIRECTOR_FEED_PRIORITIES: DirectorFeedPriorities = {
  irlPriority: true,
  obsPriority: true,
  autoSwitchOnLive: true,
  updatedAt: Date.now(),
  updatedBy: "System",
};

const PRIORITIES_SETTING_KEY = "director_feed_priorities";

export async function getDirectorFeedPriorities(): Promise<DirectorFeedPriorities> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", PRIORITIES_SETTING_KEY)
      .maybeSingle();

    if (error || !data || !data.value) {
      return DEFAULT_DIRECTOR_FEED_PRIORITIES;
    }

    return {
      ...DEFAULT_DIRECTOR_FEED_PRIORITIES,
      ...(data.value as Partial<DirectorFeedPriorities>),
    };
  } catch (err) {
    console.error("[DirectorAttentionDb] Failed to fetch director feed priorities:", err);
    return DEFAULT_DIRECTOR_FEED_PRIORITIES;
  }
}

export async function getDirectorFeedPrioritiesForWorker(): Promise<DirectorFeedPriorities> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_platform_settings")
      .select("value")
      .eq("key", PRIORITIES_SETTING_KEY)
      .maybeSingle();

    if (error || !data?.value) {
      return DEFAULT_DIRECTOR_FEED_PRIORITIES;
    }

    return {
      ...DEFAULT_DIRECTOR_FEED_PRIORITIES,
      ...(data.value as Partial<DirectorFeedPriorities>),
    };
  } catch (err) {
    console.error("[DirectorAttentionDb] Worker read for feed priorities failed:", err);
    return DEFAULT_DIRECTOR_FEED_PRIORITIES;
  }
}

export async function setDirectorFeedPriorities(
  updates: Partial<DirectorFeedPriorities>,
  operatorName = "Operator"
): Promise<{ success: boolean; priorities: DirectorFeedPriorities; error?: string }> {
  try {
    const current = await getDirectorFeedPriorities();
    const next: DirectorFeedPriorities = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
      updatedBy: operatorName,
    };

    const supabase = await createClient();
    const { error } = await supabase.from("tank_platform_settings").upsert(
      {
        key: PRIORITIES_SETTING_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return { success: false, priorities: current, error: error.message };
    }

    return { success: true, priorities: next };
  } catch (err) {
    return {
      success: false,
      priorities: DEFAULT_DIRECTOR_FEED_PRIORITIES,
      error: err instanceof Error ? err.message : "Failed to set director feed priorities",
    };
  }
}

