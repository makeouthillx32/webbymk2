import { describe, expect, test } from "bun:test";
import { parseTankChatOverlayConfig, parseTankTtsOverlayConfig } from "./overlayConfig";

describe("Tank OBS overlay query contracts", () => {
  test("chat settings are bounded and unsafe room keys fall back", () => {
    const result = parseTankChatOverlayConfig(
      new URLSearchParams("room=../../secret&limit=999&ttl=-5&fontSize=4&events=off"),
    );
    expect(result.room).toBe("global");
    expect(result.limit).toBe(25);
    expect(result.ttlSeconds).toBe(0);
    expect(result.fontSize).toBe(14);
    expect(result.events).toBe(false);
  });

  test("chat defaults to a short rolling stack", () => {
    const result = parseTankChatOverlayConfig(new URLSearchParams());
    expect(result.limit).toBe(4);
    expect(result.ttlSeconds).toBe(20);
  });

  test("TTS accepts the KickTools-style volume and voice presentation controls", () => {
    const result = parseTankTtsOverlayConfig(
      new URLSearchParams("scope=both&room=game-room&voice=Brian&volume=80&showCard=off"),
    );
    expect(result).toMatchObject({
      scope: "both",
      room: "game-room",
      fallbackVoice: "Brian",
      volume: 80,
      showCard: false,
    });
  });
});

describe("chat overlay placement and backing", () => {
  const cfg = (q: string) => parseTankChatOverlayConfig(new URLSearchParams(q));

  test("defaults to a transparent full-width column on the left", () => {
    // Transparent is the only safe default: an OBS source that paints a
    // background covers whatever is under it.
    const c = cfg("");
    expect(c.align).toBe("left");
    expect(c.widthPercent).toBe(100);
    expect(c.background).toBe("transparent");
  });

  test("accepts each side and each Tank plate", () => {
    expect(cfg("align=right").align).toBe("right");
    expect(cfg("align=center").align).toBe("center");
    expect(cfg("background=green").background).toBe("green");
    expect(cfg("background=blue").background).toBe("blue");
    expect(cfg("background=dark").background).toBe("dark");
  });

  test("an unknown side or backing falls back rather than breaking the source", () => {
    // These arrive from a URL an operator typed into OBS; a throw here is a
    // blank browser source mid-stream.
    expect(cfg("align=diagonal").align).toBe("left");
    expect(cfg("background=plaid").background).toBe("transparent");
  });

  test("width is clamped to something still readable", () => {
    expect(cfg("width=999").widthPercent).toBe(100);
    expect(cfg("width=1").widthPercent).toBe(15);
    expect(cfg("width=40").widthPercent).toBe(40);
  });

  test("background opacity is clamped and independent of text", () => {
    // Applied to a colour underneath, never as `opacity` on the element —
    // that would fade the messages too and make chat unreadable.
    expect(cfg("bgOpacity=500").backgroundOpacity).toBe(100);
    expect(cfg("bgOpacity=-20").backgroundOpacity).toBe(0);
    expect(cfg("bgOpacity=50").backgroundOpacity).toBe(50);
  });
});
