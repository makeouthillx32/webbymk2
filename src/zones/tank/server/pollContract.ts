export type PollOption = {
  id: number;
  text: string;
  votes: number;
};

export type ActivePoll = {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  votedUserIds: Record<string, number>;
  createdAt: number;
  expiresAt: number | null;
  durationMinutes: number | "indefinite";
  createdBy: string;
  active: boolean;
};

export type PollView = Omit<ActivePoll, "votedUserIds"> & {
  /** The requesting viewer's selection. Other voter identifiers stay private. */
  viewerVote?: number | null;
};

export function sanitizeAnonymousPollClientId(value?: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return /^c_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/.test(cleaned) ? cleaned : null;
}

export function projectPollForViewer(
  poll: ActivePoll,
  voterKey: string | null,
): PollView {
  const { votedUserIds, ...publicPoll } = poll;
  return {
    ...publicPoll,
    viewerVote:
      voterKey && votedUserIds[voterKey] !== undefined
        ? votedUserIds[voterKey]
        : null,
  };
}
