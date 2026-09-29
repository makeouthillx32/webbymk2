// Server-only HTTP handlers for external chat providers and webhooks.

import { createHmac, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "./staffAuth";
import {
  isConnectableChatProvider,
  normalizeKickChatEvent,
  normalizeTwitchChatEvent,
  type ConnectableChatProvider,
} from "./externalChatContract";
import {
  buildProviderAuthorization,
  createProviderCodeVerifier,
  exchangeProviderAuthorizationCode,
  subscribeProviderChat,
} from "./externalChatProviders";
import {
  clearExternalProviderMessages,
  clearExternalUserMessages,
  createProviderOAuthState,
  deleteExternalChatMessage,
  disconnectProviderConnection,
  ingestExternalChatMessage,
  listSafeChatProviderConnections,
  markProviderConnectionError,
  readProviderOAuthState,
  saveProviderConnection,
} from "./externalChatStore";

const OAUTH_COOKIE = "tank_chat_provider_oauth";
const WEBHOOK_MAX_AGE_MS = 10 * 60_000;

function houseRedirect(provider: string, status: "connected" | "error") {
  const url = new URL("/house", process.env.TANK_CHAT_PUBLIC_BASE_URL || "https://tank.unenter.live");
  url.searchParams.set("chatProvider", provider);
  url.searchParams.set("chatProviderStatus", status);
  return url;
}

function oauthCookie(response: NextResponse, value: string, maxAge = 600) {
  response.cookies.set(OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/tank/chat-providers",
    maxAge,
  });
}

export async function handleChatProvidersGet() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, error: "Staff access required." }, { status: 403 });
  try {
    return NextResponse.json({ success: true, connections: await listSafeChatProviderConnections() });
  } catch (error) {
    console.error("[TankExternalChat] connection list failed", error);
    return NextResponse.json({ success: false, error: "Provider connections are temporarily unavailable." }, { status: 503 });
  }
}

export async function handleChatProviderConnect(providerValue: string) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, error: "Staff access required." }, { status: 403 });
  if (!isConnectableChatProvider(providerValue)) {
    return NextResponse.json({ success: false, error: "That chat provider is unavailable." }, { status: 400 });
  }

  try {
    const codeVerifier = providerValue === "kick" ? createProviderCodeVerifier() : undefined;
    const state = createProviderOAuthState(providerValue, staff.id, codeVerifier);
    const authorization = buildProviderAuthorization(providerValue, state, codeVerifier);
    const response = NextResponse.redirect(authorization.url);
    oauthCookie(response, state);
    return response;
  } catch (error) {
    console.error(`[TankExternalChat] ${providerValue} connect failed`, error);
    return NextResponse.json({ success: false, error: "This provider is not configured yet." }, { status: 503 });
  }
}

export async function handleChatProviderCallback(request: NextRequest, providerValue: string) {
  const staff = await requireStaff();
  if (!staff || !isConnectableChatProvider(providerValue)) {
    return NextResponse.redirect(houseRedirect(providerValue, "error"));
  }

  const returnedState = request.nextUrl.searchParams.get("state") || "";
  const cookieState = request.cookies.get(OAUTH_COOKIE)?.value;
  const state = readProviderOAuthState(cookieState);
  const code = request.nextUrl.searchParams.get("code") || "";
  const denied = request.nextUrl.searchParams.get("error");

  if (
    denied ||
    !state ||
    returnedState !== cookieState ||
    state.provider !== providerValue ||
    state.userId !== staff.id ||
    !code
  ) {
    const response = NextResponse.redirect(houseRedirect(providerValue, "error"));
    oauthCookie(response, "", 0);
    return response;
  }

  try {
    const identity = await exchangeProviderAuthorizationCode({
      provider: providerValue,
      code,
      codeVerifier: state.codeVerifier,
    });
    await saveProviderConnection({
      provider: providerValue,
      ...identity,
      createdBy: staff.id,
    });
    try {
      await subscribeProviderChat(providerValue, identity);
    } catch (subscriptionError) {
      const message = subscriptionError instanceof Error ? subscriptionError.message : "Provider subscription failed.";
      await markProviderConnectionError(providerValue, message);
      throw subscriptionError;
    }
    const response = NextResponse.redirect(houseRedirect(providerValue, "connected"));
    oauthCookie(response, "", 0);
    return response;
  } catch (error) {
    console.error(`[TankExternalChat] ${providerValue} callback failed`, error);
    const response = NextResponse.redirect(houseRedirect(providerValue, "error"));
    oauthCookie(response, "", 0);
    return response;
  }
}

