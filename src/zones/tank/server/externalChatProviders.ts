// Server-only OAuth and webhook provider integrations for Tank.

import { createHash, randomBytes } from "node:crypto";
import type { ConnectableChatProvider } from "./externalChatContract";
import type { ProviderCredentials } from "./externalChatStore";

type OAuthClient = { clientId: string; clientSecret: string };

export type ProviderAuthorization = {
  url: string;
  codeVerifier?: string;
};

export type ConnectedProviderIdentity = {
  accountId: string;
  accountName: string;
  channelId: string;
  channelName: string;
  scopes: string[];
  credentials: ProviderCredentials;
};

export function createProviderCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

function envPrefix(provider: ConnectableChatProvider) {
  return provider === "youtube" ? "YOUTUBE" : provider.toUpperCase();
}

export function providerOAuthClient(provider: ConnectableChatProvider): OAuthClient | null {
  const prefix = envPrefix(provider);
  const clientId = process.env[`TANK_${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`TANK_${prefix}_CLIENT_SECRET`]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function providerPublicBaseUrl() {
  const raw = process.env.TANK_CHAT_PUBLIC_BASE_URL?.trim() || "https://tank.unenter.live";
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("TANK_CHAT_PUBLIC_BASE_URL must use HTTPS outside localhost.");
  }
  return url.origin;
}

export function providerCallbackUrl(provider: ConnectableChatProvider) {
  return `${providerPublicBaseUrl()}/api/tank/chat-providers/${provider}/callback`;
}

export function buildProviderAuthorization(
  provider: ConnectableChatProvider,
  state: string,
  suppliedCodeVerifier?: string,
): ProviderAuthorization {
  const client = providerOAuthClient(provider);
  if (!client) throw new Error(`${provider} OAuth application keys are not configured.`);
  const redirectUri = providerCallbackUrl(provider);

  if (provider === "twitch") {
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: redirectUri,
      scope: "user:read:chat user:bot channel:bot channel:moderate",
      state,
      force_verify: "true",
    }).toString();
    return { url: url.toString() };
  }

  if (provider === "kick") {
    const codeVerifier = suppliedCodeVerifier || createProviderCodeVerifier();
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const url = new URL("https://id.kick.com/oauth/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: redirectUri,
      scope: "user:read channel:read events:subscribe",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString(), codeVerifier };
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: redirectUri,
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    state,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
  }).toString();
  return { url: url.toString() };
}

async function fetchJson(url: string, init: RequestInit, label: string) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) {
    const p = payload as Record<string, unknown> | null;
    const detail = (p?.message || p?.error_description || p?.error || p?.data || text || response.statusText) as string;
    throw new Error(`${label} failed (${response.status}): ${detail}`);
  }
  return payload as Record<string, unknown>;
}

function tokenCredentials(payload: Record<string, unknown>): ProviderCredentials {
  const accessToken = String(payload.access_token ?? "");
  if (!accessToken) throw new Error("Provider did not return an access token.");
  const expiresIn = Number(payload.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : undefined,
    tokenType: payload.token_type ? String(payload.token_type) : "Bearer",
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined,
  };
}

function scopeList(payload: Record<string, unknown>): string[] {
  if (Array.isArray(payload.scope)) return payload.scope.map(String);
  return String(payload.scope ?? "").split(/[ ,]+/).filter(Boolean);
}

export async function exchangeProviderAuthorizationCode(input: {
  provider: ConnectableChatProvider;
  code: string;
  codeVerifier?: string;
}): Promise<ConnectedProviderIdentity> {
  const client = providerOAuthClient(input.provider);
  if (!client) throw new Error(`${input.provider} OAuth application keys are not configured.`);
  const redirectUri = providerCallbackUrl(input.provider);

  if (input.provider === "twitch") {
    const token = await fetchJson("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    }, "Twitch token exchange");
    const credentials = tokenCredentials(token);
    const identity = await fetchJson("https://api.twitch.tv/helix/users", {
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Client-Id": client.clientId },
    }, "Twitch identity lookup");
    const user = Array.isArray(identity.data) ? identity.data[0] as Record<string, unknown> | undefined : undefined;
    if (!user?.id) throw new Error("Twitch account has no channel identity.");
    return {
      accountId: String(user.id),
      accountName: String(user.display_name || user.login || "Twitch"),
      channelId: String(user.id),
      channelName: String(user.display_name || user.login || "Twitch"),
      scopes: scopeList(token),
      credentials,
    };
  }

  if (input.provider === "kick") {
    if (!input.codeVerifier) throw new Error("Kick PKCE verifier is missing or expired.");
    const token = await fetchJson("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: input.codeVerifier,
      }),
    }, "Kick token exchange");
    const credentials = tokenCredentials(token);
    const identity = await fetchJson("https://api.kick.com/public/v1/users", {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    }, "Kick identity lookup");
    const user = Array.isArray(identity.data) ? identity.data[0] as Record<string, unknown> | undefined : identity.data as Record<string, unknown> | undefined;
    const userId = user?.user_id || user?.id;
    if (!userId) throw new Error("Kick account has no channel identity.");
    const name = String(user?.name || user?.username || user?.slug || "Kick");
    return {
      accountId: String(userId),
      accountName: name,
      channelId: String(userId),
      channelName: name,
      scopes: scopeList(token),
      credentials,
    };
  }

  const token = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  }, "YouTube token exchange");
  const credentials = tokenCredentials(token);
  const identity = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true", {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  }, "YouTube channel lookup");
  const channel = Array.isArray(identity.items) ? identity.items[0] as Record<string, unknown> | undefined : undefined;
  const snippet = channel?.snippet as Record<string, unknown> | undefined;
  if (!channel?.id) throw new Error("The selected Google account has no YouTube channel.");
  return {
    accountId: String(channel.id),
    accountName: String(snippet?.title || "YouTube"),
    channelId: String(channel.id),
    channelName: String(snippet?.title || "YouTube"),
    scopes: scopeList(token).length ? scopeList(token) : ["https://www.googleapis.com/auth/youtube.readonly"],
    credentials,
  };
}

export async function subscribeProviderChat(
  provider: ConnectableChatProvider,
  identity: ConnectedProviderIdentity,
) {
  if (provider === "youtube") {
    const { triggerYouTubePoller } = await import("./youtubeChatPoller");
    triggerYouTubePoller();
    return;
  }
  const client = providerOAuthClient(provider);
  if (!client) throw new Error(`${provider} OAuth application keys are not configured.`);

  if (provider === "kick") {
    await fetchJson("https://api.kick.com/public/v1/events/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${identity.credentials.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_user_id: Number(identity.channelId),
        events: [{ name: "chat.message.sent", version: 1 }],
        method: "webhook",
      }),
    }, "Kick chat subscription");
    return;
  }

  const webhookSecret = process.env.TANK_TWITCH_EVENTSUB_SECRET?.trim();
  if (!webhookSecret || webhookSecret.length < 10 || webhookSecret.length > 100) {
    throw new Error("TANK_TWITCH_EVENTSUB_SECRET must contain 10-100 ASCII characters.");
  }
  const appToken = await fetchJson("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "client_credentials",
    }),
  }, "Twitch app token exchange");
  const accessToken = String(appToken.access_token || "");
  if (!accessToken) throw new Error("Twitch did not return an app access token.");
  const callback = `${providerPublicBaseUrl()}/api/tank/chat-providers/webhooks/twitch`;
  const eventTypes = ["channel.chat.message", "channel.chat.message_delete", "channel.chat.clear_user_messages", "channel.chat.clear"];
  for (const type of eventTypes) {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": client.clientId,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type,
        version: "1",
        condition: { broadcaster_user_id: identity.channelId, user_id: identity.accountId },
        transport: { method: "webhook", callback, secret: webhookSecret },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 409) {
      const text = await response.text().catch(() => "");
      let detail = text;
      try {
        const json = JSON.parse(text);
        detail = json.message || json.error || text;
      } catch {}
      throw new Error(`Twitch ${type} subscription failed (${response.status}): ${detail || response.statusText}`);
    }
  }
}
