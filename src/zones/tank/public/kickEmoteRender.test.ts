import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TankChatBody } from "./TankChatEmoji";
import { tokenizeTankChatBody } from "./chatBodyTokens";

// Kick chat arrives with emotes as literal "[emote:ID:slug]" tokens in the
// message body. The renderer must turn those into <img> tags pointing at
// Kick's CDN; anything else leaves them as raw text on stream. These tests
// pin the production tokenizer used by both TankChatBody consumers so a
// renderer refactor cannot silently regress global chat or the OBS overlay.

function findKickEmotes(content: string): { id: string; slug: string }[] {
  return tokenizeTankChatBody(content)
    .filter((token) => token.type === "kick-emote")
    .map((token) => ({ id: token.id, slug: token.slug }));
}

describe("kick emote tokens", () => {
  test("extracts id and slug from a single token", () => {
    expect(findKickEmotes("nice one [emote:12345:kek]")).toEqual([
      { id: "12345", slug: "kek" },
    ]);
  });

  test("extracts multiple tokens in order", () => {
    expect(findKickEmotes("[emote:1:a] and [emote:2:b_b]")).toEqual([
      { id: "1", slug: "a" },
      { id: "2", slug: "b_b" },
    ]);
  });

  test("matches Kick's official uppercase webhook example", () => {
    expect(
      findKickEmotes(
        "Hello [emote:4148074:HYPERCLAP] [emote:4148074:HYPERCLAP] [emote:37226:KEKW]",
      ),
    ).toEqual([
      { id: "4148074", slug: "HYPERCLAP" },
      { id: "4148074", slug: "HYPERCLAP" },
      { id: "37226", slug: "KEKW" },
    ]);
  });

  test("keeps punctuation and spaces in custom emote names", () => {
    expect(findKickEmotes("[emote:55:Tank-Hype!] [emote:56:Big Win]")).toEqual([
      { id: "55", slug: "Tank-Hype!" },
      { id: "56", slug: "Big Win" },
    ]);
  });

  test("preserves surrounding Unicode text", () => {
    expect(tokenizeTankChatBody("🔥 [emote:37226:KEKW] gg 🫡")).toEqual([
      { type: "text", value: "🔥 " },
      { type: "kick-emote", id: "37226", slug: "KEKW" },
      { type: "text", value: " gg 🫡" },
    ]);
  });

  test("renders Kick emotes as CDN images in the shared chat body", () => {
    const html = renderToStaticMarkup(
      createElement(TankChatBody, {
        text: "GG [emote:37226:KEKW]",
      }),
    );

    expect(html).toContain('src="https://files.kick.com/emotes/37226/fullsize"');
    expect(html).toContain('alt=":KEKW:"');
    expect(html).not.toContain("[emote:37226:KEKW]");
  });

  test("leaves ordinary bracketed text alone", () => {
    expect(findKickEmotes("[image:3] not an emote")).toEqual([]);
  });

  test("does not match a token missing its slug", () => {
    expect(findKickEmotes("[emote:12345]")).toEqual([]);
  });
});