export async function handleChatProviderDisconnect(providerValue: string) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, error: "Staff access required." }, { status: 403 });
  if (!isConnectableChatProvider(providerValue)) {
    return NextResponse.json({ success: false, error: "That chat provider is unavailable." }, { status: 400 });
  }
  try {
    await disconnectProviderConnection(providerValue);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[TankExternalChat] ${providerValue} disconnect failed`, error);
    return NextResponse.json({ success: false, error: "Could not disconnect that provider." }, { status: 503 });
  }
}

function freshWebhookTimestamp(timestamp: string) {
  const parsed = new Date(timestamp).valueOf();
  return Number.isFinite(parsed) && Math.abs(Date.now() - parsed) <= WEBHOOK_MAX_AGE_MS;
}

function validTwitchSignature(request: NextRequest, rawBody: string) {
  const secret = process.env.TANK_TWITCH_EVENTSUB_SECRET?.trim();
  const messageId = request.headers.get("twitch-eventsub-message-id") || "";
  const timestamp = request.headers.get("twitch-eventsub-message-timestamp") || "";
  const signature = request.headers.get("twitch-eventsub-message-signature") || "";
  if (!secret || !messageId || !timestamp || !signature || !freshWebhookTimestamp(timestamp)) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(messageId + timestamp + rawBody).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function handleTwitchChatWebhook(request: NextRequest) {
  const rawBody = await request.text();
  if (!validTwitchSignature(request, rawBody)) return new NextResponse("Invalid signature", { status: 403 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return new NextResponse("Invalid JSON", { status: 400 }); }

  const messageType = request.headers.get("twitch-eventsub-message-type");
  if (messageType === "webhook_callback_verification") {
    return new NextResponse(String(payload.challenge || ""), { headers: { "content-type": "text/plain" } });
  }
  if (messageType !== "notification") return new NextResponse(null, { status: 204 });

  const eventType = request.headers.get("twitch-eventsub-subscription-type") || "";
  const event = payload.event as Record<string, unknown> | undefined;
  try {
    if (eventType === "channel.chat.message") {
      const timestamp = request.headers.get("twitch-eventsub-message-timestamp");
      const normalized = normalizeTwitchChatEvent({ event: { ...event, message_timestamp: timestamp } });
      if (normalized) await ingestExternalChatMessage(normalized);
    } else if (eventType === "channel.chat.message_delete" && event?.message_id) {
      await deleteExternalChatMessage("twitch", String(event.message_id));
    } else if (eventType === "channel.chat.clear_user_messages" && event?.target_user_id) {
      await clearExternalUserMessages("twitch", String(event.target_user_id));
    } else if (eventType === "channel.chat.clear") {
      await clearExternalProviderMessages("twitch");
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[TankExternalChat] Twitch webhook ingestion failed", error);
    return new NextResponse("Temporary failure", { status: 503 });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __tankKickPublicKey: { key: string; expiresAt: number } | undefined;
}

async function kickPublicKey() {
  if (globalThis.__tankKickPublicKey && globalThis.__tankKickPublicKey.expiresAt > Date.now()) {
    return globalThis.__tankKickPublicKey.key;
  }
  const response = await fetch("https://api.kick.com/public/v1/public-key", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Kick public-key lookup failed (${response.status}).`);
  const raw = await response.text();
  let key = raw;
  try {
    const parsed = JSON.parse(raw) as { data?: { public_key?: string } | string; public_key?: string };
    key = typeof parsed.data === "string" ? parsed.data : parsed.data?.public_key || parsed.public_key || raw;
  } catch {}
  if (!key.includes("BEGIN PUBLIC KEY")) throw new Error("Kick returned an invalid webhook public key.");
  globalThis.__tankKickPublicKey = { key, expiresAt: Date.now() + 6 * 60 * 60_000 };
  return key;
}

export async function handleKickChatWebhook(request: NextRequest) {
  const rawBody = await request.text();
  const messageId = request.headers.get("kick-event-message-id") || "";
  const timestamp = request.headers.get("kick-event-message-timestamp") || "";
  const signature = request.headers.get("kick-event-signature") || "";
  if (!messageId || !timestamp || !signature || !freshWebhookTimestamp(timestamp)) {
    return new NextResponse("Invalid signature headers", { status: 403 });
  }

  try {
    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${messageId}.${timestamp}.${rawBody}`),
      await kickPublicKey(),
      Buffer.from(signature, "base64"),
    );
    if (!valid) return new NextResponse("Invalid signature", { status:  403 });
    if (request.headers.get("kick-event-type") !== "chat.message.sent") {
      return new NextResponse(null, { status: 204 });
    }
    const normalized = normalizeKickChatEvent(JSON.parse(rawBody));
    if (normalized) await ingestExternalChatMessage(normalized);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[TankExternalChat] Kick webhook ingestion failed", error);
    return new NextResponse("Temporary failure", { status: 503 });
  }
}
