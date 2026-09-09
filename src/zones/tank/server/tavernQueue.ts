"use server";

// Tank Tavern — free FIFO queue to become the next Bartender. The join
// itself is an atomic RPC (tank_join_tavern_queue — nextval() + idempotent
// insert, race-free under concurrent joins); tank_tavern_queue has no
// user-facing INSERT policy at all, only own-row SELECT/DELETE (leave is a
// plain RLS-permitted delete via the request-scoped client).

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TavernActionResult, TavernQueueStatus } from "../tavernTypes";

async function isTavernEnabled(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin.from("tank_platform_settings").select("value").eq("key", "tank_tavern_enabled").maybeSingle();
  return (data?.value as { enabled?: boolean } | null)?.enabled === true;
}

export async function joinTavernQueueAction(): Promise<TavernActionResult & { position?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  if (!(await isTavernEnabled(admin))) return { success: false, error: "The Tavern isn't open yet." };

  const { data, error } = await supabase.rpc("tank_join_tavern_queue");
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; position?: number };
  return result.success
    ? { success: true, position: result.position }
    : { success: false, error: result.error ?? "Failed to join the queue." };
}

export async function leaveTavernQueueAction(): Promise<TavernActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { error } = await supabase.from("tank_tavern_queue").delete().eq("user_id", user.id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function getTavernQueueStatusAction(): Promise<TavernQueueStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { count } = await admin.from("tank_tavern_queue").select("*", { count: "exact", head: true });
  const queueLength = count ?? 0;

  if (!user) return { inQueue: false, position: null, queueLength };

  const { data: mine } = await supabase.from("tank_tavern_queue").select("position").eq("user_id", user.id).maybeSingle();
  return { inQueue: !!mine, position: mine?.position ?? null, queueLength };
}
