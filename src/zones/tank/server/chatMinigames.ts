import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage } from "../contracts";
import {
  getLevelForXp,
  getRankForLevel,
  getXpCeilForLevel,
  type ChatRank,
} from "../xpLevels";

export {
  getLevelForXp,
  getRankForLevel,
  getXpCeilForLevel as getXpRequiredForNextLevel,
  type ChatRank,
};

// ─── MINIGAME ENGINE STATE & TYPES ──────────────────────────────────────────

export type ActiveTriviaMinigame = {
  type: "trivia";
  id: string;
  question: string;
  answer: string;
  acceptableAnswers: string[];
  rewardXp: number;
  rewardTokens: number;
  expiresAt: number;
  startedAt: number;
};

export type ActiveScavengerMinigame = {
  type: "scavenger";
  id: string;
  roomKey: string;
  roomTitle: string;
  clue: string;
  secretCode: string;
  rewardXp: number;
  rewardTokens: number;
  expiresAt: number;
  startedAt: number;
};

export type ActiveMinigame = ActiveTriviaMinigame | ActiveScavengerMinigame;

export type ActiveMultiplierEvent = {
  multiplier: number;
  expiresAt: number;
  startedAt: number;
};

// Global in-memory engine state across requests
let activeMinigame: ActiveMinigame | null = null;
let activeMultiplier: ActiveMultiplierEvent | null = null;
let lastPeriodicTriggerTime = Date.now();

// ─── TRIVIA & SCAVENGER DATA CATALOG ────────────────────────────────────────

// Anti-repeat history queue to guarantee questions never repeat in the same session/day
const recentTriviaIndices: number[] = [];

