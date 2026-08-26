export const GIPHY_API_KEY =
  process.env.GIPHY_API_KEY ||
  process.env.NEXT_PUBLIC_GIPHY_API_KEY ||
  "ZKhmUSaxyQIOiGyePCUQ3Sdj24tXXK4C";

export type GiphyMediaItem = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  webpUrl: string;
  mp4Url?: string;
  width: number;
  height: number;
};

export const GIF_TOKEN_REGEX = /\[gif:(https?:\/\/[^\s\]]+|[a-zA-Z0-9_-]+)\]/gi;

/**
 * Formats a GIF token: [gif:YsTs5ltWtEhnq]
 */
export function formatGifToken(idOrUrl: string): string {
  const clean = idOrUrl.trim().replace(/^https?:\/\/media\d*\.giphy\.com\/media\/(?:v1\.[^/]+\/)?([a-zA-Z0-9_-]+)(?:\/.*)?$/i, "$1");
  return `[gif:${clean}]`;
}

/**
 * Extracts GIF IDs or URLs from message text.
 */
export function extractGifTokensFromText(text: string = ""): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  GIF_TOKEN_REGEX.lastIndex = 0;
  while ((match = GIF_TOKEN_REGEX.exec(text))) {
    if (match[1]) tokens.push(match[1]);
  }
  return tokens;
}

/**
 * Converts a GIPHY ID to direct CDN media URLs
 */
export function getGiphyCdnUrl(idOrUrl: string, format: "webp" | "gif" | "mp4" = "webp"): string {
  if (idOrUrl.startsWith("http://") || idOrUrl.startsWith("https://")) {
    return idOrUrl;
  }
  const cleanId = idOrUrl.replace(/[^a-zA-Z0-9_-]/g, "");
  if (format === "webp") {
    return `https://media.giphy.com/media/${cleanId}/200.webp`;
  }
  if (format === "mp4") {
    return `https://media.giphy.com/media/${cleanId}/200.mp4`;
  }
  return `https://media.giphy.com/media/${cleanId}/200.gif`;
}

/**
 * Searches GIPHY for GIFs matching a query
 */
export async function searchGiphyGifs(
  query: string,
  limit = 20,
  rating = "g"
): Promise<{ success: boolean; data: GiphyMediaItem[]; error?: string }> {
  try {
    const trimmed = query.trim();
    if (!trimmed) {
      return await getTrendingGiphyGifs(limit, rating);
    }

    const url = new URL("https://api.giphy.com/v1/gifs/search");
    url.searchParams.set("api_key", GIPHY_API_KEY);
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(Math.min(limit, 50)));
    url.searchParams.set("rating", rating);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { success: false, data: [], error: `GIPHY API returned status ${res.status}` };
    }

    const json = await res.json();
    const items: GiphyMediaItem[] = (json.data ?? []).map((item: any) => {
      const fixed = item.images?.fixed_height || item.images?.downsized || item.images?.original || {};
      return {
        id: String(item.id),
        title: String(item.title || "GIF"),
        url: String(fixed.url || item.url || ""),
        previewUrl: String(fixed.url || ""),
        webpUrl: String(fixed.webp || fixed.url || ""),
        mp4Url: fixed.mp4 ? String(fixed.mp4) : undefined,
        width: Number(fixed.width || 200),
        height: Number(fixed.height || 200),
      };
    });

    return { success: true, data: items };
  } catch (err) {
    return { success: false, data: [], error: err instanceof Error ? err.message : "Search failed" };
  }
}

/**
 * Fetches Trending GIPHY GIFs
 */
export async function getTrendingGiphyGifs(
  limit = 20,
  rating = "g"
): Promise<{ success: boolean; data: GiphyMediaItem[]; error?: string }> {
  try {
    const url = new URL("https://api.giphy.com/v1/gifs/trending");
    url.searchParams.set("api_key", GIPHY_API_KEY);
    url.searchParams.set("limit", String(Math.min(limit, 50)));
    url.searchParams.set("rating", rating);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { success: false, data: [], error: `GIPHY API returned status ${res.status}` };
    }

    const json = await res.json();
    const items: GiphyMediaItem[] = (json.data ?? []).map((item: any) => {
      const fixed = item.images?.fixed_height || item.images?.downsized || item.images?.original || {};
      return {
        id: String(item.id),
        title: String(item.title || "Trending GIF"),
        url: String(fixed.url || item.url || ""),
        previewUrl: String(fixed.url || ""),
        webpUrl: String(fixed.webp || fixed.url || ""),
        mp4Url: fixed.mp4 ? String(fixed.mp4) : undefined,
        width: Number(fixed.width || 200),
        height: Number(fixed.height || 200),
      };
    });

    return { success: true, data: items };
  } catch (err) {
    return { success: false, data: [], error: err instanceof Error ? err.message : "Trending fetch failed" };
  }
}
