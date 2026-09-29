import { createAdminClient } from "@/utils/supabase/admin";
import { applyDirectorItemOverride } from "./directorPolicyHierarchy";
import { tryFireOverlayFx } from "./overlayFxStore";
import type { ChatMessage, ChatMessageType } from "../contracts";
import type { ItemRarity } from "../itemRarity";
import { TANK_ITEM_CATALOG, TANK_ITEM_ICONS, getTankItemIcon } from "../tankItemCatalog";

export type ItemActionDefinition = {
  slug: string;
  name: string;
  iconUrl: string;
  actionText: string;
  rewardXp: number;
  rewardTokens: number;
  /**
   * Mirrors tank_inventory_items.rarity. Kept here so the chat card can be
   * coloured without a database round trip on every item use — the DB stays
   * the source of truth for the catalogue, this is the render hint.
   */
  rarity: ItemRarity;
};

export const ITEM_ACTION_DEFINITIONS: Record<string, ItemActionDefinition> = {
  "pet-whistle": {
    slug: "pet-whistle",
    rarity: "rare",
    name: "Pet Whistle",
    iconUrl: "/images/tank-items/pet-whistle.png",
    actionText: "blows a high-frequency pet whistle! Director switches to Animals & Pets Mode for 45s! 🐾",
    rewardXp: 50,
    rewardTokens: 30,
  },
  "cat-laser": {
    slug: "cat-laser",
    rarity: "rare",
    name: "Cat Laser Pointer",
    iconUrl: "/images/tank-items/lightsaber.png",
    actionText: "shines a dancing red laser dot across the room! Mochi & Buster are tracking it! 🔴",
    rewardXp: 45,
    rewardTokens: 25,
  },
  "pumpkin": {
    slug: "pumpkin",
    rarity: "uncommon",
    name: "Pumpkin",
    iconUrl: "/images/tank-items/fucked-up-shit.png",
    actionText: "lands a devastating kick on their pumpkin! Orange goo and seeds go flying!!!",
    rewardXp: 40,
    rewardTokens: 25,
  },
  "launch-keys": {
    slug: "launch-keys",
    rarity: "rare",
    name: "Launch Keys",
    iconUrl: "/images/tank-items/launch-keys.png",
    actionText: "inserts dual launch keys into the console and arms the house event trigger!",
    rewardXp: 50,
    rewardTokens: 30,
  },
  // Chaos items — the use effect is the overlay fx (see overlayFxStore); the
  // actionText is what the chat card says while the overlays re-skin.
  "chrome-spray": {
    slug: "chrome-spray",
    rarity: "rare",
    name: "Chrome Spray Paint",
    iconUrl: "/images/tank-items/battery.png",
    actionText: "spray-paints the console chrome! The overlays go full brushed aluminium! 🎨",
    rewardXp: 25,
    rewardTokens: 10,
  },
  "welding-torch": {
    slug: "welding-torch",
    rarity: "epic",
    name: "Welding Torch",
    iconUrl: "/images/tank-items/lightsaber.png",
    actionText: "welds a riveted plate over the overlays! Heavy metal on air! 🔥",
    rewardXp: 40,
    rewardTokens: 20,
  },
  "grease-gun": {
    slug: "grease-gun",
    rarity: "uncommon",
    name: "Grease Gun",
    iconUrl: "/images/tank-items/boxing-gloves.png",
    actionText: "greases every panel until the overlays go dark metal! Slick. 🛠️",
    rewardXp: 15,
    rewardTokens: 8,
  },
  "love-letter": {
    slug: "love-letter",
    rarity: "uncommon",
    name: "Simple Love Letter",
    iconUrl: "/images/tank-items/love-letter.png",
    actionText: "pens a heartfelt love letter to the chat. Wholesome energy fills the room! ❤️",
    rewardXp: 20,
    rewardTokens: 10,
  },
  "first-aid-kit": {
    slug: "first-aid-kit",
    rarity: "common",
    name: "First Aid Kit",
    iconUrl: "/images/tank-items/battery.png",
    actionText: "opens a first aid kit and confidently sews themselves shut. Not dying today.",
    rewardXp: 15,
    rewardTokens: 10,
  },
  "battery": {
    slug: "battery",
    rarity: "common",
    name: "Batteries",
    iconUrl: "/images/tank-items/battery.png",
    actionText: "inserts a high-voltage lithium battery into the camera power grid! Overclocked!",
    rewardXp: 20,
    rewardTokens: 15,
  },
  "lightsaber": {
    slug: "lightsaber",
    rarity: "rare",
    name: "Sword Toy",
    iconUrl: "/images/tank-items/lightsaber.png",
    actionText: "ignites a crackling plasma lightsaber across the room! *vzzzzzt*",
    rewardXp: 30,
    rewardTokens: 25,
  },
  "boxing-gloves": {
    slug: "boxing-gloves",
    rarity: "uncommon",
    name: "Boxing Gloves",
    iconUrl: "/images/tank-items/boxing-gloves.png",
    actionText: "tightens their boxing gloves and challenges the room to a brawl! 🥊",
    rewardXp: 15,
    rewardTokens: 10,
  },
  "royal-jelly": {
    slug: "royal-jelly",
    rarity: "legendary",
    name: "Royal Jelly",
    iconUrl: "/images/tank-items/royal-jelly.png",
    actionText: "consumes a jar of glowing royal jelly! Instant watch speed surge!",
    rewardXp: 50,
    rewardTokens: 50,
  },
  "didgeridoo": {
    slug: "didgeridoo",
    rarity: "rare",
    name: "Didgeridoo",
    iconUrl: "/images/tank-items/didgeridoo.png",
    actionText: "plays a deep echoing didgeridoo chord through the house audio! *BWAAAAA*",
    rewardXp: 25,
    rewardTokens: 20,
  },
  "crisp-shorts": {
    slug: "crisp-shorts",
    rarity: "uncommon",
    name: "Crisp Shorts",
    iconUrl: "/images/tank-items/crisp-shorts.png",
    actionText: "puts on crisp brand-new athletic shorts. Maximum comfort unlocked.",
    rewardXp: 20,
    rewardTokens: 15,
  },
  "fucked-up-shit": {
    slug: "fucked-up-shit",
    rarity: "epic",
    name: "Mystery Concoction",
    iconUrl: "/images/tank-items/fucked-up-shit.png",
    actionText: "unboxes some truly fucked up shit and stares in absolute disbelief.",
    rewardXp: 66,
    rewardTokens: 66,
  },
  "deed-to-tank": {
    slug: "deed-to-tank",
    rarity: "legendary",
    name: "Deed to the Tank",
    iconUrl: "/images/tank-items/deed-to-tank.svg",
    actionText: "flaunts the official deed to the Tank! They own this domain now!",
    rewardXp: 100,
    rewardTokens: 100,
  },
  "broken-monitor": {
    slug: "broken-monitor",
    rarity: "common",
    name: "Broken CRT Monitor",
    iconUrl: "/images/tank-items/broken-monitor.png",
    actionText: "smashes a broken CRT monitor onto the floor, causing static sparks!",
    rewardXp: 18,
    rewardTokens: 12,
  },
  "dirty-mask": {
    slug: "dirty-mask",
    rarity: "epic",
    name: "Dirty Mask",
    iconUrl: "/images/tank-items/dirty-mask.png",
    actionText: "slips on a suspicious dirty mask and vanishes into the hallway shadows.",
    rewardXp: 12,
    rewardTokens: 10,
  },
  "slime-bomb": {
    slug: "slime-bomb",
    rarity: "epic",
    name: "Slime Bomb",
    iconUrl: "/images/tank-items/fucked-up-shit.png",
    actionText: "hurls a Slime Bomb into the chat! Viscous green goo splatters across the feed!",
    rewardXp: 35,
    rewardTokens: 20,
  },

  // ─── Test items (2026-08-26) — one per rarity tier, for verifying the RNG
  // action pipeline end to end. Rarity here is kept identical to
  // tankItemCatalog.ts and the tank_inventory_items DB rows on purpose —
  // this is exactly the kind of three-way drift flagged during the item audit.
  "test-static-rag": {
    slug: "test-static-rag",
    rarity: "common",
    name: "Static Rag",
    iconUrl: TANK_ITEM_ICONS["test-static-rag"],
    actionText: "wipes down the lens with a suspiciously staticky rag. Everything looks 4% dustier now.",
    rewardXp: 8,
    rewardTokens: 3,
  },
  "test-squeak-hammer": {
    slug: "test-squeak-hammer",
    rarity: "uncommon",
    name: "Squeaky Toy Hammer",
    iconUrl: TANK_ITEM_ICONS["test-squeak-hammer"],
    actionText: "bonks the nearest camera with a squeaky toy hammer. *SQUEAK*",
    rewardXp: 18,
    rewardTokens: 10,
  },
  "test-traffic-cone": {
    slug: "test-traffic-cone",
    rarity: "rare",
    name: "Neon Traffic Cone",
    iconUrl: TANK_ITEM_ICONS["test-traffic-cone"],
    actionText: "drops a glowing neon traffic cone in the middle of the room. Hazard acknowledged.",
    rewardXp: 28,
    rewardTokens: 18,
  },
  "test-haunted-phone": {
    slug: "test-haunted-phone",
    rarity: "epic",
    name: "Haunted Rotary Phone",
    iconUrl: TANK_ITEM_ICONS["test-haunted-phone"],
    actionText: "picks up the haunted rotary phone. It's ringing. It was never plugged in.",
    rewardXp: 45,
    rewardTokens: 30,
  },
  "test-golden-remote": {
    slug: "test-golden-remote",
    rarity: "legendary",
    name: "Golden Remote Control",
    iconUrl: TANK_ITEM_ICONS["test-golden-remote"],
    actionText: "clicks the Golden Remote Control at the house. Somewhere, a light flickers that shouldn't.",
    rewardXp: 70,
    rewardTokens: 55,
  },
  "test-tank-heart": {
    slug: "test-tank-heart",
    rarity: "mythic",
    name: "The Tank's Beating Heart",
    iconUrl: TANK_ITEM_ICONS["test-tank-heart"],
    actionText: "holds up the Tank's Beating Heart. The whole house pulses once in sync.",
    rewardXp: 120,
    rewardTokens: 100,
  },
};

