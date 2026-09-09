"use server";

// Tank Tavern — resolving patron chits. All the atomicity (ownership check,
// one-shot consumption, chaos delta, reward grant) lives in
// tank_resolve_tavern_chit; this is a thin wrapper that must go through the
// request-scoped client since the RPC derives the caller from auth.uid().

import { createClient } from "@/utils/supabase/server";
import type { TavernActionResult } from "../tavernTypes";
import { broadcastTavernEvent } from "./tavernSnapshot";

export async function resolveTavernChitAction(
  chitId: string,
  responseKey: string,
): Promise<TavernActionResult & { outcome?: "served" | "failed" }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (!responseKey.trim()) return { success: false, error: "Pick a response first." };

  const { data, error } = await supabase.rpc("tank_resolve_tavern_chit", {
    p_chit_id: chitId,
    p_response_key: responseKey,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string; outcome?: "served" | "failed" };
  if (!result.success) return { success: false, error: result.error ?? "Failed to resolve order." };

  await broadcastTavernEvent("chit_resolved", { chitId, outcome: result.outcome });
  return { success: true, outcome: result.outcome };
}
