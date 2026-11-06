// The game table: the living room's coffee table, in front of the couch, is
// where the chat mini-games play out in the house. A /roll, /flip, /slots,
// /roulette or /unbox lands in chat as a console line carrying its result
// (contracts.ts ChatMessage); the table replays each one, in order, on a felt
// mat lying on the table top, seen from straight above (the "Table cam").
//
// The queue and the wording are plain logic; drawTableGame paints one frame of
// a game onto a 2D canvas, which the house maps onto the table as a texture.
// Top down, flat 2D art reads right, so there is nothing to model or rig.

import type { ChatMessage } from "../../contracts";
import type { ItemRarity } from "../../itemRarity";

export type TableGame = { id: string; player: string; at: number } & (
  | { kind: "dice"; sides: number; result: number; crit: boolean; bonusXp: number }
  | { kind: "coin"; choice: "heads" | "tails"; outcome: "heads" | "tails"; won: boolean; wager: number; payout: number }
  | { kind: "slots"; reels: [string, string, string]; won: boolean; multiplier: number; payout: number }
  | { kind: "roulette"; chamber: number; survived: boolean; chambersRemaining: number | null; timeoutSeconds: number | null }
  | { kind: "crate"; crateName: string; rarity: ItemRarity; itemName: string; itemIcon: string; xp: number }
);

export type TableGameKind = TableGame["kind"];

/** A result older than this (by its chat time) is history, not something to replay. */
export const FRESH_MS = 20_000;
/** More than this many waiting: the oldest are dropped, the table never lags far behind chat. */
export const MAX_WAITING = 5;
/** How long the pieces move before the result shows. */
export const PLAY_SECONDS: Record<TableGameKind, number> = { dice: 1.4, coin: 1.5, slots: 1.9, roulette: 1.6, crate: 1.4 };
/** How long the result stays on the table once it has landed. */
export const HOLD_SECONDS = 2.4;

export const gameSeconds = (game: TableGame) => PLAY_SECONDS[game.kind] + HOLD_SECONDS;

const SLOT_SYMBOLS = ["🍒", "🍋", "💎", "🔔", "7️⃣", "⚡"];

const whole = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback);
const clip = (value: unknown, max = 40) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The game a chat line carries, if it is one of the table's. */
export function tableGameOf(message: ChatMessage): TableGame | null {
  const parsed = message.createdAt ? Date.parse(message.createdAt) : NaN;
  const base = { id: message.id, player: clip(message.user, 24) || "Someone", at: Number.isFinite(parsed) ? parsed : 0 };
  if (message.diceRoll) {
    const d = message.diceRoll;
    const sides = Math.max(2, whole(d.sides, 6));
    return { ...base, kind: "dice", sides, result: Math.min(sides, Math.max(1, whole(d.result, 1))), crit: Boolean(d.crit), bonusXp: whole(d.bonusXp) };
  }
  if (message.coinflip) {
    const c = message.coinflip;
    const side = (v: unknown): "heads" | "tails" => (v === "tails" ? "tails" : "heads");
    return { ...base, kind: "coin", choice: side(c.choice), outcome: side(c.outcome), won: Boolean(c.won), wager: whole(c.wager), payout: whole(c.payout) };
  }
  if (message.slotsResult) {
    const s = message.slotsResult;
    const reels = Array.isArray(s.reels) && s.reels.length === 3 ? (s.reels.map((r) => clip(r, 8) || "?") as [string, string, string]) : (["?", "?", "?"] as [string, string, string]);
    return { ...base, kind: "slots", reels, won: Boolean(s.won), multiplier: whole(s.multiplier), payout: whole(s.tokenPayout) };
  }
  if (message.rouletteResult) {
    const r = message.rouletteResult;
    return {
      ...base,
      kind: "roulette",
      chamber: Math.min(6, Math.max(1, whole(r.chamber, 1))),
      survived: Boolean(r.survived),
      chambersRemaining: typeof r.chambersRemaining === "number" ? whole(r.chambersRemaining) : null,
      timeoutSeconds: typeof r.timeoutSeconds === "number" ? whole(r.timeoutSeconds) : null,
    };
  }
  if (message.crateResult) {
    const c = message.crateResult;
    // Icons are our own /images paths; anything else isn't drawn (it would taint the canvas).
    const icon = typeof c.itemIcon === "string" && c.itemIcon.startsWith("/") && !c.itemIcon.startsWith("//") ? c.itemIcon : "";
    return { ...base, kind: "crate", crateName: clip(c.crateName) || "Crate", rarity: c.rarity ?? "common", itemName: clip(c.itemName) || "Something", itemIcon: icon, xp: whole(c.xpAwarded) };
  }
  return null;
}