export const FLAVOR_RNG_ACTIONS = [
  { text: "farts noisily, a proud smile appearing on their face.", xp: 6, tokens: 0 },
  { text: "trips over the living room carpet and somehow gains a little XP.", xp: 8, tokens: 0 },
  { text: "stares intensely into camera 1 trying to communicate telepathically.", xp: 5, tokens: 0 },
  { text: "discovers a stash of tokens tucked beneath the sofa cushions!", xp: 15, tokens: 25 },
  { text: "flips a lucky coin and lands on Heads! Token surge triggered!", xp: 12, tokens: 10 },
  { text: "taps aggressively on the camera lens, startling everyone in frame.", xp: 3, tokens: 0 },
  { text: "chugs an energy drink in 3 seconds flat. Maximum focus unlocked.", xp: 10, tokens: 5 },
  { text: "hacks into the TouchDesigner matrix and boosts the bass frequencies.", xp: 18, tokens: 15 },
  { text: "projectile vomits all over the place! Icky pukers!!!", xp: 10, tokens: 0 },
  { text: "suddenly squats and... well you know.", xp: 8, tokens: 0 },
  { text: "sneezes so hard the camera fogs up for a second.", xp: 4, tokens: 0 },
  { text: "attempts a backflip and lands directly on their tailbone.", xp: 14, tokens: 0 },
  { text: "eats a mystery snack found under the couch cushions. Bold strategy.", xp: 9, tokens: 5 },
  { text: "starts talking to the smoke detector like it's an old friend.", xp: 6, tokens: 0 },
  { text: "does the worm across the living room floor, unprompted.", xp: 16, tokens: 10 },
  { text: "licks the doorknob for absolutely no reason.", xp: 5, tokens: 0 },
  { text: "screams into a pillow for exactly 4 seconds. Feels better now.", xp: 7, tokens: 0 },
  { text: "puts on sunglasses indoors and refuses to explain why.", xp: 4, tokens: 0 },
  { text: "challenges the ceiling fan to a staring contest and loses.", xp: 6, tokens: 0 },
  { text: "microwaves a spoon. The house alarm has some questions.", xp: 20, tokens: 0 },
  { text: "attempts to parallel park the Roomba. Fails spectacularly.", xp: 11, tokens: 8 },
  { text: "starts a one-person conga line through the kitchen.", xp: 9, tokens: 5 },
];

