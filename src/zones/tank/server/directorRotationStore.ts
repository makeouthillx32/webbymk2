// src/zones/tank/server/directorRotationStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Durable storage for the rotation roster.
//
// Same shape as the operator-mode store next door, and for the same reason:
// the 24/7 director runs whether or not anybody has a browser open, so
// anything that steers it has to outlive the tab that set it.
//
// Stored in tank_platform_settings rather than its own table — it is one row
// of operator configuration, exactly like director_operator_mode, and it does
// not need a migration to exist.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/utils/supabase/admin";
import {
  EMPTY_ROTATION_ROSTER,
  sanitizeRotationRoster,
  type RotationRoster,
} from "./rotationRoster";

const SETTINGS_KEY = "director_rotation_roster";

/**
 * Short, because the engine reads this on its tick and an operator who edits
 * the roster expects the rotation to follow within a few seconds — not at the
 * next process restart.
 */
const ROSTER_CACHE_MS = 5_000;

let g_roster: RotationRoster = { ...EMPTY_ROTATION_ROSTER };
let g_rosterLoadedAt = 0;
let g_rosterLoadPromise: Promise<RotationRoster> | null = null;

/**
 * The last known roster, without touching the database.
 *
 * For the engine's hot path. Returns the default roster before the first load,
 * which means "rotate every live camera" — the behaviour rotation had before
 * rosters existed, and a safe thing to do while the real one is in flight.
 */
export function getRotationRoster(): RotationRoster {
  return g_roster;
}

export async function loadRotationRosterFromDb(force = false): Promise<RotationRoster> {
  const now = Date.now();
  if (!force && g_rosterLoadedAt > 0 && now - g_rosterLoadedAt < ROSTER_CACHE_MS) {
    return g_roster;
  }
  if (g_rosterLoadPromise) return g_rosterLoadPromise;

  g_rosterLoadPromise = (async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_platform_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      // Deliberately NOT thrown. This is read from the director's tick; a
      // transient database blip must not stop the programme from cutting. The
      // last known roster stays in force, and the next tick tries again.
      console.warn(`[DirectorRotation] roster read failed: ${error.message}`);
      g_rosterLoadedAt = Date.now();
      return g_roster;
    }

    g_roster = sanitizeRotationRoster(data?.value ?? null);
    g_rosterLoadedAt = Date.now();
    return g_roster;
  })();

  try {
    return await g_rosterLoadPromise;
  } finally {
    g_rosterLoadPromise = null;
  }
}

export async function persistRotationRosterToDb(
  input: unknown,
  operator = "Operator",
): Promise<RotationRoster> {
  // Do not let an older in-flight read win the race after this write.
  if (g_rosterLoadPromise) {
    await g_rosterLoadPromise.catch(() => null);
  }

  const roster = sanitizeRotationRoster(input);
  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();

  const { error } = await admin.from("tank_platform_settings").upsert(
    {
      key: SETTINGS_KEY,
      value: { ...roster, operator, updatedAt },
      updated_at: updatedAt,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(`Failed to persist rotation roster: ${error.message}`);
  }

  // Cache updated only after the durable write succeeded, so a failed save can
  // never become the process-local truth.
  g_roster = roster;
  g_rosterLoadedAt = Date.now();
  return roster;
}
