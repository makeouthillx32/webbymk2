// Plain data module (no "use server") — Bazaar market types and fallback
// stats. Moved out of server/bazaarActions.ts: that file has "use server"
// at the top, which requires every export to be an async function, and
// DEFAULT_MARKET_STATS is a plain const array. Crashed every request in
// prod ("A 'use server' file can only export async functions, found
// object.") the moment bazaarActions.ts shipped — see clanData.ts and
// tankProducts.ts for the same split done earlier for the same reason.

import type { ItemRarity } from "./itemRarity";

export type MarketListingView = {
  id: string;
  sellerUserId: string;
  sellerName: string;
  itemId: string;
  itemSlug: string;
  itemName: string;
  itemIconUrl: string;
  itemRarity: ItemRarity;
  quantity: number;
  startBid: number;
  currentBid: number | null;
  highestBidderUserId: string | null;
  highestBidderName?: string | null;
  buyoutPrice: number | null;
  status: "active" | "sold" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
};

export type MarketItemStat = {
  slug: string;
  name: string;
  iconUrl: string;
  rarity: ItemRarity;
  highPrice: number;
  lowPrice: number;
  avgPrice: number;
  amountSold: number;
};

// Fallback historical benchmark stats for all catalog items (derived from stream economy lore)
export const DEFAULT_MARKET_STATS: MarketItemStat[] = [
  { slug: "foot-detector", name: "Foot-Detector 3000", iconUrl: "/images/tank-items/foot-detector.png", rarity: "legendary", highPrice: 4000, lowPrice: 150, avgPrice: 850, amountSold: 1405 },
  { slug: "royal-jelly", name: "Royal Jelly", iconUrl: "/images/tank-items/royal-jelly.png", rarity: "legendary", highPrice: 1800, lowPrice: 80, avgPrice: 320, amountSold: 1178 },
  { slug: "deed-to-tank", name: "Deed to Tank", iconUrl: "/images/tank-items/deed-to-tank.png", rarity: "mythic", highPrice: 9999, lowPrice: 2500, avgPrice: 4500, amountSold: 42 },
  { slug: "lightsaber", name: "Sword Toy", iconUrl: "/images/tank-items/lightsaber.png", rarity: "rare", highPrice: 1000, lowPrice: 20, avgPrice: 125, amountSold: 2703 },
  { slug: "launch-keys", name: "Launch Keys", iconUrl: "/images/tank-items/launch-keys.png", rarity: "rare", highPrice: 1600, lowPrice: 45, avgPrice: 190, amountSold: 2287 },
  { slug: "duck-toy", name: "Duck Toy", iconUrl: "/images/tank-items/battery.png", rarity: "common", highPrice: 80, lowPrice: 5, avgPrice: 25, amountSold: 3450 },
  { slug: "pumpkin", name: "Pumpkin", iconUrl: "/images/tank-items/fucked-up-shit.png", rarity: "uncommon", highPrice: 150, lowPrice: 10, avgPrice: 45, amountSold: 1890 },
  { slug: "didgeridoo", name: "Didgeridoo", iconUrl: "/images/tank-items/didgeridoo.png", rarity: "rare", highPrice: 500, lowPrice: 25, avgPrice: 95, amountSold: 1062 },
  { slug: "battery", name: "Batteries", iconUrl: "/images/tank-items/battery.png", rarity: "common", highPrice: 45, lowPrice: 2, avgPrice: 12, amountSold: 5120 },
  { slug: "love-letter", name: "Simple Love Letter", iconUrl: "/images/tank-items/love-letter.png", rarity: "uncommon", highPrice: 120, lowPrice: 5, avgPrice: 30, amountSold: 1650 },
  { slug: "boxing-gloves", name: "Boxing Gloves", iconUrl: "/images/tank-items/boxing-gloves.png", rarity: "uncommon", highPrice: 180, lowPrice: 15, avgPrice: 55, amountSold: 1420 },
  { slug: "broken-monitor", name: "Broken CRT Monitor", iconUrl: "/images/tank-items/broken-monitor.png", rarity: "rare", highPrice: 360, lowPrice: 30, avgPrice: 85, amountSold: 1741 },
];
