export type TankChatBodyToken =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "emoji"; shortcode: string; raw: string }
  | { type: "mention"; value: string }
  | { type: "image"; id: string }
  | { type: "gif"; id: string }
  | { type: "kick-emote"; id: string; slug: string };

// Keep Kick first. Its wire token contains colon-delimited text that can also
// resemble Tank's :shortcode: syntax. Matching the complete provider token at
// the earliest position makes the intent explicit and keeps future changes to
// the generic shortcode branch from breaking external emotes.
const INLINE_CHAT_TOKEN_PATTERN =
  /\[emote:(\d+):([^\]\r\n]{1,100})\]|(https?:\/\/[^\s]+)|:([a-z0-9_-]+):|(@[a-zA-Z0-9_.-]+(?:\s+[a-zA-Z0-9_.-]+)?)|\[image(?::)?(\d+)\]|\[gif:(https?:\/\/[^\s\]]+|[a-zA-Z0-9_-]+)\]/gi;

/**
 * Parse the provider-neutral chat body once for every renderer. Kick's webhook
 * sends emotes inline as `[emote:ID:name]`; both the Tank console and OBS
 * overlay consume these same tokens so their behavior cannot drift apart.
 */
export function tokenizeTankChatBody(content: string): TankChatBodyToken[] {
  if (!content) return [];

  const tokens: TankChatBodyToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_CHAT_TOKEN_PATTERN.lastIndex = 0;

  while ((match = INLINE_CHAT_TOKEN_PATTERN.exec(content))) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    const [raw, kickEmoteId, kickEmoteSlug, url, shortcode, mention, imageId, gifId] = match;
    if (kickEmoteId) {
      tokens.push({
        type: "kick-emote",
        id: kickEmoteId,
        slug: kickEmoteSlug.trim() || "Kick emote",
      });
    } else if (url) {
      tokens.push({ type: "url", value: url });
    } else if (shortcode) {
      tokens.push({ type: "emoji", shortcode: shortcode.toLowerCase(), raw });
    } else if (mention) {
      tokens.push({ type: "mention", value: mention });
    } else if (imageId) {
      tokens.push({ type: "image", id: imageId });
    } else if (gifId) {
      tokens.push({ type: "gif", id: gifId });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: "text", value: content.slice(lastIndex) });
  }

  return tokens;
}