const SLOT_SYMBOLS = ["🍒", "🍋", "💎", "🔔", "7️⃣", "⚡"];

// Main Chat Command and RNG Router
export async function processChatRngTrigger(
  userId: string,
  userName: string,
  roomId: string,
  messageText: string,
): Promise<ChatMessage | null> {
  const trimmed = messageText.trim();
  const lower = trimmed.toLowerCase();

  // 1. /dice or /roll [sides]
  if (lower.startsWith("/dice") || lower.startsWith("/roll")) {
    const parts = lower.split(/\s+/);
    let sides = 100;
    if (parts.length > 1 && !isNaN(Number(parts[1]))) {
      sides = Math.min(Math.max(Number(parts[1]), 2), 1000);
    }
    return await executeDiceRoll(userId, userName, roomId, sides);
  }

  // 2. /flip or /coinflip [heads|tails] [wager]
  if (lower.startsWith("/flip") || lower.startsWith("/coinflip")) {
    const parts = lower.split(/\s+/);
    const choice: "heads" | "tails" = parts.includes("tails") ? "tails" : "heads";
    let wager = 10;
    const numPart = parts.find((p) => !isNaN(Number(p)) && Number(p) > 0);
    if (numPart) wager = Math.min(Math.max(Number(numPart), 1), 500);
    return await executeCoinflip(userId, userName, roomId, choice, wager);
  }

  // 3. /slots or /spin [wager]
  if (lower.startsWith("/slots") || lower.startsWith("/spin")) {
    const parts = lower.split(/\s+/);
    let wager = 20;
    const numPart = parts.find((p) => !isNaN(Number(p)) && Number(p) > 0);
    if (numPart) wager = Math.min(Math.max(Number(numPart), 5), 500);
    return await executeSlots(userId, userName, roomId, wager);
  }

  // 4. /roulette or /tankroulette
  if (lower.startsWith("/roulette") || lower.startsWith("/tankroulette")) {
    return await executeRoulette(userId, userName, roomId);
  }

  // 5. /unbox or /crate
  if (lower.startsWith("/unbox") || lower.startsWith("/crate")) {
    return await executeCrateUnbox(userId, userName, roomId);
  }

  // 6. /use <item_slug>
  if (lower.startsWith("/use ")) {
    const slug = lower.replace("/use ", "").trim().replace(/\s+/g, "-");
    const itemDef = ITEM_ACTION_DEFINITIONS[slug];
    if (itemDef) {
      return await executeItemUsage(userId, userName, roomId, itemDef);
    }
  }

  // 7. /me or /action <custom action>
  if (lower.startsWith("/me ") || lower.startsWith("/action ")) {
    const customAction = trimmed.replace(/^\/(me|action)\s+/i, "");
    return await broadcastActionMessage(roomId, userId, userName, `${userName} ${customAction}`, "action");
  }

  // 8. /fart
  if (lower === "/fart") {
    return await broadcastActionMessage(
      roomId,
      userId,
      userName,
      `${userName} farts noisily, a proud smile appearing on their face.`,
      "action",
      6,
    );
  }

  // 9. Auto 5% surprise RNG drop on ordinary chat
  if (Math.random() < 0.05) {
    const roll = FLAVOR_RNG_ACTIONS[Math.floor(Math.random() * FLAVOR_RNG_ACTIONS.length)];
    return await broadcastActionMessage(
      roomId,
      userId,
      userName,
      `${userName} ${roll.text}`,
      "rng_drop",
      roll.xp,
      roll.tokens,
    );
  }

  return null;
}

