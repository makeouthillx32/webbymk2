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
  /** Defaults to everyone for polls created before participation controls. */
  voterEligibility?: "everyone" | "members";
};

export type PollView = Omit<ActivePoll, "votedUserIds"> & {
  /** The requesting viewer's selection. Other voter identifiers stay private. */
  viewerVote?: number | null;
};

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
