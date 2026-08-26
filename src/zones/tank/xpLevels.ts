// ─── TANK CANONICAL XP & LEVELING FORMULA (SINGLE SOURCE OF TRUTH) ──────────────
// 1 XP Metric used across Chat, Watch-time, Inventory, Store, and Missions.
// Formula: Level = floor(sqrt(XP / 100)) + 1
// Level 1: 0 - 99 XP
// Level 2: 100 - 399 XP
// Level 3: 400 - 899 XP
// Level 4: 900 - 1,599 XP (Clan Unlock)
// Level 5: 1,600 - 2,499 XP (Regular Rank)
// Level 10: 8,100 - 9,999 XP
// Level 15: 19,600 XP (VIP Rank)
// Level 30: 84,100+ XP (Legend Rank)

export type ChatRank = "Newbie" | "Regular" | "VIP" | "Legend";

/**
 * Returns the exact level for a given XP amount
 */
export function getLevelForXp(xp: number): number {
  if (!xp || xp <= 0) return 1;
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

/**
 * Returns the minimum XP required to reach a specific level
 */
export function getXpFloorForLevel(level: number): number {
  if (level <= 1) return 0;
  return 100 * Math.pow(level - 1, 2);
}

/**
 * Returns the XP ceiling to reach the next level
 */
export function getXpCeilForLevel(level: number): number {
  return 100 * Math.pow(Math.max(1, level), 2);
}

/**
 * Calculates current level progress as a percentage (0.0 to 100.0)
 */
export function getXpProgressPercent(xp: number): number {
  const currentLevel = getLevelForXp(xp);
  const floor = getXpFloorForLevel(currentLevel);
  const ceil = getXpCeilForLevel(currentLevel);
  const span = ceil - floor;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((xp - floor) / span) * 100));
}

/**
 * Maps a level to its rank title
 */
export function getRankForLevel(level: number): ChatRank {
  if (level >= 30) return "Legend";
  if (level >= 15) return "VIP";
  if (level >= 5) return "Regular";
  return "Newbie";
}
