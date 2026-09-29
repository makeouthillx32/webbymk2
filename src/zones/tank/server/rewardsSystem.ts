/**
 * Tank Platform Daily Rewards & Promo Code System
 *
 * The Prize Machine used to live here as a fully client-displayed spin with
 * no database writes at all — no auth check, no token deduction, no
 * inventory row, and a drop table referencing items ("Night Vision Goggles")
 * that never existed in tank_inventory_items. It's been replaced by the real,
 * DB-backed spinTankPrizeMachine in actions.ts, which is the one both
 * PrizeMachineModal and InventoryOverlay call now.
 */

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
