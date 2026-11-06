// Tank TV: the living room TV shows what the chat's commands do to the house.
// Items used and flexed, lucky drops, level-ups, house events (the XP
// multiplier, sounds played, polls), the camera scavenger quest, the game
// stations board (/line), the Tavern's status (/bar) and /me actions each
// get a card on the screen, one after another in chat order. The dice, coin,
// slots, roulette and crates play on the game table instead (tableGames.ts),
// and plain chat stays in chat.
//
// The chat stays the source of truth: every card is read off a console line
// the text chat shows too, so a command works the same typed in chat with or
// without the house on screen. Long-running events (a quest's countdown, the
// multiplier) stay up in a corner of the screen while they last.

import type { ChatMessage } from "../../contracts";
import { FRESH_MS, MAX_WAITING, wobble } from "./tableGames";

export type TvCard = {
  id: string;
  at: number;
  title: string;
  /** The body, already cleaned of its console tags. */
  lines: string[];
  emoji: string;
  /** One of our own /images icons, if the line names an item. */
  icon: string;
  accent: string;
  seconds: number;
};

export type TvStatus = {
  multiplier: { x: number; endsAt: number } | null;
  quest: { clue: string; endsAt: number } | null;
};

const CARD_SECONDS = 4.5;
const BOARD_SECONDS = 8;
/** A camera scavenger quest runs this long (chatMinigames.ts). */
export const QUEST_MS = 90_000;

const ACCENT = {
  item: "#c084fc",
  drop: "#4ade80",
  level: "#fbbf24",
  house: "#fb923c",
  quest: "#38bdf8",
  board: "#f5ecd7",
  tavern: "#f59e0b",
  action: "#94a3b8",
  poll: "#f472b6",
};

/** Strip a console line's leading emoji and [TAG], and the "💡 type /…" footer. */
export function cleanBody(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^[^\p{L}\p{N}@#[(•"]*\[[A-Z0-9 ]+\]\s*/u, "").trim())
    .filter((line) => line && !/^💡/u.test(line));
}

const ownIcon = (value: unknown) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "");

const isHouse = (m: ChatMessage) => m.role === "system" || /^(SYSTEM|HOUSE|HOUSE EVENT)$/.test(m.user);

/** Queue chatter the TV leaves to chat: who stepped into which line. */
const QUEUE_NOISE = /stepped (in|out of) line|already in line|line for .* is currently full|table is full|not waiting in any|stepped in line for the Bartender Apron|stepped out of the Tavern queue/i;

