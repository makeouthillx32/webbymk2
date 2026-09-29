import { describe, expect, test } from "bun:test";
import {
  buildChatBrowserSourceUrl,
  buildDirectorBrowserSourceUrl,
  buildTtsBrowserSourceUrl,
} from "./browserSourceUrl";

describe("Tank Director OBS browser source URL", () => {
  test("carries only the options that cannot desynchronise the source", () => {
    // The five render flags are deliberately absent. Programme audio in
    // particular is a hard rule now: there is no parameter that can silence it
    // or point it at a room other than the one on screen.
    const url = new URL(buildDirectorBrowserSourceUrl("https://tank.unenter.live", {
      volume: 140,
      roomLock: "game-room",
    }));

    expect(url.pathname).toBe("/obs/director");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      volume: "100",
      theme: "cctv",
      lock: "game-room",
    });
  });

  test("leaves Director in automatic mode when no room is locked", () => {
    const url = new URL(buildDirectorBrowserSourceUrl("https://tank.unenter.live", {
      volume: 35.4,
      roomLock: "auto",
    }));

    expect(url.searchParams.get("volume")).toBe("35");
    expect(url.searchParams.has("lock")).toBe(false);
  });

  test("a room lock picks the room for picture AND sound together", () => {
    // One lock, both halves. This is why a lock cannot desync anything the way
    // a separate audio source could.
    const url = new URL(buildDirectorBrowserSourceUrl("https://tank.unenter.live", {
      volume: 100,
      roomLock: "kitchen",
    }));
    expect(url.searchParams.get("lock")).toBe("kitchen");
    expect(url.searchParams.has("audio")).toBe(false);
  });
});

test("builds bounded chat and TTS browser source URLs", () => {
  const chat = new URL(buildChatBrowserSourceUrl("https://tank.unenter.live", {
    room: "global",
    layout: "bottom-up",
    theme: "tank",
    limit: 99,
    ttlSeconds: 30,
    avatars: true,
    badges: true,
    events: false,
    replies: true,
  }));
  expect(chat.pathname).toBe("/obs/chat");
  expect(chat.searchParams.get("limit")).toBe("25");
  expect(chat.searchParams.get("ttl")).toBe("30");
  expect(chat.searchParams.get("events")).toBe("off");

  const tts = new URL(buildTtsBrowserSourceUrl("https://tank.unenter.live", {
    scope: "room",
    room: "game-room",
    volume: 80,
    voice: "Brian",
    showCard: true,
    captions: true,
  }));
  expect(tts.pathname).toBe("/obs/tts");
  expect(tts.searchParams.get("room")).toBe("game-room");
  expect(tts.searchParams.get("voice")).toBe("Brian");
});
