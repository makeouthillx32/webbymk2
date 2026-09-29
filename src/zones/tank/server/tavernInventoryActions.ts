"use server";

// Tank Tavern — Apron Snatcher use. tank_use_apron_snatcher derives the
// caller from auth.uid() internally (per the spec), so this MUST go through
// the request-scoped client — never createAdminClient(), where auth.uid()
// is NULL and the RPC always fails closed. Every other Tavern RPC in this
// feature takes an explicit p_user_id and is called via the admin client;
// this is the one deliberate exception, flagged here and in the SQL file.

import { createClient } from "@/utils/supabase/server";
import type { TavernActionResult } from "../tavernTypes";
import { broadcastTavernEvent } from "./tavernSnapshot";

export async function useApronSnatcherAction(
  idempotencyKey: string,
): Promise<TavernActionResult & { newShiftId?: string; alreadyGranted?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (!idempotencyKey.trim()) return { success: false, error: "Missing request key." };

  const { data, error } = await supabase.rpc("tank_use_apron_snatcher", {
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string; newShiftId?: string; alreadyGranted?: boolean };
  if (!result.success) return { success: false, error: result.error ?? "Failed to snatch the Apron." };

  if (!result.alreadyGranted) {
    await broadcastTavernEvent("apron_snatched", { newShiftId: result.newShiftId });
  }
  return { success: true, newShiftId: result.newShiftId, alreadyGranted: result.alreadyGranted };
}
