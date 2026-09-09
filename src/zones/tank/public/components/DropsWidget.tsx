"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { getActiveDropCampaigns, claimDropTier } from "../../server/dropCampaigns";
import type { DropCampaignWithProgress } from "../../dropCampaignTypes";

// Compact HUD banner for Tank Drops — sits in the same banner stack as the
// Director Attention lock and Level-Up celebration in TankExperience.tsx.
// Renders nothing when there's no active campaign for this room, so it's
// invisible unless a producer has actually turned one on.
//
// Only shows the single nearest campaign/tier rather than every active one
// at once — multiple simultaneous drop banners would fight the Director
// Attention / Level-Up banners for the same strip of screen.

const REFRESH_MS = 15_000;

function pickNextTier(campaign: DropCampaignWithProgress) {
  return campaign.tiers.findIndex((_, i) => !campaign.claimedTiers.includes(i));
}

export function DropsWidget({
  roomId,
  signedIn,
  onClaimed,
}: {
  roomId: string;
  signedIn: boolean;
  /** Fired after a successful claim, so the host can also log a persistent notification. */
  onClaimed?: (label: string) => void;
}) {
  const [campaigns, setCampaigns] = useState<DropCampaignWithProgress[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [dismissedClaimed, setDismissedClaimed] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    void getActiveDropCampaigns(roomId).then(setCampaigns).catch(() => {});
  }, [roomId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!signedIn || campaigns.length === 0) return null;

  // Prefer a campaign the viewer hasn't fully cleared yet.
  const campaign =
    campaigns.find((c) => pickNextTier(c) !== -1) ?? campaigns[0];
  const tierIndex = pickNextTier(campaign);
  if (tierIndex === -1) return null; // every tier claimed on every active campaign

  const tier = campaign.tiers[tierIndex];
  const targetSeconds = tier.minutes * 60;
  const pct = Math.min(100, Math.round((campaign.secondsWatched / targetSeconds) * 100));
  const ready = campaign.secondsWatched >= targetSeconds;
  const claimId = `${campaign.id}:${tierIndex}`;

  if (dismissedClaimed.has(claimId)) return null;

  const remaining = Math.max(0, targetSeconds - campaign.secondsWatched);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await claimDropTier(campaign.id, tierIndex);
      if (res.success) {
        setDismissedClaimed((prev) => new Set(prev).add(claimId));
        onClaimed?.(`${campaign.title} — ${tier.label}`);
        refresh();
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-purple-500/40 bg-purple-950/40 px-3 py-2 text-xs font-black text-white shadow-2xl duration-300 animate-in slide-in-from-top-2">
      <div className="flex min-w-0 items-center gap-2">
        <Gift className="h-4 w-4 shrink-0 text-purple-300" />
        <div className="min-w-0">
          <p className="truncate text-purple-200">
            {campaign.title} — {tier.label}
          </p>
          <div className="mt-1 h-1.5 w-40 max-w-[40vw] overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full bg-purple-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      {ready ? (
        <button
          type="button"
          onClick={claim}
          disabled={claiming}
          className="flex shrink-0 items-center gap-1 rounded bg-purple-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_10px_rgba(168,85,247,0.5)] transition hover:bg-purple-400 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          Claim Drop
        </button>
      ) : (
        <span className="shrink-0 font-mono text-[10px] text-purple-300">
          {mm}:{ss.toString().padStart(2, "0")} left
        </span>
      )}
    </div>
  );
}

export default DropsWidget;
