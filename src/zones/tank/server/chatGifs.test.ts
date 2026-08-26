import { describe, expect, it } from "bun:test";
import {
  formatGifToken,
  extractGifTokensFromText,
  getGiphyCdnUrl,
  searchGiphyGifs,
  getTrendingGiphyGifs,
  GIF_TOKEN_REGEX,
} from "./chatGifs";

describe("Tank Chat Inline GIPHY GIF System", () => {
  it("formats and extracts inline gif tokens cleanly", () => {
    expect(formatGifToken("YsTs5ltWtEhnq")).toBe("[gif:YsTs5ltWtEhnq]");
    expect(formatGifToken("https://media.giphy.com/media/YsTs5ltWtEhnq/giphy.gif")).toBe("[gif:YsTs5ltWtEhnq]");

    const message = "look at this cat [gif:YsTs5ltWtEhnq] and another [gif:xUj3Mfn12fNmDa8kmu]";
    const tokens = extractGifTokensFromText(message);
    expect(tokens).toEqual(["YsTs5ltWtEhnq", "xUj3Mfn12fNmDa8kmu"]);
  });

  it("handles direct https URL tokens", () => {
    const text = "check this out [gif:https://media.giphy.com/media/test/200.gif]";
    const tokens = extractGifTokensFromText(text);
    expect(tokens).toEqual(["https://media.giphy.com/media/test/200.gif"]);
  });

  it("builds correct GIPHY CDN URLs for WebP, GIF, and MP4", () => {
    const webp = getGiphyCdnUrl("YsTs5ltWtEhnq", "webp");
    expect(webp).toBe("https://media.giphy.com/media/YsTs5ltWtEhnq/200.webp");

    const gif = getGiphyCdnUrl("YsTs5ltWtEhnq", "gif");
    expect(gif).toBe("https://media.giphy.com/media/YsTs5ltWtEhnq/200.gif");

    const mp4 = getGiphyCdnUrl("YsTs5ltWtEhnq", "mp4");
    expect(mp4).toBe("https://media.giphy.com/media/YsTs5ltWtEhnq/200.mp4");
  });

  it("queries GIPHY Trending endpoint successfully", async () => {
    const res = await getTrendingGiphyGifs(3);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data[0].id).toBeTruthy();
    expect(res.data[0].url).toBeTruthy();
  });

  it("queries GIPHY Search endpoint successfully", async () => {
    const res = await searchGiphyGifs("cat", 2);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data[0].id).toBeTruthy();
  });
});
