// src/zones/tank/public/components/HouseRosterOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// House & Pets Enrolled Roster Overlay
//
// Displays full interactive profiles for the 4 House Pets (Buster, Kona, Mochi, Shadow)
// and the 3 House Residents (Tyler, Joe, Malia) with live stats, favorites, and
// the interactive 'Give Pat' (+5 XP) mechanic.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import React, { useState } from "react";
import { X, Heart, Sparkles, User, MapPin, Bone, Star, Smile, Shield } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import { DEFAULT_HOUSE_ANIMALS, type HouseAnimal } from "../../server/houseAnimals";
import { DEFAULT_HOUSE_MEMBERS, type HouseMember } from "../../server/houseMembers";

type HouseRosterOverlayProps = {
  onClose: () => void;
  onAwardXp?: (amount: number, reason: string) => void;
};

export function HouseRosterOverlay({ onClose, onAwardXp }: HouseRosterOverlayProps) {
  const [activeTab, setActiveTab] = useState<"pets" | "residents">("pets");
  const [selectedPet, setSelectedPet] = useState<HouseAnimal>(DEFAULT_HOUSE_ANIMALS[0]);
  const [selectedResident, setSelectedResident] = useState<HouseMember>(DEFAULT_HOUSE_MEMBERS[0]);
  const [petPats, setPetPats] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    DEFAULT_HOUSE_ANIMALS.forEach((a) => {
      map[a.id] = a.patsCount;
    });
    return map;
  });
  const [patFeedback, setPatFeedback] = useState<string | null>(null);

  const handlePatPet = (pet: HouseAnimal) => {
    setPetPats((prev) => ({
      ...prev,
      [pet.id]: (prev[pet.id] || pet.patsCount) + 1,
    }));
    setPatFeedback(`+5 XP! You gave ${pet.displayName} a warm pat! ${pet.icon}`);
    onAwardXp?.(5, `Gave ${pet.displayName} a pat`);

    setTimeout(() => {
      setPatFeedback(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <ChromePanel
        className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-white/20 bg-slate-950/95 text-white"
        aria-label="House Roster & Pets"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md text-xl">
              🐾
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
                House Roster & Enrolled Pets
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Live residents, companions & pet profiles
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close roster"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 bg-slate-900/40 px-5 pt-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("pets")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === "pets"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🐾 House Pets</span>
            <span className="rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-mono font-bold">
              {DEFAULT_HOUSE_ANIMALS.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("residents")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === "residents"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>👤 House Residents</span>
            <span className="rounded-full bg-cyan-500/20 text-cyan-300 px-2 py-0.5 text-[10px] font-mono font-bold">
              {DEFAULT_HOUSE_MEMBERS.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {activeTab === "pets" ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Pet List (Left Column) */}
              <div className="md:col-span-5 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Select Animal Companion
                </p>
                {DEFAULT_HOUSE_ANIMALS.map((pet) => {
                  const isSelected = selectedPet.id === pet.id;
                  const currentCount = petPats[pet.id] || pet.patsCount;
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => setSelectedPet(pet)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-amber-500/80 bg-amber-950/40 shadow-lg shadow-amber-950/50 ring-1 ring-amber-500/50"
                          : "border-white/10 bg-slate-900/40 hover:bg-slate-800/60 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-2xl h-10 w-10 flex items-center justify-center rounded-lg bg-black/30 border border-white/10">
                          {pet.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-sm text-white">{pet.displayName}</span>
                            <span className="text-[10px] font-mono uppercase text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-500/30">
                              {pet.species}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">{pet.breed}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-mono text-slate-400 flex items-center justify-end gap-1">
                          <Heart className="h-3 w-3 text-rose-400 fill-rose-400" />
                          <span>{currentCount}</span>
                        </div>
                        <span className="text-[9px] font-mono text-emerald-400 capitalize">
                          {pet.favoriteRoom}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pet Detail Card (Right Column) */}
              <div className="md:col-span-7 flex flex-col justify-between p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-slate-900/80 backdrop-blur-sm space-y-4">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="text-4xl h-16 w-16 flex items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-inner">
                        {selectedPet.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-white">{selectedPet.displayName}</h3>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {selectedPet.badge}
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/80 font-medium">{selectedPet.role}</p>
                        <p className="text-xs text-slate-400">{selectedPet.breed} · {selectedPet.age}</p>
                      </div>
                    </div>

                    <div className="text-right bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10">
                      <span className="text-[10px] font-mono text-slate-400 block">TOTAL PATS</span>
                      <span className="text-sm font-black font-mono text-amber-400 flex items-center justify-end gap-1">
                        <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400 animate-pulse" />
                        {petPats[selectedPet.id] || selectedPet.patsCount}
                      </span>
                    </div>
                  </div>

                  {/* Bio */}
                  <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5">
                    "{selectedPet.bio}"
                  </p>

                  {/* Traits & Personality */}
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                      Personality & Habits
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPet.personality.map((trait, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 font-medium"
                        >
                          ✨ {trait}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Favorites Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Favorite Hangout</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 capitalize flex items-center justify-center gap-1">
                        <MapPin className="h-3 w-3 text-amber-400" />
                        {selectedPet.favoriteRoom.replace("-", " ")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Favorite Snack</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 flex items-center justify-center gap-1">
                        <Bone className="h-3 w-3 text-orange-400" />
                        {selectedPet.favoriteSnack}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Favorite Toy</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 flex items-center justify-center gap-1">
                        <Star className="h-3 w-3 text-yellow-400" />
                        {selectedPet.favoriteToy}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interaction Button */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  {patFeedback ? (
                    <span className="text-xs font-mono text-emerald-400 font-bold animate-bounce">
                      {patFeedback}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-mono">
                      Tap to interact and earn +5 XP
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePatPet(selectedPet)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
                  >
                    <Heart className="h-4 w-4 fill-white" />
                    <span>Pet {selectedPet.displayName} (+5 XP)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Residents Tab */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-5 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Enrolled House Residents
                </p>
                {DEFAULT_HOUSE_MEMBERS.map((resident) => {
                  const isSelected = selectedResident.id === resident.id;
                  return (
                    <button
                      key={resident.id}
                      type="button"
                      onClick={() => setSelectedResident(resident)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-cyan-500/80 bg-cyan-950/40 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-500/50"
                          : "border-white/10 bg-slate-900/40 hover:bg-slate-800/60 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xl h-10 w-10 flex items-center justify-center rounded-lg bg-black/30 border border-white/10">
                          {resident.icon || "👤"}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-sm text-white">{resident.displayName}</span>
                            <span className="text-[10px] font-mono uppercase text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                              {resident.badge || "MEMBER"}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">{resident.role}</span>
                        </div>
                      </div>

                      <span className="text-[9px] font-mono text-emerald-400 capitalize">
                        {resident.favoriteRoom}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Resident Detail Card */}
              <div className="md:col-span-7 flex flex-col justify-between p-5 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 to-slate-900/80 backdrop-blur-sm space-y-4">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="text-3xl h-16 w-16 flex items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-inner">
                        {selectedResident.icon || "👤"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-white">{selectedResident.displayName}</h3>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            {selectedResident.badge}
                          </span>
                        </div>
                        <p className="text-xs text-cyan-200/80 font-medium">{selectedResident.role}</p>
                        <p className="text-xs text-slate-400 font-mono">Detector ID: @{selectedResident.detectorLabel}</p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                    {selectedResident.bio}
                  </p>

                  <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">PRIMARY ROOM</span>
                    <span className="text-xs font-bold text-cyan-300 capitalize flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                      {selectedResident.favoriteRoom?.replace("-", " ")}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Shield className="h-3.5 w-3.5" /> Verified House Resident
                  </span>
                  <span>Vision Re-ID Active</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ChromePanel>
    </div>
  );
}