// ─── RNG MINI-GAMES EXECUTORS ────────────────────────────────────────────────

export async function executeDiceRoll(
  userId: string,
  userName: string,
  roomId: string,
  sides = 20,
): Promise<ChatMessage | null> {
  const result = Math.floor(Math.random() * sides) + 1;
  const isCrit = result === sides;
  // Normalized to the roll's % of max, not raw result — a /roll 1000 near-max
  // shouldn't out-earn a /roll 20 near-max. Small numbers on purpose: RNG
  // flavor should be a light bonus on top of watch-time XP, not a way to
  // skip past it (see the "hours of watching" leveling curve in
  // watchTimeAccrual.ts).
  const bonusXp = isCrit ? 25 : Math.round((result / sides) * 10);
  const bonusTokens = isCrit ? 20 : result >= sides * 0.9 ? 5 : 0;

  const admin = createAdminClient();
  await awardProfileRewards(admin, userId, bonusXp, bonusTokens);

  const fullText = `${userName} rolls a ${sides}-sided dice. It lands: ${result}`;

  return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "dice_roll", {
    diceRoll: { sides, result, crit: isCrit, bonusXp, bonusTokens },
  });
}

export async function executeCoinflip(
  userId: string,
  userName: string,
  roomId: string,
  choice: "heads" | "tails",
  wager = 10,
): Promise<ChatMessage | null> {
  const preCheckAdmin = createAdminClient();
  const { data: preProfile } = await preCheckAdmin
    .from("tank_profiles")
    .select("tokens")
    .eq("user_id", userId)
    .maybeSingle();
  const balance = preProfile?.tokens ?? 0;
  if (balance <= 0) {
    return await broadcastActionMessage(
      roomId,
      userId,
      userName,
      `${userName} tried to flip for ${wager} tokens but has none to wager.`,
      "action",
    );
  }
  wager = Math.min(wager, balance);

  const outcome: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
  const won = choice === outcome;
  const payout = won ? wager * 2 : 0;
  const netTokens = won ? wager : -wager;
  const xpReward = won ? 12 : 4;

  const admin = createAdminClient();
  await awardProfileRewards(admin, userId, xpReward, netTokens);

  const fullText = won
    ? `🪙 ${userName} called ${choice.toUpperCase()} and WON! The coin landed on ${outcome.toUpperCase()}! (+${payout} Tokens, +${xpReward} XP)`
    : `🪙 ${userName} called ${choice.toUpperCase()} and LOST! The coin landed on ${outcome.toUpperCase()}! (-${wager} Tokens)`;

  return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "coinflip", {
    coinflip: { choice, outcome, won, wager, payout },
  });
}