/** The card a chat line puts on the TV, if any. */
export function tvCardOf(message: ChatMessage): TvCard | null {
  const parsed = message.createdAt ? Date.parse(message.createdAt) : NaN;
  const at = Number.isFinite(parsed) ? parsed : 0;
  const body = typeof message.body === "string" ? message.body.slice(0, 600) : "";
  const lines = cleanBody(body);
  if (!lines.length) return null;
  const base = { id: message.id, at, lines, icon: "", seconds: CARD_SECONDS };
  // The table games have their own table.
  if (message.diceRoll || message.coinflip || message.slotsResult || message.rouletteResult || message.crateResult) return null;

  switch (message.messageType) {
    case "item_use":
    case "item_flex":
      return {
        ...base,
        title: message.messageType === "item_flex" ? "ITEM FLEX" : "ITEM USED",
        emoji: "✨",
        icon: ownIcon(message.itemIconUrl),
        accent: ACCENT.item,
      };
    case "rng_drop":
      return { ...base, title: "LUCKY DROP", emoji: "🍀", accent: ACCENT.drop };
    case "level_up":
      return { ...base, title: "LEVEL UP", emoji: "⭐", accent: ACCENT.level };
    case "scavenger":
      return { ...base, title: "SCAVENGER QUEST", emoji: "🔍", accent: ACCENT.quest, seconds: BOARD_SECONDS };
    case "trivia":
      return { ...base, title: "TRIVIA", emoji: "❓", accent: ACCENT.quest, seconds: BOARD_SECONDS };
    case "house_event":
      return {
        ...base,
        title: /scavenger quest/i.test(body) ? "QUEST CLEARED" : /multiplier/i.test(body) ? "XP MULTIPLIER" : "HOUSE",
        emoji: /multiplier/i.test(body) ? "⚡" : /scavenger/i.test(body) ? "🏆" : "🏠",
        icon: ownIcon(message.itemIconUrl),
        accent: ACCENT.house,
      };
    case "announcement":
      return { ...base, title: "HOUSE POLL", emoji: "🗳️", accent: ACCENT.poll, seconds: BOARD_SECONDS };
    case "duel":
      return { ...base, title: "DUEL", emoji: "⚔️", accent: ACCENT.house };
    case "action": {
      if (QUEUE_NOISE.test(body)) return null;
      if (/^🎪/u.test(body)) {
        return { ...base, title: "GAME STATIONS", emoji: "🎪", accent: ACCENT.board, seconds: BOARD_SECONDS, lines: lines.map((l) => l.replace(/^•\s*/, "")) };
      }
      if (/^🍺/u.test(body)) return { ...base, title: "THE TAVERN", emoji: "🍺", accent: ACCENT.tavern, seconds: BOARD_SECONDS };
      if (/^[⚔]/u.test(body) || /mutiny/i.test(body)) return { ...base, title: "MUTINY", emoji: "⚔️", accent: ACCENT.tavern };
      if (isHouse(message)) return null;
      return { ...base, title: "ON AIR", emoji: "🎬", accent: ACCENT.action };
    }
    default:
      return null;
  }
}

/** What a line changes about the house's long-running events. */
export function applyStatus(status: TvStatus, message: ChatMessage, nowMs: number): TvStatus {
  const parsed = message.createdAt ? Date.parse(message.createdAt) : NaN;
  const at = Number.isFinite(parsed) ? parsed : nowMs;
  const body = typeof message.body === "string" ? message.body : "";
  if (message.messageType === "scavenger") {
    const clue = cleanBody(body)[0] ?? "";
    return { ...status, quest: { clue: clue.slice(0, 160), endsAt: at + QUEST_MS } };
  }
  if (message.messageType === "house_event") {
    if (/completed the Camera Scavenger Quest/i.test(body)) return { ...status, quest: null };
    const multiplier = body.match(/(\d+)X XP HOUSE MULTIPLIER.*?FOR (\d+) MINUTES/i);
    if (multiplier) return { ...status, multiplier: { x: Number(multiplier[1]), endsAt: at + Number(multiplier[2]) * 60_000 } };
  }
  return status;
}

/** The TV's queue: like the game table's, a fresh line plays once, in order. */
export class TvFeed {
  private seen = new Set<string>();
  private waiting: TvCard[] = [];
  private current: { card: TvCard; startedAt: number } | null = null;
  status: TvStatus = { multiplier: null, quest: null };

