"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { isConsoleMessageType, type ChatMessage } from "../contracts";
import { ExternalChatProviderBadge } from "../public/components/ExternalChatProviderBadge";
import { TankChatBody } from "../public/TankChatEmoji";
import { mergeInitialOverlayMessages } from "./chatOverlayMessages";
import { parseTankChatOverlayConfig } from "./overlayConfig";
import styles from "./obsOverlay.module.css";

type VisibleMessage = ChatMessage & { receivedAt: number };

export function TankChatObsOverlay() {
  const search = useSearchParams();
  const config = useMemo(() => parseTankChatOverlayConfig(search), [search]);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const previousHtml = document.documentElement.style.background;
    const previousBody = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.background = previousHtml;
      document.body.style.background = previousBody;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const res = await fetch(`/api/tank/chat/messages?roomId=${encodeURIComponent(config.room)}&overlay=1`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.messages)) {
          const now = Date.now();
          const initial = data.messages
            .filter((msg: ChatMessage) => config.events || !isConsoleMessageType(msg.messageType))
            .slice(-config.limit)
            .map((msg: ChatMessage) => ({ ...msg, receivedAt: now }));
          // Realtime may have delivered a new chat while this request was in
          // flight. Merge instead of replacing the stack so that chat does not
          // flash on screen and then disappear when history finishes loading.
          setMessages((current) => mergeInitialOverlayMessages(initial, current, config.limit));
        }
      } catch {
        // ignore fetch error on mount
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [config.events, config.limit, config.room]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room:${config.room}:chat`);

    channel
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (!payload || typeof payload !== "object") return;
        const message = payload as ChatMessage;
        if (!message.id || !message.body) return;
        if (!config.events && isConsoleMessageType(message.messageType)) return;
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;
          return [...current, { ...message, receivedAt: Date.now() }].slice(-config.limit);
        });
      })
      .on("broadcast", { event: "reaction_changed" }, ({ payload }) => {
        if (!payload?.messageId || !payload?.reaction) return;
        setMessages((current) =>
          current.map((msg) => {
            if (msg.id !== payload.messageId) return msg;
            const existingReactions = msg.reactions ?? [];
            const target = existingReactions.find((r) => r.reaction === payload.reaction);
            let updated: NonNullable<ChatMessage["reactions"]>;
            if (payload.active) {
              if (target) {
                updated = existingReactions.map((r) =>
                  r.reaction === payload.reaction ? { ...r, count: r.count + 1 } : r,
                );
              } else {
                updated = [
                  ...existingReactions,
                  {
                    reaction: payload.reaction as NonNullable<ChatMessage["reactions"]>[number]["reaction"],
                    count: 1,
                    reactedByMe: false,
                  },
                ];
              }
            } else {
              if (target && target.count > 1) {
                updated = existingReactions.map((r) =>
                  r.reaction === payload.reaction ? { ...r, count: r.count - 1 } : r,
                );
              } else {
                updated = existingReactions.filter((r) => r.reaction !== payload.reaction);
              }
            }
            return { ...msg, reactions: updated };
          }),
        );
      })
      .on("broadcast", { event: "delete_message" }, ({ payload }) => {
        if (payload?.messageId) setMessages((current) => current.filter((item) => item.id !== payload.messageId));
      })
      .on("broadcast", { event: "user_banned" }, ({ payload }) => {
        if (payload?.userId) setMessages((current) => current.filter((item) => item.userId !== payload.userId));
      })
      .on("broadcast", { event: "purge_room" }, () => setMessages([]))
      .subscribe((nextStatus) => setStatus(nextStatus.toLowerCase()));

    return () => { void supabase.removeChannel(channel); };
  }, [config.events, config.limit, config.room]);

  useEffect(() => {
    if (config.ttlSeconds === 0) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - config.ttlSeconds * 1000;
      setMessages((current) => current.filter((message) => message.receivedAt >= cutoff));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [config.ttlSeconds]);

  // Tank's own plates, same assets as the console and the emails. Transparent
  // stays the default: an OBS source that paints a background covers whatever
  // is beneath it, which is rarely what an overlay is for.
  const TANK_PATTERNS = {
    green:
      "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/green-bg.png",
    blue: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png",
  } as const;

  const backgroundStyle: React.CSSProperties = (() => {
    if (config.background === "transparent") return {};
    // Alpha lives on a solid colour underneath rather than on `opacity`, which
    // would fade the MESSAGES along with the plate and make chat unreadable.
    const alpha = Math.max(0, Math.min(100, config.backgroundOpacity)) / 100;
    if (config.background === "dark") {
      return { backgroundColor: `rgba(10,10,11,${alpha})` };
    }
    const base = config.background === "green" ? `rgba(99,127,109,${alpha})` : `rgba(43,47,51,${alpha})`;
    return {
      backgroundColor: base,
      backgroundImage: `url("${TANK_PATTERNS[config.background]}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundBlendMode: "multiply",
    };
  })();

  const stackClass = config.layout === "top-down" ? styles.topDown : styles.bottomUp;
  const themeClass = config.theme === "minimal" ? styles.minimalMessage : config.theme === "cards" ? styles.cardMessage : "";

  return (
    <main className={styles.viewport} aria-live="polite">
      {config.debug ? <div className={styles.debug}>CHAT · {config.room} · {status}</div> : null}
      <section
        className={`${styles.chatStack} ${stackClass}`}
        style={{
          fontSize: config.fontSize,
          width: `${config.widthPercent}%`,
          // Pushed to the chosen edge with margin rather than a flex/absolute
          // change, so the existing bottom-up / top-down stacking is untouched.
          marginLeft: config.align === "left" ? 0 : "auto",
          marginRight: config.align === "right" ? 0 : "auto",
          ...backgroundStyle,
        }}
      >
        {messages.map((message) => {
          const consoleEvent = isConsoleMessageType(message.messageType);
          return (
            <article
              className={`${styles.chatMessage} ${themeClass} ${consoleEvent ? styles.houseEvent : ""}`}
              key={message.id}
              style={{ WebkitTextStroke: config.outline ? `${config.outline}px rgba(0,0,0,.55)` : undefined }}
            >
              <div className={styles.messageRow}>
                {!consoleEvent && config.avatars && message.avatarUrl ? <img className={styles.avatar} src={message.avatarUrl} alt="" /> : null}
                <div className={styles.messageBody}>
                  {consoleEvent ? <div className={styles.consoleLabel}>House event</div> : (
                    <div className={styles.header}>
                      <ExternalChatProviderBadge provider={message.sourceProvider} compact />
                      {message.clanTag ? (
                        <span
                          className={styles.badge}
                          style={{
                            backgroundColor: message.clanColor || "#ff5722",
                            color: message.clanColor?.toLowerCase() === "#53fc18" ? "#000000" : "#ffffff",
                            borderColor: message.clanColor ? `${message.clanColor}88` : undefined,
                          }}
                        >
                          {message.clanTag}
                        </span>
                      ) : null}
                      <span className={styles.name} style={{ color: message.nameColor || "#f6f2e8" }}>{message.user || "Guest"}</span>
                      {config.badges && message.role && message.role !== "viewer" ? <span className={styles.badge}>{message.role}</span> : null}
                      {config.badges ? (message.sourceBadges ?? []).slice(0, 2).map((badge) => <span className={styles.badge} key={badge}>{badge}</span>) : null}
                    </div>
                  )}
                  {config.replies && message.replyToUserName ? <div className={styles.reply}>↳ {message.replyToUserName}{message.replyPreview ? ` · ${message.replyPreview}` : ""}</div> : null}
                  <div className={styles.text}><TankChatBody text={message.body} /></div>
                  {message.reactions && message.reactions.length > 0 ? (
                    <div className={styles.reactions}>
                      {message.reactions.map((r) => {
                        const emojiMap: Record<string, string> = { love: "❤️", laugh: "😂", wow: "😮", fire: "🔥", skull: "💀" };
                        return (
                          <span key={r.reaction} className={styles.reactionPill}>
                            <span>{emojiMap[r.reaction] || r.reaction}</span>
                            <span>{r.count}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
