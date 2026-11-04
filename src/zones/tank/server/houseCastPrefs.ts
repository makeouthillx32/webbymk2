// Which cast members are mirrored. Default: everyone with a sprite. Staff
// untick a member's sprite in the director console and that member is not
// tracked at all: the server never places, holds or broadcasts them.
//
// Stored as an opt-OUT list in tank_platform_settings so a new cast member is
// mirrored without anyone having to opt them in, and a missing row means "all".

import { CAST_RIGS } from "../vision/houseCast";

const SETTING_KEY = "house_cast_untracked";
const CACHE_MS = 5_000;

declare global {
  // eslint-disable-next-line no-var
  var __tankHouseCastUntracked: { ids: Set<string>; at: number } | undefined;
}

const clean = (raw: unknown): Set<string> =>
  new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id in CAST_RIGS) : []);

/** The stored opt-out list. Throws on a DB error (callers decide how to fail). */
async function readUntracked(): Promise<Set<string>> {
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { data, error } = await createAdminClient()
    .from("tank_platform_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return clean((data?.value as { ids?: unknown } | null)?.ids);
}

export async function loadUntrackedCast(now = Date.now()): Promise<Set<string>> {
  const cached = globalThis.__tankHouseCastUntracked;
  if (cached && now - cached.at < CACHE_MS) return cached.ids;
  try {
    const ids = await readUntracked();
    globalThis.__tankHouseCastUntracked = { ids, at: now };
    return ids;
  } catch {
    // Keep the last known list: a DB blip must never switch tracking back ON
    // for someone who turned it off. With nothing known yet, fail closed to
    // "track nobody" for this tick and retry on the next.
    if (cached) return cached.ids;
    return new Set(Object.keys(CAST_RIGS));
  }
}

export async function setCastTracked(id: string, tracked: boolean): Promise<string[]> {
  if (!(id in CAST_RIGS)) throw new Error(`Unknown cast member: ${id}`);
  // Read fresh, and let a failed read fail the write: never persist a list
  // built from the fail-closed fallback.
  const current = await readUntracked();
  if (tracked) current.delete(id);
  else current.add(id);
  const ids = [...current].sort();
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { error } = await createAdminClient()
    .from("tank_platform_settings")
    .upsert({ key: SETTING_KEY, value: { ids }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  globalThis.__tankHouseCastUntracked = { ids: new Set(ids), at: Date.now() };
  return ids;
}
