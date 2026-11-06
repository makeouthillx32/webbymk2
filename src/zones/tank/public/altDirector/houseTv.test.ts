import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "../../contracts";
import { QUEST_MS, TvFeed, applyStatus, cleanBody, tvCardOf, wrap } from "./houseTv";
import { DEFAULT_STATIONS, tvFov, tvView } from "./houseStations";

const NOW = Date.parse("2026-11-06T21:00:00Z");
const line = (id: string, extra: Partial<ChatMessage>, msAgo = 1000): ChatMessage => ({
  id,
  user: "Joe",
  body: "",
  time: "",
  createdAt: new Date(NOW - msAgo).toISOString(),
  ...extra,
});

describe("tvCardOf", () => {
  test("puts the house's command lines on the TV", () => {
    expect(tvCardOf(line("a", { messageType: "item_use", body: "Joe swings a lightsaber", itemIconUrl: "/images/tank-items/lightsaber.png" }))).toMatchObject({
      title: "ITEM USED",
      icon: "/images/tank-items/lightsaber.png",
      lines: ["Joe swings a lightsaber"],
    });
    expect(tvCardOf(line("b", { messageType: "rng_drop", body: "Joe finds a sock" }))?.title).toBe("LUCKY DROP");
    expect(tvCardOf(line("c", { messageType: "level_up", user: "SYSTEM", body: "🎉 [LEVEL UP] @Joe reached Level 5! Rank Unlocked: Regular!" }))).toMatchObject({
      title: "LEVEL UP",
      lines: ["@Joe reached Level 5! Rank Unlocked: Regular!"],
    });
    expect(tvCardOf(line("d", { messageType: "action", body: "Joe dances on the table" }))?.title).toBe("ON AIR");
    expect(tvCardOf(line("e", { messageType: "house_event", user: "HOUSE EVENT", body: "⚡ [HOUSE EVENT] 2X XP HOUSE MULTIPLIER IS NOW ACTIVE FOR 15 MINUTES!" }))?.title).toBe("XP MULTIPLIER");
    expect(tvCardOf(line("f", { messageType: "announcement", user: "HOUSE", body: "📊 New poll: pizza?" }))?.title).toBe("HOUSE POLL");
  });

  test("the /line board and /bar status are cards; the line-up chatter isn't", () => {
    const board = tvCardOf(
      line("a", {
        messageType: "action",
        user: "SYSTEM",
        body: "🎪 [TANK GAME STATIONS]\n• The Lucky Coin: 🟢 Free (No line)\n• Dice Table: 🟢 Free (No line)\n💡 Type /line to check lines",
      }),
    );
    expect(board).toMatchObject({ title: "GAME STATIONS", lines: ["The Lucky Coin: 🟢 Free (No line)", "Dice Table: 🟢 Free (No line)"] });
    expect(tvCardOf(line("b", { messageType: "action", user: "SYSTEM", body: "🍺 [TAVERN] The bar is unstaffed!" }))?.title).toBe("THE TAVERN");
    expect(tvCardOf(line("c", { messageType: "action", body: "🚶 @Joe stepped in line for Dice Table! (Position: #1 | 1 in line)" }))).toBeNull();
    expect(tvCardOf(line("d", { messageType: "action", user: "SYSTEM", body: "something from the house" }))).toBeNull();
  });

  test("plain chat and the table's games stay off the TV", () => {
    expect(tvCardOf(line("a", { messageType: "text", body: "hi" }))).toBeNull();
    expect(tvCardOf(line("b", { messageType: "dice_roll", body: "rolls", diceRoll: { sides: 6, result: 2, crit: false, bonusXp: 0, bonusTokens: 0 } }))).toBeNull();
  });

  test("never draws someone else's icon", () => {
    expect(tvCardOf(line("a", { messageType: "item_use", body: "x", itemIconUrl: "https://evil.example/x.png" }))?.icon).toBe("");
  });
});

describe("status", () => {
  test("the quest runs its 90 s, or until someone clears it", () => {
    const quest = applyStatus({ multiplier: null, quest: null }, line("q", { messageType: "scavenger", body: "🔍 [CAMERA SCAVENGER QUEST] Find the red mug.\nType !scavenger MUG" }, 0), NOW);
    expect(quest.quest).toEqual({ clue: "Find the red mug.", endsAt: NOW + QUEST_MS });
    const cleared = applyStatus(quest, line("w", { messageType: "house_event", body: "🏆 [HOUSE EVENT] @Joe completed the Camera Scavenger Quest for Kitchen!" }), NOW);
    expect(cleared.quest).toBeNull();
  });

  test("the multiplier counts down from when it started", () => {
    const status = applyStatus({ multiplier: null, quest: null }, line("m", { messageType: "house_event", body: "⚡ [HOUSE EVENT] 2X XP HOUSE MULTIPLIER IS NOW ACTIVE FOR 15 MINUTES! All chat…" }, 60_000), NOW);
    expect(status.multiplier).toEqual({ x: 2, endsAt: NOW - 60_000 + 15 * 60_000 });
  });

  test("the feed keeps a running event from history but replays no old cards", () => {
    const feed = new TvFeed();
    feed.offer([line("m", { messageType: "house_event", body: "⚡ [HOUSE EVENT] 2X XP HOUSE MULTIPLIER IS NOW ACTIVE FOR 15 MINUTES!" }, 5 * 60_000)], NOW);
    expect(feed.live(NOW).multiplier?.x).toBe(2);
    expect(feed.live(NOW + 11 * 60_000).multiplier).toBeNull();
    expect(feed.tick(0)).toBeNull();
    feed.offer([line("a", { messageType: "rng_drop", body: "Joe finds a sock" })], NOW);
    expect(feed.tick(0)?.card.id).toBe("a");
  });
});

test("cleanBody and wrap", () => {
  expect(cleanBody("🎉 [SYSTEM] @Joe won\n💡 Type /line")).toEqual(["@Joe won"]);
  const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };
  expect(wrap(ctx, "one two three four", 90)).toEqual(["one two", "three", "four"]);
});

test("the TV cam faces the screen from the room", () => {
  const view = tvView(DEFAULT_STATIONS);
  // The screen faces +x, into the living room, towards the game table.
  expect(view.screen.at[0]).toBeGreaterThan(0.16);
  expect(view.eye[0]).toBeGreaterThan(view.screen.at[0] + 2);
  expect(view.eye[2]).toBeCloseTo(view.screen.at[2]);
  expect(view.screen.width).toBeGreaterThan(1.6);
  expect(tvFov(view, 16 / 9)).toBeLessThan(tvFov(view, 9 / 16));
});
