"use server";

// Tank Drops — watch-to-earn campaigns.
//
// Scoped-down slice of the full Kick-style vision: a producer defines a
// campaign (title, optional room target, tiered rewards, optional time
// window), viewers accrue watch-seconds toward it via the existing
// /api/tank/watch/heartbeat pipeline (see watchTimeAccrual.ts — its roomId
// param was accepted but never used before this), and claim tiered rewards
// once eligible. No auto-claim: a viewer has to press claim, matching the
// "glowing CLAIM button" moment from the spec rather than a silent grant.
//
// Deliberately NOT built here: cross-zone rewards (shop vouchers, blog
// unlocks — those live in other zones' code and are a separate pass), and
// the external partner/webhook portal.

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import type { DropCampaign, DropCampaignWithProgress, DropTier } from "../dropCampaignTypes";

function rowToCampaign(row: any): DropCampaign {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    roomKey: row.room_key,
    tiers: Array.isArray(row.tiers) ? row.tiers : [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function isWithinWindow(campaign: DropCampaign, now: Date): boolean {
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return false;
  if (campaign.endsAt && new Date(campaign.endsAt) < now) return false;
  return true;
}

// Not a discriminated union on purpose — `error` is a plain optional field
// on one shape rather than split across `{ok:true}|{ok:false}` branches, so
// every caller can read `auth.error` right after `if (!auth.ok)` with no
// narrowing required.
async function requireStaffRole(): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") return { ok: false, error: "Staff only." };
  return { ok: true, userId: user.id };
}

/**
 * Bumps every currently-eligible campaign's watch-seconds for one user by
 * one heartbeat's worth of seconds. Called from recordWatchHeartbeat() on
 * every /api/tank/watch/heartbeat tick — same trust boundary (seconds is
 * already clamped 1-60 by the caller), so no extra clamping here.
 */
export async function accrueDropProgress(userId: string, roomId: string | undefined, seconds: number): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: campaigns } = await admin
      .from("tank_drop_campaigns")
      .select("*")
      .eq("is_active", true);
    if (!campaigns || campaigns.length === 0) return;

    const now = new Date();
    const eligible = campaigns
      .map(rowToCampaign)
      .filter((c) => (!c.roomKey || c.roomKey === roomId) && isWithinWindow(c, now));
    if (eligible.length === 0) return;

    const ids = eligible.map((c) => c.id);
    const { data: existingRows } = await admin
      .from("tank_drop_progress")
      .select("campaign_id, seconds_watched")
      .eq("user_id", userId)
      .in("campaign_id", ids);
    const existingByCampaign = new Map((existingRows ?? []).map((r) => [r.campaign_id, r.seconds_watched]));

    await Promise.all(
      eligible.map((c) =>
        admin.from("tank_drop_progress").upsert(
          {
            campaign_id: c.id,
            user_id: userId,
            seconds_watched: (existingByCampaign.get(c.id) ?? 0) + seconds,
            updated_at: now.toISOString(),
          },
          { onConflict: "campaign_id,user_id" },
        ),
      ),
    );
  } catch {
    // Drops are a bonus layer on top of the real watch-time XP/token award
    // in recordWatchHeartbeat() — never let this fail the heartbeat itself.
  }
}

/** Active campaigns (matching roomId or global) with the caller's own progress, if signed in. */
export async function getActiveDropCampaigns(roomId?: string): Promise<DropCampaignWithProgress[]> {
  const admin = createAdminClient();
  const { data: campaigns } = await admin.from("tank_drop_campaigns").select("*").eq("is_active", true);
  if (!campaigns || campaigns.length === 0) return [];

  const now = new Date();
  const eligible = campaigns
    .map(rowToCampaign)
    .filter((c) => (!c.roomKey || c.roomKey === roomId) && isWithinWindow(c, now));
  if (eligible.length === 0) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let progressByCampaign = new Map<string, { seconds_watched: number; claimed_tiers: number[] }>();
  if (user) {
    const { data: progressRows } = await admin
      .from("tank_drop_progress")
      .select("campaign_id, seconds_watched, claimed_tiers")
      .eq("user_id", user.id)
      .in("campaign_id", eligible.map((c) => c.id));
    progressByCampaign = new Map(
      (progressRows ?? []).map((r) => [r.campaign_id, { seconds_watched: r.seconds_watched, claimed_tiers: r.claimed_tiers ?? [] }]),
    );
  }

  return eligible.map((c) => {
    const progress = progressByCampaign.get(c.id);
    return {
      ...c,
      secondsWatched: progress?.seconds_watched ?? 0,
      claimedTiers: progress?.claimed_tiers ?? [],
    };
  });
}

