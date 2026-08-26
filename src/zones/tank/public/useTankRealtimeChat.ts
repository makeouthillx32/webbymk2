"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChatMessage } from "../contracts";

const EMPTY_MESSAGES: ChatMessage[] = [];
const MAX_CHAT_DOM_MESSAGES = 150; // Performance cap to maintain high framerates

function getStorageKey(roomId: string) {
  return `tank_chat_storage_${roomId}`;
}

export function drainClientChatStorage() {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith("tank_chat_storage_") ||
          k.startsWith("tank_session_chat_"))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
}

function loadClientStorageMessages(roomId: string): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveClientStorageMessages(roomId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const slice = messages.slice(-MAX_CHAT_DOM_MESSAGES);
    localStorage.setItem(getStorageKey(roomId), JSON.stringify(slice));
  } catch {}
}

async function fetchChatHistory(roomId: string): Promise<ChatMessage[]> {
  const response = await fetch(
    `/api/tank/chat/messages?roomId=${encodeURIComponent(roomId)}`,
    {
      cache: "no-store",
    },
  );
  const json = await response.json();
  if (!response.ok || !json.success)
    throw new Error(json.error || "Failed to load chat.");
  return Array.isArray(json.messages) ? json.messages : [];
}

function mergeHistory(current: ChatMessage[], history: ChatMessage[]) {
  const pending = current.filter(
    (message) => message.pending || message.failed,
  );
  const merged = [...history];
  for (const message of pending) {
    if (
      !merged.some(
        (row) =>
          row.id === message.id ||
          (row.clientNonce && row.clientNonce === message.clientNonce),
      )
    ) {
      merged.push(message);
    }
  }
  return merged.slice(-MAX_CHAT_DOM_MESSAGES);
}

/**
 * Who the optimistic row is rendered as. Supplied by the caller because the
 * hook has no view of the signed-in profile — without it an optimistic message
 * would render as a stranger for the half-second before the server answers,
 * which is more jarring than waiting.
 */
export type OptimisticIdentity = {
  userId?: string;
  user: string;
  avatarUrl?: string | null;
  nameColor?: string | null;
  level?: number;
  role?: ChatMessage["role"];
} | null;

