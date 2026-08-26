"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, ShieldCheck, Crown, UserCog, History, Coins, Zap, ExternalLink } from "lucide-react";
import { setTankUserRole, type PromotableRole } from "../../server/userRoles";
import { getTankUserProfileCard, type TankUserProfileCard } from "../../server/userProfileCard";

export type TankUserMenuProps = {
  targetUserId: string;
  targetUserName: string;
  targetRole: string;
  targetAvatarUrl?: string;
  targetNameColor?: string;
  x: number;
  y: number;
  canManageRoles: boolean;
  canModerate: boolean;
  isSelf: boolean;
  onMention: (userName: string) => void;
  onViewHistory: (userId: string, userName: string) => void;
  onClose: () => void;
  onRoleChanged?: (userId: string, newRole: PromotableRole) => void;
};

const ROLE_BUTTONS: { role: PromotableRole; label: string; icon: React.ReactNode }[] = [
  { role: "member", label: "Member", icon: <UserCog className="h-3.5 w-3.5" /> },
  { role: "moderator", label: "Moderator", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { role: "admin", label: "Admin", icon: <Crown className="h-3.5 w-3.5" /> },
];

const ROLE_TITLES: Record<string, string> = {
  admin: "House Admin",
  moderator: "House Moderator",
  member: "Viewer",
  viewer: "Viewer",
};

function formatJoinDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Click-on-a-person profile card for Tank chat — modeled on the reference
// site's own profile popup (avatar, title, level/currency, join date,
// badge row, action row) rather than the plain text-list menu this used to
// be. Fixed-position, click-outside/escape dismiss, same as before.
export function TankUserMenu({
  targetUserId,
  targetUserName,
  targetRole,
  targetAvatarUrl,
  targetNameColor,
  x,
  y,
  canManageRoles,
  canModerate,
  isSelf,
  onMention,
  onViewHistory,
  onClose,
  onRoleChanged,
}: TankUserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [card, setCard] = useState<TankUserProfileCard | null>(null);

  useEffect(() => {
    let active = true;
    getTankUserProfileCard(targetUserId).then((result) => {
      if (active) setCard(result);
    });
    return () => {
      active = false;
    };
  }, [targetUserId]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 8;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, card]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleSetRole = async (role: PromotableRole) => {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    const res = await setTankUserRole(targetUserId, role);
    setBusy(false);
    if (res.success) {
      onRoleChanged?.(targetUserId, role);
      onClose();
    } else {
      setErrorMsg(res.error ?? "Failed to update role.");
    }
  };

  const nameColor = targetNameColor || "#ff4d00";
  const title = ROLE_TITLES[targetRole] ?? "Viewer";

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-64 overflow-hidden rounded-md border border-black/60 bg-[#17191e] shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* Header — colored bar matching the role, big avatar, name + title */}
      <div className="p-3 pb-2" style={{ background: `linear-gradient(180deg, ${nameColor}33, transparent)` }}>
        <div className="flex items-center gap-2.5">
          {targetAvatarUrl ? (
            <img
              src={targetAvatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded border-2 object-cover"
              style={{ borderColor: nameColor }}
            />
          ) : (
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded border-2 text-sm font-black text-white"
              style={{ borderColor: nameColor, backgroundColor: nameColor }}
            >
              {targetUserName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black" style={{ color: nameColor }}>
              {targetUserName}
            </p>
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
            {card && (
              <div className="mt-0.5 flex items-center gap-2 text-[10px] font-black">
                <span className="rounded bg-black/60 px-1.5 py-0.2 text-emerald-400">LVL {card.level}</span>
                <span className="flex items-center gap-0.5 text-amber-400">
                  <Coins className="h-3 w-3" />
                  {card.tokens}
                </span>
              </div>
            )}
          </div>
        </div>

        {card && (
          <p className="mt-2 text-[10px] font-semibold text-slate-500">
            Joined {formatJoinDate(card.joinedAt)} · {card.xp} XP
          </p>
        )}

        <a
          href={`/tank-profile/${targetUserId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 rounded border border-white/15 bg-black/40 py-1 text-[10px] font-black uppercase tracking-wide text-orange-300 transition hover:bg-black/70"
        >
          <ExternalLink className="h-3 w-3" />
          View Full Profile
        </a>
      </div>

      {/* Badges / Inventory row */}
      {card && card.badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 py-2">
          {card.badges.map((badge, i) => (
            <div
              key={i}
              title={badge.name}
              className="grid h-7 w-7 place-items-center rounded border border-white/10 bg-black/60"
            >
              {badge.iconUrl ? (
                <img src={badge.iconUrl} alt={badge.name} className="h-5 w-5 object-contain" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-slate-500" />
              )}
            </div>
          ))}
          {card.extraBadgeCount > 0 && (
            <span className="text-[10px] font-black text-slate-400">+{card.extraBadgeCount}</span>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="space-y-0.5 border-t border-white/10 p-1.5">
        <button
          type="button"
          onClick={() => {
            onMention(targetUserName);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-orange-400" />
          Reply / @Mention
        </button>

        {/* Direct Message intentionally not implemented yet — no DM system
            exists in Tank. Reply/@mention above is the only "message this
            person" action until one is built. */}

        {canModerate && (
          <button
            type="button"
            onClick={() => {
              onViewHistory(targetUserId, targetUserName);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <History className="h-3.5 w-3.5 text-cyan-400" />
            View Chat History
          </button>
        )}

        {canManageRoles && !isSelf && (
          <>
            {!showRolePicker ? (
              <button
                type="button"
                onClick={() => setShowRolePicker(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
              >
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                Set Role...
              </button>
            ) : (
              <div className="rounded bg-black/40 p-1">
                <p className="px-1 pb-1 text-[9px] font-black uppercase tracking-wide text-slate-500">Set Role</p>
                {ROLE_BUTTONS.map((rb) => (
                  <button
                    key={rb.role}
                    type="button"
                    disabled={busy || targetRole === rb.role}
                    onClick={() => handleSetRole(rb.role)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-bold transition disabled:opacity-40 ${
                      targetRole === rb.role ? "bg-orange-500/20 text-orange-300" : "text-white hover:bg-white/10"
                    }`}
                  >
                    {rb.icon}
                    {rb.label}
                    {targetRole === rb.role && <span className="ml-auto text-[9px]">current</span>}
                  </button>
                ))}
              </div>
            )}
            {errorMsg && <p className="px-2 pt-1 text-[10px] font-bold text-red-400">{errorMsg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
export default TankUserMenu;
