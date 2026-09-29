// src/zones/tank/admin/ScavengerAdminPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scavenger Hunt House Console Admin Deck
//
// Allows house operators to monitor stagnant YOLO object detections, trigger
// manual surprise hunts, manage active quests, and inspect winners.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import React, { useState } from "react";
import {
  Target,
  Sparkles,
  Trophy,
  Clock,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { SCAVENGER_ITEM_CATALOG } from "../server/scavengerCatalog";
import {
  triggerScavengerHuntAction,
  getActiveScavengerQuestAction,
} from "../server/actions";
import type { ScavengerQuest } from "../server/scavengerHuntEngine";

export function ScavengerAdminPanel({
  activeQuest: initialQuest,
}: {
  activeQuest?: ScavengerQuest | null;
}) {
  const [quest, setQuest] = useState<ScavengerQuest | null>(initialQuest ?? null);
  const [selectedItem, setSelectedItem] = useState("cup");
  const [selectedRoom, setSelectedRoom] = useState("living-room");
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [triggering, setTriggering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleTriggerHunt = async () => {
    setTriggering(true);
    setStatusMessage(null);
    try {
      const newQuest = await triggerScavengerHuntAction({
        roomKey: selectedRoom,
        itemLabel: selectedItem,
        durationSeconds,
      });
      setQuest(newQuest);
      setStatusMessage(`✅ Launched [${newQuest.item.displayName}] Hunt in ${newQuest.roomTitle}!`);
    } catch (err: any) {
      setStatusMessage(`❌ Failed to trigger quest: ${err?.message || err}`);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-950 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-lg">
                🕵️
              </span>
              <h2 className="text-xl font-black tracking-tight text-white">
                YOLO Vision Scavenger Hunt Deck
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Transform everyday physical house clutter into live interactive spectator quests.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTriggerHunt}
            disabled={triggering}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500 bg-amber-500 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:bg-amber-400 transition active:scale-95 disabled:opacity-50"
          >
            <Play className="h-4 w-4 fill-current" />
            {triggering ? "Spawning..." : "Launch Surprise Hunt"}
          </button>
        </div>

        {statusMessage && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs font-bold text-amber-200">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Active Quest Monitor */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl backdrop-blur-md">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-400">
          <Clock className="h-4 w-4 text-amber-400" />
          Active Live Quest
        </h3>

        {quest && quest.state !== "EXPIRED" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{quest.item.icon || "🎯"}</span>
              <div>
                <div className="text-base font-black text-white">
                  {quest.item.displayName}
                </div>
                <div className="text-xs text-slate-300">
                  Target Room: <span className="font-bold text-amber-300">{quest.roomTitle}</span> · Bounding Box: [{quest.targetBox.nx}, {quest.targetBox.ny}]
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-black text-amber-300">
                  +{quest.item.rewardTokens} Tokens / +{quest.item.rewardXp} XP
                </div>
                <div className="text-xs text-slate-400">
                  Status: <span className="font-bold uppercase text-white">{quest.state}</span>
                </div>
              </div>

              {quest.claimedBy && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-200">
                  Solved by @{quest.claimedBy.userName}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-xs text-slate-500">
            No active quest running right now. Spawn one below or let the autonomous stagnancy engine trigger on its next cycle.
          </div>
        )}
      </div>

      {/* Manual Quest Creator Controls */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
            1. Select Target Item
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(SCAVENGER_ITEM_CATALOG).map(([key, def]) => {
              const isSelected = selectedItem === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedItem(key)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/20 text-white shadow"
                      : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  <span className="text-xl">{def.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-white">
                      {def.displayName}
                    </div>
                    <div className="text-[10px] text-amber-400">
                      +{def.rewardTokens} Tokens
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-950/60 p-6">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
              2. Target Room
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { key: "living-room", label: "🛋️ Living Room" },
                { key: "kitchen", label: "🍳 Kitchen" },
                { key: "game-room", label: "🎮 Game Room" },
                { key: "control-room", label: "⚡ Control Room" },
              ].map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSelectedRoom(r.key)}
                  className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                    selectedRoom === r.key
                      ? "border-amber-500 bg-amber-500/20 text-white shadow"
                      : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
              3. Quest Duration
            </h4>
            <div className="mt-2 flex gap-2">
              {[
                { sec: 30, label: "30 Seconds" },
                { sec: 60, label: "60 Seconds" },
                { sec: 120, label: "2 Minutes" },
              ].map((d) => (
                <button
                  key={d.sec}
                  type="button"
                  onClick={() => setDurationSeconds(d.sec)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                    durationSeconds === d.sec
                      ? "border-amber-500 bg-amber-500/20 text-white shadow"
                      : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