export async function executeSlots(
  userId: string,
  userName: string,
  roomId: string,
  wager = 20,
): Promise<ChatMessage | null> {
  const preCheckAdmin = createAdminClient();
  const { data: preProfile } = await preCheckAdmin
    .from("tank_profiles")
    .select("tokens")
    .eq("user_id", userId)
    .maybeSingle();
  const balance = preProfile?.tokens ?? 0;
  if (balance <= 0) {
    return await broadcastActionMessage(
      roomId,
      userId,
      userName,
      `${userName} tried to spin the slots for ${wager} tokens but has none to wager.`,
      "action",
    );
  }
  wager = Math.min(wager, balance);

  const reel1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  const reel2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  const reel3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];

  let multiplier = 0;
  let droppedItemSlug: string | undefined;

  if (reel1 === reel2 && reel2 === reel3) {
    if (reel1 === "7️⃣") {
      multiplier = 50;
      droppedItemSlug = "deed-to-tank";
    } else if (reel1 === "💎") {
      multiplier = 25;
      droppedItemSlug = "royal-jelly";
    } else if (reel1 === "⚡") {
      multiplier = 15;
      droppedItemSlug = "didgeridoo";
    } else if (reel1 === "🔔") {
      multiplier = 10;
      droppedItemSlug = "lightsaber";
    } else {
      multiplier = 5;
      droppedItemSlug = "first-aid-kit";
    }
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 2;
  }

  const won = multiplier > 0;
  const tokenPayout = won ? wager * multiplier : 0;
  const netTokens = won ? tokenPayout - wager : -wager;
  const xpReward = won ? 8 * multiplier : 5;

  const admin = createAdminClient();
  await awardProfileRewards(admin, userId, xpReward, netTokens);

  // If jackpot item dropped, insert to inventory. Falls back to a
  // guaranteed-present item ("battery") if the rolled slug turns out to be
  // missing from tank_inventory_items — a catalog-drift bug should never
  // visibly cost a player an item they were just told they won; it still
  // gets logged (inside insertItemToInventory) so staff finds out.
  let droppedDef: ItemActionDefinition | undefined;
  if (droppedItemSlug && ITEM_ACTION_DEFINITIONS[droppedItemSlug]) {
    droppedDef = ITEM_ACTION_DEFINITIONS[droppedItemSlug];
    const grant = await insertItemToInventory(admin, userId, droppedDef.slug);
    if (!grant.success && droppedDef.slug !== "battery") {
      droppedDef = ITEM_ACTION_DEFINITIONS["battery"];
      await insertItemToInventory(admin, userId, droppedDef.slug);
    }
  }

  const reelsText = `[ ${reel1} | ${reel2} | ${reel3} ]`;
  const fullText = won
    ? `🎰 SLOTS WIN! ${userName} spun ${reelsText} for a ${multiplier}X MULTIPLIER! (+${tokenPayout} Tokens, +${xpReward} XP)${
        droppedDef ? ` 🎁 BONUS DROP: ${droppedDef.name}!` : ""
      }`
    : `🎰 ${userName} spun ${reelsText} — No match. (-${wager} Tokens)`;

  return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "slots", {
    slotsResult: {
      reels: [reel1, reel2, reel3],
      outcome: reelsText,
      won,
      multiplier,
      tokenPayout,
      droppedItemSlug: droppedDef?.slug,
      droppedItemName: droppedDef?.name,
      droppedItemIcon: droppedDef?.iconUrl,
    },
  });
}

export async function executeRoulette(
  userId: string,
  userName: string,
  roomId: string,
): Promise<ChatMessage | null> {
  const chamber = Math.floor(Math.random() * 6) + 1;
  const survived = chamber !== 6;

  const admin = createAdminClient();

  if (survived) {
    await awardProfileRewards(admin, userId, 20, 15);
    const fullText = `🔫 *CLICK* — Chamber ${chamber}/6 was empty! ${userName} survived Tank Roulette! (+20 XP, +15 Tokens)`;
    return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "roulette", {
      rouletteResult: { chamber, survived: true },
    });
  } else {
    // 2-minute timeout on loss
    try {
      const { data: setting } = await admin
        .from("tank_platform_settings")
        .select("value")
        .eq("key", "chat_banned_users")
        .maybeSingle();

      const bans = Array.isArray(setting?.value) ? setting.value : [];
      bans.push({
        id: `roulette_${Date.now()}`,
        userId,
        userName,
        reason: "Lost Tank Roulette (2m timeout)",
        bannedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        bannedBy: "Tank Roulette",
      });

      await admin
        .from("tank_platform_settings")
        .upsert({ key: "chat_banned_users", value: bans, updated_at: new Date().toISOString() });
    } catch {}

    const fullText = `💥 BANG! Chamber 6 went off! ${userName} got blasted straight off the broadcast! (2m Timeout)`;
    return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "roulette", {
      rouletteResult: { chamber, survived: false, timeoutSeconds: 120 },
    });
  }
}

