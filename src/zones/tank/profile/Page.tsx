import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Package, Mic, Home } from "lucide-react";
import { ChromePanel } from "../public/components/ChromePanel";
import { ACTIVE_THEME } from "../theme";
import {
  getTankUserFullProfile,
  getUserInventoryFor,
  getUserAudioHistory,
} from "../server/userFullProfile";
import { getTankItemIcon, getTankItemEmoji } from "../tankItemCatalog";

export const metadata: Metadata = {
  title: "Tank Profile",
  description: "Viewer profile — level, inventory, and TTS/SFX history.",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes}m ago`;
}

const RARITY_COLORS: Record<string, string> = {
  common: "border-slate-500/40 bg-slate-950/40",
  uncommon: "border-emerald-500/40 bg-emerald-950/40",
  rare: "border-blue-500/40 bg-blue-950/40",
  epic: "border-purple-500/40 bg-purple-950/40",
  legendary: "border-amber-500/60 bg-amber-950/40",
};

export default async function TankProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [profile, inventory, audioHistory] = await Promise.all([
    getTankUserFullProfile(userId),
    getUserInventoryFor(userId),
    getUserAudioHistory(userId),
  ]);

  if (!profile) {
    return (
      <main className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-[#0d0e11] p-4 text-center text-slate-300">
        <p className="text-sm font-bold">
          Profile not found, or you need to be signed in to view it.
        </p>
      </main>
    );
  }

  const progressPct = Math.round((profile.xpIntoLevel / profile.xpForNextLevel) * 100);

  return (
    <main className="min-h-screen min-h-[100dvh] bg-[#0d0e11] p-3 text-slate-200 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
        >
          <Home className="h-3.5 w-3.5" /> Back to Tank
        </Link>

        {/* Header */}
        <ChromePanel withScrews>
          <div
            className="-m-4 mb-3 rounded-t p-4"
            style={{ background: `linear-gradient(180deg, ${profile.nameColor}33, transparent)` }}
          >
            <div className="flex items-center gap-4">
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-20 w-20 rounded border-2 object-cover shadow-lg"
                style={{ borderColor: profile.nameColor }}
              />
              <div className="min-w-0 flex-1">
                <h1
                  className="truncate text-xl font-black"
                  style={{ color: profile.nameColor, fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  {profile.displayName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold">
                  <span className="rounded bg-black/60 px-2 py-0.5 text-emerald-400">LVL {profile.level}</span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <Coins className="h-3.5 w-3.5" />
                    {profile.tokens} tokens
                  </span>
                  <span className="text-slate-500">
                    Joined{" "}
                    {profile.joinedAt
                      ? new Date(profile.joinedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                      style={{ width: `${Math.min(100, progressPct)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                    {profile.xpIntoLevel} / {profile.xpForNextLevel} XP to Level {profile.level + 1}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ChromePanel>

        {/* Inventory */}
        <ChromePanel withScrews>
          <div className="mb-2 flex items-center gap-2 border-b border-black/15 pb-1">
            <Package className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
              Inventory ({inventory.length})
            </span>
          </div>
          {inventory.length === 0 ? (
            <p className="py-4 text-center text-xs font-semibold italic text-slate-600">No items yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {inventory.map((item) => {
                const icon = getTankItemIcon(item.slug || item.itemId, item.iconUrl);
                const emoji = getTankItemEmoji(item.slug || item.itemId);
                return (
                  <div
                    key={item.itemId}
                    title={item.name}
                    className={`relative aspect-square rounded border p-1.5 flex items-center justify-center ${
                      RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common
                    }`}
                  >
                    {icon ? (
                      <img src={icon} alt={item.name} className="h-full w-full object-contain" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-lg">{emoji}</div>
                    )}
                    {item.quantity > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/90 px-1 text-[9px] font-black text-white">
                        x{item.quantity}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ChromePanel>

        {/* TTS / SFX History */}
        <ChromePanel withScrews>
          <div className="mb-2 flex items-center gap-2 border-b border-black/15 pb-1">
            <Mic className="h-4 w-4 text-cyan-600" />
            <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
              TTS / SFX History ({audioHistory.length})
            </span>
          </div>
          {audioHistory.length === 0 ? (
            <p className="py-4 text-center text-xs font-semibold italic text-slate-600">
              No TTS/SFX requests yet.
            </p>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {audioHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded border border-black/15 bg-white/40 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#241f14]">
                      {entry.kind === "tts" ? `"${entry.message}"` : entry.voiceOrSoundKey}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {entry.kind.toUpperCase()} · {entry.voiceOrSoundKey} · {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                      entry.status === "approved" || entry.status === "played"
                        ? "bg-emerald-600 text-white"
                        : entry.status === "rejected"
                          ? "bg-red-600 text-white"
                          : "bg-slate-600 text-white"
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChromePanel>
      </div>
    </main>
  );
}
