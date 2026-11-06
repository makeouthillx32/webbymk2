import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "../../contracts";
import { FRESH_MS, HOLD_SECONDS, MAX_WAITING, PLAY_SECONDS, TableQueue, describeTableGame, gameSeconds, tableGameOf, wobble } from "./tableGames";

const NOW = Date.parse("2026-11-06T20:00:00Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const line = (id: string, extra: Partial<ChatMessage>, msAgo = 1000): ChatMessage => ({
  id,
  user: "Joe",
  body: "",
  time: "",
  createdAt: at(msAgo),
  ...extra,
});
const dice = (id: string, msAgo = 1000) => line(id, { diceRoll: { sides: 20, result: 17, crit: false, bonusXp: 0, bonusTokens: 0 } }, msAgo);

describe("tableGameOf", () => {
  test("reads each mini-game off its chat line", () => {
    expect(tableGameOf(dice("a"))).toMatchObject({ kind: "dice", sides: 20, result: 17, player: "Joe" });
    expect(tableGameOf(line("b", { coinflip: { choice: "heads", outcome: "tails", won: false, wager: 10, payout: 0 } }))).toMatchObject({ kind: "coin", outcome: "tails", won: false });
    expect(tableGameOf(line("c", { slotsResult: { reels: ["🍒", "🍒", "🍒"], outcome: "x", won: true, multiplier: 25, tokenPayout: 250 } }))).toMatchObject({ kind: "slots", payout: 250 });
    expect(tableGameOf(line("d", { rouletteResult: { chamber: 4, survived: false, timeoutSeconds: 120, chambersRemaining: 0 } }))).toMatchObject({ kind: "roulette", chamber: 4, survived: false, timeoutSeconds: 120 });
    expect(tableGameOf(line("e", { crateResult: { crateName: "Mystery", rarity: "rare", itemSlug: "x", itemName: "Lightsaber", itemIcon: "/images/tank-items/lightsaber.png", xpAwarded: 5 } }))).toMatchObject({ kind: "crate", itemIcon: "/images/tank-items/lightsaber.png" });
    expect(tableGameOf(line("f", { body: "hello" }))).toBeNull();
  });

  test("keeps impossible values on the table", () => {
    const game = tableGameOf(line("a", { diceRoll: { sides: 6, result: 99, crit: false, bonusXp: 0, bonusTokens: 0 } }));
    expect(game).toMatchObject({ result: 6 });
    const roulette = tableGameOf(line("b", { rouletteResult: { chamber: 9, survived: true } }));
    expect(roulette).toMatchObject({ chamber: 6, chambersRemaining: null });
  });

  test("only draws icons from our own site", () => {
    const crate = (icon: string) =>
      tableGameOf(line("x", { crateResult: { crateName: "C", rarity: "common", itemSlug: "s", itemName: "I", itemIcon: icon, xpAwarded: 0 } }));
    expect(crate("https://elsewhere.example/a.png")).toMatchObject({ itemIcon: "" });
    expect(crate("//elsewhere.example/a.png")).toMatchObject({ itemIcon: "" });
  });

  test("says what happened in one line", () => {
    expect(describeTableGame(tableGameOf(dice("a"))!)).toBe("Joe rolled 17 on a d20.");
  });
});

describe("TableQueue", () => {
  test("plays fresh games one after another, in chat order", () => {
    const queue = new TableQueue();
    queue.offer([dice("late", 500), dice("early", 3000)], NOW);
    expect(queue.tick(0)?.game.id).toBe("early");
    expect(queue.tick(1)?.game.id).toBe("early");
    const length = gameSeconds(queue.tick(1)!.game);
    expect(length).toBe(PLAY_SECONDS.dice + HOLD_SECONDS);
    expect(queue.tick(length + 0.01)?.game.id).toBe("late");
    expect(queue.tick(length * 2 + 0.1)).toBeNull();
  });

  test("history and repeats never replay", () => {
    const queue = new TableQueue();
    queue.offer([dice("old", FRESH_MS + 1)], NOW);
    expect(queue.tick(0)).toBeNull();
    queue.offer([dice("new")], NOW);
    queue.offer([dice("new")], NOW + 100);
    expect(queue.tick(0)?.game.id).toBe("new");
    expect(queue.tick(100)).toBeNull();
  });

  test("a flood keeps only the newest few", () => {
    const queue = new TableQueue();
    queue.offer(Array.from({ length: MAX_WAITING + 3 }, (_, i) => dice(`g${i}`, 10_000 - i * 100)), NOW);
    expect(queue.tick(0)?.game.id).toBe("g3");
  });

  test("an optimistic line with no server time still plays", () => {
    const queue = new TableQueue();
    queue.offer([{ ...dice("mine"), createdAt: undefined }], NOW);
    expect(queue.tick(0)?.game.id).toBe("mine");
  });
});

test("the tumble is the same on every screen", () => {
  expect(wobble("abc", 3)).toBe(wobble("abc", 3));
  expect(wobble("abc", 3)).not.toBe(wobble("abc", 4));
});
