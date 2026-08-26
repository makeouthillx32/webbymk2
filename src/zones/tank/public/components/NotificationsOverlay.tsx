"use client";

import React, { useState } from "react";
import {
  Bell,
  Coins,
  Megaphone,
  Anchor,
  Swords,
  X,
  Bomb,
  CheckCheck,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";

export type TankNotificationCategory = "all" | "tokens" | "tts" | "tanktoys" | "wartoys";

export type TankNotificationItem = {
  id: string;
  category: "tokens" | "tts" | "tanktoys" | "wartoys";
  body: string;
  time: string;
  read: boolean;
};

// Seed dataset provided from real Tank account history
export const SEEDED_NOTIFICATIONS: TankNotificationItem[] = [
  // Wartoys batch
  { id: "w-1", category: "wartoys", body: "BIGR attacked you with a grenade for 936 XP", time: "6/24/25, 1:00 AM", read: false },
  { id: "w-2", category: "wartoys", body: "BUM attacked you with a grenade for 970 XP", time: "6/23/25, 10:17 PM", read: false },
  { id: "w-3", category: "wartoys", body: "akimbo attacked you with a grenade for 933 XP", time: "6/23/25, 9:50 PM", read: false },
  { id: "w-4", category: "wartoys", body: "LUKEW attacked you with a grenade for 1015 XP", time: "6/23/25, 8:12 PM", read: false },
  { id: "w-5", category: "wartoys", body: "BASED attacked you with a grenade for 955 XP", time: "6/23/25, 8:06 PM", read: false },
  { id: "w-6", category: "wartoys", body: "Shitty_StarPress attacked you with a grenade for 884 XP", time: "6/23/25, 7:59 PM", read: false },
  { id: "w-7", category: "wartoys", body: "Shitty_StarPress attacked you with a grenade for 856 XP", time: "6/23/25, 7:59 PM", read: false },
  { id: "w-8", category: "wartoys", body: "JOSIE attacked you with a grenade for 846 XP", time: "6/23/25, 7:50 PM", read: false },
  { id: "w-9", category: "wartoys", body: "Jlag96 attacked you with a grenade for 848 XP", time: "6/23/25, 7:43 PM", read: false },
  { id: "w-10", category: "wartoys", body: "JadtheTaff attacked you with a grenade for 931 XP", time: "6/23/25, 6:04 PM", read: false },
  { id: "w-11", category: "wartoys", body: "gpoore96 attacked you with a grenade for 1049 XP", time: "6/23/25, 5:53 PM", read: false },
  { id: "w-12", category: "wartoys", body: "luca attacked you with a grenade for 955 XP", time: "6/23/25, 3:31 PM", read: false },
  { id: "w-13", category: "wartoys", body: "luca attacked you with a grenade for 949 XP", time: "6/23/25, 3:14 PM", read: false },
  { id: "w-14", category: "wartoys", body: "luca attacked you with a grenade for 1083 XP", time: "6/23/25, 3:14 PM", read: false },
  { id: "w-15", category: "wartoys", body: "TNLS attacked you with a grenade for 868 XP", time: "6/23/25, 3:01 PM", read: false },
  { id: "w-16", category: "wartoys", body: "RAPE attacked you with a grenade for 1163 XP", time: "6/23/25, 1:53 PM", read: false },
  { id: "w-17", category: "wartoys", body: "oceansoos attacked you with a grenade for 995 XP", time: "6/23/25, 12:30 PM", read: false },
  { id: "w-18", category: "wartoys", body: "Chaka attacked you with a grenade for 828 XP", time: "6/23/25, 12:25 PM", read: false },
  { id: "w-19", category: "wartoys", body: "WHORE attacked you with a grenade for 800 XP", time: "6/23/25, 10:40 AM", read: false },
  { id: "w-20", category: "wartoys", body: "WHORE attacked you with a grenade for 1065 XP", time: "6/23/25, 10:39 AM", read: false },
  { id: "w-21", category: "wartoys", body: "WHORE attacked you with a grenade for 1094 XP", time: "6/23/25, 10:39 AM", read: false },
  { id: "w-22", category: "wartoys", body: "AC attacked you with a grenade for 959 XP", time: "6/23/25, 9:16 AM", read: false },
  { id: "w-23", category: "wartoys", body: "FENTLESSAPE attacked you with a grenade for 819 XP", time: "6/23/25, 5:18 AM", read: false },
  { id: "w-24", category: "wartoys", body: "BigPat attacked you with a grenade for 981 XP", time: "6/23/25, 2:19 AM", read: false },
  { id: "w-25", category: "wartoys", body: "BIGR attacked you with a grenade for 884 XP", time: "6/23/25, 12:28 AM", read: false },
  { id: "w-26", category: "wartoys", body: "LUKEW attacked you with a grenade for 980 XP", time: "6/23/25, 12:20 AM", read: false },
  { id: "w-27", category: "wartoys", body: "LUKEW attacked you with a grenade for 1009 XP", time: "6/23/25, 12:20 AM", read: false },
  { id: "w-28", category: "wartoys", body: "SID55 attacked you with a grenade for 1108 XP", time: "6/23/25, 12:09 AM", read: false },
  { id: "w-29", category: "wartoys", body: "MidSentry attacked you with a grenade for 1012 XP", time: "6/23/25, 12:07 AM", read: false },
  { id: "w-30", category: "wartoys", body: "jackglisan attacked you with a grenade for 957 XP", time: "6/22/25, 10:26 PM", read: false },
  { id: "w-31", category: "wartoys", body: "SHARK attacked you with a grenade for 1036 XP", time: "6/22/25, 8:29 PM", read: false },
  { id: "w-32", category: "wartoys", body: "WHORE attacked you with a grenade for 865 XP", time: "6/22/25, 7:33 PM", read: false },
  { id: "w-33", category: "wartoys", body: "WHORE attacked you with a grenade for 846 XP", time: "6/22/25, 7:33 PM", read: false },
  { id: "w-34", category: "wartoys", body: "WHORE attacked you with a grenade for 897 XP", time: "6/22/25, 7:33 PM", read: false },
  { id: "w-35", category: "wartoys", body: "BIGR attacked you with a grenade for 1118 XP", time: "6/22/25, 7:19 PM", read: false },
  { id: "w-36", category: "wartoys", body: "SHARK attacked you with a grenade for 840 XP", time: "6/22/25, 7:03 PM", read: false },
  { id: "w-37", category: "wartoys", body: "SHARK attacked you with a grenade for 984 XP", time: "6/22/25, 7:02 PM", read: false },
  { id: "w-38", category: "wartoys", body: "RIP attacked you with a grenade for 897 XP", time: "6/22/25, 6:13 PM", read: false },
  { id: "w-39", category: "wartoys", body: "Fluu attacked you with a grenade for 853 XP", time: "6/22/25, 5:54 PM", read: false },
  { id: "w-40", category: "wartoys", body: "awesomealex118 attacked you with a grenade for 861 XP", time: "6/22/25, 5:46 PM", read: false },
  { id: "w-41", category: "wartoys", body: "MULE attacked you with a grenade for 947 XP", time: "6/22/25, 5:20 PM", read: false },
  { id: "w-42", category: "wartoys", body: "BIGR attacked you with a grenade for 906 XP", time: "6/22/25, 4:56 PM", read: false },
  { id: "w-43", category: "wartoys", body: "BIGR attacked you with a grenade for 831 XP", time: "6/22/25, 4:56 PM", read: false },
  { id: "w-44", category: "wartoys", body: "BIGR attacked you with a grenade for 1149 XP", time: "6/22/25, 4:54 PM", read: false },
  { id: "w-45", category: "wartoys", body: "BIGR attacked you with a grenade for 1146 XP", time: "6/22/25, 4:53 PM", read: false },
  { id: "w-46", category: "wartoys", body: "BIGR attacked you with a grenade for 804 XP", time: "6/22/25, 3:30 PM", read: false },
  { id: "w-47", category: "wartoys", body: "BRUK attacked you with a grenade for 989 XP", time: "6/22/25, 2:42 PM", read: false },
  { id: "w-48", category: "wartoys", body: "shadeval attacked you with a grenade for 1103 XP", time: "6/22/25, 2:07 PM", read: false },
  { id: "w-49", category: "wartoys", body: "DustBunnie attacked you with a grenade for 1148 XP", time: "6/22/25, 1:47 PM", read: false },
  { id: "w-50", category: "wartoys", body: "BIGR attacked you with a grenade for 1142 XP", time: "6/22/25, 1:34 PM", read: false },
  { id: "w-51", category: "wartoys", body: "CUNNY attacked you with a grenade for 885 XP", time: "6/22/25, 1:33 PM", read: false },
  { id: "w-52", category: "wartoys", body: "CUNNY attacked you with a grenade for 985 XP", time: "6/22/25, 1:33 PM", read: false },
  { id: "w-53", category: "wartoys", body: "CUNNY attacked you with a grenade for 1082 XP", time: "6/22/25, 1:33 PM", read: false },
  { id: "w-54", category: "wartoys", body: "CUNNY attacked you with a grenade for 917 XP", time: "6/22/25, 1:33 PM", read: false },
  { id: "w-55", category: "wartoys", body: "CROSS attacked you with a grenade for 938 XP", time: "6/22/25, 7:15 AM", read: false },
  { id: "w-56", category: "wartoys", body: "MULE attacked you with a grenade for 999 XP", time: "6/22/25, 7:15 AM", read: false },
  { id: "w-57", category: "wartoys", body: "BGONE attacked you with a grenade for 1106 XP", time: "6/22/25, 5:53 AM", read: false },
  { id: "w-58", category: "wartoys", body: "BIGR attacked you with a grenade for 897 XP", time: "6/22/25, 5:11 AM", read: false },
  { id: "w-59", category: "wartoys", body: "BIGR attacked you with a grenade for 1121 XP", time: "6/22/25, 5:01 AM", read: false },
  { id: "w-60", category: "wartoys", body: "YOHONII attacked you with a grenade for 820 XP", time: "6/22/25, 2:43 AM", read: false },
  { id: "w-61", category: "wartoys", body: "BIGR attacked you with a grenade for 1195 XP", time: "6/22/25, 2:40 AM", read: false },
  { id: "w-62", category: "wartoys", body: "BIGR attacked you with a grenade for 910 XP", time: "6/22/25, 2:25 AM", read: false },
  { id: "w-63", category: "wartoys", body: "BIGR attacked you with a grenade for 1132 XP", time: "6/22/25, 2:24 AM", read: false },
  { id: "w-64", category: "wartoys", body: "BIGR attacked you with a grenade for 1198 XP", time: "6/22/25, 2:02 AM", read: false },
  { id: "w-65", category: "wartoys", body: "BIGR attacked you with a grenade for 863 XP", time: "6/22/25, 2:01 AM", read: false },
  { id: "w-66", category: "wartoys", body: "BIGR attacked you with a grenade for 898 XP", time: "6/22/25, 2:01 AM", read: false },
  { id: "w-67", category: "wartoys", body: "BIGR attacked you with a grenade for 951 XP", time: "6/22/25, 1:54 AM", read: false },
  { id: "w-68", category: "wartoys", body: "loonbar attacked you with a grenade for 806 XP", time: "6/19/25, 6:00 PM", read: false },
  { id: "w-69", category: "wartoys", body: "BASED attacked you with a grenade for 1073 XP", time: "6/19/25, 5:51 PM", read: false },
  { id: "w-70", category: "wartoys", body: "SmallWang attacked you with a grenade for 1049 XP", time: "6/19/25, 3:59 PM", read: false },
  { id: "w-71", category: "wartoys", body: "TrueCracker attacked you with a grenade for 905 XP", time: "6/19/25, 12:54 PM", read: false },
  { id: "w-72", category: "wartoys", body: "FIST attacked you with a grenade for 950 XP", time: "6/19/25, 7:58 AM", read: false },
  { id: "w-73", category: "wartoys", body: "CROSS attacked you with a grenade for 909 XP", time: "6/19/25, 7:54 AM", read: false },
  { id: "w-74", category: "wartoys", body: "pristine attacked you with a grenade for 1100 XP", time: "6/19/25, 2:59 AM", read: false },
  { id: "w-75", category: "wartoys", body: "DiabeticBruh421 attacked you with a grenade for 1164 XP", time: "6/18/25, 10:55 PM", read: false },
  { id: "w-76", category: "wartoys", body: "BOOTY attacked you with a grenade for 989 XP", time: "6/18/25, 5:31 PM", read: false },
  { id: "w-77", category: "wartoys", body: "Win attacked you with a grenade for 814 XP", time: "4/2/25, 10:24 AM", read: false },
  { id: "w-78", category: "wartoys", body: "CHAOS attacked you with a grenade for 942 XP", time: "4/1/25, 10:04 PM", read: false },
  { id: "w-79", category: "wartoys", body: "2fatfarmers attacked you with a grenade for 1055 XP", time: "3/9/25, 9:08 PM", read: false },
  { id: "w-80", category: "wartoys", body: "CHAOS attacked you with a grenade for 843 XP", time: "3/9/25, 6:44 PM", read: false },
  { id: "w-81", category: "wartoys", body: "CHAOS attacked you with a grenade for 1056 XP", time: "3/9/25, 6:43 PM", read: false },
  { id: "w-82", category: "wartoys", body: "CAW attacked you with a grenade for 1119 XP", time: "3/3/25, 9:29 PM", read: false },
  { id: "w-83", category: "wartoys", body: "CAW attacked you with a grenade for 1152 XP", time: "3/3/25, 9:29 PM", read: false },
  { id: "w-84", category: "wartoys", body: "usernames attacked you with a grenade for 1113 XP", time: "3/3/25, 9:00 PM", read: false },

  // Tokens batch
  { id: "t-1", category: "tokens", body: "You were tipped ₮1 from trish!", time: "12/21/23, 12:08 AM", read: false },
  { id: "t-2", category: "tokens", body: "You were tipped ₮1 from BuzzLightbeer!", time: "12/21/23, 12:00 AM", read: false },
];

export type NotificationsOverlayProps = {
  notifications?: TankNotificationItem[];
  onClose: () => void;
  onMarkAllRead?: () => void;
};

export function NotificationsOverlay({
  notifications = SEEDED_NOTIFICATIONS,
  onClose,
  onMarkAllRead,
}: NotificationsOverlayProps) {
  const [items, setItems] = useState<TankNotificationItem[]>(notifications);
  const [activeFilter, setActiveFilter] = useState<TankNotificationCategory>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const handleMarkAll = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    if (onMarkAllRead) onMarkAllRead();
  };

  const filteredItems = items.filter((n) => {
    if (activeFilter !== "all" && n.category !== activeFilter) return false;
    if (unreadOnly && n.read) return false;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end p-2 sm:p-4 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
    >
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Floating ChromePanel positioned on top-right of viewport */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto relative flex w-full max-w-[360px] sm:max-w-[390px] max-h-[90vh] flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* Top Close Button positioned with safe bolt clearance */}
          <div className="absolute right-7 top-3.5 z-30">
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* ═══════════ HEADER: TITLE & 5 CATEGORY FILTER BLOCKS ═══════════ */}
          <div className="px-8 pt-4 pb-3 border-b border-black/40 space-y-2.5">
            <div className="flex items-center gap-2 pr-8">
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Notifications
              </h2>

              {/* 1. All Filter */}
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition ${
                  activeFilter === "all"
                    ? "bg-[#e85a4f] ring-2 ring-yellow-400 text-white scale-105"
                    : "bg-[#e85a4f]/75 text-white hover:brightness-110"
                }`}
                title="All Notifications"
              >
                <Bell className="h-3.5 w-3.5 fill-white stroke-none" />
              </button>

              {/* 2. Tokens Filter */}
              <button
                type="button"
                onClick={() => setActiveFilter("tokens")}
                className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition ${
                  activeFilter === "tokens"
                    ? "bg-[#48a964] ring-2 ring-yellow-400 text-white scale-105"
                    : "bg-[#48a964]/75 text-white hover:brightness-110"
                }`}
                title="Tokens"
              >
                <Coins className="h-3.5 w-3.5" />
              </button>

              {/* 3. TTS/SFX Filter */}
              <button
                type="button"
                onClick={() => setActiveFilter("tts")}
                className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition ${
                  activeFilter === "tts"
                    ? "bg-[#4a90e2] ring-2 ring-yellow-400 text-white scale-105"
                    : "bg-[#4a90e2]/75 text-white hover:brightness-110"
                }`}
                title="TTS / SFX"
              >
                <Megaphone className="h-3.5 w-3.5" />
              </button>

              {/* 4. Tanktoys Filter */}
              <button
                type="button"
                onClick={() => setActiveFilter("tanktoys")}
                className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition ${
                  activeFilter === "tanktoys"
                    ? "bg-[#d4a017] ring-2 ring-yellow-400 text-black scale-105"
                    : "bg-[#d4a017]/75 text-black hover:brightness-110"
                }`}
                title="Tanktoys"
              >
                <Anchor className="h-3.5 w-3.5" />
              </button>

              {/* 5. Wartoys Filter */}
              <button
                type="button"
                onClick={() => setActiveFilter("wartoys")}
                className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition ${
                  activeFilter === "wartoys"
                    ? "bg-[#e85a4f] ring-2 ring-yellow-400 text-white scale-105"
                    : "bg-[#e85a4f]/75 text-white hover:brightness-110"
                }`}
                title="Wartoys"
              >
                <Swords className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Action Bar: Mark All Read + UNREAD ONLY Switch */}
            <div className="flex items-center justify-between pt-1">
              <ConsoleButton
                variant="orange"
                onClick={handleMarkAll}
                className="!px-2.5 !py-1 !text-[11px]"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark All Read
              </ConsoleButton>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span
                  className="text-[10px] font-black uppercase tracking-wider text-[#241f14]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  UNREAD ONLY
                </span>
                <button
                  type="button"
                  onClick={() => setUnreadOnly((prev) => !prev)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors border border-black/40 ${
                    unreadOnly ? "bg-[#e85a4f]" : "bg-black/60"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      unreadOnly ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* ═══════════ NOTIFICATIONS INNER SCROLLABLE FEED ═══════════ */}
          <div
            className="flex-1 overflow-y-auto px-8 py-3 pb-6 space-y-2 bg-gradient-to-b from-[#18191a] via-[#121314] to-[#0a0a0b]"
            style={{
              maxHeight: "calc(90vh - 130px)",
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-slate-500">
                No notifications...
              </div>
            ) : (
              filteredItems.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setItems((prev) =>
                      prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
                    );
                  }}
                  className={`group relative flex items-start gap-2.5 rounded border p-2.5 transition cursor-pointer ${
                    n.read
                      ? "border-white/5 bg-black/40 opacity-70"
                      : "border-black/60 bg-black/80 hover:border-yellow-400 shadow-md"
                  }`}
                >
                  {/* Left Icon */}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-black/60 border border-white/10">
                    {n.category === "tokens" ? (
                      <Coins className="h-4 w-4 text-[#39ff6a]" />
                    ) : n.category === "tts" ? (
                      <Megaphone className="h-4 w-4 text-[#4a90e2]" />
                    ) : n.category === "tanktoys" ? (
                      <Anchor className="h-4 w-4 text-yellow-400" />
                    ) : (
                      <Bomb className="h-4 w-4 text-[#ff3b2f]" />
                    )}
                  </span>

                  {/* Content Body & Timestamp */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p
                      className="text-xs font-black uppercase tracking-wide text-white leading-snug"
                      style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                    >
                      {n.body}
                    </p>

                    <div className="flex justify-end">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {n.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
