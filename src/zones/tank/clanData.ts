// Plain data module (no "use server") — RPG pillar/subclass catalog.
// Moved out of clanSystem.ts: that file has "use server" at the top,
// which requires every export to be an async function. RPG_PILLARS and
// RPG_SUBCLASSES are plain objects, and ClansOverlay.tsx (a client
// component) imports them directly for rendering — both of those are
// violations of the "use server" contract. This was the actual cause of
// "A \"use server\" file can only export async functions, found object"
// on every Tank page load once a real build finally ran tonight.

export type RpgPillar = "martial" | "striker" | "mystic" | "support";

export type RpgSubclass =
  // Martial / Defense
  | "juggernaut"
  | "paladin"
  | "berserker"
  | "vanguard"
  // Striker / Offense
  | "bladedancer"
  | "assassin"
  | "sniper"
  | "gunslinger"
  // Mystic / Magic
  | "pyromancer"
  | "necromancer"
  | "chronomancer"
  | "enchanter"
  // Support / Specialist
  | "bard"
  | "cleric"
  | "druid"
  | "merchant"
  // Guild Leadership
  | "warlord";

export type RpgSubclassInfo = {
  id: RpgSubclass;
  pillar: RpgPillar;
  name: string;
  dndClass: string;
  icon: string;
  color: string;
  roleType: string;
  perkDescription: string;
  specialAbility: string;
};

export const RPG_PILLARS: Record<RpgPillar, { name: string; icon: string; color: string; description: string }> = {
  martial: {
    name: "Martial & Defense",
    icon: "🛡️",
    color: "#3b82f6",
    description: "Frontline guardians, damage sponges, and tacticians who fortify the clan.",
  },
  striker: {
    name: "Striker & Hunter",
    icon: "⚔️",
    color: "#ef4444",
    description: "Lethal duelists, snipers, and high-risk critical rollers.",
  },
  mystic: {
    name: "Mystic & Arcanist",
    icon: "🧙",
    color: "#a855f7",
    description: "Spellcasters who manipulate token yields, elemental fire, and temporal cooldowns.",
  },
  support: {
    name: "Support & Specialist",
    icon: "🧪",
    color: "#10b981",
    description: "Bards, clerics, and merchants who buff clanmates and discount broadcast sounds.",
  },
};