/** One line for the HUD once a game has landed. */
export function describeTableGame(game: TableGame): string {
  switch (game.kind) {
    case "dice":
      return `${game.player} rolled ${game.result} on a d${game.sides}${game.crit ? ". Critical!" : "."}`;
    case "coin":
      return `${game.player} called ${game.choice}, it landed ${game.outcome}. ${game.won ? `Won ${game.payout} tokens.` : game.wager ? `Lost ${game.wager} tokens.` : "No luck."}`;
    case "slots":
      return `${game.player} spun ${game.reels.join(" ")}. ${game.won ? `×${game.multiplier}, ${game.payout} tokens.` : "Nothing."}`;
    case "roulette":
      return game.survived
        ? `${game.player} pulled chamber ${game.chamber}. Click. Still here.`
        : `${game.player} pulled chamber ${game.chamber}. Bang.${game.timeoutSeconds ? ` Out for ${game.timeoutSeconds}s.` : ""}`;
    case "crate":
      return `${game.player} opened a ${game.crateName}: ${game.itemName} (${game.rarity}).`;
  }
}

/**
 * The line of games waiting for the table, played one after another. Every
 * viewer replays the same chat in the same order, so everyone at the table
 * sees the same game. Old lines (a chat history load) are skipped.
 */
export class TableQueue {
  private seen = new Set<string>();
  private waiting: TableGame[] = [];
  private current: { game: TableGame; startedAt: number } | null = null;

