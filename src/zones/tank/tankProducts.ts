// Plain data module (no "use server") so the client store UI can import the
// catalog directly — a "use server" file's exports must all be async
// functions, so this can't live in tankStore.ts alongside
// createTankPurchaseIntent.
export type TankProductKey =
  | "season_pass"
  | "season_pass_xl"
  | "tokens_500"
  | "tokens_1500"
  | "tokens_5000"
  | "room_vip"
  | "tank_bnb";

export type TankProduct = {
  key: TankProductKey;
  name: string;
  description: string;
  amountCents: number;
  tokens?: number; // present for token-pack products
  /** Present for pass products — which gate tier the buyer receives. */
  passTier?: "base" | "xl";
  /**
   * True for real-world items (Big Tanktoys) that staff must arrange.
   *
   * Nothing in the system can deliver a night in the house, so these must
   * never be auto-marked as delivered — payment only opens a booking that a
   * human still has to honour.
   */
  irlFulfilment?: boolean;
  /** Tokens included per month with a pass. Granted at most once per period. */
  monthlyTokens?: number;
};

export const TANK_PRODUCTS: Record<TankProductKey, TankProduct> = {
  season_pass: {
    key: "season_pass",
    name: "Season Pass",
    description: "Season perks, private rooms marked base, and a monthly token allowance.",
    amountCents: 999,
    passTier: "base",
    monthlyTokens: 100,
  },
  season_pass_xl: {
    key: "season_pass_xl",
    name: "Season Pass XL",
    description: "Everything in the Season Pass, every private room, and a much larger monthly token allowance.",
    amountCents: 3499,
    passTier: "xl",
    monthlyTokens: 350,
  },
  tokens_500: {
    key: "tokens_500",
    name: "₮500 Tank Tokens",
    description: "A quick top-up for Tank interactions.",
    amountCents: 499,
    tokens: 500,
  },
  tokens_1500: {
    key: "tokens_1500",
    name: "₮1,500 Tank Tokens",
    description: "Best value for regular TTS/SFX/RNG spend.",
    amountCents: 1299,
    tokens: 1500,
  },
  tokens_5000: {
    key: "tokens_5000",
    name: "₮5,000 Tank Tokens",
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
  tank_bnb: {
    key: "tank_bnb",
    name: "Tank B&B",
    description: "Stay at the house for a week. Booked with staff after payment.",
    amountCents: 250_000,
    irlFulfilment: true,
  },
};
