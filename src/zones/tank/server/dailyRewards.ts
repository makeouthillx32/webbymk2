"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { resolveDailyStreakWindow } from "./dailyStreakPolicy";

export type DailyClaimStatus = {
  signedIn: boolean;
  currentStreak: number;
  longestStreak: number;
  totalClaims: number;
  canClaim: boolean;
  nextClaimAt: string | null;
  streakExpiresAt: string | null;
  secondsUntilClaim: number;
};

export type DailyClaimResult = {
  success: boolean;
  xpAwarded?: number;
  tokensAwarded?: number;
  streakDays?: number;
  longestStreak?: number;
  totalClaims?: number;
  nextClaimAt?: string | null;
  streakExpiresAt?: string | null;
  nextClaimInHours?: number;
  error?: string;
};

type DailyClaimRpcPayload = {
  success?: boolean;
  error?: string;
  streak_day?: number;
  longest_streak?: number;
  total_claims?: number;
  xp_gained?: number;
  tokens_gained?: number;
  next_claim_at?: string;
  streak_expires_at?: string;
  next_claim_in_seconds?: number;
};

function positiveInteger(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export async function getDailyClaimStatusAction(): Promise<DailyClaimStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      signedIn: false,
      currentStreak: 0,
      longestStreak: 0,
      totalClaims: 0,
      canClaim: false,
      nextClaimAt: null,
      streakExpiresAt: null,
      secondsUntilClaim: 0,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_profiles")
    .select("daily_streak, longest_daily_streak, daily_claim_count, last_daily_claim_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  const window = resolveDailyStreakWindow(
    data?.last_daily_claim_at,
    positiveInteger(data?.daily_streak),
  );

  return {
    signedIn: true,
    currentStreak: window.currentStreak,
    longestStreak: positiveInteger(data?.longest_daily_streak),
    totalClaims: positiveInteger(data?.daily_claim_count),
    canClaim: window.canClaim,
    nextClaimAt: window.nextClaimAt,
    streakExpiresAt: window.streakExpiresAt,
    secondsUntilClaim: window.secondsUntilClaim,
  };
}

export async function claimDailyRewardsAction(): Promise<DailyClaimResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in to claim your daily reward." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("tank_claim_daily_streak", {
    p_user_id: user.id,
  });
  if (error) return { success: false, error: error.message };

  const payload = (data ?? {}) as DailyClaimRpcPayload;
  const remainingSeconds = positiveInteger(payload.next_claim_in_seconds);

  return {
    success: payload.success === true,
    xpAwarded: positiveInteger(payload.xp_gained),
    tokensAwarded: positiveInteger(payload.tokens_gained),
    streakDays: positiveInteger(payload.streak_day),
    longestStreak: positiveInteger(payload.longest_streak),
    totalClaims: positiveInteger(payload.total_claims),
    nextClaimAt: payload.next_claim_at ?? null,
    streakExpiresAt: payload.streak_expires_at ?? null,
    nextClaimInHours: remainingSeconds > 0 ? Math.ceil(remainingSeconds / 3600) : undefined,
    error: payload.error,
  };
}