  /** Offer chat lines; new, fresh games join the line. `nowMs` is wall time. */
  offer(messages: readonly ChatMessage[], nowMs: number): void {
    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      const game = tableGameOf(message);
      if (!game) continue;
      this.seen.add(message.id);
      // An optimistic copy has no server time yet; it is fresh by definition.
      const at = game.at || nowMs;
      if (nowMs - at > FRESH_MS) continue;
      this.waiting.push({ ...game, at });
    }
    this.waiting.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    if (this.waiting.length > MAX_WAITING) this.waiting.splice(0, this.waiting.length - MAX_WAITING);
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
  }

  /** Advance the clock (seconds); returns what's on the table and how far into it. */
  tick(now: number): { game: TableGame; t: number } | null {
    if (this.current && now - this.current.startedAt >= gameSeconds(this.current.game)) this.current = null;
    if (!this.current) {
      const next = this.waiting.shift();
      if (next) this.current = { game: next, startedAt: now };
    }
    return this.current ? { game: this.current.game, t: now - this.current.startedAt } : null;
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────

export const TABLE_CANVAS = { width: 312, height: 240 };

const FELT = "#17462f";
const FELT_DARK = "#0f3322";
const RIM = "#b8893a";
const INK = "#f5ecd7";
const WIN = "#7ee787";
const LOSE = "#ff7b72";

const RARITY_COLOUR: Record<string, string> = {
  common: "#cbd5e1",
  uncommon: "#4ade80",
  rare: "#60a5fa",
  epic: "#c084fc",
  legendary: "#fbbf24",
  mythic: "#f472b6",
};

/** A repeatable 0..1 from a game id and a step, so every screen shows the same tumble. */
export function wobble(id: string, step: number): number {
  let h = 0x811c9dc5 ^ step;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return ((h >>> 0) % 10_000) / 10_000;
}

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

type Ctx = CanvasRenderingContext2D;

function text(ctx: Ctx, value: string, x: number, y: number, size: number, colour = INK, align: CanvasTextAlign = "center") {
  ctx.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#00000099";
  ctx.fillText(value, x + 1, y + 2);
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
}

function emoji(ctx: Ctx, value: string, x: number, y: number, size: number) {
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

/** The felt mat: an oval like the table, leaving the table's own rim showing. */
function drawMat(ctx: Ctx, w: number, h: number, accent: string | null) {
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = RIM;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 12, h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = FELT;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 34, h / 2 - 30, 0, 0, Math.PI * 2);
  ctx.strokeStyle = accent ?? FELT_DARK;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function drawDie(ctx: Ctx, x: number, y: number, size: number, angle: number, face: number, sides: number, glow: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.18);
  ctx.fillStyle = "#f8f4ea";
  ctx.fill();
  ctx.lineWidth = glow ? 4 : 2;
  ctx.strokeStyle = glow ? "#fbbf24" : "#3b2f1e";
  ctx.stroke();
  if (sides === 6 && PIPS[face]) {
    ctx.fillStyle = "#1c1917";
    for (const [px, py] of PIPS[face]) {
      ctx.beginPath();
      ctx.arc(px * size * 0.26, py * size * 0.26, size * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.font = `bold ${Math.round(size * (face >= 100 ? 0.36 : 0.5))}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1c1917";
    ctx.fillText(String(face), 0, size * 0.03);
  }
  ctx.restore();
}

function header(ctx: Ctx, w: number, game: TableGame, label: string) {
  text(ctx, game.player, w / 2, 40, 15);
  text(ctx, label, w / 2, 58, 10, "#d6c8a4");
}

const icons = new Map<string, HTMLImageElement>();
function iconImage(src: string): HTMLImageElement | null {
  if (!src || typeof Image === "undefined") return null;
  let image = icons.get(src);
  if (!image) {
    image = new Image();
    image.src = src;
    icons.set(src, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Paint the table: the idle mat when `game` is null, else game `game` at `t` seconds in. */
export function drawTableGame(ctx: Ctx, game: TableGame | null, t: number): void {
  const { width: w, height: h } = TABLE_CANVAS;
  ctx.imageSmoothingEnabled = false;
  const play = game ? PLAY_SECONDS[game.kind] : 0;
  const landed = Boolean(game) && t >= play;
  const p = game ? Math.min(1, t / play) : 0;

  if (!game) {
    drawMat(ctx, w, h, null);
    text(ctx, "GAME TABLE", w / 2, h / 2 - 14, 18, "#e9d9a8");
    text(ctx, "/roll  /flip  /slots", w / 2, h / 2 + 12, 11, "#a7c4b2");
    text(ctx, "/roulette  /unbox", w / 2, h / 2 + 28, 11, "#a7c4b2");
    return;
  }

  switch (game.kind) {
    case "dice": {
      drawMat(ctx, w, h, landed && game.crit ? "#fbbf24" : null);
      header(ctx, w, game, `d${game.sides}`);
      // Thrown in from the left, bouncing to a stop mid-table.
      const travel = easeOut(p);
      const x = 70 + (w / 2 - 70) * travel;
      const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 26;
      const y = h / 2 + 14 - bounce;
      const step = Math.floor(t * 14);
      const face = landed ? game.result : 1 + Math.floor(wobble(game.id, step) * (game.sides === 6 ? 6 : game.sides));
      const angle = landed ? 0 : (1 - p) * 7 + wobble(game.id, step + 99) * 0.4;
      drawDie(ctx, x, y, 54, angle, face, game.sides, landed && game.crit);
      if (landed) {
        text(ctx, game.crit ? "CRITICAL!" : `rolled ${game.result}`, w / 2, h - 46, 14, game.crit ? "#fbbf24" : INK);
        if (game.bonusXp) text(ctx, `+${game.bonusXp} XP`, w / 2, h - 30, 10, WIN);
      }
      return;
    }
    case "coin": {
      drawMat(ctx, w, h, landed ? (game.won ? WIN : LOSE) : null);
      header(ctx, w, game, `called ${game.choice}${game.wager ? ` · ${game.wager} T` : ""}`);
      // Up, spinning edge-on, and back down on the outcome.
      const lift = Math.sin(p * Math.PI);
      const r = 26 + lift * 12;
      const spin = landed ? 1 : Math.cos(t * 22);
      const showing = landed ? game.outcome : spin >= 0 ? "heads" : "tails";
      const x = w / 2;
      const y = h / 2 + 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.max(0.12, Math.abs(spin)), 1);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = showing === "heads" ? "#e3b341" : "#c9d1d9";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = showing === "heads" ? "#9a6b12" : "#6e7781";
      ctx.stroke();
      ctx.font = `bold ${Math.round(r)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = showing === "heads" ? "#7a4f00" : "#3d444d";
      ctx.fillText(showing === "heads" ? "H" : "T", 0, 2);
      ctx.restore();
      if (landed) {
        text(ctx, game.outcome.toUpperCase(), w / 2, h - 50, 14);
        text(ctx, game.won ? `WIN +${game.payout} T` : game.wager ? `LOSE −${game.wager} T` : "LOSE", w / 2, h - 32, 12, game.won ? WIN : LOSE);
      }
      return;
    }
    case "slots": {
      drawMat(ctx, w, h, landed ? (game.won ? WIN : null) : null);
      header(ctx, w, game, "777 slots");
      // Three reels stop one after another.
      const stops = [0.5, 0.75, 1].map((f) => f * PLAY_SECONDS.slots);
      for (let i = 0; i < 3; i += 1) {
        const x = w / 2 + (i - 1) * 58;
        const y = h / 2 + 10;
        roundRect(ctx, x - 25, y - 28, 50, 56, 6);
        ctx.fillStyle = "#1b1b22";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = RIM;
        ctx.stroke();
        const stopped = t >= stops[i];
        const symbol = stopped ? game.reels[i] : SLOT_SYMBOLS[Math.floor(wobble(game.id, Math.floor(t * 16) + i * 31) * SLOT_SYMBOLS.length)];
        const shake = stopped ? 0 : (wobble(game.id, Math.floor(t * 30) + i) - 0.5) * 10;
        emoji(ctx, symbol, x, y + shake + 2, 28);
      }
      if (landed) {
        text(ctx, game.won ? `×${game.multiplier}  +${game.payout} T` : "no win", w / 2, h - 34, 13, game.won ? WIN : "#d6c8a4");
      }
      return;
    }
    case "roulette": {
      const bang = landed && !game.survived;
      drawMat(ctx, w, h, landed ? (game.survived ? WIN : LOSE) : null);
      if (bang && t - play < 0.35) {
        ctx.fillStyle = "#ff7b72cc";
        ctx.fillRect(0, 0, w, h);
      }
      header(ctx, w, game, `chamber ${game.chamber} of 6`);
      // The cylinder spins and settles with the pulled chamber at the top.
      const cx = w / 2;
      const cy = h / 2 + 14;
      const settle = -((game.chamber - 1) / 6) * Math.PI * 2;
      const angle = settle + (1 - easeOut(p)) * Math.PI * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fillStyle = "#4b4f57";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#2a2d33";
      ctx.stroke();
      for (let i = 0; i < 6; i += 1) {
        const a = angle + (i / 6) * Math.PI * 2 - Math.PI / 2;
        const spent = i < game.chamber - 1;
        const pulled = i === game.chamber - 1;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 9, 0, Math.PI * 2);
        ctx.fillStyle = pulled && landed ? (game.survived ? "#111" : "#f85149") : spent ? "#1d1f23" : "#0b0c0e";
        ctx.fill();
        if (pulled && landed) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = game.survived ? WIN : "#ffd8d3";
          ctx.stroke();
        }
      }
      // The hammer, top centre.
      ctx.fillStyle = RIM;
      ctx.fillRect(cx - 3, cy - 58, 6, 12);
      if (landed) {
        text(ctx, game.survived ? "click." : "BANG!", w / 2, h - 34, game.survived ? 14 : 20, game.survived ? WIN : LOSE);
      }
      return;
    }
    case "crate": {
      const colour = RARITY_COLOUR[game.rarity] ?? INK;
      drawMat(ctx, w, h, landed ? colour : null);
      header(ctx, w, game, game.crateName);
      const cx = w / 2;
      const cy = h / 2 + 16;
      // Rattles, then the lid flies and the prize rises out.
      const shake = landed ? 0 : (wobble(game.id, Math.floor(t * 24)) - 0.5) * 8 * p;
      ctx.fillStyle = "#7c5a2e";
      ctx.fillRect(cx - 30 + shake, cy - 22, 60, 44);
      ctx.strokeStyle = "#3d2a12";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 30 + shake, cy - 22, 60, 44);
      ctx.beginPath();
      ctx.moveTo(cx - 30 + shake, cy);
      ctx.lineTo(cx + 30 + shake, cy);
      ctx.stroke();
      if (landed) {
        const rise = easeOut((t - play) / 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy - 4 - rise * 6, 26, 0, Math.PI * 2);
        ctx.fillStyle = `${colour}55`;
        ctx.fill();
        const image = iconImage(game.itemIcon);
        if (image) ctx.drawImage(image, cx - 20, cy - 24 - rise * 6, 40, 40);
        else emoji(ctx, "🎁", cx, cy - 4 - rise * 6, 30);
        text(ctx, game.itemName, w / 2, h - 44, 12, colour);
        text(ctx, game.rarity.toUpperCase(), w / 2, h - 28, 9, colour);
      } else {
        ctx.fillStyle = "#3d2a12";
        ctx.fillRect(cx - 34 + shake, cy - 28, 68, 10);
      }
      return;
    }
  }
}
