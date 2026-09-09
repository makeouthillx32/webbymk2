// src/zones/tank/tavernTypes.ts
// Plain (non-"use server") types for Tank Tavern — every "use server" file
// under server/tavern*.ts may only export async functions, so shared shapes
// live here instead, same fix pattern as dropCampaignTypes.ts.

export type TavernShiftStatus = "active" | "completed" | "rotated_out" | "stolen";

export type TavernShift = {
  id: string;
  bartenderId: string;
  bartenderName: string;
  bartenderClickId: string | null;
  clickBonusApplies: boolean;
  startedAt: string;
  deadlineAt: string;
  chaos: number;
  sfxAllowanceRemaining: number;
  tipsTokens: number;
  status: TavernShiftStatus;
  takeoverShieldedUntil: string | null;
};

export type TavernChitOutcome = "pending" | "served" | "expired" | "cancelled";

export type TavernChit = {
  id: string;
  shiftId: string;
  dialogue: string;
  payload: Record<string, unknown>;
  troubleType: string | null;
  createdAt: string;
  deadlineAt: string;
  outcome: TavernChitOutcome;
};

export type TavernMutinyStatus = "open" | "overturned" | "defended";

export type TavernMutiny = {
  id: string;
  shiftId: string;
  startedAt: string;
  voteDeadlineAt: string;
  status: TavernMutinyStatus;
  eligibleCount: number | null;
  overturnCount: number | null;
  defendCount: number | null;
  /** Only present for the caller's own vote, never anyone else's. */
  myVote?: "overturn" | "defend" | null;
};

export type TavernQueueStatus = {
  inQueue: boolean;
  position: number | null;
  queueLength: number;
};

export type TavernSfxOption = { soundKey: string; name: string };

/** Guest-safe public snapshot — no queue contents, no votes, no reward internals. */
export type TavernSnapshot = {
  enabled: boolean;
  shift: TavernShift | null;
  chits: TavernChit[];
  mutiny: TavernMutiny | null;
  queueLength: number;
  sfxOptions: TavernSfxOption[];
};

export type TavernActionResult = { success: boolean; error?: string };
