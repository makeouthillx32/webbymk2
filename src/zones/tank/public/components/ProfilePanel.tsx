"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  User,
  Settings,
  Sparkles,
  Bell,
  CreditCard,
  Key,
  Megaphone,
  HelpCircle,
  LogOut,
  ChevronRight,
  Home,
  Shield,
  ShoppingBag,
  Video,
  Minus,
} from "lucide-react";
import type { TankPlayerProfile } from "../../server/gamification";

export type ProfilePanelProps = {
  initialProfile: (TankPlayerProfile & { avatarUrl?: string | null; nameColor?: string | null }) | null;
  signedIn: boolean;
  merchHref: string;
  onClaimDaily?: () => void;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
  onOpenProfile: () => void;
  onOpenNotifications?: () => void;
  onOpenBilling?: () => void;
  onOpenAdvertise?: () => void;
  onOpenHelp?: () => void;
  onOpenAppeals?: () => void;
  onSignOut: () => void;
  onCollapseRail: () => void;
  unreadNotificationsCount?: number;
};

export function ProfilePanel({
  initialProfile,
  signedIn,
  merchHref,
  onClaimDaily,
  onOpenSettings,
  onOpenSignIn,
  onOpenProfile,
  onOpenNotifications,
  onOpenBilling,
  onOpenAdvertise,
  onOpenHelp,
  onOpenAppeals,
  onSignOut,
  onCollapseRail,
  unreadNotificationsCount = 0,
}: ProfilePanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Standard menu-item icons pick up the viewer's own chosen profile color
  // (same nameColor used for their chat username) instead of a fixed brand
  // orange — a personal touch, and Tailwind can't express a runtime value
  // via an arbitrary-value class, so these render via inline style instead
  // of text-[#ff4d00]. Staff Room / Creator Dashboard keep their own fixed
  // accent colors on purpose — those are role badges, not generic items.
  const menuIconColor = initialProfile?.nameColor || "#ff4d00";

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
      <div
        className="flex w-fit max-w-full items-center gap-1 border border-black/60 bg-[#202328]/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_4px_12px_rgba(0,0,0,.55)] backdrop-blur-sm"
        style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
        role="toolbar"
        aria-label="Tank quick actions"
      >
        <button
          type="button"
          onClick={handleClickNameplate}
          className={`group relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden border bg-black/80 shadow transition hover:border-yellow-400 active:scale-95 ${
            menuOpen ? "border-yellow-400 ring-1 ring-yellow-400/50" : "border-white/20"
          }`}
          style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
          title={signedIn ? "Click to open user menu" : "Click to Sign In"}
          aria-label={signedIn ? "Open profile menu" : "Sign in"}
        >
            {initialProfile?.avatarUrl ? (
              <img
                src={initialProfile.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png";
                }}
              />
            ) : (
              <User className="h-4 w-4 text-slate-300" />
            )}
          {unreadNotificationsCount > 0 && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#ff3b2f] shadow-[0_0_5px_#ff3b2f]" />
          )}
        </button>

        <button
            type="button"
            onClick={onClaimDaily}
            className="grid h-8 w-8 shrink-0 place-items-center border border-amber-900/80 bg-[#e9ae20] text-[#241500] shadow-[inset_0_1px_0_rgba(255,255,255,.45)] transition hover:brightness-110 active:scale-95"
            style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
            title="Daily bonus"
            aria-label="Daily bonus"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <Link
            href={merchHref}
            className="grid h-8 w-8 shrink-0 place-items-center border border-orange-950/80 bg-[#f28c18] text-[#241500] shadow-[inset_0_1px_0_rgba(255,255,255,.45)] transition hover:brightness-110 active:scale-95"
            style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
            title="Merch"
            aria-label="Merch"
          >
            <ShoppingBag className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onOpenSettings}
            className="grid h-8 w-8 shrink-0 place-items-center border border-white/15 bg-[#4e5964] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)] transition hover:brightness-110 active:scale-95"
            style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />
          <button
            type="button"
            onClick={onCollapseRail}
            className="grid h-8 w-8 shrink-0 place-items-center border border-red-950/80 bg-[#d94339] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)] transition hover:bg-[#ef5146] active:scale-95"
            style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
            title="Hide panels"
            aria-label="Hide panels"
          >
            <Minus className="h-4 w-4" strokeWidth={3} />
          </button>
      </div>

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
            <User className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
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

          {/* Creator Dashboard — same "who can stream" gate as /stream itself
              (obsRooms.ts: admin or moderator). No "streamer" role/tag exists
              in profiles yet, so this can't be scoped to streamers alone the
              way it eventually should be — admin/moderator is the real
              current boundary, streamer support is a follow-up once that
              role exists. */}
          {(initialProfile?.role === "admin" || initialProfile?.role === "moderator") && (
            <Link
              href="/stream"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded border border-purple-500/50 bg-gradient-to-r from-purple-950/60 to-fuchsia-950/60 px-3 py-2.5 text-left text-sm font-black tracking-tight text-purple-200 transition hover:bg-purple-900/80 active:scale-[0.98] shadow-[0_0_10px_rgba(168,85,247,0.2)]"
            >
              <Video className="h-4 w-4 shrink-0 stroke-[2.5] text-purple-400" />
              <span className="flex-1">Creator Dashboard</span>
              <span className="rounded bg-purple-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow">
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
            <Bell className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
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
            <CreditCard className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
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
            <Megaphone className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
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
            <HelpCircle className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
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
            <LogOut className="h-4 w-4 shrink-0 stroke-[2.5]" style={{ color: menuIconColor }} />
            <span className="flex-1">Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
