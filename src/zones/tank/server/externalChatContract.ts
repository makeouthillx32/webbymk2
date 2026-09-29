import type { TankChatProvider } from "../contracts";

export const CONNECTABLE_CHAT_PROVIDERS = ["twitch", "kick", "youtube"] as const;
export type ConnectableChatProvider = (typeof CONNECTABLE_CHAT_PROVIDERS)[number];

export type NormalizedExternalChatMessage = {
  provider: ConnectableChatProvider;
  messageId: string;
  channelId: string;
  userId: string;
  userName: string;
  body: string;
  avatarUrl?: string;
  nameColor?: string;
  badges: string[];
  createdAt: string;
};

export function isTankChatProvider(value: unknown): value is TankChatProvider {
  return ["tank", "twitch", "kick", "youtube", "trovo"].includes(String(value));
}

export function isConnectableChatProvider(value: unknown): value is ConnectableChatProvider {
  return CONNECTABLE_CHAT_PROVIDERS.includes(value as ConnectableChatProvider);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function cleanUrl(value: unknown): string | undefined {
  const text = cleanText(value, 2048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanColor(value: unknown): string | undefined {
  const text = cleanText(value, 16);
  return /^#[0-9a-f]{6}$/i.test(text) ? text : undefined;
}

function cleanBadges(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((badge) => cleanText(badge, 32).toLowerCase()).filter(Boolean))].slice(0, 12);
}

function cleanCreatedAt(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

export function normalizeExternalChatMessage(value: unknown): NormalizedExternalChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isConnectableChatProvider(row.provider)) return null;

  const messageId = cleanText(row.messageId, 160);
  const channelId = cleanText(row.channelId, 160);
  const userId = cleanText(row.userId, 160);
  const userName = cleanText(row.userName, 80);
  const body = cleanText(row.body, 500);
  if (!messageId || !channelId || !userId || !userName || !body) return null;

  return {
    provider: row.provider,
    messageId,
    channelId,
    userId,
    userName,
    body,
    avatarUrl: cleanUrl(row.avatarUrl),
    nameColor: cleanColor(row.nameColor),
    badges: cleanBadges(row.badges),
    createdAt: cleanCreatedAt(row.createdAt),
  };
}

export function normalizeTwitchChatEvent(payload: unknown): NormalizedExternalChatMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const event = (payload as { event?: Record<string, unknown> }).event;
  if (!event) return null;
  const message = event.message as { text?: unknown } | undefined;
  const badges = Array.isArray(event.badges)
    ? event.badges.map((badge) => (badge && typeof badge === "object" ? (badge as { set_id?: unknown }).set_id : ""))
    : [];

  return normalizeExternalChatMessage({
    provider: "twitch",
    messageId: event.message_id,
    channelId: event.broadcaster_user_id,
    userId: event.chatter_user_id,
    userName: event.chatter_user_name || event.chatter_user_login,
    body: message?.text,
    nameColor: event.color,
    badges,
    createdAt: event.message_timestamp,
  });
}

export function normalizeKickChatEvent(payload: unknown): NormalizedExternalChatMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const event = (raw.event && typeof raw.event === "object" ? raw.event : raw) as Record<string, unknown>;
  const sender = event.sender as Record<string, unknown> | undefined;
  const broadcaster = event.broadcaster as Record<string, unknown> | undefined;
  const identity = sender?.identity as Record<string, unknown> | undefined;
  const badges = Array.isArray(identity?.badges)
    ? identity.badges.map((badge) => (badge && typeof badge === "object" ? (badge as { type?: unknown }).type : ""))
    : [];

  return normalizeExternalChatMessage({
    provider: "kick",
    messageId: event.message_id,
    channelId: broadcaster?.user_id,
    userId: sender?.user_id,
    userName: sender?.username,
    body: event.content,
    avatarUrl: sender?.profile_picture,
    nameColor: identity?.username_color,
    badges,
    createdAt: event.created_at,
  });
}

export function normalizeYouTubeChatEvent(payload: unknown, fallbackChannelId?: string): NormalizedExternalChatMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  const snippet = event.snippet as Record<string, unknown> | undefined;
  const author = event.authorDetails as Record<string, unknown> | undefined;
  if (!snippet || !author || snippet.type !== "textMessageEvent") return null;

  return normalizeExternalChatMessage({
    provider: "youtube",
    messageId: event.id,
    channelId: fallbackChannelId || snippet.liveChatId,
    userId: author.channelId || snippet.authorChannelId,
    userName: author.displayName,
    body: snippet.displayMessage,
    avatarUrl: author.profileImageUrl,
    badges: [
      author.isChatOwner ? "owner" : "",
      author.isChatModerator ? "moderator" : "",
      author.isChatSponsor ? "member" : "",
      author.isVerified ? "verified" : "",
    ],
    createdAt: snippet.publishedAt,
  });
}

export type ProviderGuildInfo = {
  name: string;
  tag: string;
  bannerColor: string;
};

export const PROVIDER_GUILDS: Record<string, ProviderGuildInfo> = {
  youtube: { name: "YouTube", tag: "YouTube", bannerColor: "#ff0000" },
  twitch: { name: "Twitch", tag: "Twitch", bannerColor: "#9146ff" },
  kick: { name: "Kick", tag: "Kick", bannerColor: "#53fc18" },
  trovo: { name: "Trovo", tag: "Trovo", bannerColor: "#19d66b" },
};

export function getProviderGuild(provider?: string | null): ProviderGuildInfo | null {
  if (!provider) return null;
  return PROVIDER_GUILDS[provider.toLowerCase()] ?? null;
}
