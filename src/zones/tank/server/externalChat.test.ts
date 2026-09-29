import { describe, expect, it } from "bun:test";

import {
  isConnectableChatProvider,
  isTankChatProvider,
  normalizeKickChatEvent,
  normalizeTwitchChatEvent,
  normalizeYouTubeChatEvent,
  getProviderGuild,
} from "./externalChatContract";
import {
  createProviderOAuthState,
  decryptProviderCredentials,
  encryptProviderCredentials,
  readProviderOAuthState,
} from "./externalChatStore";

describe("Tank External Chat - Provider Verification", () => {
  it("identifies valid chat providers and connectable providers", () => {
    expect(isTankChatProvider("tank")).toBe(true);
    expect(isTankChatProvider("twitch")).toBe(true);
    expect(isTankChatProvider("kick")).toBe(true);
    expect(isTankChatProvider("youtube")).toBe(true);
    expect(isTankChatProvider("trovo")).toBe(true);
    expect(isTankChatProvider("unknown")).toBe(false);

    expect(isConnectableChatProvider("twitch")).toBe(true);
    expect(isConnectableChatProvider("kick")).toBe(true);
    expect(isConnectableChatProvider("youtube")).toBe(true);
    expect(isConnectableChatProvider("trovo")).toBe(false); // Trovo retired June 30, 2026
    expect(isConnectableChatProvider("tank")).toBe(false);
  });

  it("normalizes Twitch EventSub chat messages", () => {
    const payload = {
      event: {
        message_id: "tw-msg-12345",
        broadcaster_user_id: "channel-99",
        chatter_user_id: "user-42",
        chatter_user_name: "TwitchFan",
        message: {
          text: "Hello from Twitch chat!",
        },
        color: "#9146FF",
        badges: [
          { set_id: "subscriber", id: "12" },
          { set_id: "moderator", id: "1" },
        ],
        message_timestamp: "2026-09-12T20:00:00.000Z",
      },
    };

    const normalized = normalizeTwitchChatEvent(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.provider).toBe("twitch");
    expect(normalized?.messageId).toBe("tw-msg-12345");
    expect(normalized?.channelId).toBe("channel-99");
    expect(normalized?.userId).toBe("user-42");
    expect(normalized?.userName).toBe("TwitchFan");
    expect(normalized?.body).toBe("Hello from Twitch chat!");
    expect(normalized?.nameColor).toBe("#9146FF");
    expect(normalized?.badges).toContain("subscriber");
    expect(normalized?.badges).toContain("moderator");
    expect(normalized?.createdAt).toBe("2026-09-12T20:00:00.000Z");
  });

  it("normalizes Kick webhook chat messages", () => {
    const payload = {
      event: {
        message_id: "kick-msg-67890",
        content: "GG [emote:4148074:HYPERCLAP] [emote:37226:KEKW]",
        emotes: [
          { emote_id: "4148074", positions: [{ s: 3, e: 27 }] },
          { emote_id: "37226", positions: [{ s: 29, e: 46 }] },
        ],
        created_at: "2026-09-12T20:05:00.000Z",
        broadcaster: {
          user_id: "kick-broadcaster-1",
          username: "TankStream",
        },
        sender: {
          user_id: "kick-user-77",
          username: "KickSniper",
          profile_picture: "https://files.kick.com/avatars/77.png",
          identity: {
            username_color: "#53FC18",
            badges: [{ type: "founder" }, { type: "sub_gifter" }],
          },
        },
      },
    };

    const normalized = normalizeKickChatEvent(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.provider).toBe("kick");
    expect(normalized?.messageId).toBe("kick-msg-67890");
    expect(normalized?.channelId).toBe("kick-broadcaster-1");
    expect(normalized?.userId).toBe("kick-user-77");
    expect(normalized?.userName).toBe("KickSniper");
    expect(normalized?.body).toBe("GG [emote:4148074:HYPERCLAP] [emote:37226:KEKW]");
    expect(normalized?.nameColor).toBe("#53FC18");
    expect(normalized?.avatarUrl).toBe("https://files.kick.com/avatars/77.png");
    expect(normalized?.badges).toContain("founder");
    expect(normalized?.badges).toContain("sub_gifter");
  });

  it("normalizes YouTube Live Chat events", () => {
    const payload = {
      id: "yt-msg-9999",
      snippet: {
        type: "textMessageEvent",
        liveChatId: "yt-livechat-abc",
        authorChannelId: "UC1234567890",
        displayMessage: "Watching live on YouTube!",
        publishedAt: "2026-09-12T20:10:00.000Z",
      },
      authorDetails: {
        channelId: "UC1234567890",
        displayName: "YTViewer",
        profileImageUrl: "https://yt3.ggpht.com/avatar.jpg",
        isChatOwner: false,
        isChatModerator: true,
        isChatSponsor: true,
        isVerified: true,
      },
    };

    const normalized = normalizeYouTubeChatEvent(payload);
    expect(normalized).not.toBeNull();
    expect(normalized?.provider).toBe("youtube");
    expect(normalized?.messageId).toBe("yt-msg-9999");
    expect(normalized?.channelId).toBe("yt-livechat-abc");
    expect(normalized?.userName).toBe("YTViewer");
    expect(normalized?.body).toBe("Watching live on YouTube!");
    expect(normalized?.badges).toContain("moderator");
    expect(normalized?.badges).toContain("member");
    expect(normalized?.badges).toContain("verified");

    const withChannelId = normalizeYouTubeChatEvent(payload, "UC-channel-123");
    expect(withChannelId?.channelId).toBe("UC-channel-123");
  });

  it("safely generates and verifies signed OAuth state tokens", () => {
    process.env.TANK_CHAT_PROVIDER_ENCRYPTION_KEY = "test-secret-key-at-least-24-chars-long-tank-secret";

    const stateToken = createProviderOAuthState("twitch", "staff-user-1", "test-verifier-abc");
    const parsed = readProviderOAuthState(stateToken);

    expect(parsed).not.toBeNull();
    expect(parsed?.provider).toBe("twitch");
    expect(parsed?.userId).toBe("staff-user-1");
    expect(parsed?.codeVerifier).toBe("test-verifier-abc");

    // Invalid signature token should fail to parse
    const tampered = stateToken.slice(0, -4) + "XXXX";
    expect(readProviderOAuthState(tampered)).toBeNull();
  });

  it("encrypts and decrypts provider OAuth tokens with AES-256-GCM", () => {
    process.env.TANK_CHAT_PROVIDER_ENCRYPTION_KEY = "test-secret-key-at-least-24-chars-long-tank-secret";

    const original = {
      accessToken: "oauth_access_token_super_secret_xyz123",
      refreshToken: "oauth_refresh_token_abc789",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    const encrypted = encryptProviderCredentials(original);
    expect(encrypted.credential_ciphertext).toBeDefined();
    expect(encrypted.credential_ciphertext).not.toContain("oauth_access_token");

    const decrypted = decryptProviderCredentials(encrypted);
    expect(decrypted.accessToken).toBe(original.accessToken);
    expect(decrypted.refreshToken).toBe(original.refreshToken);
    expect(decrypted.tokenType).toBe(original.tokenType);
    expect(decrypted.expiresAt).toBe(original.expiresAt);
  });

  it("maps external chat providers to their dedicated Tank guilds", () => {
    const yt = getProviderGuild("youtube");
    expect(yt).not.toBeNull();
    expect(yt?.name).toBe("YouTube");
    expect(yt?.tag).toBe("YouTube");
    expect(yt?.bannerColor).toBe("#ff0000");

    const tw = getProviderGuild("twitch");
    expect(tw).not.toBeNull();
    expect(tw?.name).toBe("Twitch");
    expect(tw?.tag).toBe("Twitch");
    expect(tw?.bannerColor).toBe("#9146ff");

    const kick = getProviderGuild("kick");
    expect(kick).not.toBeNull();
    expect(kick?.name).toBe("Kick");
    expect(kick?.tag).toBe("Kick");
    expect(kick?.bannerColor).toBe("#53fc18");

    const trovo = getProviderGuild("trovo");
    expect(trovo).not.toBeNull();
    expect(trovo?.name).toBe("Trovo");
    expect(trovo?.tag).toBe("Trovo");
    expect(trovo?.bannerColor).toBe("#19d66b");

    expect(getProviderGuild("tank")).toBeNull();
    expect(getProviderGuild(undefined)).toBeNull();
  });
});
