import { describe, expect, test } from "bun:test";
import { mergeInitialOverlayMessages } from "./chatOverlayMessages";

describe("Tank chat overlay message queue", () => {
  test("history cannot erase a chat that arrived while it was loading", () => {
    const history = [
      { id: "old-1", body: "one", receivedAt: 100 },
      { id: "old-2", body: "two", receivedAt: 100 },
    ];
    const live = [{ id: "live-1", body: "new", receivedAt: 200 }];

    expect(mergeInitialOverlayMessages(history, live, 3).map((message) => message.id)).toEqual([
      "old-1",
      "old-2",
      "live-1",
    ]);
  });

  test("keeps only the newest configured number without duplicating ids", () => {
    const history = [
      { id: "old-1", body: "old", receivedAt: 100 },
      { id: "shared", body: "history copy", receivedAt: 100 },
    ];
    const live = [
      { id: "shared", body: "live copy", receivedAt: 200 },
      { id: "live-2", body: "newest", receivedAt: 201 },
    ];

    const result = mergeInitialOverlayMessages(history, live, 2);
    expect(result.map((message) => message.id)).toEqual(["shared", "live-2"]);
    expect(result[0]?.body).toBe("live copy");
  });
});
