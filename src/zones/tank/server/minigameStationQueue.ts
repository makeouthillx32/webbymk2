// src/zones/tank/server/minigameStationQueue.ts
// Turn-based physical game station queue for Tank minigames.
// Enforces a line of people instead of 50 players spamming RNG simultaneously.

import type { ChatMessage } from "../contracts";

export type StationType = "coin" | "dice" | "slots" | "roulette" | "unbox";

export type QueuedTurn = {
  userId: string;
  userName: string;
  roomId: string;
  command: string;
  params: Record<string, unknown>;
  queuedAt: number;
};

export type ActiveTurn = {
  userId: string;
  userName: string;
  startedAt: number;
  expiresAt: number;
};

export type StationState = {
  type: StationType;
  name: string;
  busy: boolean;
  activeTurn: ActiveTurn | null;
  queue: QueuedTurn[];
  turnDurationMs: number;
  maxQueue: number;
  rouletteState?: {
    chambersRemaining: number;
    bulletIndex: number;
    currentPull: number;
  };
};

const DEFAULT_TURN_DURATION_MS = 3500; // 3.5s cooldown between turns for realistic pacing

const stations: Record<StationType, StationState> = {
  coin: {
    type: "coin",
    name: "The Lucky Coin",
    busy: false,
    activeTurn: null,
    queue: [],
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    maxQueue: 10,
  },
  dice: {
    type: "dice",
    name: "Dice Table",
    busy: false,
    activeTurn: null,
    queue: [],
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    maxQueue: 10,
  },
  slots: {
    type: "slots",
    name: "777 Slot Machine",
    busy: false,
    activeTurn: null,
    queue: [],
    turnDurationMs: 4500, // slots spin a bit longer
    maxQueue: 10, // 1 physical machine, 1 active instance
  },
  roulette: {
    type: "roulette",
    name: "Russian Roulette Table",
    busy: false,
    activeTurn: null,
    queue: [],
    turnDurationMs: 4000,
    maxQueue: 6, // strictly maximum 6 players per cylinder round
    rouletteState: {
      chambersRemaining: 6,
      bulletIndex: Math.floor(Math.random() * 6) + 1,
      currentPull: 1,
    },
  },
  unbox: {
    type: "unbox",
    name: "Mystery Crate Pedestal",
    busy: false,
    activeTurn: null,
    queue: [],
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    maxQueue: 10,
  },
};

export function getStation(type: StationType): StationState {
  return stations[type];
}

export function getAllStations(): Record<StationType, StationState> {
  return stations;
}

/** Reset all stations to default idle state (used between test suites) */
export function resetStationsForTesting(): void {
  for (const key of Object.keys(stations) as StationType[]) {
    const s = stations[key];
    s.busy = false;
    s.activeTurn = null;
    s.queue = [];
    if (key === "roulette") {
      s.rouletteState = {
        chambersRemaining: 6,
        bulletIndex: Math.floor(Math.random() * 6) + 1,
        currentPull: 1,
      };
    }
  }
}

/** Check if an active turn has expired past its safety timeout (15s) */
function cleanStaleTurn(station: StationState): void {
  if (station.activeTurn && Date.now() > station.activeTurn.expiresAt) {
    station.activeTurn = null;
    station.busy = false;
  }
}

export type QueueJoinResult =
  | { status: "turn_ready" }
  | { status: "queued"; position: number; queueLength: number }
  | { status: "already_queued"; position: number; queueLength: number }
  | { status: "queue_full"; maxQueue: number; queueLength: number };

/**
 * Attempt to take a turn or join the queue at a minigame station.
 */
export function enqueueTurn(
  type: StationType,
  item: Omit<QueuedTurn, "queuedAt">,
): QueueJoinResult {
  const station = stations[type];
  cleanStaleTurn(station);

  // If station is currently idle and nobody is waiting, player takes turn immediately!
  if (!station.busy && station.queue.length === 0) {
    station.busy = true;
    station.activeTurn = {
      userId: item.userId,
      userName: item.userName,
      startedAt: Date.now(),
      expiresAt: Date.now() + 15000, // 15s max timeout safety
    };
    return { status: "turn_ready" };
  }

  // Check if player is already queued
  const existingIdx = station.queue.findIndex((q) => q.userId === item.userId);
  if (existingIdx !== -1) {
    // Update params/command if they typed a new wager
    station.queue[existingIdx].command = item.command;
    station.queue[existingIdx].params = item.params;
    return {
      status: "already_queued",
      position: existingIdx + 1,
      queueLength: station.queue.length,
    };
  }

  // Check if queue has reached maximum player capacity (e.g. 6 for Roulette)
  if (station.queue.length >= station.maxQueue) {
    return {
      status: "queue_full",
      maxQueue: station.maxQueue,
      queueLength: station.queue.length,
    };
  }

  // If player is currently the active player taking their turn, allow queueing for next
  station.queue.push({
    ...item,
    queuedAt: Date.now(),
  });

  return {
    status: "queued",
    position: station.queue.length,
    queueLength: station.queue.length,
  };
}