export async function executeCrateUnbox(
  userId: string,
  userName: string,
  roomId: string,
): Promise<ChatMessage | null> {
  const roll = Math.random();
  let rarity: "common" | "rare" | "epic" | "legendary" | "mythic" = "common";
  let itemSlug = "broken-monitor";
  let xp = 10;

  if (roll < 0.03) {
    rarity = "mythic";
    itemSlug = "deed-to-tank";
    xp = 100;
  } else if (roll < 0.12) {
    rarity = "legendary";
    itemSlug = "royal-jelly";
    xp = 50;
  } else if (roll < 0.30) {
    rarity = "epic";
    itemSlug = "lightsaber";
    xp = 30;
  } else if (roll < 0.60) {
    rarity = "rare";
    itemSlug = "first-aid-kit";
    xp = 18;
  } else {
    rarity = "common";
    itemSlug = "battery";
    xp = 10;
  }

  let def = ITEM_ACTION_DEFINITIONS[itemSlug];
  const admin = createAdminClient();
  await awardProfileRewards(admin, userId, xp, 0);

  // Falls back to a guaranteed-present item ("battery") if the rolled slug
  // is missing from tank_inventory_items — confirmed live 2026-08-31 that
  // "first-aid-kit" (this crate's "rare" tier, 30% of all rolls) had no row
  // at all, so this was silently costing players the item they were just
  // told they'd won. Still logged (inside insertItemToInventory) so staff
  // finds out; the player never sees a broken roll.
  let grant = await insertItemToInventory(admin, userId, def.slug);
  if (!grant.success && def.slug !== "battery") {
    def = ITEM_ACTION_DEFINITIONS["battery"];
    grant = await insertItemToInventory(admin, userId, def.slug);
  }

  const fullText = `📦 UNBOX! ${userName} opened a Mystery Crate and unboxed [${rarity.toUpperCase()}] ${def.name}! (+${xp} XP)`;

  return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "crate_unbox", {
    crateResult: {
      crateName: "Tank Mystery Crate",
      rarity,
      itemSlug: def.slug,
      itemName: def.name,
      itemIcon: def.iconUrl,
      xpAwarded: xp,
    },
  });
}

export async function executeItemUsage(
  userId: string,
  userName: string,
  roomId: string,
  itemDef: ItemActionDefinition,
): Promise<ChatMessage | null> {
  const admin = createAdminClient();

  try {
    const itemId = await resolveItemId(admin, itemDef.slug);

    if (itemId) {
      const { data: itemRow } = await admin
        .from("tank_player_inventory")
        .select("quantity")
        .eq("user_id", userId)
        .eq("item_id", itemId)
        .maybeSingle();

      if (itemRow && itemRow.quantity > 0) {
        if (itemRow.quantity === 1) {
          await admin
            .from("tank_player_inventory")
            .delete()
            .eq("user_id", userId)
            .eq("item_id", itemId);
        } else {
          await admin
            .from("tank_player_inventory")
            .update({ quantity: itemRow.quantity - 1 })
            .eq("user_id", userId)
            .eq("item_id", itemId);
        }
      }
    }

    await awardProfileRewards(admin, userId, itemDef.rewardXp, itemDef.rewardTokens);

    // Chaos items: if the catalog entry carries overlayFx, attempt to re-skin
    // the HUD/VU overlays. Failure is deliberately NOT fatal — the item is
    // already consumed and the chat card still goes out, so a disabled
    // kill-switch or an active cooldown degrades to "used a normal item",
    // never to a dead button.
    const chaosFx = TANK_ITEM_CATALOG[itemDef.slug]?.overlayFx;
    if (chaosFx) {
      try {
        await tryFireOverlayFx({
          userId,
          triggeredBy: userName,
          texture: chaosFx.texture,
          durationSec: chaosFx.durationSec,
        });
      } catch (err) {
        console.error("[ItemUse] overlay fx failed:", err);
      }
    }

    // Apply Director Item Overrides
    if (itemDef.slug === "pet-whistle" || itemDef.slug === "cat-laser") {
      applyDirectorItemOverride({
        itemSlug: itemDef.slug,
        itemName: itemDef.name,
        targetMode: "animals",
        triggeredBy: userName,
        durationSeconds: 45,
      });
    } else if (itemDef.slug === "launch-keys") {
      applyDirectorItemOverride({
        itemSlug: itemDef.slug,
        itemName: itemDef.name,
        targetMode: "group",
        targetRoomKey: roomId,
        triggeredBy: userName,
        durationSeconds: 45,
      });
    }

    const fullText = `${userName} ${itemDef.actionText}`;
    return await saveAndBroadcast(admin, roomId, userId, userName, fullText, "item_use", {
      itemSlug: itemDef.slug,
      itemName: itemDef.name,
      itemIconUrl: itemDef.iconUrl,
      itemRarity: itemDef.rarity,
    });
  } catch {
    return null;
  }
}

