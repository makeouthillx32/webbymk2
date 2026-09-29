"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  Shield,
  Megaphone,
  Tv,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  CornerUpLeft,
  X,
  Globe2,
  ChevronRight,
  Smile,
  Eye,
  Columns,
  Flame,
  Radio,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { ChatMessage, DerivedRoom } from "../contracts";
import { isConsoleMessageType } from "../contracts";
import { ExternalChatProviderBadge } from "../public/components/ExternalChatProviderBadge";
import { formatLocalChatTime } from "../public/components/ChatConsolePanel";
import { broadcastConsoleMessage } from "../server/actions";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";

export type HouseLiveChatConsoleProps = {
  rooms?: DerivedRoom[];
  operatorName: string;
  operatorRole: "admin" | "moderator";
  initialRoom?: string;
  compact?: boolean;
  onOpenOverlayWorkshop?: () => void;
};

const EMOJI_REACTIONS = [
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "skull", emoji: "💀", label: "Skull" },
] as const;

const QUICK_TEXT_EMOJIS = ["🔥", "❤️", "👑", "💀", "😂", "⚡", "🎉", "👀", "🫡", "🚀"];

export function HouseLiveChatConsole({
  rooms = [],
  operatorName,
  operatorRole,
  initialRoom = "global",
  compact = false,
}: HouseLiveChatConsoleProps) {
  const [selectedRoom, setSelectedRoom] = useState<string>(initialRoom);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isPostingAsConsole, setIsPostingAsConsole] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [viewMode, setViewMode] = useState<"console" | "overlay" | "split">(
    compact ? "console" : "console",
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [origin, setOrigin] = useState("https://tank.unenter.live");
  const [testSending, setTestSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const roomOptions = [
    { roomKey: "global", title: "Global Chat", isGlobal: true },
    ...rooms
      .filter((r) => r.roomKey !== "global")
      .map((r) => ({ roomKey: r.roomKey, title: r.title, isGlobal: false })),
  ];

  // If rooms list doesn't include standard defaults, add fallbacks
  const allRooms = roomOptions.length > 1 ? roomOptions : [
    { roomKey: "global", title: "Global Chat", isGlobal: true },
    { roomKey: "game-room", title: "Game Room", isGlobal: false },
    { roomKey: "living-room", title: "Living Room", isGlobal: false },
    { roomKey: "kitchen", title: "Kitchen", isGlobal: false },
    { roomKey: "foyer", title: "The Foyer", isGlobal: false },
    { roomKey: "makeup-room", title: "Makeup Room", isGlobal: false },
    { roomKey: "game-room-2", title: "Game Room 2", isGlobal: false },
    { roomKey: "director", title: "Director", isGlobal: false },
  ];

  const overlayUrl = `${origin}/obs/chat?room=${encodeURIComponent(selectedRoom)}&layout=bottom-up&theme=tank&limit=8&ttl=60&avatars=1&badges=1&events=1&replies=1`;

  const fetchHistory = useCallback(async (roomId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tank/chat/messages?roomId=${encodeURIComponent(roomId)}&overlay=1`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Room history fetch & realtime subscription
  useEffect(() => {
    void fetchHistory(selectedRoom);

    const supabase = createClient();
    const channel = supabase.channel(`room:${selectedRoom}:chat`);

    channel
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (!payload || typeof payload !== "object") return;
        const msg = payload as ChatMessage;
        if (!msg.id || !msg.body) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg].slice(-80);
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
                    reactedByMe: payload.userId ? true : false,
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
        if (payload?.messageId) {
          setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
        }
      })
      .on("broadcast", { event: "user_banned" }, ({ payload }) => {
        if (payload?.userId) {
          setMessages((prev) => prev.filter((m) => m.userId !== payload.userId));
        }
      })
      .on("broadcast", { event: "purge_room" }, () => setMessages([]))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedRoom, fetchHistory]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleToggleReaction = async (messageId: string, reaction: string) => {
    try {
      const res = await fetch("/api/tank/chat/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, reaction }),
      });
      if (res.ok) {
        const json = await res.json();
        setMessages((current) =>
          current.map((msg) => {
            if (msg.id !== messageId) return msg;
            const existing = msg.reactions ?? [];
            const found = existing.find((r) => r.reaction === reaction);
            let updated;
            if (json.active) {
              if (found) {
                updated = existing.map((r) =>
                  r.reaction === reaction ? { ...r, count: r.count + 1, reactedByMe: true } : r,
                );
              } else {
                updated = [...existing, { reaction: reaction as any, count: 1, reactedByMe: true }];
              }
            } else {
              if (found && found.count > 1) {
                updated = existing.map((r) =>
                  r.reaction === reaction ? { ...r, count: r.count - 1, reactedByMe: false } : r,
                );
              } else {
                updated = existing.filter((r) => r.reaction !== reaction);
              }
            }
            return { ...msg, reactions: updated };
          }),
        );
      }
    } catch {
      // ignore reaction network error
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setStatusMessage(null);

    try {
      if (isPostingAsConsole) {
        const res = await broadcastConsoleMessage(selectedRoom, text);
        if (res.success) {
          setInputText("");
          setReplyTarget(null);
        } else {
          setStatusMessage(res.error || "Failed to broadcast console announcement.");
        }
      } else {
        const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `n_${Date.now()}`;

        const res = await fetch("/api/tank/chat/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomId: selectedRoom,
            body: text,
            clientNonce: nonce,
            replyToMessageId: replyTarget?.id,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          setInputText("");
          setReplyTarget(null);
        } else {
          setStatusMessage(json.error || "Failed to send message.");
        }
      }
    } catch (err) {
      setStatusMessage("Connection error sending message.");
    } finally {
      setSending(false);
    }
  };

  const handleSendTestPing = async () => {
    setTestSending(true);
    try {
      const res = await broadcastConsoleMessage(
        selectedRoom,
        `⚡ OBS Overlay Ping test: Live at ${new Date().toLocaleTimeString()}`,
      );
      if (res.success) {
        setStatusMessage("✅ Test ping broadcasted into chat!");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch {
      setStatusMessage("Failed to broadcast test ping.");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── TOP CONTROL BAR: TITLE, STATUS & VIEW MODES ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20 text-orange-600 border border-orange-500/30">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                Staff Live Chat Hub
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.2 text-[9px] font-black uppercase text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Ingest
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-600">
              Unified chat: YouTube, Kick, Twitch & Tank viewers. Full mobile interaction & overlay sync.
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-md border border-black/15 bg-black/5 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("console")}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
              viewMode === "console"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-600 hover:text-black hover:bg-black/5"
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Chat Feed
          </button>
          <button
            type="button"
            onClick={() => setViewMode("overlay")}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
              viewMode === "overlay"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-600 hover:text-black hover:bg-black/5"
            }`}
          >
            <Tv className="h-3 w-3" />
            OBS Overlay
          </button>
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`hidden sm:flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
              viewMode === "split"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-600 hover:text-black hover:bg-black/5"
            }`}
          >
            <Columns className="h-3 w-3" />
            Split View
          </button>
        </div>
      </div>

      {/* ── ROOM SWITCHER (HORIZONTAL MOBILE-OPTIMIZED SCROLL) ── */}
      <div className="space-y-1">
        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
          Active Chat Room (Touch / Click to switch):
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
          {allRooms.map((room) => {
            const isSelected = selectedRoom === room.roomKey;
            return (
              <button
                key={room.roomKey}
                type="button"
                onClick={() => setSelectedRoom(room.roomKey)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider transition active:scale-95 ${
                  isSelected
                    ? room.isGlobal
                      ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-[0_0_12px_rgba(249,115,22,0.4)] border border-orange-400/60"
                      : "bg-slate-900 text-orange-300 border border-orange-500/50 shadow-sm"
                    : room.isGlobal
                    ? "bg-orange-500/10 text-orange-700 border border-orange-500/30 hover:bg-orange-500/20"
                    : "bg-white/60 text-slate-700 border border-black/15 hover:bg-white/90"
                }`}
              >
                {room.isGlobal ? (
                  <Globe2 className="h-3.5 w-3.5 text-current animate-spin-slow" />
                ) : (
                  <Radio className="h-3 w-3 text-current opacity-70" />
                )}
                <span>{room.title}</span>
                {room.isGlobal && (
                  <span className="rounded bg-black/30 px-1 py-0.2 text-[8px] font-bold text-white">
                    MULTI-STREAM
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN WORKSPACE: CONSOLE / OVERLAY / SPLIT ── */}
      <div
        className={`grid gap-3 ${
          viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {/* ── LEFT: INTERACTIVE LIVE CHAT FEED & COMPOSER ── */}
        {(viewMode === "console" || viewMode === "split") && (
          <div
            className="flex flex-col rounded-lg border border-black/20 bg-slate-950 p-2.5 text-white shadow-inner"
            style={{
              backgroundImage: "var(--tank-texture-dark-panel, none)",
              backgroundColor: "var(--tank-color-dark, #020617)",
              borderRadius: "var(--tank-border-radius, 0.5rem)",
            }}
          >
            {/* Header with Room Info & Refresh */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-orange-400 uppercase">
                  #{selectedRoom}
                </span>
                <span className="text-[10px] text-slate-400">
                  {messages.length} messages loaded
                </span>
              </div>
              <button
                type="button"
                onClick={() => void fetchHistory(selectedRoom)}
                title="Reload history"
                className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/20 hover:text-white"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                <span>Sync</span>
              </button>
            </div>

            {/* Scrollable Message List */}
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[460px] min-h-[320px] pr-1">
              {loading && messages.length === 0 ? (
                <div className="grid place-items-center py-12 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  Loading #{selectedRoom} messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="grid place-items-center py-12 text-slate-500 font-semibold text-xs italic">
                  No messages in #{selectedRoom} yet. Say something below!
                </div>
              ) : (
                messages.map((msg) => {
                  const isConsole = isConsoleMessageType(msg.messageType);
                  return (
                    <article
                      key={msg.id}
                      className={`group rounded-md border p-2 transition ${
                        isConsole
                          ? "border-amber-500/40 bg-amber-950/30 text-amber-200"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {/* Message Meta Row */}
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Provider Badge (Twitch/Kick/YouTube) */}
                          <ExternalChatProviderBadge provider={msg.sourceProvider} compact />

                          {/* Clan / Guild Tag */}
                          {msg.clanTag ? (
                            <span
                              className="rounded px-1.5 py-0.2 text-[9px] font-black uppercase"
                              style={{
                                backgroundColor: msg.clanColor || "#ff5722",
                                color: msg.clanColor?.toLowerCase() === "#53fc18" ? "#000" : "#fff",
                              }}
                            >
                              {msg.clanTag}
                            </span>
                          ) : null}

                          {/* Username */}
                          <span
                            className="text-xs font-black tracking-wide"
                            style={{ color: msg.nameColor || (isConsole ? "#f59e0b" : "#f6f2e8") }}
                          >
                            {msg.user || "Guest"}
                          </span>

                          {/* Staff / Moderator / Role Badge */}
                          {msg.role && msg.role !== "viewer" && (
                            <span className="rounded bg-orange-600/80 px-1 py-0.2 text-[8px] font-black uppercase text-white">
                              {msg.role}
                            </span>
                          )}
                        </div>

                        {/* Timestamp & Reply trigger */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span>{formatLocalChatTime(msg.time, msg.createdAt)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTarget(msg);
                              inputRef.current?.focus();
                            }}
                            className="opacity-0 group-hover:opacity-100 transition rounded p-0.5 hover:bg-white/15 hover:text-white"
                            title="Reply to message"
                          >
                            <CornerUpLeft className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Reply Reference */}
                      {msg.replyToUserName && (
                        <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1">
                          <span className="text-orange-400">↳ Replying to @{msg.replyToUserName}:</span>
                          <span className="truncate max-w-[240px] italic">{msg.replyPreview}</span>
                        </div>
                      )}

                      {/* Message Body */}
                      <p className="text-xs font-medium leading-relaxed text-slate-100 break-words whitespace-pre-wrap">
                        {msg.body}
                      </p>

                      {/* Reactions Row & Quick React Buttons */}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-white/5">
                        {/* Existing Reactions */}
                        <div className="flex flex-wrap items-center gap-1">
                          {(msg.reactions ?? []).map((r) => {
                            const foundEmoji = EMOJI_REACTIONS.find((item) => item.id === r.reaction);
                            return (
                              <button
                                key={r.reaction}
                                type="button"
                                onClick={() => void handleToggleReaction(msg.id, r.reaction)}
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                                  r.reactedByMe
                                    ? "bg-orange-600 text-white border border-orange-400"
                                    : "bg-white/10 text-slate-200 hover:bg-white/20 border border-white/10"
                                }`}
                                title={`Toggle ${r.reaction}`}
                              >
                                <span>{foundEmoji ? foundEmoji.emoji : r.reaction}</span>
                                <span>{r.count}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Quick Reaction Bar for Mobile Touch */}
                        <div className="flex items-center gap-1">
                          {EMOJI_REACTIONS.map((re) => (
                            <button
                              key={re.id}
                              type="button"
                              onClick={() => void handleToggleReaction(msg.id, re.id)}
                              className="grid h-6 w-6 place-items-center rounded bg-white/5 text-xs hover:bg-white/20 hover:scale-110 active:scale-95 transition"
                              title={`React with ${re.label}`}
                            >
                              {re.emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error / Status Banner */}
            {statusMessage && (
              <div className="my-1 rounded bg-red-950/80 border border-red-500/40 px-2.5 py-1 text-[10px] font-bold text-red-300">
                {statusMessage}
              </div>
            )}

            {/* Reply Target Banner */}
            {replyTarget && (
              <div className="mt-2 flex items-center justify-between rounded bg-white/10 px-2.5 py-1 text-xs text-slate-300">
                <span className="truncate">
                  Replying to <strong className="text-orange-400">@{replyTarget.user}</strong>: &ldquo;
                  {replyTarget.body.slice(0, 40)}&hellip;&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="rounded p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Quick Emoji Bar */}
            <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">Quick:</span>
              {QUICK_TEXT_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setInputText((prev) => `${prev} ${em} `);
                    inputRef.current?.focus();
                  }}
                  className="rounded bg-white/10 px-1.5 py-0.5 text-xs hover:bg-white/20 transition active:scale-95 shrink-0"
                >
                  {em}
                </button>
              ))}
            </div>

            {/* Chat Composer Form */}
            <form onSubmit={handleSendMessage} className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPostingAsConsole}
                    onChange={(e) => setIsPostingAsConsole(e.target.checked)}
                    className="h-3.5 w-3.5 accent-orange-600 rounded"
                  />
                  <Megaphone className="h-3 w-3 text-amber-400" />
                  <span>Broadcast as CONSOLE (Official Announcement)</span>
                </label>
                <span className="text-[9px] text-slate-500 font-mono">
                  Posting as: <strong className="text-orange-400">{isPostingAsConsole ? "CONSOLE" : operatorName}</strong>
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isPostingAsConsole
                      ? `Broadcast house announcement to #${selectedRoom}...`
                      : `Message #${selectedRoom} as ${operatorName}...`
                  }
                  className="flex-1 rounded-md border border-white/20 bg-black/60 px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-orange-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-orange-500 disabled:opacity-50 transition active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── RIGHT: OBS OVERLAY EMBEDDED PREVIEW & TOOLS ── */}
        {(viewMode === "overlay" || viewMode === "split") && (
          <div className="flex flex-col rounded-lg border border-black/20 bg-slate-900 p-2.5 text-white shadow-inner">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <Tv className="h-4 w-4 text-orange-400" />
                <span className="text-xs font-black uppercase tracking-wider">
                  OBS Chat Overlay Live Viewport
                </span>
              </div>
              <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[9px] text-orange-400 border border-orange-500/30">
                1920 × 1080 Transparent Canvas
              </span>
            </div>

            {/* Live Simulated OBS Canvas */}
            <div className="relative aspect-video w-full rounded border border-white/10 bg-slate-950 overflow-hidden shadow-2xl flex flex-col justify-end">
              {/* Checkered / dark stream backdrop indicating transparent overlay */}
              <div className="absolute inset-0 bg-[radial-gradient(#222_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

              {/* Realtime Overlay Iframe */}
              <iframe
                key={selectedRoom}
                src={overlayUrl}
                title="OBS Chat Overlay Live Preview"
                className="h-full w-full border-0 relative z-10"
              />

              {/* Watermark in Preview */}
              <div className="absolute top-2 left-2 z-20 rounded bg-black/80 px-2 py-0.5 text-[9px] font-mono text-slate-400 border border-white/10">
                OVERLAY TARGET: #{selectedRoom.toUpperCase()}
              </div>
            </div>

            {/* Overlay URL & OBS Controls */}
            <div className="mt-3 space-y-2 rounded border border-white/10 bg-black/40 p-2.5">
              <label className="text-[10px] font-black uppercase text-slate-400 block">
                OBS Browser Source URL (For OBS Studio / Streamlabs):
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  readOnly
                  value={overlayUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/80 px-2.5 py-1.5 font-mono text-[10px] text-orange-300 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex items-center justify-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-xs font-black uppercase text-white hover:bg-orange-500 transition active:scale-95"
                >
                  {copiedUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
                </button>
                <a
                  href={overlayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1 rounded border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase text-slate-200 hover:bg-slate-700 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Full Screen</span>
                </a>
              </div>

              {/* Test Ping Button */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Verify overlay rendering and animations:
                </span>
                <button
                  type="button"
                  onClick={handleSendTestPing}
                  disabled={testSending}
                  className="flex items-center gap-1.5 rounded bg-emerald-700 hover:bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase text-white transition active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>{testSending ? "Sending..." : "Send Test Ping"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
