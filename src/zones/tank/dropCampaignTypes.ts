// src/zones/tank/dropCampaignTypes.ts
// Plain (non-"use server") types for Tank Drops — dropCampaigns.ts's "use
// server" directive requires every export to be an async function, so
// shared types live here instead and get imported by both the server
// actions and any client component that needs them. Same fix pattern as
// bazaarMarketData.ts for the Night Bazaar.

export type DropRewardType = "tokens" | "xp" | "item";

export type DropTier = {
  minutes: number;
  rewardType: DropRewardType;
  /** Token or XP amount. Ignored (and may be absent) when rewardType is "item". */
  rewardValue?: number;
  /** tank_inventory_items.slug. Only used when rewardType is "item". */
  itemSlug?: string;
  label: string;
};

export type DropCampaign = {
  id: string;
  key: string | null;
  title: string;
  description: string | null;
  roomKey: string | null;
  tiers: DropTier[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type DropCampaignWithProgress = DropCampaign & {
  secondsWatched: number;
  claimedTiers: number[];
};
