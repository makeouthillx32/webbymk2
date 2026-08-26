"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  User,
  Settings,
  Bell,
  CreditCard,
  Key,
  Megaphone,
  HelpCircle,
  LogOut,
  ChevronRight,
  Home,
  Shield,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import type { TankClanSummary, TankPlayerProfile } from "../../server/gamification";
import { getLevelForXp } from "../../xpLevels";

export type ProfilePanelProps = {
  initialProfile: (TankPlayerProfile & { avatarUrl?: string | null; nameColor?: string | null }) | null;
  userClan: TankClanSummary | null;
  signedIn: boolean;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
  onOpenProfile: () => void;
  onOpenNotifications?: () => void;
  onOpenBilling?: () => void;
  onOpenAdvertise?: () => void;
  onOpenHelp?: () => void;
  onOpenAppeals?: () => void;
  onSignOut: () => void;
  unreadNotificationsCount?: number;
};

export function ProfilePanel({
  initialProfile,
  userClan,
  signedIn,
  onOpenSettings,
  onOpenSignIn,
  onOpenProfile,
  onOpenNotifications,
  onOpenBilling,
  onOpenAdvertise,
  onOpenHelp,
  onOpenAppeals,
  onSignOut,
  unreadNotificationsCount = 0,
}: ProfilePanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const handleClickNameplate = () => {
    if (signedIn) {
      setMenuOpen((prev) => !prev);
    } else {
      onOpenSignIn();
    }
  };

  return (
    <div className="relative w-full" ref={menuRef}>
      <ChromePanel withScrews className="w-full" contentClassName="!px-6 !py-4 space-y-3">
        {/* Clickable Avatar & User Nameplate */}
        <button
          type="button"
          onClick={handleClickNameplate}
          className={`group flex w-full items-center gap-3 rounded-lg p-1 text-left transition-all hover:bg-black/10 active:scale-[0.98] ${
            menuOpen ? "bg-black/15 ring-1 ring-yellow-400/50" : ""
          }`}
          title={signedIn ? "Click to open user menu" : "Click to Sign In"}
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-[#7a8576] bg-black/80 shadow-md group-hover:border-yellow-400 group-hover:shadow-[0_0_8px_rgba(250,204,21,0.6)]">
            {initialProfile?.avatarUrl ? (
              <img
                src={initialProfile.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-contain p-0.5 drop-shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png";
                }}
              />
            ) : (
              <User className="h-6 w-6 text-slate-400" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-black uppercase tracking-wide group-hover:underline"
              style={{
                color: initialProfile?.nameColor || "#241f14",
                fontFamily: ACTIVE_THEME.fonts.label,
              }}
            >
              {signedIn ? initialProfile?.displayName ?? "Viewer" : "Guest (Sign In)"}
            </p>
            {signedIn ? (
              <p className="text-[10px] font-bold" style={{ color: "#4c4630" }}>
                LVL {initialProfile ? getLevelForXp(initialProfile.xp ?? 0) : 1}
                {userClan ? ` · [${userClan.tag}]` : ""}
              </p>
            ) : (
              <p className="text-[10px] font-semibold text-slate-600">Spectator Mode</p>
            )}
          </div>
        </button>

        {/* Buttons */}
        <div className="flex gap-2">
          <ConsoleButton className="flex-1" onClick={onOpenSettings}>
            <Settings className="h-3.5 w-3.5" />
            Settings
          </ConsoleButton>
          {!signedIn && (
            <ConsoleButton variant="orange" className="flex-1" onClick={onOpenSignIn}>
              Sign in
            </ConsoleButton>
          )}
        </div>
      </ChromePanel>

      {/* ═══════════ TANK DROPDOWN MENU ═══════════ */}
      {menuOpen && signedIn && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-md border border-[#2d2f34] bg-[#1a1b1e] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          style={{
            boxShadow: "0 10px 30px rgba(0,0,0,0.9), 0 0 1px rgba(255,255,255,0.1)",
          }}
        >
          {/* Profile */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenProfile();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <User className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Profile</span>
          </button>

          {/* Staff Room (Single unified command desk for admin / moderator) */}
          {(initialProfile?.role === "admin" ||
            initialProfile?.role === "moderator" ||
            initialProfile?.displayName?.toLowerCase() === "admin") && (
            <Link
              href="/house"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded border border-orange-500/50 bg-gradient-to-r from-orange-950/60 to-amber-950/60 px-3 py-2.5 text-left text-sm font-black tracking-tight text-orange-200 transition hover:bg-orange-900/80 active:scale-[0.98] shadow-[0_0_10px_rgba(255,77,0,0.2)]"
            >
              <Shield className="h-4 w-4 shrink-0 stroke-[2.5] text-orange-400" />
              <span className="flex-1">Staff Room</span>
              <span className="rounded bg-[#ff4d00] px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow">
                {initialProfile?.role === "moderator" ? "MOD" : "ADMIN"}
              </span>
            </Link>
          )}

          {/* Notifications */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              if (onOpenNotifications) onOpenNotifications();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <Bell className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Notifications</span>
            {unreadNotificationsCount > 0 && (
              <span className="rounded-full bg-[#ff4d00] px-1.5 py-0.2 text-[10px] font-black text-white">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Billing */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              if (onOpenBilling) onOpenBilling();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <CreditCard className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Billing</span>
          </button>

          {/* Advertise */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              if (onOpenAdvertise) onOpenAdvertise();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <Megaphone className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Advertise</span>
          </button>

          {/* Help */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              if (onOpenHelp) onOpenHelp();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <HelpCircle className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Help</span>
          </button>

          {/* Divider */}
          <div className="my-1 border-t border-white/10" />

          {/* Log Out */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-black tracking-tight text-white transition hover:bg-[#ff4d00]/20 hover:text-[#ff4d00] active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4 shrink-0 stroke-[2.5] text-[#ff4d00]" />
            <span className="flex-1">Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