// Rarity-tiered "holding up the trophy fish" flavor text, generic over item
// name rather than hand-written per-slug — ITEM_ACTION_DEFINITIONS only
// covers items with a "use" effect, but any owned item (including pure
// collectibles like Deed to the Tank) can be flexed, so this has to work for
// every entry in TANK_ITEM_CATALOG without per-item authoring.
const FLEX_FLAVOR_BY_RARITY: Record<ItemRarity, string[]> = {
  common: [
    "holds up their {name} for a quick look.",
    "shows off their {name} to the room.",
  ],
  uncommon: [
    "shows off their {name} — not bad!",
    "flashes their {name} for the chat.",
  ],
  rare: [
    "flourishes their {name} (🧪 RARE) for everyone to admire!",
    "holds up their {name} (🧪 RARE) — a solid pull!",
  ],
  epic: [
    "raises their {name} (💎 EPIC) high — the room gasps!",
    "shows off their {name} (💎 EPIC) with a proud grin!",
  ],
  legendary: [
    "holds up their {name} (✨ LEGENDARY) — the room falls silent in awe!",
    "unveils their {name} (✨ LEGENDARY), catching the studio lights perfectly!",
  ],
  mythic: [
    "unveils their {name} (🏆 MYTHIC) — a holy light bathes the chat!",
    "raises their {name} (🏆 MYTHIC) skyward — chat is speechless!",
  ],
};

function getFlexFlavorText(itemName: string, rarity: ItemRarity): string {
  const options = FLEX_FLAVOR_BY_RARITY[rarity] ?? FLEX_FLAVOR_BY_RARITY.common;
  const pick = options[Math.floor(Math.random() * options.length)];
  return pick.replace("{name}", itemName);
}

const FLEX_COOLDOWN_MS = 30_000;
const FLEX_COOLDOWN_SETTING_KEY = "tank_flex_cooldowns";

/**
 * Shows off an owned item in chat without consuming it — the inventory
 * "Trophy Catch" flex. No inventory mutation, no XP/token reward; just a
 * console broadcast plus a per-user cooldown so it can't be spammed.
 */
