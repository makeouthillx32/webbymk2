"use client";

import React, { useEffect, useState } from "react";
import { X, History, Loader2, ShieldAlert, ShieldCheck, MessageSquare, Flame, Ban, CheckCircle } from "lucide-react";
import {
  getTankUserChatHistory,
  type UserAuditProfile,
  type UserChatHistoryEntry,
} from "../../server/chatHistory";

export type TankUserHistoryModalProps = {
  userId: string;
  userName: string;
  onClose: () => void;
};

export function TankUserHistoryModal({ userId, userName, onClose }: TankUserHistoryModalProps) {
  const [profile, setProfile] = useState<UserAuditProfile | null>(null);
  const [entries, setEntries] = useState<UserChatHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>("all");
  const [unbanning, setUnbanning] = useState(false);

  useEffect(() => {
    let active = true;
    getTankUserChatHistory(userId).then((res) => {
      if (!active) return;
      if (res.success) {
        setProfile(res.profile);
        setEntries(res.entries);
      } else {
        setError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleUnban = async () => {
    if (unbanning) return;
    setUnbanning(true);
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unban",
          userId,
        }),
      });
      if (profile) {
        setProfile({ ...profile, isBanned: false, bannedReason: undefined, bannedUntil: undefined });
      }
    } catch {}
    setUnbanning(false);
  };

  const filteredEntries = (entries ?? []).filter((entry) => {
    if (selectedRoomFilter === "all") return true;
    return entry.roomId === selectedRoomFilter;
  });

  const availableRooms = Object.keys(profile?.roomCounts || {});

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 border-black/80 bg-[#16181d] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with User Info */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#1d2027] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-black">
              <img
                src={
                  profile?.avatarUrl ||
                  "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png"
                }
                alt=""
                className="h-full w-full object-contain p-0.5"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white truncate">
                  {profile?.userName || userName}
                </span>
                {profile?.clanTag && (
                  <span className="rounded bg-amber-500/20 border border-amber-500/50 px-1.5 py-0.2 text-[9px] font-black text-amber-400">
                    [{profile.clanTag}]
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400">
                  LVL {profile?.level ?? 1}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                ID: {userId.slice(0, 16)}... · {profile?.totalMessagesCount ?? 0} total messages
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Ban / Timeout / Appeal Alert Status Banner */}
        {profile?.isBanned && (
          <div className="flex items-center justify-between bg-red-950/80 border-b border-red-800/80 px-4 py-2 text-xs font-bold text-red-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
              <span>
                <strong>BANNED / TIMED OUT</strong>
                {profile.bannedReason ? ` — Reason: ${profile.bannedReason}` : ""}
              </span>
            </div>
            <button
              onClick={handleUnban}
              disabled={unbanning}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase text-white shadow transition active:scale-95 disabled:opacity-50"
            >
              {unbanning ? "Unbanning..." : "Approve Appeal / Unban"}
            </button>
          </div>
        )}

        {/* Room Filter Pills */}
        {availableRooms.length > 0 && (
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#121316] px-4 py-2 overflow-x-auto text-[11px] font-bold">
            <button
              onClick={() => setSelectedRoomFilter("all")}
              className={`rounded-lg px-2.5 py-1 transition ${
                selectedRoomFilter === "all"
                  ? "bg-orange-500 text-black font-black"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              All Rooms ({profile?.totalMessagesCount ?? 0})
            </button>
            {availableRooms.map((room) => (
              <button
                key={room}
                onClick={() => setSelectedRoomFilter(room)}
                className={`rounded-lg px-2.5 py-1 transition shrink-0 uppercase text-[10px] ${
                  selectedRoomFilter === room
                    ? "bg-orange-500 text-black font-black"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {room === "global" ? "🌐 Global" : room} ({profile?.roomCounts[room]})
              </button>
            ))}
          </div>
        )}

        {/* Message Log Viewport */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <p className="text-sm font-bold text-red-400 text-center py-4">{error}</p>}

          {!error && entries === null && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
              <span className="text-xs font-bold">Auditing permanent chat records across all rooms...</span>
            </div>
          )}

          {entries !== null && filteredEntries.length === 0 && (
            <p className="py-12 text-center text-xs font-semibold italic text-slate-500">
              No chat messages found for the selected room filter.
            </p>
          )}

          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-white/10 bg-black/50 p-2.5 text-xs text-slate-200 shadow-sm"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span className="font-mono uppercase font-black text-orange-400">
                  {entry.roomId === "global" ? "🌐 Global" : `🏠 ${entry.roomId}`}
                </span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <p className="break-words leading-relaxed text-slate-100 font-medium">
                {entry.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TankUserHistoryModal;