/**
 * Remove a player from a station queue (e.g. /leave)
 */
export function leaveStationQueue(
  userId: string,
  type?: StationType,
): { left: boolean; stationName?: string } {
  const targetTypes: StationType[] = type ? [type] : (Object.keys(stations) as StationType[]);
  for (const st of targetTypes) {
    const s = stations[st];
    const idx = s.queue.findIndex((q) => q.userId === userId);
    if (idx !== -1) {
      s.queue.splice(idx, 1);
      return { left: true, stationName: s.name };
    }
  }
  return { left: false };
}

/**
 * Mark active turn finished, and advance the queue.
 * Returns the next queued turn if someone is waiting in line.
 */
export function completeTurn(type: StationType): QueuedTurn | null {
  const station = stations[type];
  station.activeTurn = null;

  if (station.queue.length > 0) {
    const next = station.queue.shift()!;
    station.busy = true;
    station.activeTurn = {
      userId: next.userId,
      userName: next.userName,
      startedAt: Date.now(),
      expiresAt: Date.now() + 15000,
    };
    return next;
  } else {
    station.busy = false;
    return null;
  }
}

/**
 * Russian roulette shared chamber advance:
 * Returns { chamber, survived, chambersRemaining }
 * When a bullet fires, automatically reloads and spins for the next player!
 */
export function pullRouletteTrigger(): {
  chamber: number;
  survived: boolean;
  chambersRemaining: number;
} {
  const station = stations.roulette;
  if (!station.rouletteState) {
    station.rouletteState = {
      chambersRemaining: 6,
      bulletIndex: Math.floor(Math.random() * 6) + 1,
      currentPull: 1,
    };
  }

  const currentPull = station.rouletteState.currentPull;
  const isBullet = currentPull === station.rouletteState.bulletIndex;

  if (isBullet) {
    // Bullet fired! Reset the gun for the next round
    const chamber = currentPull;
    station.rouletteState = {
      chambersRemaining: 6,
      bulletIndex: Math.floor(Math.random() * 6) + 1,
      currentPull: 1,
    };
    return { chamber, survived: false, chambersRemaining: 0 };
  } else {
    // Empty click! Advance chamber
    const chamber = currentPull;
    station.rouletteState.currentPull += 1;
    station.rouletteState.chambersRemaining = Math.max(0, 6 - currentPull);
    return {
      chamber,
      survived: true,
      chambersRemaining: station.rouletteState.chambersRemaining,
    };
  }
}

export type TavernSnapshotSummary = {
  enabled: boolean;
  shift: { bartenderName: string; chaos: number; tipsTokens: number } | null;
  chits: { id: string }[];
  queueLength: number;
};

/**
 * Format a chat report showing all station lines and status, including the Tavern
 */
export function formatLinesStatusReport(tavern?: TavernSnapshotSummary | null): string {
  const lines: string[] = ["🎪 [TANK GAME STATIONS]"];
  for (const key of Object.keys(stations) as StationType[]) {
    const s = stations[key];
    cleanStaleTurn(s);
    let statusText = "🟢 Free (No line)";
    if (s.activeTurn) {
      const wait = s.queue.length;
      statusText = `🔴 Busy: @${s.activeTurn.userName} playing${wait > 0 ? ` | Line: ${wait}/${s.maxQueue} waiting` : ""}`;
    }
    let extra = "";
    if (key === "roulette" && s.rouletteState) {
      extra = ` [${s.rouletteState.chambersRemaining}/6 in cylinder, Max 6 in line]`;
    } else if (key === "slots") {
      extra = " [1 Physical Machine]";
    }
    lines.push(`• ${s.name}: ${statusText}${extra}`);
  }

  if (tavern) {
    if (!tavern.enabled) {
      lines.push("• 🍺 The Tavern (Bartender): 🔒 Closed for the night");
    } else if (tavern.shift) {
      lines.push(
        `• 🍺 The Tavern (Bartender): 🟢 Active Bartender: @${tavern.shift.bartenderName} (Chaos: ${tavern.shift.chaos}%, Tips: ${tavern.shift.tipsTokens}T, Orders: ${tavern.chits.length}) | Line: ${tavern.queueLength} waiting for Apron`,
      );
    } else {
      lines.push(
        `• 🍺 The Tavern (Bartender): ⚠️ No bartender on shift! | Line: ${tavern.queueLength} waiting (Type /bar join)`,
      );
    }
  }

  lines.push("💡 Type /line to check lines, or step up with /flip, /slots, /roll, /roulette, /unbox, /bar!");
  return lines.join("\n");
}