export async function executeItemFlex(
  userId: string,
  userName: string,
  roomId: string,
  itemSlug: string,
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  const admin = createAdminClient();
  const item = TANK_ITEM_CATALOG[itemSlug];
  if (!item) return { success: false, error: "Unknown item." };

  try {
    const itemId = await resolveItemId(admin, itemSlug);
    if (!itemId) return { success: false, error: "Unknown item." };

    const { data: owned } = await admin
      .from("tank_player_inventory")
      .select("quantity")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle();
    if (!owned || owned.quantity < 1) {
      return { success: false, error: "You don't own this item." };
    }

    // Per-user flex cooldown, stored the same way clan subclass/rank prefs
    // are (clanSystem.ts) — a JSON map on one tank_platform_settings row.
    // Read-modify-write on a shared row can race under concurrent flexes;
    // acceptable here since a lost cooldown update only costs a few seconds
    // of spam protection, not real value like tokens or inventory.
    const { data: cooldownSetting } = await admin
      .from("tank_platform_settings")
      .select("value")
      .eq("key", FLEX_COOLDOWN_SETTING_KEY)
      .maybeSingle();
    const cooldownMap: Record<string, number> = cooldownSetting?.value ?? {};
    const now = Date.now();
    const lastFlex = cooldownMap[userId] ?? 0;
    if (now - lastFlex < FLEX_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((FLEX_COOLDOWN_MS - (now - lastFlex)) / 1000);
      return { success: false, error: `You can flex again in ${waitSeconds}s.` };
    }

    const fullText = `${userName} ${getFlexFlavorText(item.name, item.rarity)}`;
    const message = await saveAndBroadcast(admin, roomId, userId, userName, fullText, "item_flex", {
      itemSlug: item.slug,
      itemName: item.name,
      itemIconUrl: getTankItemIcon(item.slug),
      itemRarity: item.rarity,
    });
    if (!message) return { success: false, error: "Failed to showcase item." };

    cooldownMap[userId] = now;
    await admin.from("tank_platform_settings").upsert(
      { key: FLEX_COOLDOWN_SETTING_KEY, value: cooldownMap, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

    return { success: true, message };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to showcase item." };
  }
}

export async function broadcastActionMessage(
  roomId: string,
  userId: string,
  userName: string,
  fullText: string,
  messageType: "action" | "rng_drop",
  rewardXp = 0,
  rewardTokens = 0,
): Promise<ChatMessage | null> {
  const admin = createAdminClient();
  if (rewardXp > 0 || rewardTokens > 0) {
    await awardProfileRewards(admin, userId, rewardXp, rewardTokens);
  }
  return await saveAndBroadcast(admin, roomId, userId, userName, fullText, messageType);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function awardProfileRewards(admin: any, userId: string, xp: number, tokens: number) {
  try {
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("xp, tokens, level")
      .eq("user_id", userId)
      .maybeSingle();

    const curXp = profile?.xp ?? 0;
    const curTokens = profile?.tokens ?? 0;
    const nextXp = Math.max(0, curXp + xp);
    const nextTokens = Math.max(0, curTokens + tokens);
    const nextLevel = Math.floor(1 + Math.sqrt(nextXp / 100));

    await admin.from("tank_profiles").upsert(
      {
        user_id: userId,
        xp: nextXp,
        tokens: nextTokens,
        level: nextLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {}
}

// tank_player_inventory keys items by item_id (uuid, FK to
// tank_inventory_items.id) — it has no item_slug column at all. Every
// caller here works in slugs (matching ITEM_ACTION_DEFINITIONS), so every
// inventory read/write resolves slug -> id first via this lookup.
async function resolveItemId(admin: any, itemSlug: string): Promise<string | null> {
  const { data } = await admin.from("tank_inventory_items").select("id").eq("slug", itemSlug).maybeSingle();
  return data?.id ?? null;
}

// Thin wrapper over the centralized tank_grant_inventory_item RPC (Tavern
// Phase 0) — locks the row and enforces max_stack, which this function's own
// previous plain select-then-upsert body never did (a real lost-update race
// under concurrent grants, and no stack cap of any kind). Kept as the same
// exported name/signature every existing caller (slots win, crate unbox,
// drops) already uses, so nothing upstream needed to change.
/**
 * Grants an item via the centralized tank_grant_inventory_item RPC (Tavern
 * Phase 0) and reports whether it actually landed.
 *
 * Used to be `try { await admin.rpc(...) } catch {}` with the result
 * completely discarded — but the RPC returns `{success:false, error:...}`
 * as a normal (non-throwing) response when the item slug doesn't exist in
 * tank_inventory_items, so a missing catalog row never threw and never got
 * caught; it just silently failed to grant while callers went on to
 * broadcast a success message anyway. Confirmed live 2026-08-31:
 * "first-aid-kit" (the /unbox "rare" tier, 30% of all rolls) had no row at
 * all. Same pattern already used against this RPC in dropCampaigns.ts.
 */
export async function insertItemToInventory(
  admin: any,
  userId: string,
  itemSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await admin.rpc("tank_grant_inventory_item", {
      p_user_id: userId,
      p_item_slug: itemSlug,
      p_quantity: 1,
      p_source: "chat_event",
    });
    if (error || !data?.success) {
      console.error("[ChatRngEvents] insertItemToInventory failed:", { userId, itemSlug, error, data });
      return { success: false, error: data?.error || error?.message };
    }
    return { success: true };
  } catch (err) {
    console.error("[ChatRngEvents] insertItemToInventory threw:", { userId, itemSlug, err });
    return { success: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

async function saveAndBroadcast(
  admin: any,
  roomId: string,
  userId: string,
  userName: string,
  body: string,
  messageType: ChatMessageType,
  extra: Partial<ChatMessage> = {},
): Promise<ChatMessage | null> {
  try {
    // message_type / item_slug / metadata MUST be persisted, not just put on
    // the broadcast payload. The broadcast only reaches viewers who are
    // subscribed right now; everyone else reads the row back through
    // getRecentChatMessages, and a row without a type comes back as an
    // ordinary user chat message — which is how console events ended up
    // rendering with an avatar and role badge.
    const { data: msgData, error } = await admin
      .from("tank_chat_messages")
      .insert({
        room_id: roomId,
        user_id: userId,
        user_name: userName,
        user_role: "member",
        body,
        message_type: messageType,
        item_slug: extra.itemSlug ?? null,
        metadata: extra,
      })
      .select("id, created_at")
      .single();

    if (error || !msgData) {
      console.error("[ChatRngEvents] saveAndBroadcast insert failed:", { roomId, userId, messageType, error });
      return null;
    }

    const chatMsg: ChatMessage = {
      id: msgData.id,
      userId,
      user: userName,
      body,
      time: new Date(msgData.created_at).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      messageType,
      eventDescription: body,
      ...extra,
    };

    const channel = admin.channel(`room:${roomId}:chat`);
    try {
      await channel.send({
        type: "broadcast",
        event: "new_message",
        payload: chatMsg,
      });
    } finally {
      await admin.removeChannel(channel);
    }

    return chatMsg;
  } catch (err) {
    // Every RNG command (/roll, /unbox, /flip, /slots, /roulette, /me, ...)
    // funnels through this on its way to actually posting — a swallowed
    // error here was invisible regardless of any fix at the individual
    // command's call site. Confirmed live 2026-08-31.
    console.error("[ChatRngEvents] saveAndBroadcast failed:", { roomId, userId, messageType, err });
    return null;
  }
}
