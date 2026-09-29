"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  Sparkles,
  Plus,
  RefreshCw,
  Clock,
  Award,
  Coins,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Crosshair,
  Layers,
  Box,
} from "lucide-react";
import {
  listTrashTargetsAction,
  createTrashTargetAction,
  clearTrashTargetAction,
  resetDefaultTrashTargetsAction,
  claimInteractiveTargetTap,
} from "../server/interactiveTargetActions";
import type { InteractiveTarget } from "../server/interactiveTargetDetector";
import { ACTIVE_THEME } from "../theme";

type EnrichedTarget = InteractiveTarget & {
  ageMinutes: number;
  ageBonusXp: number;
  totalXp: number;
};

const ROOM_OPTIONS = [
  { slug: "living-room", title: "Living Room" },
  { slug: "kitchen", title: "Kitchen" },
  { slug: "game-room", title: "Game Room" },
  { slug: "director", title: "Director Cut (House-Wide)" },
];

const TARGET_KINDS = [
  { id: "trash", label: "Trash (High Dwell Bonus)", icon: "🗑️" },
  { id: "clutter", label: "Room Clutter", icon: "📦" },
  { id: "easter_egg", label: "Easter Egg (Secret Bounty)", icon: "🥚" },
  { id: "waldo", label: "Where's Waldo Special", icon: "🎯" },
] as const;

const BOX_PRESETS = [
  { label: "Center Floor", box: { xMin: 0.35, yMin: 0.45, xMax: 0.65, yMax: 0.75 } },
  { label: "Bottom Left Corner", box: { xMin: 0.1, yMin: 0.65, xMax: 0.35, yMax: 0.9 } },
  { label: "Bottom Right Corner", box: { xMin: 0.65, yMin: 0.65, xMax: 0.9, yMax: 0.9 } },
  { label: "Top Shelf / Counter", box: { xMin: 0.4, yMin: 0.2, xMax: 0.65, yMax: 0.45 } },
];

