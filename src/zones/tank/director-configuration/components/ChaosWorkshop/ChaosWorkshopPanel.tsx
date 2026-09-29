"use client";

import React, { useState, useEffect } from "react";
import {
  Flame,
  Zap,
  Sparkles,
  RefreshCw,
  XCircle,
  Clock,
  Compass,
  Eye,
  Camera,
  Layers,
  Dog,
  Cat,
  Footprints,
  Volume2,
  Users,
  Shuffle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  CHAOS_DIRECTOR_CATALOG,
  type ChaosDirectorItemDefinition,
  type ActiveChaosItemPayload,
} from "../../../director/chaosDirectorCatalog";

type ChaosWorkshopPanelProps = {
  activeChaosItem?: ActiveChaosItemPayload | null;
  activeRoomKey?: string;
  onRefreshState?: () => void;
};

export function ChaosWorkshopPanel({
  activeChaosItem: propActiveChaosItem,
  activeRoomKey,
  onRefreshState,
}: ChaosWorkshopPanelProps) {
  const [activeItem, setActiveItem] = useState<ActiveChaosItemPayload | null>(
    propActiveChaosItem ?? null
  );
  const [triggeringSlug, setTriggeringSlug] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Sync prop changes
  useEffect(() => {
    if (propActiveChaosItem !== undefined) {
      setActiveItem(propActiveChaosItem);
    }
  }, [propActiveChaosItem]);

  // Poll active overrides
  const fetchOverrideState = async () => {
    try {
      const res = await fetch("/api/tank/director/override", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.hasActiveOverride && data?.activeOverrides?.length > 0) {
        const latest = data.activeOverrides[data.activeOverrides.length - 1];
        setActiveItem({
          itemSlug: latest.itemSlug,
          itemName: latest.itemName,
          triggeredBy: latest.triggeredBy,
          durationSeconds: latest.durationSeconds,
          timeRemainingSeconds: data.decoupledPolicy?.timeRemainingSeconds ?? 0,
          targetDetectionMode: data.decoupledPolicy?.effectiveDetectionMode ?? undefined,
          targetFramingMode: data.decoupledPolicy?.effectiveFramingMode ?? undefined,
          targetRoomKey: data.decoupledPolicy?.effectiveRoomKey ?? undefined,
          targetCameraId: data.decoupledPolicy?.effectiveCameraId ?? undefined,
          overrideRoomLock: data.decoupledPolicy?.overrideRoomLock ?? false,
          chaosHopIntervalMs: data.decoupledPolicy?.chaosHopIntervalMs ?? undefined,
        });
      } else {
        setActiveItem(null);
      }
    } catch {
      // Best effort
    }
  };

  useEffect(() => {
    void fetchOverrideState();
    const interval = setInterval(fetchOverrideState, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerItem = async (item: ChaosDirectorItemDefinition) => {
    setTriggeringSlug(item.slug);
    setFeedbackMessage(null);
    try {
      const res = await fetch("/api/tank/director/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemSlug: item.slug,
          targetRoomKey: item.slug === "room-spotlight" ? activeRoomKey || "living-room" : undefined,
          triggeredBy: "Operator",
          durationSeconds: item.defaultDurationSeconds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMessage(`⚡ Triggered: ${item.name}!`);
        await fetchOverrideState();
        onRefreshState?.();
      } else {
        setFeedbackMessage(`Error: ${data.error || "Failed to trigger"}`);
      }
    } catch (err) {
      setFeedbackMessage(`Network error triggering item`);
    } finally {
      setTriggeringSlug(null);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const handleDismissOverride = async () => {
    setDismissing(true);
    try {
      const res = await fetch("/api/tank/director/override", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setActiveItem(null);
        setFeedbackMessage("Cleared active item overrides");
        onRefreshState?.();
      }
    } catch {
      setFeedbackMessage("Failed to clear overrides");
    } finally {
      setDismissing(false);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const getItemIcon = (slug: string) => {
    switch (slug) {
      case "pet-whistle":
        return <Dog className="h-4 w-4 text-amber-400" />;
      case "cat-laser":
        return <Cat className="h-4 w-4 text-pink-400" />;
      case "sneaker-cam":
        return <Footprints className="h-4 w-4 text-teal-400" />;
      case "sound-hound":
        return <Volume2 className="h-4 w-4 text-cyan-400" />;
      case "viewer-mutiny":
        return <Users className="h-4 w-4 text-red-400" />;
      case "chaos-cyclone":
        return <Shuffle className="h-4 w-4 text-yellow-400" />;
      case "room-spotlight":
        return <Compass className="h-4 w-4 text-blue-400" />;
      case "paparazzi-zoom":
        return <Camera className="h-4 w-4 text-purple-400" />;
      default:
        return <Sparkles className="h-4 w-4 text-amber-400" />;
    }
  };

  return (
    <div className="rounded-xl border border-red-500/40 bg-[#16141a] p-3.5 space-y-3 shadow-xl">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-red-950/60 border border-red-500/60 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]">
            <Flame className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                Chaos Director & Decoupled Override Hub
              </p>
              <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.2 text-[9px] font-mono text-red-300">
                LIVE ORCHESTRATION
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400">
              Trigger decoupled items, knock director off its rocker & test viewer bounty items live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeItem && (
            <button
              type="button"
              onClick={handleDismissOverride}
              disabled={dismissing}
              className="flex items-center gap-1 rounded bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow transition disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {dismissing ? "Dismissing..." : "Dismiss Chaos"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded p-1 text-slate-400 hover:text-white transition"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Active Chaos Item Alert Banner */}
      {activeItem ? (
        <div className="rounded-lg border-2 border-red-500 bg-gradient-to-r from-red-950/80 via-orange-950/40 to-black/80 p-3 space-y-2 shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow animate-pulse">
                <Zap className="h-3 w-3 fill-black" />
                CHAOS OVERRIDE ACTIVE
              </span>
              <span className="text-sm font-black text-white">
                {activeItem.itemName}
              </span>
              <span className="text-[10px] font-mono text-slate-300">
                by @{activeItem.triggeredBy}
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-yellow-400">
              <Clock className="h-3.5 w-3.5 text-yellow-400 animate-spin" style={{ animationDuration: "4s" }} />
              <span>{activeItem.timeRemainingSeconds}s remaining</span>
            </div>
          </div>

          {/* Decoupled Slots Active HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/10 text-[10px] font-mono">
            <div className="rounded bg-black/40 border border-white/5 p-1.5">
              <span className="text-slate-400 block">Detection Style</span>
              <span className="text-amber-300 font-bold uppercase">
                {activeItem.targetDetectionMode || "Preserved"}
              </span>
            </div>

            <div className="rounded bg-black/40 border border-white/5 p-1.5">
              <span className="text-slate-400 block">Framing Mode</span>
              <span className="text-purple-300 font-bold uppercase">
                {activeItem.targetFramingMode || "Preserved"}
              </span>
            </div>

            <div className="rounded bg-black/40 border border-white/5 p-1.5">
              <span className="text-slate-400 block">Room Trajectory</span>
              <span className="text-cyan-300 font-bold uppercase">
                {activeItem.chaosHopIntervalMs
                  ? `Shuffle (${activeItem.chaosHopIntervalMs / 1000}s)`
                  : activeItem.targetRoomKey || "Heuristic / Dynamic"}
              </span>
            </div>

            <div className="rounded bg-black/40 border border-white/5 p-1.5">
              <span className="text-slate-400 block">Lock Override</span>
              <span
                className={`font-bold uppercase ${
                  activeItem.overrideRoomLock ? "text-red-400 animate-pulse" : "text-slate-400"
                }`}
              >
                {activeItem.overrideRoomLock ? "💥 OFF ROCKER" : "Compliant"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Layers className="h-3.5 w-3.5" />
            Control Plane Steady: Autonomous scorer & operator policy in sync.
          </span>
          <span className="text-[10px] text-slate-500">Ready for chat & chaos drops</span>
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div className="rounded bg-black/60 border border-yellow-500/50 px-2.5 py-1 text-[11px] font-mono text-yellow-300 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
          {feedbackMessage}
        </div>
      )}

      {/* Workshop Catalog Grid */}
      {isOpen && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>CHAOS DIRECTOR CATALOG (1-CLICK TEST)</span>
            <span>8 Canonical Viewer Overrides</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {CHAOS_DIRECTOR_CATALOG.map((item) => {
              const isTriggering = triggeringSlug === item.slug;
              const isItemActive = activeItem?.itemSlug === item.slug;

              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => handleTriggerItem(item)}
                  disabled={isTriggering}
                  className={`flex flex-col text-left rounded-lg p-2.5 border transition relative overflow-hidden group ${
                    isItemActive
                      ? "border-red-500 bg-red-950/40 ring-1 ring-red-400"
                      : "border-white/10 bg-black/40 hover:border-red-500/60 hover:bg-black/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="flex items-center gap-1.5">
                      {getItemIcon(item.slug)}
                      <span className="text-[11px] font-black text-white group-hover:text-red-300 transition">
                        {item.name}
                      </span>
                    </span>

                    <span className="rounded bg-black/60 border border-white/10 px-1 py-0.2 text-[8px] font-mono text-slate-400">
                      {item.defaultDurationSeconds}s
                    </span>
                  </div>

                  <p className="text-[9px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    {item.description}
                  </p>

                  <div className="mt-auto flex items-center justify-between w-full pt-1.5 border-t border-white/5 text-[8px] font-mono">
                    <span
                      className={`px-1.5 py-0.2 rounded font-black uppercase ${
                        item.overrideRoomLock
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {item.badge}
                    </span>

                    <span className="text-slate-400 group-hover:text-yellow-400 flex items-center gap-0.5">
                      {isTriggering ? (
                        <RefreshCw className="h-3 w-3 animate-spin text-yellow-400" />
                      ) : (
                        <>
                          <Zap className="h-2.5 w-2.5" />
                          <span>Trigger</span>
                        </>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChaosWorkshopPanel;
