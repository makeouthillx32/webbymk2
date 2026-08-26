"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  Crown,
  Sparkles,
  Swords,
  Plus,
  LogOut,
  CheckCircle2,
  X,
  ChevronRight,
  Info,
  Flame,
  Award,
  Zap,
  Target,
  Search,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import {
  getDetailedClansList,
  getCurrentUserClanState,
  createClanAction,
  joinClanWithSubclassAction,
  setMemberSubclassAction,
  leaveClan,
  type ClanFullDetails,
  type UserClanMembershipState,
} from "../../server/clanSystem";
import { RPG_PILLARS, RPG_SUBCLASSES, type RpgPillar, type RpgSubclass } from "../../clanData";

export type ClicksOverlayProps = {
  onClose: () => void;
  signedIn: boolean;
  currentUserLevel?: number;
  currentUserTokens?: number;
  onMembershipChanged?: (membership: {
    id: string;
    name: string;
    tag: string;
    bannerColor: string;
  } | null) => void;
};

export function ClicksOverlay({
  onClose,
  signedIn,
  currentUserLevel = 1,
  currentUserTokens = 0,
  onMembershipChanged,
}: ClicksOverlayProps) {
  const [tab, setTab] = useState<"my_clan" | "browse" | "create" | "season_pass">("browse");
  const [clans, setClans] = useState<ClanFullDetails[]>([]);
  const [userClan, setUserClan] = useState<UserClanMembershipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Selected subclass pillar filter
  const [selectedPillar, setSelectedPillar] = useState<RpgPillar | "all">("all");

  // Create form state
  const [nameInput, setNameInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [mottoInput, setMottoInput] = useState("");
  const [bannerColorInput, setBannerColorInput] = useState("#ff5a36");

  // Selected clan to view details in modal
  const [selectedClan, setSelectedClan] = useState<ClanFullDetails | null>(null);
  const [joinSubclass, setJoinSubclass] = useState<RpgSubclass>("juggernaut");

  const loadData = async () => {
    try {
      const [list, memberState] = await Promise.all([
        getDetailedClansList(),
        signedIn ? getCurrentUserClanState() : Promise.resolve(null),
      ]);
      setClans(list);
      setUserClan(memberState);
      onMembershipChanged?.(
        memberState?.clanId
          ? {
              id: memberState.clanId,
              name: memberState.clanName,
              tag: memberState.clanTag,
              bannerColor: memberState.bannerColor,
            }
          : null,
      );
      if (memberState && memberState.clanId) {
        setTab("my_clan");
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [signedIn]);

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    const res = await createClanAction({
      name: nameInput,
      tag: tagInput,
      motto: mottoInput,
      bannerColor: bannerColorInput,
    });

    if (res.success) {
      setFeedback({ type: "success", msg: `Click [${tagInput.toUpperCase()}] ${nameInput} founded successfully!` });
      await loadData();
      setTab("my_clan");
    } else {
      setFeedback({ type: "error", msg: res.error || "Failed to create Click." });
    }
    setBusy(false);
  };

  const handleJoinClan = async (clanId: string) => {
    setBusy(true);
    setFeedback(null);
    const res = await joinClanWithSubclassAction(clanId, joinSubclass);
    if (res.success) {
      setFeedback({ type: "success", msg: "Joined the Click successfully!" });
      await loadData();
      setTab("my_clan");
    } else {
      setFeedback({ type: "error", msg: res.error || "Failed to join Click." });
    }
    setBusy(false);
  };

  const handleLeaveClan = async () => {
    if (!confirm("Are you sure you want to leave your Click?")) return;
    setBusy(true);
    await leaveClan();
    await loadData();
    setTab("browse");
    setBusy(false);
  };

  const handleChangeSubclass = async (newSubclass: RpgSubclass) => {
    setBusy(true);
    await setMemberSubclassAction(newSubclass);
    await loadData();
    setBusy(false);
  };

  const isEligibleToCreate = userClan?.hasSeasonPass || currentUserLevel >= 4;

  const filteredSubclasses = (Object.keys(RPG_SUBCLASSES) as RpgSubclass[])
    .filter((k) => k !== "warlord")
    .filter((k) => selectedPillar === "all" || RPG_SUBCLASSES[k].pillar === selectedPillar);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Clicks & RPG System"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* Header Strip */}
          <div className="relative flex items-center justify-between border-b border-black/40 px-8 py-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded border border-orange-500/40 bg-orange-950/60 text-orange-400 shadow">
                <Swords className="h-4 w-4" />
              </div>
              <div>
                <h2
                  className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Clicks & Deep RPG Guilds
                </h2>
                <p className="text-[10px] text-slate-700 font-bold">
                  Member Guilds · Private Realtime Chat · 4 Pillars · 16 D&D Classes
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* Tab Navigation with ConsoleButtons */}
          <div className="flex gap-2 border-b border-black/30 px-8 pt-3 pb-2">
            {userClan && userClan.clanId ? (
              <ConsoleButton
                variant={tab === "my_clan" ? "orange" : "gray"}
                onClick={() => setTab("my_clan")}
                className="flex-1"
              >
                <Shield className="h-3.5 w-3.5" /> My Click [{userClan.clanTag}]
              </ConsoleButton>
            ) : null}

            <ConsoleButton
              variant={tab === "browse" ? "orange" : "gray"}
              onClick={() => setTab("browse")}
              className="flex-1"
            >
              <Users className="h-3.5 w-3.5" /> All Clicks ({clans.length})
            </ConsoleButton>

            <ConsoleButton
              variant={tab === "create" ? "orange" : "gray"}
              onClick={() => setTab("create")}
              className="flex-1"
            >
              <Plus className="h-3.5 w-3.5" /> Create Click
            </ConsoleButton>

            <ConsoleButton
              variant={tab === "season_pass" ? "orange" : "gray"}
              onClick={() => setTab("season_pass")}
              className="flex-1"
            >
              <Award className="h-3.5 w-3.5" /> Classes & Perks
            </ConsoleButton>
          </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-5 py-2.5 text-xs font-bold ${
              feedback.type === "success"
                ? "bg-emerald-950/80 text-emerald-200 border-b border-emerald-500/30"
                : "bg-red-950/80 text-red-200 border-b border-red-500/30"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <p className="py-12 text-center text-sm font-bold text-slate-400 animate-pulse">
              Loading Click rosters & chat permissions...
            </p>
          ) : null}

          {/* ═══════════ TAB 1: MY CLAN HUB ═══════════ */}
          {!loading && tab === "my_clan" && userClan && userClan.clanId && (
            <div className="space-y-6">
              {/* Clan Banner Card */}
              <div
                className="relative overflow-hidden rounded-2xl border border-white/20 p-6 shadow-2xl"
                style={{
                  background: `linear-gradient(135deg, ${userClan.bannerColor}44 0%, #16181b 100%)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-md bg-black/80 px-2 py-0.5 text-xs font-black uppercase text-orange-400 border border-orange-500/40">
                        [{userClan.clanTag}]
                      </span>
                      <h3 className="text-xl font-black uppercase text-white tracking-wide">
                        {userClan.clanName}
                      </h3>
                      {userClan.isLeader && (
                        <span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-black uppercase border border-amber-400/40 flex items-center gap-1">
                          <Crown className="h-3 w-3" /> Click Founder
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-300 font-medium">
                      Your Active RPG Subclass:{" "}
                      <strong className="text-white">
                        {RPG_SUBCLASSES[userClan.subclass]?.icon} {RPG_SUBCLASSES[userClan.subclass]?.name}
                      </strong>{" "}
                      ({RPG_SUBCLASSES[userClan.subclass]?.dndClass}) · {RPG_SUBCLASSES[userClan.subclass]?.perkDescription}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleLeaveClan}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-900/60 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Leave Click
                  </button>
                </div>
              </div>

              {/* Subclass Selector Grid with 4 Core Pillar Filter Tabs */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <span className="text-xs font-black uppercase text-orange-400 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" /> 16 D&D Specializations & Subclasses
                  </span>
                  {/* Pillar Filters */}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPillar("all")}
                      className={`px-2 py-1 rounded text-[10px] font-black uppercase transition ${
                        selectedPillar === "all" ? "bg-orange-600 text-white" : "bg-white/5 text-slate-400"
                      }`}
                    >
                      All
                    </button>
                    {(Object.keys(RPG_PILLARS) as RpgPillar[]).map((pil) => (
                      <button
                        key={pil}
                        type="button"
                        onClick={() => setSelectedPillar(pil)}
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase transition flex items-center gap-1 ${
                          selectedPillar === pil
                            ? "bg-white/20 text-white border border-white/30"
                            : "bg-white/5 text-slate-400"
                        }`}
                      >
                        <span>{RPG_PILLARS[pil].icon}</span>
                        <span>{RPG_PILLARS[pil].name.split(" ")[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {filteredSubclasses.map((subId) => {
                    const info = RPG_SUBCLASSES[subId];
                    const isSelected = userClan.subclass === subId;

                    return (
                      <button
                        key={subId}
                        type="button"
                        disabled={busy}
                        onClick={() => handleChangeSubclass(subId)}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? "border-orange-500 bg-orange-950/40 shadow-[0_0_12px_rgba(255,90,54,0.2)]"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xl">{info.icon}</span>
                          <span
                            className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded"
                            style={{ background: `${info.color}22`, color: info.color }}
                          >
                            {info.dndClass}
                          </span>
                        </div>
                        <span className="font-bold text-xs text-white mt-1">{info.name}</span>
                        <p className="text-[10px] text-slate-300 mt-0.5 leading-tight">
                          {info.perkDescription}
                        </p>
                        <span className="text-[9px] font-mono text-amber-400 mt-1.5 block">
                          ⚡ {info.specialAbility}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ TAB 2: BROWSE ALL CLANS ═══════════ */}
          {!loading && tab === "browse" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-black uppercase text-slate-400">
                  Active Tank Clicks ({clans.length})
                </span>
                <span className="text-xs text-slate-500">Unlimited member rosters · Click to inspect or enlist</span>
              </div>

              {clans.length === 0 ? (
                <div className="py-12 text-center">
                  <Swords className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-white">No Clicks Created Yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Be the first member to create a Click and open its private chat.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab("create")}
                    className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-orange-500"
                  >
                    Create the First Click
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {clans.map((clan) => {
                    const isMyClan = userClan?.clanId === clan.id;

                    return (
                      <div
                        key={clan.id}
                        className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-4 hover:border-white/25 transition shadow-lg"
                        style={{
                          borderLeftWidth: "4px",
                          borderLeftColor: clan.bannerColor,
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-black px-2 py-0.5 text-xs font-black uppercase text-orange-400 border border-orange-500/30">
                                [{clan.tag}]
                              </span>
                              <strong className="text-sm text-white font-bold">{clan.name}</strong>
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {clan.memberCount} member{clan.memberCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs italic text-slate-300">"{clan.motto}"</p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                            <span>Leader: <strong className="text-amber-400">{clan.leaderName}</strong></span>
                            <span>·</span>
                            <span>Total XP: <strong className="text-emerald-400">{clan.totalXp.toLocaleString()}</strong></span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                          {isMyClan ? (
                            <span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-1 text-[11px] font-bold border border-emerald-500/30">
                              ✓ Enlisted Member
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy || !signedIn}
                              onClick={() => setSelectedClan(clan)}
                              className="rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
                            >
                              Enlist / View Roster
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TAB 3: FOUND A CLAN ═══════════ */}
          {!loading && tab === "create" && (
            <div className="space-y-6 max-w-xl mx-auto py-2">
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-400" />
                  <h4 className="font-black text-sm text-amber-300 uppercase">
                    Click Founder Clearance
                  </h4>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Creating a Click opens a members-only realtime chat and your own RPG group identity. Creation requires an active{" "}
                  <strong className="text-amber-300">Season Pass</strong> OR reaching{" "}
                  <strong className="text-white">Iceberg Level 4+</strong> and 100 Tokens.
                </p>
                <div className="mt-2.5 flex items-center gap-3 text-xs font-bold">
                  <span className={userClan?.hasSeasonPass ? "text-emerald-400" : "text-slate-400"}>
                    {userClan?.hasSeasonPass ? "✓ Season Pass Holder" : "✕ No Season Pass"}
                  </span>
                  <span>·</span>
                  <span className={currentUserLevel >= 4 ? "text-emerald-400" : "text-slate-400"}>
                    Level: {currentUserLevel}/4
                  </span>
                  <span>·</span>
                  <span className={currentUserTokens >= 100 ? "text-emerald-400" : "text-slate-400"}>
                    Tokens: {currentUserTokens}/100
                  </span>
                </div>
              </div>

              <form onSubmit={handleCreateClan} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-300 mb-1">
                    Click Name
                  </label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Vampire Council, Kitten Syndicate"
                    className="w-full rounded-xl border border-white/20 bg-black/60 px-3.5 py-2.5 text-sm font-bold text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-300 mb-1">
                      Click Tag (2-5 Letters)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                      placeholder="e.g. VAMP, KIT, WOLF"
                      className="w-full rounded-xl border border-white/20 bg-black/60 px-3.5 py-2.5 text-sm font-black text-orange-400 uppercase tracking-widest focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-slate-300 mb-1">
                      Banner Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bannerColorInput}
                        onChange={(e) => setBannerColorInput(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-white/20 bg-transparent p-1"
                      />
                      <span className="font-mono text-xs font-bold text-slate-300">
                        {bannerColorInput}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-300 mb-1">
                    Click Motto / War Cry
                  </label>
                  <input
                    type="text"
                    value={mottoInput}
                    onChange={(e) => setMottoInput(e.target.value)}
                    placeholder="e.g. Blood, teeth, and tokens."
                    className="w-full rounded-xl border border-white/20 bg-black/60 px-3.5 py-2.5 text-sm font-medium text-slate-200 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !isEligibleToCreate}
                  className="w-full rounded-xl bg-orange-600 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-orange-500 disabled:opacity-40"
                >
                  {busy ? "Creating Click..." : "Create Click"}
                </button>
              </form>
            </div>
          )}

          {/* ═══════════ TAB 4: SEASON PASS PERKS ═══════════ */}
          {!loading && tab === "season_pass" && (
            <div className="space-y-6 max-w-xl mx-auto py-2">
              <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-yellow-950/20 to-black p-6 text-center shadow-2xl">
                <div className="inline-grid h-12 w-12 place-items-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/40 mb-3 shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black uppercase text-white tracking-wide">
                  TANK SEASON PASS
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
                  Stripe-backed VIP Season Pass unlocking Click creation, exclusive RPG subclass abilities, and custom chat insignias.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                  <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                    <span className="text-amber-400 font-bold text-xs block">👑 Click Founder</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Create and lead a Click with a custom tag, banner, and private chat.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                    <span className="text-amber-400 font-bold text-xs block">⚡ +20% Watch XP Boost</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Scale the iceberg curve faster with VIP multiplier.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                    <span className="text-amber-400 font-bold text-xs block">🏷️ Golden Chat Insignia</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Exclusive Season Pass badge rendered on all your messages.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                    <span className="text-amber-400 font-bold text-xs block">🎁 VIP Mystery Drops</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Bonus items in casino slots and crate drops.</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10">
                  <span className="text-xs text-slate-400 block mb-2">
                    Status: <strong className={userClan?.hasSeasonPass ? "text-emerald-400" : "text-amber-400"}>
                      {userClan?.hasSeasonPass ? "Active Season Pass VIP" : "Season Pass Available"}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Selected Clan Enlistment Modal */}
        {selectedClan && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-white/20 bg-[#191b20] p-5 shadow-2xl text-left">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-black px-2 py-0.5 text-xs font-black uppercase text-orange-400 border border-orange-500/30">
                    [{selectedClan.tag}]
                  </span>
                  <h4 className="font-black text-white text-base">{selectedClan.name}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedClan(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs italic text-slate-300 mt-2">"{selectedClan.motto}"</p>

              {/* Choose RPG Subclass on Enlist */}
              <div className="mt-4">
                <label className="block text-xs font-black uppercase text-slate-300 mb-1.5">
                  Select Your D&D RPG Subclass for this Click:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto custom-scrollbar">
                  {(Object.keys(RPG_SUBCLASSES) as RpgSubclass[])
                    .filter((k) => k !== "warlord")
                    .map((subId) => {
                      const info = RPG_SUBCLASSES[subId];
                      return (
                        <button
                          key={subId}
                          type="button"
                          onClick={() => setJoinSubclass(subId)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs ${
                            joinSubclass === subId
                              ? "border-orange-500 bg-orange-950/50 text-white font-bold"
                              : "border-white/10 bg-white/5 text-slate-300"
                          }`}
                        >
                          <span className="text-base">{info.icon}</span>
                          <div>
                            <p className="font-bold text-xs">{info.name}</p>
                            <p className="text-[9px] text-slate-400">{info.dndClass}</p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedClan(null)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleJoinClan(selectedClan.id);
                    setSelectedClan(null);
                  }}
                  className="rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-1.5 text-xs font-black uppercase text-white"
                >
                  Confirm Enlistment
                </button>
              </div>
            </div>
          </div>
        )}
        </ChromePanel>
      </div>
    </div>
  );
}
export default ClicksOverlay;
