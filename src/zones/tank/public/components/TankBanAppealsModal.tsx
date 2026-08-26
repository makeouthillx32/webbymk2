"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  History,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Check,
  Ban,
  Clock,
  ChevronRight,
  MessageSquare,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import {
  listBanAppealsAction,
  resolveBanAppealAction,
  type BanAppealItem,
} from "../../server/chatAppeals";
import {
  getTankUserChatHistory,
  type UserAuditProfile,
  type UserChatHistoryEntry,
} from "../../server/chatHistory";

export type TankBanAppealsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialUserId?: string;
};

export function TankBanAppealsModal({
  isOpen,
  onClose,
  initialUserId,
}: TankBanAppealsModalProps) {
  const [appeals, setAppeals] = useState<BanAppealItem[]>([]);
  const [selectedAppeal, setSelectedAppeal] = useState<BanAppealItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [chatLogs, setChatLogs] = useState<UserChatHistoryEntry[]>([]);
  const [userProfile, setUserProfile] = useState<UserAuditProfile | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"logs" | "mod_notes">("logs");
  const [modNoteInput, setModNoteInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const loadAppeals = async () => {
    setLoading(true);
    try {
      const res = await listBanAppealsAction();
      if (res.success && res.appeals) {
        setAppeals(res.appeals);
        if (initialUserId) {
          const match = res.appeals.find((a) => a.userId === initialUserId);
          setSelectedAppeal(match || res.appeals[0] || null);
        } else if (!selectedAppeal && res.appeals.length > 0) {
          setSelectedAppeal(res.appeals[0]);
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadAppeals();
    }
  }, [isOpen, initialUserId]);

  useEffect(() => {
    if (!selectedAppeal) return;
    let active = true;
    setLoadingLogs(true);

    getTankUserChatHistory(selectedAppeal.userId)
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setUserProfile(res.profile);
          setChatLogs(res.entries);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingLogs(false);
      });

    return () => {
      active = false;
    };
  }, [selectedAppeal]);

  if (!isOpen) return null;

  const handleDecision = async (decision: "approved" | "denied") => {
    if (!selectedAppeal || actionBusy) return;
    setActionBusy(true);
    try {
      await resolveBanAppealAction(selectedAppeal.id, decision, modNoteInput);
      setAppeals((prev) =>
        prev.map((a) => (a.id === selectedAppeal.id ? { ...a, status: decision } : a)),
      );
      if (selectedAppeal) {
        setSelectedAppeal({ ...selectedAppeal, status: decision });
      }
    } catch {
    } finally {
      setActionBusy(false);
    }
  };

  const filteredAppeals = appeals.filter(
    (a) =>
      a.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.appealText.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredLogs = chatLogs.filter((log) => {
    if (selectedRoomFilter === "all") return true;
    return log.roomId === selectedRoomFilter;
  });

  const availableRooms = Object.keys(userProfile?.roomCounts || {});

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-black/80 bg-[#121316] text-[#e2e8f0] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Window Chrome */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#1a1b1f] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-orange-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Tank Moderation & Ban Appeals Desk
            </h2>
            <span className="rounded-full bg-orange-500/20 border border-orange-500/40 px-2 py-0.5 text-[10px] font-black text-orange-400">
              {appeals.filter((a) => a.status === "pending").length} Pending
            </span>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2-Column Twitch/Kick Desk Split Layout */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {/* ═══════════ LEFT COLUMN: APPEALS QUEUE (4 cols) ═══════════ */}
          <div className="flex flex-col min-h-0 md:col-span-4 bg-[#15161a]">
            {/* Search Box */}
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter users or appeals..."
                  className="w-full rounded-lg bg-black/60 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                  <span className="text-xs font-bold">Loading appeal queue...</span>
                </div>
              )}

              {!loading && filteredAppeals.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-500 italic">
                  No appeals matching your search.
                </div>
              )}

              {filteredAppeals.map((appeal) => {
                const isSelected = selectedAppeal?.id === appeal.id;
                return (
                  <button
                    key={appeal.id}
                    onClick={() => setSelectedAppeal(appeal)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition ${
                      isSelected
                        ? "bg-white/10 border-l-4 border-orange-500"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black">
                      <img
                        src={appeal.avatarUrl || "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png"}
                        alt=""
                        className="h-full w-full object-contain p-0.5"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white truncate">
                          {appeal.userName}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase ${
                            appeal.status === "approved"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : appeal.status === "denied"
                              ? "bg-red-500/20 text-red-400 border border-red-500/40"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          }`}
                        >
                          {appeal.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300 line-clamp-2 leading-tight">
                        {appeal.appealText}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Queue Footer Counter */}
            <div className="flex items-center justify-between border-t border-white/10 bg-[#121316] px-4 py-2 text-[10px] font-bold text-slate-400">
              <span>{filteredAppeals.length} Total Appeals</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Live Synced
              </span>
            </div>
          </div>

          {/* ═══════════ RIGHT COLUMN: AUDIT & DECISION DESK (8 cols) ═══════════ */}
          <div className="flex flex-col min-h-0 md:col-span-8 bg-[#181a1f]">
            {selectedAppeal ? (
              <>
                {/* User Header & Top Tabs */}
                <div className="flex items-center justify-between border-b border-white/10 bg-[#1d1f26] px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-white">
                      {selectedAppeal.userName}
                    </span>
                    {userProfile?.clanTag && (
                      <span className="rounded bg-amber-500/20 border border-amber-500/50 px-1.5 py-0.5 text-[9px] font-black text-amber-400">
                        [{userProfile.clanTag}]
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-bold">
                      LVL {userProfile?.level ?? 1} · {userProfile?.totalMessagesCount ?? 0} Messages
                    </span>
                  </div>

                  {/* Top Mode Tabs */}
                  <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs font-bold">
                    <button
                      onClick={() => setActiveTab("logs")}
                      className={`rounded px-3 py-1 transition ${
                        activeTab === "logs" ? "bg-orange-500 text-black font-black" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Chat Logs ({chatLogs.length})
                    </button>
                    <button
                      onClick={() => setActiveTab("mod_notes")}
                      className={`rounded px-3 py-1 transition ${
                        activeTab === "mod_notes" ? "bg-orange-500 text-black font-black" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Mod Notes
                    </button>
                  </div>
                </div>

                {/* Room Filter Pills */}
                {availableRooms.length > 0 && activeTab === "logs" && (
                  <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#14151a] px-5 py-2 overflow-x-auto text-[11px] font-bold">
                    <button
                      onClick={() => setSelectedRoomFilter("all")}
                      className={`rounded px-2.5 py-0.5 transition ${
                        selectedRoomFilter === "all"
                          ? "bg-orange-500 text-black font-black"
                          : "bg-white/5 text-slate-400 hover:text-white"
                      }`}
                    >
                      All ({chatLogs.length})
                    </button>
                    {availableRooms.map((room) => (
                      <button
                        key={room}
                        onClick={() => setSelectedRoomFilter(room)}
                        className={`rounded px-2.5 py-0.5 transition shrink-0 uppercase text-[10px] ${
                          selectedRoomFilter === room
                            ? "bg-orange-500 text-black font-black"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        {room === "global" ? "🌐 Global" : room} ({userProfile?.roomCounts[room]})
                      </button>
                    ))}
                  </div>
                )}

                {/* Main Message Stream Viewport */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 font-sans text-xs">
                  {loadingLogs && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                      <span className="text-xs font-bold">Loading user chat logs & timestamps...</span>
                    </div>
                  )}

                  {!loadingLogs && filteredLogs.length === 0 && (
                    <div className="py-16 text-center text-xs text-slate-500 italic">
                      No chat logs recorded for this room.
                    </div>
                  )}

                  {!loadingLogs && (
                    <>
                      {/* Chronological Chat Logs */}
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-2 rounded-lg bg-black/40 px-3 py-1.5 border border-white/5 text-slate-200"
                        >
                          <span className="font-mono text-[10px] text-slate-500 shrink-0">
                            {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="font-mono text-[10px] text-orange-400 font-bold uppercase shrink-0">
                            [{log.roomId === "global" ? "GLOBAL" : log.roomId}]
                          </span>
                          <span className="font-bold text-amber-300 shrink-0">
                            {selectedAppeal.userName}:
                          </span>
                          <span className="break-words text-slate-100 flex-1">
                            {log.body}
                          </span>
                        </div>
                      ))}

                      {/* Inline Moderation Event Timeline (Fossabot / Mod style) */}
                      <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-[11px] text-red-200 my-3">
                        <div className="flex items-center gap-2 font-black uppercase text-red-400">
                          <Ban className="h-4 w-4" /> Banned by {selectedAppeal.bannedBy || "Staff"}
                        </div>
                        <p className="mt-1 text-slate-300">
                          Reason: <span className="font-semibold text-white">{selectedAppeal.bannedReason}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* ═══════════ BOTTOM APPEAL BOX & ACTION BAR ═══════════ */}
                <div className="border-t border-white/10 bg-[#1a1b20] p-4">
                  {/* User Appeal Quote Box */}
                  <div className="mb-3 rounded-xl border border-white/10 bg-black/60 p-3 text-xs leading-relaxed text-slate-200">
                    <p className="font-black text-[10px] uppercase tracking-wider text-orange-400 mb-1 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> User Appeal Statement
                    </p>
                    <p className="italic text-slate-300">
                      "{selectedAppeal.appealText}"
                    </p>
                  </div>

                  {/* Decision Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDecision("denied")}
                        disabled={actionBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow transition active:scale-95 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> Deny Appeal
                      </button>

                      <button
                        onClick={() => handleDecision("approved")}
                        disabled={actionBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve & Unban User
                      </button>
                    </div>

                    {selectedAppeal.status !== "pending" && (
                      <span
                        className={`text-xs font-black uppercase ${
                          selectedAppeal.status === "approved" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        Status: {selectedAppeal.status}
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-20">
                <ShieldAlert className="h-10 w-10 text-slate-600 mb-2" />
                <p className="text-xs font-bold">Select an appeal from the queue on the left.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TankBanAppealsModal;
