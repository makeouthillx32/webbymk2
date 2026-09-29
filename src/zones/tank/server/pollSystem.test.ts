import { describe, expect, it } from "bun:test";
import {
  projectPollForViewer,
  type ActivePoll,
} from "./pollContract";

const POLL: ActivePoll = {
  id: "poll_test",
  question: "What should Tank improve next?",
  options: [
    { id: 0, text: "Better director tracking", votes: 1 },
    { id: 1, text: "More chat games", votes: 0 },
  ],
  totalVotes: 1,
  votedUserIds: {
    "guest_123e4567-e89b-42d3-a456-426614174000": 0,
    "11111111-1111-4111-8111-111111111111": 0,
  },
  createdAt: 1,
  expiresAt: null,
  durationMinutes: "indefinite",
  createdBy: "HOUSE",
  active: true,
};

describe("Tank public poll contract", () => {
  it("returns only the requesting viewer's selection", () => {
    const view = projectPollForViewer(
      POLL,
      "guest_123e4567-e89b-42d3-a456-426614174000",
    );
    expect(view.viewerVote).toBe(0);
    expect("votedUserIds" in view).toBe(false);
  });

  it("does not expose another viewer's vote", () => {
    const view = projectPollForViewer(POLL, "anon_c_someone_else");
    expect(view.viewerVote).toBeNull();
    expect("votedUserIds" in view).toBe(false);
  });
});