export function TrashAdminPanel() {
  const [targets, setTargets] = useState<EnrichedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // New Target Form State
  const [roomSlug, setRoomSlug] = useState("living-room");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"trash" | "clutter" | "easter_egg" | "waldo">("trash");
  const [xMin, setXMin] = useState(0.2);
  const [yMin, setYMin] = useState(0.5);
  const [xMax, setXMax] = useState(0.4);
  const [yMax, setYMax] = useState(0.7);
  const [xpReward, setXpReward] = useState(25);
  const [tokenReward, setTokenReward] = useState(15);
  const [durationMinutes, setDurationMinutes] = useState(120);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrashTargetsAction();
      if (res.success && res.targets) {
        setTargets(res.targets);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTargets();
    const interval = setInterval(fetchTargets, 5000);
    return () => clearInterval(interval);
  }, [fetchTargets]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const selectedRoom = ROOM_OPTIONS.find((r) => r.slug === roomSlug);
    const res = await createTrashTargetAction({
      camSlug: roomSlug,
      roomKey: roomSlug,
      roomTitle: selectedRoom?.title || "House Room",
      label: label.trim(),
      kind,
      box: { xMin, yMin, xMax, yMax },
      xpReward,
      tokenReward,
      durationMinutes,
    });

    if (res.success) {
      setActionMessage(`✅ Deployed "${label}" to ${selectedRoom?.title}!`);
      setLabel("");
      void fetchTargets();
    } else {
      setActionMessage(`❌ Error: ${res.error}`);
    }
  };

  const handleClear = async (targetId: string, itemLabel: string) => {
    const res = await clearTrashTargetAction(targetId, "Operator");
    if (res.success) {
      setActionMessage(`🧹 Cleared "${itemLabel}" and broadcast to chat!`);
      void fetchTargets();
    }
  };

  const handleTestTap = async (target: EnrichedTarget) => {
    const midX = (target.box.xMin + target.box.xMax) / 2;
    const midY = (target.box.yMin + target.box.yMax) / 2;
    const res = await claimInteractiveTargetTap({
      camSlug: target.camSlug,
      roomId: target.roomKey,
      nx: midX,
      ny: midY,
    });
    if (res.hit) {
      setActionMessage(`🎯 Tap Hit Tested! Awarded ${res.xpAwarded} XP to player.`);
      void fetchTargets();
    } else {
      setActionMessage(`ℹ️ Tap missed or already claimed: ${res.message || res.error || "No hit"}`);
    }
  };

  const handleResetDefaults = async () => {
    const res = await resetDefaultTrashTargetsAction();
    if (res.success) {
      setActionMessage(`✨ Reset ${res.count} default house clutter & trash targets!`);
      void fetchTargets();
    }
  };

  const applyPreset = (presetBox: { xMin: number; yMin: number; xMax: number; yMax: number }) => {
    setXMin(presetBox.xMin);
    setYMin(presetBox.yMin);
    setXMax(presetBox.xMax);
    setYMax(presetBox.yMax);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-950/40 via-black/40 to-orange-950/40 p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 shadow">
            <Trash2 className="h-6 w-6" />
          </div>
          <div>
            <h2
              className="text-base font-black uppercase tracking-wider text-white md:text-lg"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Trash, Clutter & Scavenger Bounties Control
            </h2>
            <p className="text-xs font-semibold text-slate-400">
              Real-time screen touch hit-testing · Dwell-time age multiplier (+5 XP/min) · Chat system announcements
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTargets}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-black/50 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-900/60 transition shadow"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Re-seed Default Bounties
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="flex items-center justify-between rounded-lg border border-orange-500/40 bg-black/80 px-4 py-2 text-xs font-bold text-orange-300">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left = Target Roster Table (8 cols), Right = Spawn Form (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Targets Table */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
              <Box className="h-4 w-4" />
              Active In-Room Targets & Clutter ({targets.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-400 font-bold">
              Age Multiplier: Active (+5 XP / min dwell)
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#121316] shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-black/60 font-mono text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Item</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Normalized Bounding Box</th>
                    <th className="p-3">Age & Multiplier</th>
                    <th className="p-3">Total Bounty</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {targets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-semibold">
                        No active targets in rooms. Click "Re-seed Default Bounties" or spawn one to the right.
                      </td>
                    </tr>
                  ) : (
                    targets.map((target) => {
                      const isTrash = target.kind === "trash";
                      return (
                        <tr key={target.id} className="hover:bg-white/[0.02] transition">
                          <td className="p-3 font-bold text-white flex items-center gap-2">
                            <span>
                              {target.kind === "trash"
                                ? "🗑️"
                                : target.kind === "clutter"
                                ? "📦"
                                : target.kind === "easter_egg"
                                ? "🥚"
                                : "🎯"}
                            </span>
                            <span>{target.label}</span>
                          </td>
                          <td className="p-3 font-semibold text-slate-300">
                            <span className="rounded bg-black/40 px-2 py-0.5 border border-slate-700 text-[11px]">
                              {target.roomTitle}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-400">
                            [{target.box.xMin.toFixed(2)}, {target.box.yMin.toFixed(2)}] → [{target.box.xMax.toFixed(2)}, {target.box.yMax.toFixed(2)}]
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            <div className="flex items-center gap-1 text-amber-400 font-bold">
                              <Clock className="h-3 w-3" />
                              {target.ageMinutes}m (+{target.ageBonusXp} XP)
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 font-mono text-[11px] font-black text-emerald-300">
                                +{target.totalXp} XP
                              </span>
                              <span className="rounded bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                                +{target.tokenReward} T
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                target.active
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                  : "bg-slate-800 text-slate-500"
                              }`}
                            >
                              {target.active ? "ACTIVE" : "CLEARED"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTestTap(target)}
                                className="rounded bg-cyan-950/60 border border-cyan-500/40 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900/80 transition"
                                title="Simulate player tap at center of bounding box"
                              >
                                Test Tap
                              </button>
                              {target.active && (
                                <button
                                  type="button"
                                  onClick={() => handleClear(target.id, target.label)}
                                  className="rounded bg-red-950/60 border border-red-500/40 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-900/80 transition"
                                  title="Force clear target and broadcast cleanup to chat"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Spawn New Bounty Form */}
        <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121316] p-4 shadow-xl space-y-4">
          <div className="border-b border-white/10 pb-2 flex items-center gap-2">
            <Plus className="h-4 w-4 text-orange-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Spawn Interactive Bounty
            </h3>
          </div>

          <form onSubmit={handleCreate} className="space-y-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Target Room
              </label>
              <select
                value={roomSlug}
                onChange={(e) => setRoomSlug(e.target.value)}
                className="w-full rounded border border-slate-700 bg-black/60 p-2 text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                {ROOM_OPTIONS.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Item Label / Description
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Empty Popcorn Bucket"
                className="w-full rounded border border-slate-700 bg-black/60 p-2 text-slate-200 focus:border-orange-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Target Classification
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full rounded border border-slate-700 bg-black/60 p-2 text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                {TARGET_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.icon} {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Quick Placement Presets
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {BOX_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.box)}
                    className="rounded border border-slate-700/60 bg-black/40 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 hover:border-slate-500 text-left"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>
                <label className="block text-[9px] text-slate-400">X Min (0.0 - 1.0)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={0.95}
                  value={xMin}
                  onChange={(e) => setXMin(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">X Max (0.0 - 1.0)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.05}
                  max={1.0}
                  value={xMax}
                  onChange={(e) => setXMax(parseFloat(e.target.value) || 1)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">Y Min (0.0 - 1.0)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={0.95}
                  value={yMin}
                  onChange={(e) => setYMin(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-400">Y Max (0.0 - 1.0)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.05}
                  max={1.0}
                  value={yMax}
                  onChange={(e) => setYMax(parseFloat(e.target.value) || 1)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">
                  Base XP Reward
                </label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={xpReward}
                  onChange={(e) => setXpReward(parseInt(e.target.value, 10) || 25)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">
                  Token Reward
                </label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={tokenReward}
                  onChange={(e) => setTokenReward(parseInt(e.target.value, 10) || 15)}
                  className="w-full rounded border border-slate-700 bg-black/60 p-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 p-2.5 font-bold uppercase tracking-wider text-white hover:from-orange-500 hover:to-amber-500 transition shadow-[0_0_15px_rgba(255,102,0,0.3)]"
            >
              <Crosshair className="h-4 w-4" />
              Deploy In-Room Target
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default TrashAdminPanel;
