"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Search, Send, MessageCircle } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import { useTankRealtimeChat } from "../useTankRealtimeChat";
import {
  listMyDmConversations,
  startDmConversation,
  searchTankViewers,
  type TankDmConversationSummary,
  type TankMessengerContact,
} from "../../server/actions";

export type TankMessengerOverlayProps = {
  onClose: () => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatarUrl?: string;
};

type ActiveContact = { id: string; name: string; avatarUrl: string | null };

export function TankMessengerOverlay({
  onClose,
  currentUserId,
  currentUserName,
  currentUserAvatarUrl,
}: TankMessengerOverlayProps) {
  const [conversations, setConversations] = useState<TankDmConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<ActiveContact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TankMessengerContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [composerText, setComposerText] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      setConversations(await listMyDmConversations());
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        setSearchResults(await searchTankViewers(searchQuery));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const openConversation = (id: string, contact: ActiveContact) => {
    setActiveConversationId(id);
    setActiveContact(contact);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSelectConversation = (conv: TankDmConversationSummary) => {
    openConversation(conv.id, {
      id: conv.otherUserId,
      name: conv.otherDisplayName,
      avatarUrl: conv.otherAvatarUrl,
    });
  };

  const handleSelectContact = async (contact: TankMessengerContact) => {
    const res = await startDmConversation(contact.id);
    if (!res.success || !res.conversationId) {
      alert(res.error || "Could not start that conversation.");
      return;
    }
    openConversation(res.conversationId, {
      id: contact.id,
      name: contact.displayName,
      avatarUrl: contact.avatarUrl,
    });
    void refreshConversations();
  };

  const roomId = activeConversationId ? `dm:${activeConversationId}` : "";
  const identity = currentUserId
    ? {
        userId: currentUserId,
        user: currentUserName || "You",
        role: "member" as const,
        avatarUrl: currentUserAvatarUrl,
      }
    : null;
  const { messages, postMessage, loadingHistory } = useTankRealtimeChat(roomId, [], identity);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerText.trim()) return;
    void postMessage(composerText);
    setComposerText("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tank Messenger"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel withScrews className="w-full flex flex-col overflow-hidden" contentClassName="!p-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-black/40 px-4 py-3">
            <h2
              className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              <MessageCircle className="h-5 w-5 text-emerald-400" /> Tank Messenger
            </h2>
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded border border-white/40 bg-[#e85a4f] text-white shadow hover:scale-105 active:scale-95"
            >
              <X className="h-4 w-4 stroke-[3]" />
            </button>
          </div>

          <div className="flex h-[70vh] min-h-[420px]">
            {/* ── Left: search + conversation list ── */}
            <div className="flex w-[220px] shrink-0 flex-col border-r border-black/40 bg-[#0e1013]">
              <div className="border-b border-black/40 p-2">
                <div className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find a viewer..."
                    className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto">
                {searchQuery.trim().length >= 2 ? (
                  searching ? (
                    <p className="p-3 text-[11px] text-slate-500">Searching...</p>
                  ) : searchResults.length === 0 ? (
                    <p className="p-3 text-[11px] text-slate-500">No viewers found.</p>
                  ) : (
                    searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void handleSelectContact(c)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/5"
                      >
                        <ContactAvatar name={c.displayName} url={c.avatarUrl} />
                        <span className="truncate text-xs font-bold text-white">{c.displayName}</span>
                      </button>
                    ))
                  )
                ) : loadingList ? (
                  <p className="p-3 text-[11px] text-slate-500">Loading...</p>
                ) : conversations.length === 0 ? (
                  <p className="p-3 text-[11px] text-slate-500">
                    No conversations yet. Search a viewer above to start one.
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleSelectConversation(conv)}
                      className={`flex w-full items-center gap-2 border-l-2 px-3 py-2.5 text-left transition ${
                        activeConversationId === conv.id
                          ? "border-orange-500 bg-orange-500/20"
                          : "border-transparent hover:bg-white/5"
                      }`}
                    >
                      <ContactAvatar name={conv.otherDisplayName} url={conv.otherAvatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{conv.otherDisplayName}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {conv.lastMessageBody || "No messages yet"}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── Right: active thread ── */}
            <div className="flex flex-1 flex-col bg-gradient-to-b from-[#18191a] via-[#121314] to-[#0a0a0b]">
              {!activeConversationId ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center">
                  <p className="text-xs text-slate-500">
                    Pick a conversation, or search a viewer to start a new one.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 border-b border-black/40 px-4 py-2.5">
                    <ContactAvatar name={activeContact?.name ?? "Viewer"} url={activeContact?.avatarUrl ?? null} />
                    <span className="text-xs font-black uppercase tracking-wide text-white">
                      {activeContact?.name}
                    </span>
                  </div>
                  <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
                    {loadingHistory && messages.length === 0 ? (
                      <p className="text-center text-[11px] text-slate-500">Loading messages...</p>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-[11px] text-slate-500">Say hello 👋</p>
                    ) : (
                      messages.map((m) => {
                        const mine = m.userId === currentUserId;
                        return (
                          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[75%] rounded-xl px-3 py-2 text-xs ${
                                mine ? "bg-orange-500 text-black" : "bg-[#1f2021] text-white"
                              } ${m.failed ? "opacity-50" : m.pending ? "opacity-70" : ""}`}
                            >
                              <p className="break-words">{m.body}</p>
                              <p className={`mt-0.5 text-[9px] ${mine ? "text-black/60" : "text-slate-500"}`}>
                                {m.time}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-black/40 p-2.5">
                    <input
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder="Message..."
                      className="flex-1 rounded bg-black/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!composerText.trim()}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded bg-orange-500 text-black shadow transition hover:brightness-110 active:scale-95 disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

function ContactAvatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-slate-700 text-xs font-black text-white">
      {initial}
    </div>
  );
}

export default TankMessengerOverlay;
