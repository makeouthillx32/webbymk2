import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
export type WatchMode = "director" | "room_direct";

export type HeartbeatResult = {
  success: boolean;
  earnedXp: number;
  earnedTokens: number;
  currentXp: number;
  currentTokens: number;
  currentLevel: number;
  levelUp: boolean;
  error?: string;
};

// NOTE: the re-export below aliases getLevelForXp as calculateLevelFromXp for
// other modules, but `export { X as Y }` creates no LOCAL binding — so calling
// calculateLevelFromXp inside this file was a ReferenceError on every watch
// heartbeat, the path that awards watch-time XP. Call getLevelForXp directly.
import {
  getLevelForXp,
  getXpFloorForLevel,
  getXpCeilForLevel,
} from "../xpLevels";

export {
  getLevelForXp as calculateLevelFromXp,
  getXpFloorForLevel as xpFloorForLevel,
};

// Ultra-slow balanced earn rates:
const DIRECTOR_XP_PER_SEC = 0.04; // ~2.4 XP/min (~144 XP/hr)
const ROOM_DIRECT_XP_PER_SEC = 0.08; // ~4.8 XP/min (~288 XP/hr)

const DIRECTOR_TOKENS_PER_SEC = 0.0005; // ~1.8 tokens/hr
const ROOM_DIRECT_TOKENS_PER_SEC = 0.001; // ~3.6 tokens/hr

export async function recordWatchHeartbeat(
  seconds: number,
  watchMode: WatchMode,
  roomId?: string,
): Promise<HeartbeatResult> {
  const safeSeconds = Math.min(Math.max(seconds, 1), 60); // Clamp between 1s and 60s per heartbeat to prevent tampering
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      earnedXp: 0,
      earnedTokens: 0,
      currentXp: 0,
      currentTokens: 0,
      currentLevel: 1,
      levelUp: false,
      error: "Authentication required for XP accrual.",
    };
  }

  const multiplier = watchMode === "room_direct" ? ROOM_DIRECT_XP_PER_SEC : DIRECTOR_XP_PER_SEC;
  const tokenMultiplier = watchMode === "room_direct" ? ROOM_DIRECT_TOKENS_PER_SEC : DIRECTOR_TOKENS_PER_SEC;

  const earnedXp = Math.round(safeSeconds * multiplier);
  const earnedTokens = Math.round(safeSeconds * tokenMultiplier * 10) / 10;

  const admin = createAdminClient();

  try {
    // 1. Fetch current profile
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("xp, level, tokens")
      .eq("user_id", user.id)
      .maybeSingle();

    const previousXp = profile?.xp ?? 0;
    const previousTokens = profile?.tokens ?? 0;
    const previousLevel = getLevelForXp(previousXp);

    const newXp = previousXp + earnedXp;
    const newTokens = previousTokens + earnedTokens;
    const newLevel = getLevelForXp(newXp);
    const levelUp = newLevel > previousLevel;

    // 2. Upsert updated profile stats
    await admin.from("tank_profiles").upsert(
      {
        user_id: user.id,
        xp: newXp,
        tokens: newTokens,
        level: newLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    // 3. Update mission progress if any active missions relate to watching
    try {
      const { data: activeMissions } = await admin
        .from("tank_missions")
        .select("id, target_count")
        .eq("is_active", true);

      if (activeMissions && activeMissions.length > 0) {
        for (const mission of activeMissions) {
          const { data: progressRow } = await admin
            .from("tank_mission_progress")
            .select("progress, completed_at")
            .eq("user_id", user.id)
            .eq("mission_id", mission.id)
            .maybeSingle();

          if (!progressRow?.completed_at) {
            const nextProgress = (progressRow?.progress ?? 0) + safeSeconds;
            const isCompleted = nextProgress >= mission.target_count;
            await admin.from("tank_mission_progress").upsert(
              {
                user_id: user.id,
                mission_id: mission.id,
                progress: nextProgress,
                completed_at: isCompleted ? new Date().toISOString() : null,
              },
              { onConflict: "user_id,mission_id" },
            );
          }
        }
      }
    } catch {}

    return {
      success: true,
      earnedXp,
      earnedTokens,
      currentXp: newXp,
      currentTokens: newTokens,
      currentLevel: newLevel,
      levelUp,
    };
  } catch (err: any) {
    return {
      success: false,
      earnedXp: 0,
      earnedTokens: 0,
      currentXp: 0,
      currentTokens: 0,
      currentLevel: 1,
      levelUp: false,
      error: err?.message || "Failed to record watch heartbeat.",
    };
  }
}