/** Claims one tier's reward. Grants tokens/XP/item and marks the tier claimed. */
export async function claimDropTier(
  campaignId: string,
  tierIndex: number,
): Promise<{ success: boolean; error?: string; reward?: DropTier }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  const { data: campaignRow } = await admin
    .from("tank_drop_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow) return { success: false, error: "Campaign not found." };
  const campaign = rowToCampaign(campaignRow);
  if (!campaign.isActive || !isWithinWindow(campaign, new Date())) {
    return { success: false, error: "This drop campaign is no longer active." };
  }
  const tier = campaign.tiers[tierIndex];
  if (!tier) return { success: false, error: "Unknown tier." };

  const { data: progressRow } = await admin
    .from("tank_drop_progress")
    .select("seconds_watched, claimed_tiers")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  const secondsWatched = progressRow?.seconds_watched ?? 0;
  const claimedTiers: number[] = progressRow?.claimed_tiers ?? [];

  if (secondsWatched < tier.minutes * 60) {
    return { success: false, error: `Not eligible yet — needs ${tier.minutes} minutes watched.` };
  }
  if (claimedTiers.includes(tierIndex)) {
    return { success: false, error: "Already claimed." };
  }

  try {
    // Both branches route through the centralized, idempotent reward/grant
    // boundary (tank_grant_reward / tank_grant_inventory_item — Tavern Phase
    // 0) instead of a manual select-then-upsert. The old tokens branch here
    // double-applied every token reward: it directly UPDATEd
    // tank_profiles.tokens AND inserted into tank_token_transactions, whose
    // own AFTER INSERT trigger applies the same delta again. Real bug, live
    // since Drops shipped — this claim call is the fix, not just prep for
    // Tavern. The idempotency key is per (campaign, tier, user) so a retried
    // claim request can never grant a second copy/payout.
    const idempotencyKey = `drop:${campaign.id}:${tierIndex}:${user.id}`;
    if (tier.rewardType === "item" && tier.itemSlug) {
      const grantResult = await admin.rpc("tank_grant_inventory_item", {
        p_user_id: user.id,
        p_item_slug: tier.itemSlug,
        p_quantity: 1,
        p_source: "drop",
        p_source_id: campaign.id,
        p_idempotency_key: idempotencyKey,
      });
      if (grantResult.error || !grantResult.data?.success) {
        return { success: false, error: grantResult.data?.error || grantResult.error?.message || "Failed to grant item." };
      }
    } else if ((tier.rewardType === "tokens" || tier.rewardType === "xp") && tier.rewardValue) {
      const grantResult = await admin.rpc("tank_grant_reward", {
        p_user_id: user.id,
        p_base_amount: tier.rewardValue,
        p_currency: tier.rewardType,
        p_source: "drop",
        p_source_id: campaign.id,
        p_shift_id: null,
        p_idempotency_key: idempotencyKey,
      });
      if (grantResult.error || !grantResult.data?.success) {
        return { success: false, error: grantResult.data?.error || grantResult.error?.message || "Failed to grant reward." };
      }
    }

    await admin.from("tank_drop_progress").upsert(
      {
        campaign_id: campaignId,
        user_id: user.id,
        seconds_watched: secondsWatched,
        claimed_tiers: [...claimedTiers, tierIndex],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id,user_id" },
    );

    return { success: true, reward: tier };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to claim drop." };
  }
}

// ── Producer/admin management (admin or moderator only) ─────────────────────

/** All campaigns, active or not — for the producer's management view. */
export async function listAllDropCampaignsAction(): Promise<DropCampaign[] | { error: string }> {
  const auth = await requireStaffRole();
  if (!auth.ok) return { error: auth.error ?? "Staff only." };
  const admin = createAdminClient();
  const { data } = await admin.from("tank_drop_campaigns").select("*").order("created_at", { ascending: false });
  return (data ?? []).map(rowToCampaign);
}

export async function createDropCampaignAction(input: {
  title: string;
  description?: string;
  roomKey?: string | null;
  tiers: DropTier[];
  durationMinutes?: number; // convenience for flash drops — sets endsAt = now + durationMinutes
}): Promise<{ success: boolean; error?: string; campaign?: DropCampaign }> {
  const auth = await requireStaffRole();
  if (!auth.ok) return { success: false, error: auth.error ?? "Staff only." };
  if (!input.title.trim()) return { success: false, error: "Title is required." };
  if (!input.tiers || input.tiers.length === 0) return { success: false, error: "At least one tier is required." };

  const admin = createAdminClient();
  const endsAt = input.durationMinutes
    ? new Date(Date.now() + input.durationMinutes * 60_000).toISOString()
    : null;

  const { data, error } = await admin
    .from("tank_drop_campaigns")
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      room_key: input.roomKey || null,
      tiers: input.tiers,
      ends_at: endsAt,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) return { success: false, error: error?.message || "Failed to create campaign." };
  return { success: true, campaign: rowToCampaign(data) };
}

export async function setDropCampaignActiveAction(
  campaignId: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireStaffRole();
  if (!auth.ok) return { success: false, error: auth.error ?? "Staff only." };
  const admin = createAdminClient();
  const { error } = await admin.from("tank_drop_campaigns").update({ is_active: isActive }).eq("id", campaignId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteDropCampaignAction(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireStaffRole();
  if (!auth.ok) return { success: false, error: auth.error ?? "Staff only." };
  const admin = createAdminClient();
  const { error } = await admin.from("tank_drop_campaigns").delete().eq("id", campaignId);
  return error ? { success: false, error: error.message } : { success: true };
}