export function useTankRealtimeChat(
  roomId: string,
  initialMessages: ChatMessage[] = EMPTY_MESSAGES,
  identity: OptimisticIdentity = null,
) {
  // Keep SSR and the first client render identical. Browser-cached messages
  // are restored by the room effect below after hydration; reading storage in
  // this initializer made Safari render cached chat while the server rendered
  // the empty state, causing React to discard and rebuild the whole Tank tree
  // during refresh.
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sync messages to local client storage as new messages stream in
  useEffect(() => {
    if (messages.length > 0 && roomId) {
      saveClientStorageMessages(roomId, messages);
    }
  }, [messages, roomId]);

  // When room changes or on reload: load cached client messages and fetch recent history
  useEffect(() => {
    if (!roomId) return;
    const cached = loadClientStorageMessages(roomId);
    if (cached && cached.length > 0) {
      setMessages(cached);
    }

    let active = true;
    setLoadingHistory(true);
    fetchChatHistory(roomId)
      .then((history) => {
        if (active) {
          setMessages((current) => {
            const next = mergeHistory(current, history);
            saveClientStorageMessages(roomId, next);
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  // Drain client storage if auth state changes to SIGNED_OUT
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        drainClientChatStorage();
        setMessages(EMPTY_MESSAGES);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Realtime Supabase broadcast listener with live message dispatching
  useEffect(() => {
    if (!roomId) return;
    const supabase = createClient();

    if (roomId.startsWith("click:")) {
      const channel = supabase
        .channel(`tank-click-chat-${roomId.slice(6)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tank_chat_messages",
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            void fetchChatHistory(roomId)
              .then((history) => {
                setMessages((current) => mergeHistory(current, history));
              })
              .catch(() => {});
          },
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    }

    const channel = supabase.channel(`room:${roomId}:chat`);

    channel
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (!payload || typeof payload !== "object") return;
        const msg = payload as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          // The sender is subscribed to their own room, so their own message
          // arrives back over broadcast. Reconcile it onto the optimistic row
          // instead of appending a second copy.
          if (msg.clientNonce) {
            const pendingIdx = prev.findIndex(
              (m) => m.clientNonce === msg.clientNonce,
            );
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = msg;
              return next;
            }
          }
          const next = [...prev, msg];
          return next.length > MAX_CHAT_DOM_MESSAGES
            ? next.slice(next.length - MAX_CHAT_DOM_MESSAGES)
            : next;
        });
      })
      .on("broadcast", { event: "delete_message" }, ({ payload }) => {
        if (!payload?.messageId) return;
        setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      })
      .on("broadcast", { event: "user_banned" }, ({ payload }) => {
        if (!payload?.userId) return;
        setMessages((prev) => prev.filter((m) => m.userId !== payload.userId));
      })
      .on("broadcast", { event: "purge_room" }, () => setMessages([]))
      .on("broadcast", { event: "reaction_changed" }, ({ payload }) => {
        if (!payload?.messageId) return;
        void fetchChatHistory(roomId)
          .then((history) => {
            setMessages((current) => mergeHistory(current, history));
          })
          .catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("tank:chat_moderation")
      .on("broadcast", { event: "user_banned" }, ({ payload }) => {
        if (payload?.userId)
          setMessages((current) =>
            current.filter((message) => message.userId !== payload.userId),
          );
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const postMessage = useCallback(
    async (body: string, replyTo?: ChatMessage) => {
      const trimmed = body.trim();
      if (!trimmed) return false;

      // Optimistic send. The old flow awaited seven server round trips — auth,
      // ban check, automod config, XP read+write, insert, broadcast — before
      // the message appeared and before the input was even cleared, so typing
      // felt like it stalled on every line. The row now renders instantly and
      // the server reconciles it under clientNonce.
      const nonce =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const optimistic: ChatMessage = {
        id: `pending_${nonce}`,
        clientNonce: nonce,
        pending: true,
        userId: identity?.userId,
        user: identity?.user ?? "You",
        body: trimmed,
        time: new Date().toLocaleString([], {
          month: "numeric",
          day: "numeric",
          year: "2-digit",
          hour: "numeric",
          minute: "2-digit",
        }),
        role: identity?.role ?? "member",
        avatarUrl: identity?.avatarUrl ?? undefined,
        nameColor: identity?.nameColor ?? undefined,
        level: identity?.level,
        messageType: "text",
        replyToMessageId: replyTo?.id,
        replyToUserId: replyTo?.userId,
        replyToUserName: replyTo?.user,
        replyPreview: replyTo?.body.slice(0, 100),
      };

      setError(null);
      setMessages((prev) => {
        const next = [...prev, optimistic];
        return next.length > MAX_CHAT_DOM_MESSAGES
          ? next.slice(next.length - MAX_CHAT_DOM_MESSAGES)
          : next;
      });

      // Deliberately NOT awaited by the caller's UI path: the input clears on
      // the synchronous return above. `sending` is still exposed for anyone who
      // wants a subtle in-flight hint, but it no longer gates typing.
      setSending(true);
      void fetch("/api/tank/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          body: trimmed,
          clientNonce: nonce,
          replyToMessageId: replyTo?.id,
        }),
      })
        .then(async (response) => {
          let result: { success?: boolean; error?: string; message?: ChatMessage } = {};
          try {
            result = await response.json();
          } catch {
            result = {
              success: false,
              error:
                response.status >= 500
                  ? "Server temporarily unavailable. Tap to retry."
                  : "Failed to send message.",
            };
          }
          if (!response.ok && !result.error) {
            result.error = "Failed to send message.";
          }
          return result;
        })
        .then((result) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.clientNonce === nonce);
            if (idx === -1) return prev;
            const next = [...prev];
            if (result.success && result.message) {
              // Broadcast may have already reconciled this row; replacing an
              // identical message is harmless and keeps the two paths simple.
              next[idx] = result.message;
            } else {
              // Keep the row and mark it failed rather than deleting it — the
              // user's text is the one thing they cannot get back.
              next[idx] = { ...next[idx], pending: false, failed: true };
            }
            return next;
          });
          if (!result.success)
            setError(result.error ?? "Failed to send message.");
        })
        .catch((err) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.clientNonce === nonce);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], pending: false, failed: true };
            return next;
          });
          setError(
            err instanceof Error && err.name === "AbortError"
              ? "Request timed out."
              : "Connection issue. Failed to send message."
          );
        })
        .finally(() => setSending(false));

      return true;
    },
    [roomId, identity],
  );

  const toggleReaction = useCallback(
    async (messageId: string, reaction: string) => {
      const response = await fetch("/api/tank/chat/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, reaction }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || "Failed to react.");
        return false;
      }
      const history = await fetchChatHistory(roomId);
      setMessages((current) => mergeHistory(current, history));
      return true;
    },
    [roomId],
  );

  return {
    messages,
    sending,
    error,
    postMessage,
    toggleReaction,
    loadingHistory,
  };
}
export default useTankRealtimeChat;
