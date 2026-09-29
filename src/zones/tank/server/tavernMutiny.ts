"use server";

// Tank Tavern — mutiny votes. Starting one and casting a vote both derive
// the caller from auth.uid(), so both go through the request-scoped client:
// starting is an RPC (tank_start_tavern_mutiny — Click-membership check,
// self-target guard, one-open-mutiny-per-shift), casting a vote is a plain
// RLS-permitted insert (own-row INSERT policy; the (mutiny_id, user_id)
// primary key already stops a double vote — surfaced here as a friendly
// "already voted" instead of a raw 23505).

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TavernActionResult } from "../tavernTypes";
import { broadcastTavernEvent } from "./tavernSnapshot";

export async function startTavernMutinyAction(): Promise<TavernActionResult & { mutinyId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { data, error } = await supabase.rpc("tank_start_tavern_mutiny");
  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string; mutinyId?: string };
  if (!result.success) return { success: false, error: result.error ?? "Failed to start a mutiny." };

  await broadcastTavernEvent("mutiny_started", { mutinyId: result.mutinyId });
  return { success: true, mutinyId: result.mutinyId };
}

export async function castTavernMutinyVoteAction(
  mutinyId: string,
  choice: "overturn" | "defend",
): Promise<TavernActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (choice !== "overturn" && choice !== "defend") return { success: false, error: "Invalid vote." };

  const admin = createAdminClient();
  const { data: mutiny } = await admin
    .from("tank_tavern_mutinies")
    .select("status")
    .eq("id", mutinyId)
    .maybeSingle();
  if (!mutiny) return { success: false, error: "Mutiny not found." };
  if (mutiny.status !== "open") return { success: false, error: "Voting has closed on this mutiny." };

  const { error } = await supabase.from("tank_tavern_mutiny_votes").insert({
    mutiny_id: mutinyId,
    user_id: user.id,
    choice,
  });
  if (error) {
    if (error.code === "23505") return { success: false, error: "You already voted on this mutiny." };
    return { success: false, error: error.message };
  }
  return { success: true };
}
