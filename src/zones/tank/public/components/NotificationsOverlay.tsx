"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  Coins,
  Package,
  Gift,
  X,
  CheckCheck,
  Scroll,
  Flame,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";

// Categories match real Tank events only — the previous set ("TTS",
// "Wartoys" combat, tanktoys) mirrored features that were never actually
// built, and every entry under them was hardcoded placeholder data (see
// SEEDED_NOTIFICATIONS' removal below). "system" covers level-ups and
// house announcements; the rest map 1:1 to real reward paths.
export type TankNotificationCategory =
  | "all"
  | "tokens"
  | "items"
  | "drops"
  | "missions"
  | "system";

export type TankNotificationItem = {
  id: string;
  category: "tokens" | "items" | "drops" | "missions" | "system";
  body: string;
  time: string;
  read: boolean;
};

export type NotificationsOverlayProps = {
  notifications?: TankNotificationItem[];
  onClose: () => void;
  onMarkAllRead?: () => void;
  onNotificationRead?: (id: string) => void;
};

export function NotificationsOverlay({
  notifications = [],
  onClose,
  onMarkAllRead,
  onNotificationRead,
}: NotificationsOverlayProps) {
  const [items, setItems] = useState<TankNotificationItem[]>(notifications);
  const [activeFilter, setActiveFilter] = useState<TankNotificationCategory>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Sync with prop updates — including down to zero. The old `length > 0`
  // guard here meant a real empty state could never actually reach `items`
  // once anything had rendered once; harmless while notifications were
  // always-nonempty fake seed data, wrong now that "you have none yet" is a
  // real, legitimate state.
  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  // Keyboard escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleMarkAll = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    if (onMarkAllRead) onMarkAllRead();
  };

  const handleItemClick = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    if (onNotificationRead) onNotificationRead(id);
  };

  const filteredItems = items.filter((n) => {
    if (activeFilter !== "all" && n.category !== activeFilter) return false;
    if (unreadOnly && n.read) return false;
    return true;
  });

  const getCategoryIcon = (category: TankNotificationItem["category"]) => {
    switch (category) {
      case "tokens":
        return <Coins className="h-4 w-4 text-[#39ff6a]" />;
      case "items":
        return <Package className="h-4 w-4 text-[#ffc107]" />;
      case "drops":
        return <Gift className="h-4 w-4 text-[#a855f7]" />;
      case "missions":
        return <Scroll className="h-4 w-4 text-[#4a90e2]" />;
      case "system":
        return <Bell className="h-4 w-4 text-[#ff5722]" />;
      default:
        return <Bell className="h-4 w-4 text-white" />;
    }
  };

  const filterButtons: {
    key: TankNotificationCategory;
    label: string;
    icon: React.ReactNode;
    colorClass: string;
  }[] = [
    {
      key: "all",
      label: "All",
      icon: <Flame className="h-3.5 w-3.5 fill-white stroke-none" />,
      colorClass: "bg-[#e85a4f]",
    },
    {
      key: "tokens",
      label: "Tokens",
      icon: <Coins className="h-3.5 w-3.5" />,
      colorClass: "bg-[#48a964]",
    },
    {
      key: "items",
      label: "Items",
      icon: <Package className="h-3.5 w-3.5" />,
      colorClass: "bg-[#d4a017]",
    },
    {
      key: "drops",
      label: "Drops",
      icon: <Gift className="h-3.5 w-3.5" />,
      colorClass: "bg-[#9333ea]",
    },
    {
      key: "missions",
      label: "Quests",
      icon: <Scroll className="h-3.5 w-3.5" />,
      colorClass: "bg-[#4a90e2]",
    },
    {
      key: "system",
      label: "System",
      icon: <Bell className="h-3.5 w-3.5" />,
      colorClass: "bg-[#dc2626]",
    },
  ];

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
        className="pointer-events-auto relative flex w-full max-w-[360px] sm:max-w-[420px] max-h-[92vh] flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200"
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
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* ═══════════ HEADER: TITLE & 6 CATEGORY FILTER ICONS ═══════════ */}
          <div className="px-7 pt-4 pb-3 border-b border-black/40 space-y-2.5">
            <div className="flex items-center justify-between pr-8">
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Notifications
              </h2>

              {/* 6 Category Filter Icons */}
              <div className="flex items-center gap-1.5">
                {filterButtons.map((btn) => {
                  const isActive = activeFilter === btn.key;
                  return (
                    <div key={btn.key} className="relative group">
                      <button
                        type="button"
                        onClick={() => setActiveFilter(btn.key)}
                        className={`grid h-7 w-7 place-items-center rounded border border-black/40 shadow transition cursor-pointer ${
                          btn.colorClass
                        } ${
                          isActive
                            ? "ring-2 ring-yellow-400 text-white scale-105 brightness-110 shadow-md"
                            : "opacity-80 text-white hover:opacity-100 hover:brightness-110 hover:scale-105"
                        }`}
                        title={btn.label}
                      >
                        {btn.icon}
                      </button>

                      {/* Active Label Pill below active icon */}
                      {isActive && (
                        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
                          <span className="bg-black/90 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-white/20 shadow whitespace-nowrap">
                            {btn.label}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Bar: Mark All Read + UNREAD ONLY Switch */}
            <div className="flex items-center justify-between pt-2">
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
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors border border-black/40 cursor-pointer ${
                    unreadOnly ? "bg-[#e85a4f]" : "bg-black/60"
                  }`}
                  aria-checked={unreadOnly}
                  role="switch"
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
            className="flex-1 overflow-y-auto px-7 py-3 pb-6 space-y-2 bg-gradient-to-b from-[#18191a] via-[#121314] to-[#0a0a0b]"
            style={{
              maxHeight: "calc(92vh - 135px)",
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-slate-500">
                {unreadOnly
                  ? "No unread notifications"
                  : "No notifications in this category"}
              </div>
            ) : (
              filteredItems.map((n) => {
                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n.id)}
                    className={`group relative flex items-start gap-3 rounded-lg border p-3 transition cursor-pointer select-none ${
                      n.read
                        ? "border-white/5 bg-[#1a1d24]/60 opacity-70 hover:opacity-90 hover:bg-[#1a1d24]/90"
                        : "border-slate-700/80 bg-[#1e232f] hover:border-yellow-400 shadow-md ring-1 ring-white/10"
                    }`}
                  >
                    {/* Unread indicator dot */}
                    {!n.read && (
                      <span className="absolute -top-1 -left-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-black" />
                      </span>
                    )}

                    {/* Left Category Icon */}
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-black/70 border border-white/10 shadow-inner mt-0.5">
                      {getCategoryIcon(n.category)}
                    </span>

                    {/* Content Body & Timestamp */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p
                        className={`text-xs font-bold leading-snug ${
                          n.read ? "text-slate-300" : "text-white font-black"
                        }`}
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
                );
              })
            )}
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
export default NotificationsOverlay;
