import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeYouTubeChatEvent } from "./externalChatContract";
import {
  decryptProviderCredentials,
  encryptProviderCredentials,
  ingestExternalChatMessage,
} from "./externalChatStore";

declare global {
  // eslint-disable-next-line no-var
  var __tankYouTubePollerTimer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line no-var
  var __tankYouTubePollerInFlight: boolean | undefined;
  // eslint-disable-next-line no-var
  var __tankYouTubeCachedLiveChatId: { id: string; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __tankYouTubeNextPageToken: string | undefined;
}

const IDLE_POLL_INTERVAL_MS = 25_000;
const MIN_ACTIVE_POLL_INTERVAL_MS = 1_500;

async function refreshYouTubeToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  const clientId = process.env.TANK_YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.TANK_YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn("[YouTubePoller] Token refresh failed with status", res.status);
      return null;
    }
    const data = await res.json() as Record<string, unknown>;
    const accessToken = String(data.access_token || "");
    const expiresIn = Number(data.expires_in || 3600);
    if (!accessToken) return null;
    return { accessToken, expiresIn };
  } catch (err) {
    console.error("[YouTubePoller] Token refresh request error:", err);
    return null;
  }
}

async function getValidYouTubeToken(admin: ReturnType<typeof createAdminClient>): Promise<{
  accessToken: string;
  channelId: string;
} | null> {
  const { data: row } = await admin
    .from("tank_chat_provider_connections")
    .select("status, enabled, provider_channel_id, credential_ciphertext, credential_iv, credential_tag, token_expires_at")
    .eq("provider", "youtube")
    .maybeSingle();

  if (!row || !row.enabled || row.status !== "connected") return null;
  if (!row.credential_ciphertext || !row.credential_iv || !row.credential_tag) return null;

  let creds;
  try {
    creds = decryptProviderCredentials({
      credential_ciphertext: row.credential_ciphertext,
      credential_iv: row.credential_iv,
      credential_tag: row.credential_tag,
    });
  } catch (err) {
    console.error("[YouTubePoller] Failed to decrypt credentials:", err);
    return null;
  }

  const expiresAtMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const isExpiringSoon = !expiresAtMs || expiresAtMs < Date.now() + 120_000;

  if (isExpiringSoon && creds.refreshToken) {
    const refreshed = await refreshYouTubeToken(creds.refreshToken);
    if (refreshed) {
      creds.accessToken = refreshed.accessToken;
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
      creds.expiresAt = newExpiresAt;

      const encrypted = encryptProviderCredentials(creds);
      await admin.from("tank_chat_provider_connections").update({
        ...encrypted,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      }).eq("provider", "youtube");
    }
  }

  return {
    accessToken: creds.accessToken,
    channelId: String(row.provider_channel_id || ""),
  };
}

async function fetchActiveLiveChatId(accessToken: string): Promise<string | null> {
  if (globalThis.__tankYouTubeCachedLiveChatId && globalThis.__tankYouTubeCachedLiveChatId.expiresAt > Date.now()) {
    return globalThis.__tankYouTubeCachedLiveChatId.id;
  }

  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    const active = items[0];
    const snippet = active?.snippet as Record<string, unknown> | undefined;
    const liveChatId = typeof snippet?.liveChatId === "string" ? snippet.liveChatId : null;

    if (liveChatId) {
      // Cache for 60 seconds
      globalThis.__tankYouTubeCachedLiveChatId = { id: liveChatId, expiresAt: Date.now() + 60_000 };
      return liveChatId;
    }
    return null;
  } catch (err) {
    console.error("[YouTubePoller] Error discovering active live broadcast:", err);
    return null;
  }
}

export async function pollYouTubeChatOnce(): Promise<{ active: boolean; nextDelayMs: number }> {
  const admin = createAdminClient();
  const auth = await getValidYouTubeToken(admin);
  if (!auth) {
    return { active: false, nextDelayMs: IDLE_POLL_INTERVAL_MS };
  }

  const liveChatId = await fetchActiveLiveChatId(auth.accessToken);
  if (!liveChatId) {
    // Channel is not currently streaming live
    globalThis.__tankYouTubeNextPageToken = undefined;
    return { active: false, nextDelayMs: IDLE_POLL_INTERVAL_MS };
  }

  const pageToken = globalThis.__tankYouTubeNextPageToken;
  const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("part", "id,snippet,authorDetails");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401) {
      // Force token refresh on next tick
      globalThis.__tankYouTubeCachedLiveChatId = undefined;
      return { active: false, nextDelayMs: 5_000 };
    }

    if (res.status === 404 || res.status === 403) {
      // Stream ended or chat disabled
      globalThis.__tankYouTubeCachedLiveChatId = undefined;
      globalThis.__tankYouTubeNextPageToken = undefined;
      return { active: false, nextDelayMs: IDLE_POLL_INTERVAL_MS };
    }

    if (!res.ok) {
      return { active: true, nextDelayMs: 5_000 };
    }

    const data = await res.json() as Record<string, unknown>;
    const nextPageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
    globalThis.__tankYouTubeNextPageToken = nextPageToken;

    const pollingInterval = typeof data.pollingIntervalMillis === "number"
      ? data.pollingIntervalMillis
      : 2_500;

    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    if (items.length > 0) {
      for (const item of items) {
        const normalized = normalizeYouTubeChatEvent(item, auth.channelId);
        if (normalized) {
          try {
            await ingestExternalChatMessage(normalized);
          } catch (ingestErr) {
            console.warn("[YouTubePoller] Ingest message warning:", ingestErr);
          }
        }
      }
    }

    return {
      active: true,
      nextDelayMs: Math.max(MIN_ACTIVE_POLL_INTERVAL_MS, pollingInterval),
    };
  } catch (err) {
    console.error("[YouTubePoller] Chat poll request failed:", err);
    return { active: true, nextDelayMs: 5_000 };
  }
}

function scheduleNextTick(delayMs: number) {
  if (globalThis.__tankYouTubePollerTimer) {
    clearTimeout(globalThis.__tankYouTubePollerTimer);
    globalThis.__tankYouTubePollerTimer = undefined;
  }

  globalThis.__tankYouTubePollerTimer = setTimeout(async () => {
    if (globalThis.__tankYouTubePollerInFlight) return;
    globalThis.__tankYouTubePollerInFlight = true;
    try {
      const { nextDelayMs } = await pollYouTubeChatOnce();
      scheduleNextTick(nextDelayMs);
    } catch (err) {
      console.error("[YouTubePoller] Unhandled poll error:", err);
      scheduleNextTick(10_000);
    } finally {
      globalThis.__tankYouTubePollerInFlight = false;
    }
  }, delayMs);
}

export function startYouTubeChatPoller() {
  if (globalThis.__tankYouTubePollerTimer) return;
  scheduleNextTick(1_000);
}

export function triggerYouTubePoller() {
  globalThis.__tankYouTubeCachedLiveChatId = undefined;
  scheduleNextTick(100);
}

const isTankZone =
  process.env.NEXT_PUBLIC_ZONE === "tank" ||
  process.env.ZONE === "tank" ||
  (!process.env.NEXT_PUBLIC_ZONE && process.env.NODE_ENV !== "production");

if (
  isTankZone &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !globalThis.__tankYouTubePollerTimer
) {
  startYouTubeChatPoller();
}
