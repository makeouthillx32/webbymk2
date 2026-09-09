"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { safeStorage } from "@/lib/safeStorage";
import type { ChatMessage } from "../contracts";

const EMPTY_MESSAGES: ChatMessage[] = [];
const MAX_CHAT_DOM_MESSAGES = 150; // Performance cap to maintain high framerates

// Root cause of the "iOS Safari / Brave stuck loading forever until you
// clear site data" incident (vault/Core/tank-ios-safari-persisted-site-data-
// forever-load.md): this cache used to write one full raw localStorage entry
// PER ROOM EVER VISITED, with no cap on the number of rooms and no routing
// through safeStorage's quota-exceeded handling. A visitor who'd clicked
// through Director + every room over a session accumulated that many
// uncapped ~150-message JSON blobs. Safari's per-origin localStorage quota is
// tight and shared across the whole origin — once full, writes made by code
// that ISN'T defensively wrapped (Supabase's own auth SDK session persistence
// among them) start throwing, and that's what actually bricked the app. Every
// deploy forces a hard reload for everyone at once (new JS hash = no cached
// bundle to fall back to), which is why this reliably showed up right after
// pushing a build instead of trickling in randomly.
//
// Fixed two ways: (1) route through safeStorage so a quota failure here is
// the same handled/evicting path as everywhere else instead of a bespoke
// silent catch, and (2) cap how many rooms' worth of history are kept at
// all — LRU-evict the oldest room's cache once the count exceeds the cap,
// so total footprint no longer grows with "how many rooms has this browser
// ever opened."
const MAX_CACHED_ROOMS = 6;
const ROOM_CACHE_INDEX_KEY = "tank_chat_storage_index";

function getStorageKey(roomId: string, userId?: string | null) {
  if (userId) {
    return `tank_chat_storage_user_${userId}_${roomId}`;
  }
  return `tank_chat_storage_guest_${roomId}`;
}

function readRoomCacheIndex(): string[] {
  try {
    const raw = safeStorage.getItem(ROOM_CACHE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Moves storageKey to the front of the index, evicting oldest room caches if over limit
function touchRoomCacheIndex(storageKey: string) {
  try {
    const index = readRoomCacheIndex().filter((id) => id !== storageKey);
    index.unshift(storageKey);
    const evicted = index.splice(MAX_CACHED_ROOMS);
    for (const staleKey of evicted) {
      safeStorage.removeItem(staleKey);
    }
    safeStorage.setItem(ROOM_CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

export function clearTankSessionCookies() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const cookiesToClear = [
    "tank_participant_v1",
    "tank_voter_client_id",
    "userRole",
    "userRoleUserId",
    "userDisplayName",
    "userPermissions",
    "rememberMe",
    "lastPage",
  ];
  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, ".unenter.live", "unenter.live"];
  const paths = ["/", "/rooms", ""];

  for (const name of cookiesToClear) {
    for (const domain of domains) {
      for (const path of paths) {
        const domainPart = domain ? `; domain=${domain}` : "";
        const pathPart = path ? `; path=${path}` : "; path=/";
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT${pathPart}${domainPart}; SameSite=Lax`;
      }
    }
  }
}

export function drainClientChatStorage(userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (userId) {
        if (
          k.startsWith(`tank_chat_storage_user_${userId}_`) ||
          k.startsWith(`tank_session_chat_${userId}_`)
        ) {
          keysToRemove.push(k);
        }
      } else {
        if (
          k.startsWith("tank_chat_storage_user_") ||
          k.startsWith("tank_session_chat_") ||
          k.startsWith("tank_chat_storage_")
        ) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    sessionStorage.clear();
    clearTankSessionCookies();
  } catch {}
}

function loadClientStorageMessages(roomId: string, userId?: string | null): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getStorageKey(roomId, userId);
    const raw = safeStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveClientStorageMessages(roomId: string, messages: ChatMessage[], userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const slice = messages.slice(-MAX_CHAT_DOM_MESSAGES);
    const key = getStorageKey(roomId, userId);
    safeStorage.setItem(key, JSON.stringify(slice));
    touchRoomCacheIndex(key);
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
  const currentUserId = identity?.userId ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sync messages to local client storage as new messages stream in
  useEffect(() => {
    if (messages.length > 0 && roomId) {
      saveClientStorageMessages(roomId, messages, currentUserId);
    }
  }, [messages, roomId, currentUserId]);

  // When room changes or user identity changes or on reload: load cached messages and fetch recent history
  useEffect(() => {
    if (!roomId) return;
    const cached = loadClientStorageMessages(roomId, currentUserId);
    if (cached && cached.length > 0) {
      setMessages(cached);
    } else {
      setMessages(EMPTY_MESSAGES);
    }

    let active = true;
    setLoadingHistory(true);
    fetchChatHistory(roomId)
      .then((history) => {
        if (active) {
          setMessages((current) => {
            const next = mergeHistory(current, history);
            saveClientStorageMessages(roomId, next, currentUserId);
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
  }, [roomId, currentUserId]);

  // Drain client storage if auth state changes to SIGNED_OUT, and sync logout across tabs
  useEffect(() => {
    const handleLogout = (targetUserId?: string | null) => {
      drainClientChatStorage(targetUserId || currentUserId);
      setMessages(EMPTY_MESSAGES);
      // Fetch fresh public room history for guest
      void fetchChatHistory(roomId)
        .then((history) => {
          setMessages(history);
        })
        .catch(() => {});
    };

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        handleLogout();
      }
    });

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("tank_session_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "LOGOUT") {
          handleLogout(event.data.userId);
        }
      };
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "tank_logout_sync") {
        handleLogout();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      subscription.unsubscribe();
      if (bc) bc.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [roomId, currentUserId]);

  // Realtime Supabase broadcast listener with live message dispatching
  useEffect(() => {
    if (!roomId) return;
    const supabase = createClient();

    if (roomId.startsWith("click:") || roomId.startsWith("dm:")) {
      const channel = supabase
        .channel(`tank-scoped-chat-${roomId}`)
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