const TRIVIA_QUESTIONS = [
  {
    question: "What is the level formula on Tank live chat?",
    answer: "sqrt(xp / 10) + 1",
    acceptable: ["sqrt(xp/10)+1", "sqrt(xp / 10) + 1", "sqrt", "level = floor(sqrt(xp/10))+1"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What chat command rolls a 100-sided die?",
    answer: "/roll 100",
    acceptable: ["/roll 100", "/dice 100", "/roll", "/dice"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What rank title do you unlock at Level 5?",
    answer: "Regular",
    acceptable: ["regular"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What rank title do you unlock at Level 30?",
    answer: "Legend",
    acceptable: ["legend"],
    rewardXp: 60,
    rewardTokens: 30,
  },
  {
    question: "What inventory item opens a kit and sews yourself shut?",
    answer: "First Aid Kit",
    acceptable: ["first aid kit", "first aid", "first-aid-kit"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What command lets you spin the 3-reel slot machine?",
    answer: "/slots",
    acceptable: ["/slots", "/spin"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What command lets you flip a coin for tokens?",
    answer: "/flip",
    acceptable: ["/flip", "/coinflip"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What is the curated main cut room called in Tank?",
    answer: "Director",
    acceptable: ["director", "director program", "program"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What command unboxes a mystery crate?",
    answer: "/unbox",
    acceptable: ["/unbox", "/crate"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What item ignites a crackling plasma blade across the room?",
    answer: "Sword Toy",
    acceptable: ["sword toy", "lightsaber", "plasma blade", "sword"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What item flaunts the official legal sovereignty of the live house?",
    answer: "Deed to the Tank",
    acceptable: ["deed to the tank", "deed to tank", "deed"],
    rewardXp: 75,
    rewardTokens: 50,
  },
  {
    question: "What rank do you achieve between Level 15 and 29?",
    answer: "VIP",
    acceptable: ["vip"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What amber item boosts your XP watch speed by +50%?",
    answer: "Royal Jelly",
    acceptable: ["royal jelly", "jelly", "honey"],
    rewardXp: 55,
    rewardTokens: 30,
  },
  {
    question: "What acoustic item blasts a deep drone into the house audio?",
    answer: "Didgeridoo",
    acceptable: ["didgeridoo", "drone", "horn"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What item can be salvaged for scrap electronic parts after breaking?",
    answer: "Smashed Monitor",
    acceptable: ["smashed monitor", "broken monitor", "monitor", "crt"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What item is a handwritten letter sealed with a wax heart?",
    answer: "Simple Love Letter",
    acceptable: ["simple love letter", "love letter", "letter"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What command lets you slap another chatter with a wet trout?",
    answer: "/slap",
    acceptable: ["/slap", "slap"],
    rewardXp: 35,
    rewardTokens: 15,
  },
  {
    question: "What command lets you hug another chatter in the room?",
    answer: "/hug",
    acceptable: ["/hug", "hug"],
    rewardXp: 35,
    rewardTokens: 15,
  },
  {
    question: "What command lets you dance in the live chat?",
    answer: "/dance",
    acceptable: ["/dance", "dance"],
    rewardXp: 35,
    rewardTokens: 15,
  },
  {
    question: "What command lets you flex your level and stats in chat?",
    answer: "/flex",
    acceptable: ["/flex", "flex"],
    rewardXp: 35,
    rewardTokens: 15,
  },
  {
    question: "What command lets you cheer for the house?",
    answer: "/cheer",
    acceptable: ["/cheer", "cheer"],
    rewardXp: 35,
    rewardTokens: 15,
  },
  {
    question: "What rank does every new viewer start with at Level 1?",
    answer: "Newbie",
    acceptable: ["newbie", "viewer"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What gas mask item provides immunity to chat slime bombs?",
    answer: "Dirty Mask",
    acceptable: ["dirty mask", "mask", "gas mask"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What item provides 9V power to overclock the camera grid?",
    answer: "Batteries",
    acceptable: ["batteries", "battery", "9v"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What athletic apparel item unlocks maximum comfort?",
    answer: "Crisp Shorts",
    acceptable: ["crisp shorts", "shorts"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What mystery drink item is consumed at your own risk?",
    answer: "Mystery Concoction",
    acceptable: ["mystery concoction", "fucked up shit", "concoction"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What red equipment item prepares you for physical sparring challenges?",
    answer: "Boxing Gloves",
    acceptable: ["boxing gloves", "gloves"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "How many base XP do you earn for sending a chat message?",
    answer: "5",
    acceptable: ["5", "5 xp", "five"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What keyboard shortcut toggles the Inventory Overlay on desktop?",
    answer: "I",
    acceptable: ["i", "key i"],
    rewardXp: 45,
    rewardTokens: 25,
  },
  {
    question: "What keyboard shortcut toggles the Director Dock on desktop?",
    answer: "D",
    acceptable: ["d", "key d"],
    rewardXp: 45,
    rewardTokens: 25,
  },
  {
    question: "What protocol delivers ultra-low latency sub-second live video in Tank?",
    answer: "WebRTC",
    acceptable: ["webrtc", "whep", "whip"],
    rewardXp: 55,
    rewardTokens: 30,
  },
  {
    question: "What streaming format is used for iOS Apple native playback?",
    answer: "HLS",
    acceptable: ["hls", "fmp4", "m4s"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What button jumps your player immediately back to the live broadcast edge?",
    answer: "LIVE",
    acceptable: ["live", "back to live", "live badge"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What color border signifies a Legendary tier item?",
    answer: "Gold",
    acceptable: ["gold", "yellow", "#eab308"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What color border signifies an Epic tier item?",
    answer: "Purple",
    acceptable: ["purple", "violet", "#a855f7"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What color border signifies a Rare tier item?",
    answer: "Blue",
    acceptable: ["blue", "cyan", "#3b82f6"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What color border signifies an Uncommon tier item?",
    answer: "Green",
    acceptable: ["green", "#22c55e"],
    rewardXp: 45,
    rewardTokens: 20,
  },
  {
    question: "What item inserts dual keys to arm special house event sequences?",
    answer: "Launch Keys",
    acceptable: ["launch keys", "keys"],
    rewardXp: 50,
    rewardTokens: 25,
  },
  {
    question: "What command lets you challenge someone to Rock Paper Scissors?",
    answer: "/rps",
    acceptable: ["/rps", "rps", "rock paper scissors"],
    rewardXp: 40,
    rewardTokens: 20,
  },
  {
    question: "What is the primary currency symbol used on Tank?",
    answer: "Tokens",
    acceptable: ["tokens", "token", "f", "unt"],
    rewardXp: 40,
    rewardTokens: 20,
  },
];

const SCAVENGER_ROOM_QUESTS = [
  {
    roomKey: "living-room",
    roomTitle: "Living Room Feed",
    clue: "Switch to the Living Room feed and inspect the camera code!",
    codes: ["LIVING-ROOM-99", "SOFA-CAM-77", "TV-CORNER-42"],
  },
  {
    roomKey: "kitchen",
    roomTitle: "Kitchen Feed",
    clue: "Check out the Kitchen feed to catch the secret broadcast code!",
    codes: ["KITCHEN-CAM-12", "REFRIGERATOR-88", "SNACK-ZONE-33"],
  },
  {
    roomKey: "foyer",
    roomTitle: "The Foyer Feed",
    clue: "Inspect The Foyer feed to locate the hidden entrance code!",
    codes: ["FOYER-CAM-04", "ENTRANCE-DECK-22", "FOYER-77"],
  },
  {
    roomKey: "makeup-room",
    roomTitle: "Makeup Room Feed",
    clue: "Inspect the Makeup Room feed to locate the vanity code!",
    codes: ["MAKEUP-CAM-05", "VANITY-44", "GLAM-88"],
  },
  {
    roomKey: "game-room-2",
    roomTitle: "Game Room 2 Feed",
    clue: "Head over to the Game Room 2 feed to retrieve the secondary game signal!",
    codes: ["GAME-ROOM-2-01", "ARCADE-CUT-55", "CONTROL-ROOM-10"],
  },
];

// ─── SYSTEM CONSOLE BROADCAST HELPERS ────────────────────────────────────────

/**
 * Broadcasts a styled system message over Supabase Realtime channel and saves to DB.
 */
export async function sendSystemConsoleAnnouncement(
  roomId: string,
  body: string,
  category: "system" | "house_event" | "level_up" | "trivia" | "scavenger" = "system",
): Promise<ChatMessage | null> {
  const admin = createAdminClient();
  const id = `sys_${category}_${Date.now()}`;
  const now = new Date().toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });

  // Triggered by the house — no sender, no role badge, no avatar.
  const msg: ChatMessage = {
    id,
    user: category === "house_event" || category === "trivia" || category === "scavenger" ? "HOUSE EVENT" : "SYSTEM",
    body,
    time: now,
    messageType: category,
  };

  try {
    await admin.from("tank_chat_messages").insert({
      room_id: roomId,
      user_id: null,
      user_name: msg.user,
      user_role: "system",
      body,
      message_type: category,
    });

    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: msg,
    });

    return msg;
  } catch {
    return null;
  }
}

// ─── MINIGAME ENGINE CORE IMPLEMENTATION ────────────────────────────────────

export function getActiveMinigame(): ActiveMinigame | null {
  if (activeMinigame && Date.now() > activeMinigame.expiresAt) {
    activeMinigame = null;
  }
  return activeMinigame;
}

export function getActiveMultiplier(): number {
  if (activeMultiplier && Date.now() > activeMultiplier.expiresAt) {
    activeMultiplier = null;
  }
  return activeMultiplier ? activeMultiplier.multiplier : 1;
}

/**
 * Triggers a House Trivia Question round in chat with guaranteed anti-repeat rotation
 */
export async function triggerHouseTriviaRound(roomId = "director"): Promise<ChatMessage | null> {
  // Find all question indices that haven't been recently used
  let availableIndices = TRIVIA_QUESTIONS.map((_, idx) => idx).filter(
    (idx) => !recentTriviaIndices.includes(idx),
  );

  // If all questions have been cycled through, reset history and pick from all
  if (availableIndices.length === 0) {
    recentTriviaIndices.length = 0;
    availableIndices = TRIVIA_QUESTIONS.map((_, idx) => idx);
  }

  const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  recentTriviaIndices.push(chosenIndex);
  if (recentTriviaIndices.length > 25) {
    recentTriviaIndices.shift();
  }

  const item = TRIVIA_QUESTIONS[chosenIndex];
  const durationSeconds = 60;

  activeMinigame = {
    type: "trivia",
    id: `trivia_${Date.now()}`,
    question: item.question,
    answer: item.answer,
    acceptableAnswers: [item.answer.toLowerCase(), ...item.acceptable.map((a) => a.toLowerCase())],
    rewardXp: item.rewardXp,
    rewardTokens: item.rewardTokens,
    startedAt: Date.now(),
    expiresAt: Date.now() + durationSeconds * 1000,
  };

  const announcement = `[HOUSE TRIVIA] ${item.question}\nType !answer <your answer> in chat within 60s to win ${item.rewardXp} XP and ${item.rewardTokens} Tokens!`;
  return await sendSystemConsoleAnnouncement(roomId, announcement, "trivia");
}

/**
 * Triggers a Camera Scavenger Quest in chat
 */
export async function triggerCameraScavengerQuest(roomId = "director"): Promise<ChatMessage | null> {
  const quest = SCAVENGER_ROOM_QUESTS[Math.floor(Math.random() * SCAVENGER_ROOM_QUESTS.length)];
  const secretCode = quest.codes[Math.floor(Math.random() * quest.codes.length)];
  const durationSeconds = 90;

  activeMinigame = {
    type: "scavenger",
    id: `scavenger_${Date.now()}`,
    roomKey: quest.roomKey,
    roomTitle: quest.roomTitle,
    clue: quest.clue,
    secretCode,
    rewardXp: 75,
    rewardTokens: 35,
    startedAt: Date.now(),
    expiresAt: Date.now() + durationSeconds * 1000,
  };

  const announcement = `🔍 [CAMERA SCAVENGER QUEST] ${quest.clue}\nType !scavenger ${secretCode} or !claim ${secretCode} in chat to earn 75 XP and 35 Tokens!`;
  return await sendSystemConsoleAnnouncement(roomId, announcement, "scavenger");
}

/**
 * Triggers a 2x XP House Multiplier event for chat
 */
export async function triggerHouseMultiplierEvent(
  multiplier = 2,
  durationMinutes = 15,
  roomId = "director",
): Promise<ChatMessage | null> {
  activeMultiplier = {
    multiplier,
    startedAt: Date.now(),
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
  };

  const announcement = `⚡ [HOUSE EVENT] ${multiplier}X XP HOUSE MULTIPLIER IS NOW ACTIVE FOR ${durationMinutes} MINUTES! All chat messages & minigames earn ${multiplier}x bonus XP!`;
  return await sendSystemConsoleAnnouncement(roomId, announcement, "house_event");
}

/**
 * Checks incoming message text against active minigames (Trivia & Camera Scavenger)
 */
export async function processMinigameAnswer(
  userId: string,
  userName: string,
  roomId: string,
  messageText: string,
): Promise<{ solved: boolean; rewardXp?: number; rewardTokens?: number; systemMessage?: ChatMessage } | null> {
  const current = getActiveMinigame();
  if (!current) return null;

  const trimmed = messageText.trim();
  const lower = trimmed.toLowerCase();

  // 1. TRIVIA MATCHING
  if (current.type === "trivia") {
    // Strip "!answer " or "!a " prefix if present
    const cleanedAnswer = lower.replace(/^!(answer|a)\s+/i, "").trim();

    const isMatch = current.acceptableAnswers.some(
      (acceptable) => cleanedAnswer === acceptable || lower.includes(acceptable),
    );

    if (isMatch) {
      activeMinigame = null; // Clear active trivia
      const mult = getActiveMultiplier();
      const finalXp = current.rewardXp * mult;
      const finalTokens = current.rewardTokens;

      // Award XP & Tokens
      const admin = createAdminClient();
      await awardProfileXpAndTokens(admin, userId, finalXp, finalTokens);

      const sysText = `🎉 [SYSTEM] @${userName} correctly answered the trivia: "${current.answer}"! Won +${finalXp} XP and +${finalTokens} Tokens!`;
      const sysMsg = await sendSystemConsoleAnnouncement(roomId, sysText, "system");

      return { solved: true, rewardXp: finalXp, rewardTokens: finalTokens, systemMessage: sysMsg ?? undefined };
    }
  }

  // 2. SCAVENGER QUEST MATCHING
  if (current.type === "scavenger") {
    const codeMatch = lower.includes(current.secretCode.toLowerCase());
    const isCommand = lower.startsWith("!scavenger") || lower.startsWith("!claim");

    if (codeMatch || (isCommand && lower.includes(current.secretCode.toLowerCase()))) {
      activeMinigame = null; // Clear active quest
      const mult = getActiveMultiplier();
      const finalXp = current.rewardXp * mult;
      const finalTokens = current.rewardTokens;

      const admin = createAdminClient();
      await awardProfileXpAndTokens(admin, userId, finalXp, finalTokens);

      const sysText = `🏆 [HOUSE EVENT] @${userName} completed the Camera Scavenger Quest for ${current.roomTitle}! Code "${current.secretCode}" redeemed for +${finalXp} XP and +${finalTokens} Tokens!`;
      const sysMsg = await sendSystemConsoleAnnouncement(roomId, sysText, "house_event");

      return { solved: true, rewardXp: finalXp, rewardTokens: finalTokens, systemMessage: sysMsg ?? undefined };
    }
  }

  return null;
}

/**
 * Internal helper to award XP and tokens to tank_profiles and handle leveling
 */
export async function awardProfileXpAndTokens(
  admin: any,
  userId: string,
  addXp: number,
  addTokens: number,
): Promise<{ newXp: number; newLevel: number; oldLevel: number; leveledUp: boolean; newRank: ChatRank; applied: boolean }> {
  try {
    // Atomic. This used to read xp/tokens, compute in Node, then write back —
    // so two concurrent actions read the same balance and one award was
    // silently lost. For a SPEND it was worse: two /flip commands issued
    // together both passed the balance check and both deducted. Postgres
    // serialises the row, and the function refuses rather than going negative.
    const { data, error } = await admin.rpc("tank_apply_balance_delta", {
      p_user_id: userId,
      p_xp_delta: Math.round(addXp),
      p_token_delta: Math.round(addTokens),
    });

    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      return { newXp: 0, newLevel: 1, oldLevel: 1, leveledUp: false, newRank: getRankForLevel(1), applied: false };
    }

    const newXp = Number(row.new_xp) || 0;
    const oldXp = Number(row.old_xp ?? Math.max(0, newXp - Math.round(addXp))) || 0;
    const newLevel = getLevelForXp(newXp);
    const oldLevel = getLevelForXp(oldXp);

    return {
      newXp,
      newLevel,
      oldLevel,
      leveledUp: Boolean(row.applied) && newLevel > oldLevel,
      newRank: getRankForLevel(newLevel),
      applied: Boolean(row.applied),
    };
  } catch {
    return { newXp: 0, newLevel: 1, oldLevel: 1, leveledUp: false, newRank: getRankForLevel(1), applied: false };
  }
}

/**
 * Automated Cron / Activity Helper: schedules or triggers periodic chat minigame events
 * (e.g. Trivia every 15 mins, Camera Scavenger, Multipliers).
 */
export async function triggerPeriodicChatEvents(roomId = "director"): Promise<{ triggered: boolean; eventType?: string }> {
  const now = Date.now();
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

  // Don't interrupt an active minigame or fire too rapidly
  if (getActiveMinigame()) {
    return { triggered: false };
  }

  if (now - lastPeriodicTriggerTime < FIFTEEN_MINUTES_MS) {
    return { triggered: false };
  }

  lastPeriodicTriggerTime = now;
  const roll = Math.random();

  if (roll < 0.45) {
    await triggerHouseTriviaRound(roomId);
    return { triggered: true, eventType: "trivia" };
  } else if (roll < 0.80) {
    await triggerCameraScavengerQuest(roomId);
    return { triggered: true, eventType: "scavenger" };
  } else {
    await triggerHouseMultiplierEvent(2, 15, roomId);
    return { triggered: true, eventType: "multiplier" };
  }
}
