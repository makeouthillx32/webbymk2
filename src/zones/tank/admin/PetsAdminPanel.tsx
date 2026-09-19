// src/zones/tank/admin/PetsAdminPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Pets & Animals Admin Deck Panel
//
// Operational management panel for the 4 Enrolled House Animals (2 Dogs, 2 Cats).
// Displays live detector status, AI framing telemetry, favorite rooms,
// and quick actions for testing pet spot-focus and interactive pats.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import React, { useState } from "react";
import { Heart, Sparkles, MapPin, Bone, Star, Eye, Zap, ShieldCheck, UserCheck } from "lucide-react";
import { DEFAULT_HOUSE_ANIMALS, type HouseAnimal } from "../server/houseAnimals";
import { DEFAULT_HOUSE_MEMBERS, type HouseMember } from "../server/houseMembers";
import { applyDirectorItemOverride } from "../server/directorPolicyHierarchy";

export function PetsAdminPanel({
  onNavigateToEnrolment,
}: {
  onNavigateToEnrolment?: () => void;
} = {}) {
  const [pets, setPets] = useState<HouseAnimal[]>(DEFAULT_HOUSE_ANIMALS);
  const [selectedPet, setSelectedPet] = useState<HouseAnimal>(DEFAULT_HOUSE_ANIMALS[0]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleTriggerSpotlight = (pet: HouseAnimal) => {
    applyDirectorItemOverride({
      itemSlug: "pet-spotlight",
      itemName: `${pet.displayName} Spotlight`,
      targetMode: "animals",
      targetRoomKey: pet.favoriteRoom,
      triggeredBy: "Admin / Operator",
      durationSeconds: 45,
    });
    setActionFeedback(`⚡ Switched Director to ANIMALS MODE & spotlighted ${pet.displayName} in ${pet.favoriteRoom}!`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleIncrementPat = (petId: string) => {
    setPets((prev) =>
      prev.map((p) => (p.id === petId ? { ...p, patsCount: p.patsCount + 1 } : p))
    );
    if (selectedPet.id === petId) {
      setSelectedPet((prev) => ({ ...prev, patsCount: prev.patsCount + 1 }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-900/80 p-5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/40 text-2xl shadow-lg shadow-amber-500/10">
            🐾
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
              Enrolled House Pets & Animal Vision Matrix
            </h2>
            <p className="text-xs text-amber-200/80 font-mono">
              4 official house companions (2 Dogs, 2 Cats) · AI PTZ Vision Re-ID Active
            </p>
          </div>
        </div>

        {actionFeedback && (
          <div className="px-3.5 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-xs font-mono text-emerald-300 animate-pulse font-bold">
            {actionFeedback}
          </div>
        )}
      </div>

      {/* Grid: Left Column = Pets Roster (7 cols), Right Column = Enrolled Residents (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Pets Catalog */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
            <span>🐾 4 Enrolled House Pets</span>
            <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-300 border border-amber-500/30">
              AUTO-PTZ READY
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pets.map((pet) => {
              const isSelected = selectedPet.id === pet.id;
              return (
                <div
                  key={pet.id}
                  onClick={() => setSelectedPet(pet)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "border-amber-500 bg-amber-950/40 shadow-lg shadow-amber-950/50 ring-1 ring-amber-500/60"
                      : "border-white/10 bg-slate-900/60 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-3xl">{pet.icon}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-white">{pet.displayName}</span>
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-black/40 text-amber-300 border border-amber-500/30">
                            {pet.species}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 block">{pet.breed}</span>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {pet.badge}
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-slate-300 line-clamp-2 italic">
                    "{pet.bio}"
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400 capitalize flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-amber-400" />
                      {pet.favoriteRoom}
                    </span>
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <Heart className="h-3 w-3 fill-rose-400" />
                      {pet.patsCount} Pats
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerSpotlight(pet);
                      }}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-500 transition-colors flex items-center justify-center gap-1"
                    >
                      <Zap className="h-3 w-3" />
                      Spotlight (45s)
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIncrementPat(pet.id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-black text-rose-300 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 transition-colors flex items-center gap-1"
                    >
                      <Heart className="h-3 w-3 fill-rose-400" />
                      +1 Pat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Enrolled Residents */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 font-mono flex items-center gap-2">
            <span>👤 3 Enrolled House Residents</span>
            <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] text-cyan-300 border border-cyan-500/30">
              IDENTITY REGISTRY
            </span>
          </h3>

          <div className="space-y-3">
            {DEFAULT_HOUSE_MEMBERS.map((member) => (
              <div
                key={member.id}
                className="p-4 rounded-xl border border-white/10 bg-slate-900/60 flex items-start justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl h-10 w-10 flex items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/30">
                    {member.icon || "👤"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white">{member.displayName}</span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                        {member.badge}
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200/70">{member.role}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                      YOLO ID: @{member.detectorLabel} · Room: {member.favoriteRoom}
                    </p>
                  </div>
                </div>

                <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-1" />
              </div>
            ))}
            {onNavigateToEnrolment && (
              <button
                type="button"
                onClick={onNavigateToEnrolment}
                className="w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 flex items-center justify-center gap-2 transition shadow-sm"
              >
                <UserCheck className="h-4 w-4 text-cyan-400" />
                <span>View Identity Registry</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
