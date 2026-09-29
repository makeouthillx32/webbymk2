// Server-only data access module for external chat provider credentials and deduplication.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage, TankChatProvider } from "../contracts";
import { getAutomodConfig, validateMessageAgainstAutomod } from "./chatModerationDb";
import { getProviderGuild, type ConnectableChatProvider, type NormalizedExternalChatMessage } from "./externalChatContract";

export type ProviderCredentials = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
};

export type SafeChatProviderConnection = {
  provider: TankChatProvider;
  configured: boolean;
  enabled: boolean;
  status: "disconnected" | "connecting" | "connected" | "error" | "retired";
  accountId?: string;
  accountName?: string;
  channelId?: string;
  channelName?: string;
  connectedAt?: string;
  lastEventAt?: string;
  lastError?: string;
};

type EncryptedCredentials = {
  credential_ciphertext: string;
  credential_iv: string;
  credential_tag: string;
};

function encryptionKey(): Buffer {
  const secret = process.env.TANK_CHAT_PROVIDER_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 24) {
    throw new Error("TANK_CHAT_PROVIDER_ENCRYPTION_KEY must be configured with a high-entropy server secret.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptProviderCredentials(credentials: ProviderCredentials): EncryptedCredentials {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return {
    credential_ciphertext: ciphertext.toString("base64url"),
    credential_iv: iv.toString("base64url"),
    credential_tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptProviderCredentials(row: EncryptedCredentials): ProviderCredentials {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.credential_iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(row.credential_tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.credential_ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as ProviderCredentials;
}

export function createProviderOAuthState(provider: ConnectableChatProvider, userId: string, codeVerifier?: string) {
  const payload = Buffer.from(JSON.stringify({
    provider,
    userId,
    nonce: randomBytes(18).toString("base64url"),
    codeVerifier,
    expiresAt: Date.now() + 10 * 60_000,
  })).toString("base64url");
  const signature = createHmac("sha256", encryptionKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readProviderOAuthState(value: string | undefined) {
  if (!value) return null;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return null;
  const expected = createHmac("sha256", encryptionKey()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      provider?: unknown;
      userId?: unknown;
      nonce?: unknown;
      codeVerifier?: unknown;
      expiresAt?: unknown;
    };
    if (typeof decoded.provider !== "string" || typeof decoded.userId !== "string") return null;
    if (typeof decoded.expiresAt !== "number" || decoded.expiresAt < Date.now()) return null;
    return {
      provider: decoded.provider,
      userId: decoded.userId,
      nonce: String(decoded.nonce ?? ""),
      codeVerifier: typeof decoded.codeVerifier === "string" ? decoded.codeVerifier : undefined,
    };
  } catch {
    return null;
  }
}

function providerConfigured(provider: TankChatProvider): boolean {
  if (provider === "trovo") return false;
  const prefix = provider === "youtube" ? "YOUTUBE" : provider.toUpperCase();
  const baseConfigured = Boolean(
    process.env[`TANK_${prefix}_CLIENT_ID`] &&
    process.env[`TANK_${prefix}_CLIENT_SECRET`] &&
    process.env.TANK_CHAT_PROVIDER_ENCRYPTION_KEY,
  );
  return provider === "twitch"
    ? baseConfigured && Boolean(process.env.TANK_TWITCH_EVENTSUB_SECRET)
    : baseConfigured;
}

const PROVIDERS: TankChatProvider[] = ["twitch", "kick", "youtube", "trovo"];

export async function listSafeChatProviderConnections(): Promise<SafeChatProviderConnection[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_chat_provider_connections")
    .select("provider, enabled, status, provider_account_id, provider_account_name, provider_channel_id, provider_channel_name, connected_at, last_event_at, last_error");
  if (error) throw new Error(error.message);
  const byProvider = new Map((data ?? []).map((row) => [String(row.provider), row]));

  return PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      configured: providerConfigured(provider),
      enabled: provider === "trovo" ? false : Boolean(row?.enabled),
      status: provider === "trovo" ? "retired" : ((row?.status as SafeChatProviderConnection["status"]) ?? "disconnected"),
      accountId: row?.provider_account_id || undefined,
      accountName: row?.provider_account_name || undefined,
      channelId: row?.provider_channel_id || undefined,
      channelName: row?.provider_channel_name || undefined,
      connectedAt: row?.connected_at || undefined,
      lastEventAt: row?.last_event_at || undefined,
      lastError: row?.last_error || undefined,
    };
  });
}

export async function saveProviderConnection(input: {
  provider: ConnectableChatProvider;
  accountId: string;
  accountName: string;
  channelId: string;
  channelName: string;
  scopes: string[];
  credentials: ProviderCredentials;
  createdBy: string;
}) {
  const admin = createAdminClient();
  const encrypted = encryptProviderCredentials(input.credentials);
  const now = new Date().toISOString();
  const { error } = await admin.from("tank_chat_provider_connections").upsert({
    provider: input.provider,
    provider_account_id: input.accountId,
    provider_account_name: input.accountName,
    provider_channel_id: input.channelId,
    provider_channel_name: input.channelName,
    status: "connected",
    enabled: true,
    scopes: input.scopes,
    ...encrypted,
    token_expires_at: input.credentials.expiresAt || null,
    connected_at: now,
    last_error: null,
    created_by: input.createdBy,
    updated_at: now,
  }, { onConflict: "provider" });
  if (error) throw new Error(error.message);
}

export async function disconnectProviderConnection(provider: ConnectableChatProvider) {
  const admin = createAdminClient();
  const { error } = await admin.from("tank_chat_provider_connections").update({
    enabled: false,
    status: "disconnected",
    credential_ciphertext: null,
    credential_iv: null,
    credential_tag: null,
    token_expires_at: null,
    provider_cursor: {},
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("provider", provider);
  if (error) throw new Error(error.message);
}

export async function markProviderConnectionError(provider: ConnectableChatProvider, errorMessage: string) {
  const admin = createAdminClient();
  await admin.from("tank_chat_provider_connections").update({
    status: "error",
    last_error: errorMessage.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("provider", provider);
}

export async function ingestExternalChatMessage(message: NormalizedExternalChatMessage): Promise<{
  accepted: boolean;
  duplicate?: boolean;
  blocked?: boolean;
  message?: ChatMessage;
}> {
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("tank_chat_provider_connections")
    .select("provider_channel_id, enabled, status")
    .eq("provider", message.provider)
    .maybeSingle();
  if (!connection?.enabled || connection.status !== "connected") return { accepted: false };
  if (connection.provider_channel_id && String(connection.provider_channel_id) !== message.channelId) {
    return { accepted: false };
  }

  const automod = await getAutomodConfig();
  const validation = validateMessageAgainstAutomod(message.body, "viewer", automod);
  if (!validation.allowed) return { accepted: false, blocked: true };
  const body = validation.cleanedText ?? message.body;
  const guild = getProviderGuild(message.provider);

  const { data: row, error } = await admin.from("tank_chat_messages").insert({
    room_id: "global",
    user_id: null,
    user_name: message.userName,
    user_role: "viewer",
    body,
    message_type: "text",
    source_provider: message.provider,
    source_message_id: message.messageId,
    source_channel_id: message.channelId,
    source_user_id: message.userId,
    source_avatar_url: message.avatarUrl || null,
    source_name_color: message.nameColor || null,
    source_badges: message.badges,
    metadata: {
      ...(guild ? { clan_tag: guild.tag, clan_color: guild.bannerColor } : {}),
    },
    created_at: message.createdAt,
  }).select("id, created_at").maybeSingle();

  if (error?.code === "23505") return { accepted: true, duplicate: true };
  if (error || !row) throw new Error(error?.message || "External chat message insert failed.");

  const chatMessage: ChatMessage = {
    id: row.id,
    user: message.userName,
    body,
    time: new Date(row.created_at).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }),
    createdAt: row.created_at,
    role: "viewer",
    avatarUrl: message.avatarUrl,
    nameColor: message.nameColor,
    messageType: "text",
    sourceProvider: message.provider,
    sourceMessageId: message.messageId,
    sourceChannelId: message.channelId,
    sourceUserId: message.userId,
    sourceBadges: message.badges,
    ...(guild?.tag ? { clanTag: guild.tag } : {}),
    ...(guild?.bannerColor ? { clanColor: guild.bannerColor } : {}),
    reactions: [],
  };

  const channel = admin.channel("room:global:chat");
  try {
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: chatMessage,
    });
  } finally {
    await admin.removeChannel(channel);
  }
  await admin.from("tank_chat_provider_connections").update({
    last_event_at: row.created_at,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("provider", message.provider);

  return { accepted: true, message: chatMessage };
}

export async function deleteExternalChatMessage(provider: ConnectableChatProvider, sourceMessageId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tank_chat_messages").update({
    deleted_at: new Date().toISOString(),
    deleted_by: `${provider}:moderation`,
  }).eq("source_provider", provider).eq("source_message_id", sourceMessageId).is("deleted_at", null).select("id");
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const channel = admin.channel("room:global:chat");
    try {
      await channel.send({
        type: "broadcast",
        event: "delete_message",
        payload: { messageId: row.id },
      });
    } finally {
      await admin.removeChannel(channel);
    }
  }
  return data?.length ?? 0;
}

async function broadcastDeletedIds(ids: string[]) {
  const admin = createAdminClient();
  for (const messageId of ids) {
    const channel = admin.channel("room:global:chat");
    try {
      await channel.send({
        type: "broadcast",
        event: "delete_message",
        payload: { messageId },
      });
    } finally {
      await admin.removeChannel(channel);
    }
  }
}

export async function clearExternalUserMessages(provider: ConnectableChatProvider, sourceUserId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tank_chat_messages").update({
    deleted_at: new Date().toISOString(),
    deleted_by: `${provider}:moderation`,
  }).eq("source_provider", provider).eq("source_user_id", sourceUserId).is("deleted_at", null).select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.id);
  await broadcastDeletedIds(ids);
  return ids.length;
}

export async function clearExternalProviderMessages(provider: ConnectableChatProvider) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tank_chat_messages").update({
    deleted_at: new Date().toISOString(),
    deleted_by: `${provider}:moderation`,
  }).eq("source_provider", provider).is("deleted_at", null).select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.id);
  await broadcastDeletedIds(ids);
  return ids.length;
}
