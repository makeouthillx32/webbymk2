"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChatMessage } from "../contracts";
import { sendChatMessage } from "../server/actions";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useTankRealtimeChat(
  roomId: string,
  initialMessages: ChatMessage[] = EMPTY_MESSAGES,
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previousRoomId = useRef(roomId);

  useEffect(() => {
    if (previousRoomId.current === roomId) return;
    previousRoomId.current = roomId;
    setMessages(initialMessages);
  }, [initialMessages, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const supabase = createClient();
    const channel = supabase.channel(`room:${roomId}:chat`);

    channel
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (!payload || typeof payload !== "object") return;
        const msg = payload as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const postMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || sending) return false;

      setSending(true);
      setError(null);

      const result = await sendChatMessage(roomId, trimmed);
      setSending(false);

      if (!result.success) {
        setError(result.error ?? "Failed to send message.");
        return false;
      }

      if (result.message) {
        const newMsg = result.message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      return true;
    },
    [roomId, sending],
  );

  return {
    messages,
    sending,
    error,
    postMessage,
  };
}