export const RPG_SUBCLASSES: Record<RpgSubclass, RpgSubclassInfo> = {
  // ─── 1. MARTIAL & DEFENSE ──────────────────────────────────────────────────
  juggernaut: {
    id: "juggernaut",
    pillar: "martial",
    name: "Juggernaut",
    dndClass: "Fighter / Knight",
    icon: "🛡️",
    color: "#3b82f6",
    roleType: "Main Tank",
    perkDescription: "+15% bonus Watch XP accrual rate while director is live.",
    specialAbility: "Unstoppable: Absorbs high-traffic chat slowdowns.",
  },
  paladin: {
    id: "paladin",
    pillar: "martial",
    name: "Oathkeeper",
    dndClass: "Paladin",
    icon: "✨",
    color: "#60a5fa",
    roleType: "Holy Defender",
    perkDescription: "+10% Clan XP aura shared with all online clanmates in room.",
    specialAbility: "Aura of Protection: Boosts clanmates' roll luck.",
  },
  berserker: {
    id: "berserker",
    pillar: "martial",
    name: "Berserker",
    dndClass: "Barbarian",
    icon: "🪓",
    color: "#dc2626",
    roleType: "Rage Warrior",
    perkDescription: "+35% critical multiplier on high-stakes /dice and /roll.",
    specialAbility: "Frenzy: Double tokens on natural 20 rolls.",
  },
  vanguard: {
    id: "vanguard",
    pillar: "martial",
    name: "Vanguard",
    dndClass: "Battlemaster",
    icon: "🚩",
    color: "#2563eb",
    roleType: "Tactician",
    perkDescription: "Bonus token drops during intense room switches.",
    specialAbility: "Rallying Cry: Clan alert ping when live action spikes.",
  },

  // ─── 2. STRIKER & HUNTER ───────────────────────────────────────────────────
  bladedancer: {
    id: "bladedancer",
    pillar: "striker",
    name: "Blade Dancer",
    dndClass: "Duelist",
    icon: "⚔️",
    color: "#ef4444",
    roleType: "Dual Striker",
    perkDescription: "Rapid multi-roll attacks with lucky low-roll dice rerolls.",
    specialAbility: "Flurry: Chance to trigger 2x rolls per command.",
  },
  assassin: {
    id: "assassin",
    pillar: "striker",
    name: "Shadow Assassin",
    dndClass: "Rogue",
    icon: "🗡️",
    color: "#991b1b",
    roleType: "Infiltrator",
    perkDescription: "+20% increased legendary drop rate on mystery /unbox crates.",
    specialAbility: "Sneak Attack: Triple rewards on first unbox of the day.",
  },
  sniper: {
    id: "sniper",
    pillar: "striker",
    name: "Marksman",
    dndClass: "Ranger",
    icon: "🏹",
    color: "#f97316",
    roleType: "Sharpshooter",
    perkDescription: "Critical bounty on first message posted in a newly switched room.",
    specialAbility: "True Strike: Pinpoint room tracking alerts.",
  },
  gunslinger: {
    id: "gunslinger",
    pillar: "striker",
    name: "Gunslinger",
    dndClass: "Outlaw",
    icon: "🎯",
    color: "#ea580c",
    roleType: "High Roller",
    perkDescription: "+15% payout multiplier on coinflips (/flip) and casino bets.",
    specialAbility: "Deadeye: Extra token refund on coinflip losses.",
  },

  // ─── 3. MYSTIC & ARCANIST ──────────────────────────────────────────────────
  pyromancer: {
    id: "pyromancer",
    pillar: "mystic",
    name: "Pyromancer",
    dndClass: "Evocation Wizard",
    icon: "🔥",
    color: "#f59e0b",
    roleType: "Fire Elementalist",
    perkDescription: "Flaming chat badge and fiery glowing text effects.",
    specialAbility: "Combustion: Explodes /slots multiplier on cherry spins.",
  },
  necromancer: {
    id: "necromancer",
    pillar: "mystic",
    name: "Necromancer",
    dndClass: "Warlock",
    icon: "💀",
    color: "#a855f7",
    roleType: "Shadow Caster",
    perkDescription: "Scavenges bonus tokens from failed roulette and unbox wagers.",
    specialAbility: "Soul Harvest: Absorbs lost tokens back into wallet.",
  },
  chronomancer: {
    id: "chronomancer",
    pillar: "mystic",
    name: "Chronomancer",
    dndClass: "Time Mage",
    icon: "⌛",
    color: "#c084fc",
    roleType: "Time Weaver",
    perkDescription: "50% cooldown reduction on all chat mini-games and item use.",
    specialAbility: "Time Warp: Instant reset of /slots cooldowns.",
  },
  enchanter: {
    id: "enchanter",
    pillar: "mystic",
    name: "Alchemist",
    dndClass: "Artificer",
    icon: "🔮",
    color: "#7e22ce",
    roleType: "Transmuter",
    perkDescription: "+25% item duration and potion crafting efficiency in inventory.",
    specialAbility: "Transmutation: Convert duplicate common items into rare crates.",
  },

  // ─── 4. SUPPORT & SPECIALIST ───────────────────────────────────────────────
  bard: {
    id: "bard",
    pillar: "support",
    name: "Lore Skald",
    dndClass: "Bard",
    icon: "🎶",
    color: "#10b981",
    roleType: "Song Weaver",
    perkDescription: "50% discount on TTS voice and soundboard audio broadcasts.",
    specialAbility: "Bardic Inspiration: Inspires chat with animated musical notes.",
  },
  cleric: {
    id: "cleric",
    pillar: "support",
    name: "High Cleric",
    dndClass: "Cleric",
    icon: "🧪",
    color: "#059669",
    roleType: "Radiant Healer",
    perkDescription: "Healing aura and immunity to short automod chat timeouts.",
    specialAbility: "Revitalize: Purges negative statuses and chat cooldowns.",
  },
  druid: {
    id: "druid",
    pillar: "support",
    name: "Druid",
    dndClass: "Shapeshifter",
    icon: "🌿",
    color: "#16a34a",
    roleType: "Beast Tamer",
    perkDescription: "Custom animal pet companions rendered next to chat messages.",
    specialAbility: "Wild Shape: Unlock exclusive beast avatar badges.",
  },
  merchant: {
    id: "merchant",
    pillar: "support",
    name: "Guild Treasurer",
    dndClass: "Merchant",
    icon: "💰",
    color: "#0d9488",
    roleType: "Banker",
    perkDescription: "Clan bank contributions and passive token interest accrual.",
    specialAbility: "Gold Rush: Shared jackpot rewards for entire clan.",
  },

  // ─── 5. CLAN COMMAND ───────────────────────────────────────────────────────
  warlord: {
    id: "warlord",
    pillar: "martial",
    name: "Clan Warlord",
    dndClass: "Guildmaster",
    icon: "👑",
    color: "#eab308",
    roleType: "Supreme Commander",
    perkDescription: "Full domain governance, recruitment authority, and subclass assignments.",
    specialAbility: "Imperial Command: Sets clan war cries, motto, and banner colors.",
  },
};
