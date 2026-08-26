/**
 * Tank Platform Daily Rewards, Prize Machine & Promo Code System
 */

export type PrizeWheelItem = {
  id: string;
  name: string;
  type: "item" | "tokens" | "xp";
  amount?: number;
  itemSlug?: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  weight: number;
};

export const PRIZE_WHEEL_DROPS: PrizeWheelItem[] = [
  {
    id: "drop_lightsaber",
    name: "Staff Lightsaber",
    type: "item",
    itemSlug: "lightsaber",
    icon: "🗡️",
    rarity: "legendary",
    weight: 5,
  },
  {
    id: "drop_nvg",
    name: "Night Vision Goggles",
    type: "item",
    itemSlug: "nvg",
    icon: "🥽",
    rarity: "rare",
    weight: 15,
  },
  {
    id: "drop_tokens_50",
    name: "50 Tokens Stash",
    type: "tokens",
    amount: 50,
    icon: "🪙",
    rarity: "rare",
    weight: 25,
  },
  {
    id: "drop_xp_150",
    name: "150 XP Surge",
    type: "xp",
    amount: 150,
    icon: "⚡",
    rarity: "common",
    weight: 35,
  },
  {
    id: "drop_tokens_15",
    name: "15 Pocket Tokens",
    type: "tokens",
    amount: 15,
    icon: "🪙",
    rarity: "common",
    weight: 20,
  },
];

export type SpinResult = {
  success: boolean;
  prize?: PrizeWheelItem;
  tokensCost?: number;
  error?: string;
};

export type CodeRedemptionResult = {
  success: boolean;
  message?: string;
  xpAwarded?: number;
  tokensAwarded?: number;
  itemAwarded?: string;
  error?: string;
};

const PROMO_CODES: Record<
  string,
  { xp: number; tokens: number; item?: string; label: string }
> = {
  UNENTER2026: { xp: 500, tokens: 100, item: "Founders Key", label: "Unenter 2026 Launch" },
  LAUNCH2026: { xp: 500, tokens: 100, item: "Founders Key", label: "Official Tank Launch" },
  DIRECTOR: { xp: 250, tokens: 50, label: "Director Access Perk" },
  CHATMASTER: { xp: 300, tokens: 75, item: "Trivia Master Badge", label: "Tank Chat Master Perk" },
  KICKTANK: { xp: 200, tokens: 50, label: "Community Promo" },
};

// In-memory tracking for fallback / local development sessions
const claimedCodesMemory = new Set<string>();
/**
 * Rolls RNG Prize Wheel with weighted drop table.
 */
export async function spinPrizeMachineAction(
  userId = "viewer-self",
  isFreeSpin = false,
): Promise<SpinResult> {
  const totalWeight = PRIZE_WHEEL_DROPS.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  let selectedPrize: PrizeWheelItem = PRIZE_WHEEL_DROPS[0];
  for (const item of PRIZE_WHEEL_DROPS) {
    if (random < item.weight) {
      selectedPrize = item;
      break;
    }
    random -= item.weight;
  }

  return {
    success: true,
    prize: selectedPrize,
    tokensCost: isFreeSpin ? 0 : 20,
  };
}

/**
 * Validates and redeems a promotional or streamer secret event code.
 */
export async function redeemSecretCodeAction(
  rawCode: string,
  userId = "viewer-self",
): Promise<CodeRedemptionResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { success: false, error: "Please enter a secret event code." };
  }

  const promo = PROMO_CODES[code];
  if (!promo) {
    return { success: false, error: "Invalid or expired secret code." };
  }

  const userKey = `${userId}:${code}`;
  if (claimedCodesMemory.has(userKey)) {
    return { success: false, error: "You have already redeemed this code." };
  }

  claimedCodesMemory.add(userKey);

  return {
    success: true,
    message: `Redeemed ${promo.label}!`,
    xpAwarded: promo.xp,
    tokensAwarded: promo.tokens,
    itemAwarded: promo.item,
  };
}
