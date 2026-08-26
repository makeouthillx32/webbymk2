// Plain data module (no "use server") so the client store UI can import the
// catalog directly — a "use server" file's exports must all be async
// functions, so this can't live in tankStore.ts alongside
// createTankPurchaseIntent.
export type TankProductKey =
  | "season_pass"
  | "tokens_500"
  | "tokens_1500"
  | "tokens_5000"
  | "room_vip";

export type TankProduct = {
  key: TankProductKey;
  name: string;
  description: string;
  amountCents: number;
  tokens?: number; // present for token-pack products
};

export const TANK_PRODUCTS: Record<TankProductKey, TankProduct> = {
  season_pass: {
    key: "season_pass",
    name: "Season Pass",
    description: "Unlocks Season perks for the current season.",
    amountCents: 999,
  },
  tokens_500: {
    key: "tokens_500",
    name: "500 Tokens",
    description: "A small top-up of endgame currency.",
    amountCents: 499,
    tokens: 500,
  },
  tokens_1500: {
    key: "tokens_1500",
    name: "1,500 Tokens",
    description: "Best value for regular TTS/SFX/RNG spend.",
    amountCents: 1299,
    tokens: 1500,
  },
  tokens_5000: {
    key: "tokens_5000",
    name: "5,000 Tokens",
    description: "For the heavy spenders.",
    amountCents: 3999,
    tokens: 5000,
  },
  room_vip: {
    key: "room_vip",
    name: "VIP Room Access",
    description: "Placeholder — actual room-tier gating isn't designed yet, this just proves the purchase path end to end.",
    amountCents: 1999,
  },
};