  offer(messages: readonly ChatMessage[], nowMs: number): void {
    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      this.seen.add(message.id);
      // Status follows history too (a quest still running when you arrive), as long as it hasn't ended.
      this.status = applyStatus(this.status, message, nowMs);
      const card = tvCardOf(message);
      if (!card) continue;
      const at = card.at || nowMs;
      if (nowMs - at > FRESH_MS) continue;
      this.waiting.push({ ...card, at });
    }
    this.waiting.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    if (this.waiting.length > MAX_WAITING) this.waiting.splice(0, this.waiting.length - MAX_WAITING);
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
  }

  /** The long-running events still running at `nowMs`. */
  live(nowMs: number): TvStatus {
    const { multiplier, quest } = this.status;
    return {
      multiplier: multiplier && multiplier.endsAt > nowMs ? multiplier : null,
      quest: quest && quest.endsAt > nowMs ? quest : null,
    };
  }

  tick(now: number): { card: TvCard; t: number } | null {
    if (this.current && now - this.current.startedAt >= this.current.card.seconds) this.current = null;
    if (!this.current) {
      const next = this.waiting.shift();
      if (next) this.current = { card: next, startedAt: now };
    }
    return this.current ? { card: this.current.card, t: now - this.current.startedAt } : null;
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────

/** The screen is about 2.6 : 1. */
export const TV_CANVAS = { width: 416, height: 160 };

type Ctx = CanvasRenderingContext2D;
const MONO = "ui-monospace, Menlo, Consolas, monospace";
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Break text into lines no wider than `width` at the current font. */
export function wrap(ctx: Pick<Ctx, "measureText">, text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
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

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Paint the screen: a card at `t` seconds in, or the channel's idle screen. */
export function drawTv(ctx: Ctx, card: TvCard | null, t: number, status: TvStatus, nowMs: number): void {
  const { width: w, height: h } = TV_CANVAS;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#06080c";
  ctx.fillRect(0, 0, w, h);
  // Scanlines.
  ctx.fillStyle = "#ffffff08";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  const footer = h - 16;
  if (card) {
    // Slides in, holds, fades its accent out at the end.
    const enter = Math.min(1, t / 0.25);
    const x0 = Math.round((1 - enter) * 40);
    ctx.fillStyle = card.accent;
    ctx.fillRect(0, 0, w, 22);
    ctx.font = `bold 13px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0b0d12";
    ctx.fillText(card.title, 10 + x0, 12);
    ctx.textAlign = "right";
    ctx.fillText("TANK TV", w - 10, 12);

    const image = iconImage(card.icon);
    const textLeft = 84;
    if (image) ctx.drawImage(image, 14 + x0, 34, 56, 56);
    else {
      ctx.font = `44px ${EMOJI}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(card.emoji, 42 + x0, 64 + Math.round(Math.sin(t * 6) * 2));
    }
    const small = card.lines.length > 3;
    ctx.font = `bold ${small ? 11 : 14}px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lineHeight = small ? 14 : 19;
    const rows = wrap(ctx, card.lines.join("\n"), w - textLeft - 12).slice(0, Math.floor((footer - 32) / lineHeight));
    // Typed out, a few characters a frame.
    let budget = Math.floor(t * 90);
    rows.forEach((row, i) => {
      const shown = row.slice(0, Math.max(0, budget));
      budget -= row.length;
      ctx.fillStyle = i === 0 ? "#f5ecd7" : "#cbd5e1";
      ctx.fillText(shown, textLeft + x0, 30 + i * lineHeight);
    });
  } else {
    // Idle: the channel ident, with whatever is running.
    const glow = 0.6 + 0.4 * Math.sin(nowMs / 700);
    ctx.font = `bold 26px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(251, 146, 60, ${glow.toFixed(2)})`;
    ctx.fillText("TANK TV", w / 2, status.quest ? 30 : 58);
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = "#94a3b8";
    if (status.quest) {
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`🔍 SCAVENGER QUEST · ${clock(status.quest.endsAt - nowMs)}`, w / 2, 56);
      ctx.fillStyle = "#e2e8f0";
      ctx.textBaseline = "top";
      wrap(ctx, status.quest.clue, w - 40)
        .slice(0, 4)
        .forEach((row, i) => ctx.fillText(row, w / 2, 68 + i * 14));
    } else {
      ctx.fillText("/line  /bar  /use <item>  /me <action>  /quest", w / 2, 90);
      // A little static so the screen reads as on.
      for (let i = 0; i < 40; i += 1) {
        const step = Math.floor(nowMs / 120);
        ctx.fillStyle = "#ffffff14";
        ctx.fillRect(Math.floor(wobble("tv", step * 40 + i) * w), Math.floor(wobble("tv", step * 40 + i + 999) * h), 2, 1);
      }
    }
  }

  if (status.multiplier) {
    const label = `⚡ ${status.multiplier.x}X XP · ${clock(status.multiplier.endsAt - nowMs)}`;
    ctx.font = `bold 11px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(label).width + 12;
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(w - width - 6, footer - 2, width, 15);
    ctx.fillStyle = "#0b0d12";
    ctx.fillText(label, w - 12, footer + 6);
  }
}
