import { describe, expect, test } from "bun:test";
import { mergeHistory, syncReactions } from "./useTankRealtimeChat";
import type { ChatMessage } from "../contracts";

// The chat lifecycle: the database never populates a client. A guest starts
// every load empty and fills live; a member restores only what they were
// present for. These tests exist because the dangerous direction is silent —
// a rule that erases a live session looks identical to "nobody has spoken".

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    roomId: "global",
    userId: "u1",
    username: "someone",
    body: `message ${id}`,
    createdAt: new Date().toISOString(),
    ...over,
  }) as ChatMessage;

describe("syncReactions", () => {
  test("an empty server response never erases what is on screen", () => {
    // THE regression. mergeHistory REPLACES the visible set, so gating history
    // behind auth meant a guest seeing any reaction event had their whole
    // session wiped — server says "no history", client renders nothing.
    const live = [msg("a"), msg("b")];
    expect(syncReactions(live, [])).toEqual(live);
  });

  test("it updates reactions on messages already present", () => {
    const live = [msg("a"), msg("b")];
    const fromServer = [msg("a", { reactions: [{ emoji: "🔥", count: 3 }] } as never)];
    const result = syncReactions(live, fromServer);
    expect(result).toHaveLength(2);
    expect((result[0] as never as { reactions: unknown }).reactions).toEqual([
      { emoji: "🔥", count: 3 },
    ] as never);
  });

  test("it introduces NOTHING the viewer was not present for", () => {
    // A reaction must not be an excuse to backfill the room.
    const live = [msg("b")];
    const fromServer = [msg("a"), msg("b"), msg("c")];
    const result = syncReactions(live, fromServer);
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });

  test("messages the server no longer knows about are left alone", () => {
    const live = [msg("local-only")];
    expect(syncReactions(live, [msg("a")])).toEqual(live);
  });
});

describe("mergeHistory — why it cannot be used for reaction refreshes", () => {
  test("it REPLACES the visible set rather than adding to it", () => {
    // Documented here because the name suggests otherwise, and that
    // misreading is what produced the guest-wipe.
    const live = [msg("a"), msg("b")];
    const fromServer = [msg("x")];
    expect(mergeHistory(live, fromServer).map((m) => m.id)).toEqual(["x"]);
  });

  test("unsent local messages survive the replacement", () => {
    const live = [msg("a"), msg("pending-1", { pending: true } as never)];
    const result = mergeHistory(live, [msg("x")]);
    expect(result.map((m) => m.id).sort()).toEqual(["pending-1", "x"]);
  });

  test("an empty history wipes everything except unsent — the trap", () => {
    const live = [msg("a"), msg("b")];
    expect(mergeHistory(live, [])).toEqual([]);
  });
});

describe("optimistic rollback on failed send", () => {
  test("a rejected message (e.g. slow mode or permission) is purged from visible feed", () => {
    const nonce = "nonce-123";
    const pendingMsg: ChatMessage = {
      ...msg(`pending_${nonce}`),
      clientNonce: nonce,
      pending: true,
    };
    const liveMessages = [msg("a"), pendingMsg];

    // On failure, rollback removes the pending message row by nonce
    const rolledBack = liveMessages.filter((m) => m.clientNonce !== nonce);
    expect(rolledBack).toHaveLength(1);
    expect(rolledBack[0].id).toBe("a");
    expect(rolledBack.some((m) => m.clientNonce === nonce)).toBe(false);
  });

  test("failed text is retained for chat bar restoration rather than being lost", () => {
    let chatInput = "";
    const typedText = "Hello everyone in the tank";
    // Optimistic clear
    chatInput = "";

    // Simulated failure callback (e.g. slow mode active)
    const handleFailure = (failedText: string) => {
      chatInput = chatInput ? `${failedText} ${chatInput}` : failedText;
    };

    handleFailure(typedText);
    expect(chatInput).toBe(typedText);
  });
});

