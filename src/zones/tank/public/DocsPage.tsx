"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  ExternalLink,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Menu,
  X,
  MessageSquare,
  Sparkles,
  Award,
  Zap,
  Gamepad2,
  Users,
  CheckCircle,
  HelpCircle,
} from "lucide-react";

type PageId =
  | "about"
  | "contestants"
  | "season-pass"
  | "tts-sfx"
  | "tanktoys"
  | "chat"
  | "xp"
  | "items"
  | "missions"
  | "clicks";

const PAGES: { id: PageId; label: string; group: string; icon?: string }[] = [
  { id: "about", label: "About", group: "Tank LIVE" },
  { id: "contestants", label: "House Members", group: "Tank LIVE" },
  { id: "season-pass", label: "Season Passes", group: "Website" },
  { id: "tts-sfx", label: "TTS & SFX", group: "Website" },
  { id: "tanktoys", label: "Tanktoys & Trinkets", group: "Website" },
  { id: "chat", label: "Chat", group: "Website" },
  { id: "xp", label: "XP & Streaks", group: "Features" },
  { id: "items", label: "Tankems & Crafting", group: "Features" },
  { id: "missions", label: "Chores & Quests", group: "Features" },
  { id: "clicks", label: "Clicks & Alliances", group: "Features" },
];

export function DocsPage() {
  const [activeTab, setActiveTab] = useState<PageId>("about");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "yes" | "no">>({});

  // Sync with window.location.hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (!hash) return;
      const found = PAGES.find((p) => p.id === hash);
      if (found) setActiveTab(found.id);
      else if (hash === "chores" || hash === "directives") setActiveTab("missions");
      else if (hash === "clicks" || hash === "cliques") setActiveTab("clicks");
      else if (hash === "trinkets" || hash === "tanktoys") setActiveTab("tanktoys");
      else if (hash === "tankems" || hash === "tankitems") setActiveTab("items");
      else if (hash === "house-members" || hash === "house_members") setActiveTab("contestants");
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleSelectTab = (tabId: PageId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFeedback = (val: "yes" | "no") => {
    setFeedbackGiven((prev) => ({ ...prev, [activeTab]: val }));
  };

  // Filtered navigation if search query is typed
  const filteredPages = PAGES.filter((p) =>
    p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.group.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0e090b] text-gray-300 font-sans selection:bg-[#f30e00] selection:text-white">
      {/* ═══════════ TOP NAVBAR ═══════════ */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0e090b]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-black tracking-wider text-white hover:opacity-80 transition-opacity"
            >
              <div className="h-7 w-7 rounded-lg bg-[#f30e00] flex items-center justify-center text-white font-black text-xs shadow-[0_0_12px_rgba(243,14,0,0.6)]">
                UNT
              </div>
              <span className="font-mono text-sm uppercase tracking-widest text-slate-200">
                Tank <span className="text-[#f30e00]">Docs</span>
              </span>
            </Link>
            <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-slate-400 border border-white/10">
              v2.0 Roadmap
            </span>
          </div>

          {/* Search bar & links */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-[#f30e00] focus:outline-none focus:ring-1 focus:ring-[#f30e00]"
              />
            </div>

            <Link
              href="/"
              className="hidden lg:inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            >
              Back to Live Stream <ExternalLink className="h-3 w-3" />
            </Link>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 lg:hidden hover:bg-white/10"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT LAYOUT ═══════════ */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 py-8">
          {/* ─── SIDEBAR NAVIGATION (Desktop) ─── */}
          <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-64 shrink-0 overflow-y-auto pr-4 lg:block">
            <div className="space-y-6">
              {/* Tank LIVE Group */}
              <div>
                <h5 className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tank LIVE
                </h5>
                <div className="space-y-1">
                  {PAGES.filter((p) => p.group === "Tank LIVE").map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelectTab(page.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                        activeTab === page.id
                          ? "bg-[#f30e00]/15 text-[#f30e00] font-bold border border-[#f30e00]/30 shadow-[0_0_12px_rgba(243,14,0,0.15)]"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      <span>{page.label}</span>
                      {activeTab === page.id && <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Website Group */}
              <div>
                <h5 className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Website
                </h5>
                <div className="space-y-1">
                  {PAGES.filter((p) => p.group === "Website").map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelectTab(page.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                        activeTab === page.id
                          ? "bg-[#f30e00]/15 text-[#f30e00] font-bold border border-[#f30e00]/30 shadow-[0_0_12px_rgba(243,14,0,0.15)]"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      <span>{page.label}</span>
                      {activeTab === page.id && <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Features Group */}
              <div>
                <h5 className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Features & Mechanics
                </h5>
                <div className="space-y-1">
                  {PAGES.filter((p) => p.group === "Features").map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelectTab(page.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                        activeTab === page.id
                          ? "bg-[#f30e00]/15 text-[#f30e00] font-bold border border-[#f30e00]/30 shadow-[0_0_12px_rgba(243,14,0,0.15)]"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      <span>{page.label}</span>
                      {activeTab === page.id && <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* ─── MOBILE DRAWER MENU ─── */}
          {mobileMenuOpen && (
            <div className="fixed inset-x-0 top-16 z-50 border-b border-white/10 bg-[#0e090b] p-4 lg:hidden">
              <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                {PAGES.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => handleSelectTab(page.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
                      activeTab === page.id
                        ? "bg-[#f30e00]/20 text-[#f30e00] font-bold border border-[#f30e00]/30"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>{page.label}</span>
                    <span className="text-[10px] uppercase font-mono text-slate-500">{page.group}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── DOCUMENT ARTICLE CONTENT ─── */}
          <main className="min-w-0 flex-1 max-w-4xl pb-16">
            {/* ═══════════ SECTION: ABOUT ═══════════ */}
            {activeTab === "about" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Tank LIVE
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    About Tank LIVE
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    The premise of the show is hanging out with the House Members living on 24/7 multi-cam
                    livestreams. Viewers interact directly with the house in real time through audio, chat, and
                    room automation.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-4">
                  <p className="leading-relaxed">
                    Viewers can interact with House Members through <strong>SFX (sound effects)</strong>,{" "}
                    <strong>TTS (text-to-speech)</strong>, and even physically affect conditions in the house
                    through <strong>Tanktoys</strong>. House members and guests deal with non-stop chat
                    interactions, room overrides, and live community chaos.
                  </p>

                  <div className="my-6 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl">
                    <iframe
                      src="https://www.youtube.com/embed/geUJ6Ikjh_0?si=FQjoNVaED_DgKb1v"
                      title="YouTube video player"
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>

                  <h3 className="text-xl font-bold text-white pt-4">Interactive Stream Features</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 not-prose my-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="font-bold text-white flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-400" /> Multi-Cam Real-Time Surveillance
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        High-framerate, sub-second latency video delivery across every room in the facility.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="font-bold text-white flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-cyan-400" /> 24/7 Realtime Live Chat
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Global chat, one chat per physical room, and private members-only Click chat. Director is a
                        program feed and uses Global instead of creating a fake room.
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: CONTESTANTS ═══════════ */}
            {activeTab === "contestants" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Cast & Lore
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    House Members & Couch Surfers
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    The residents and guests living inside the house under continuous 24/7 surveillance.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">House Members</h2>
                    <p className="leading-relaxed">
                      House Members are the permanent residents living inside the tank under 24/7 surveillance,
                      competing for survival, community approval, and seasonal dominance.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">Couch Surfers</h2>
                    <p className="leading-relaxed">
                      Couch Surfers are friends, guests, and online anomalies crashing at the house. Their goal is
                      to disrupt the daily routine, stir up chaos with the House Members, and keep chat entertained.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 not-prose">
                    <h3 className="text-lg font-bold text-white">Historical Seasons</h3>
                    <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                      <div>
                        <span className="font-bold text-[#f30e00]">Season 1:</span> April 18 - May 30, 2023. Eight
                        House Members competed in physical challenges, social strategy, and direct audience contact
                        via TTS/SFX. Finalists Josie and Letty took top honors.
                      </div>
                      <div>
                        <span className="font-bold text-[#f30e00]">Season 2:</span> December 18, 2023 - January 28,
                        2024. Featured Swamp Olympics and boxing matches, concluding with TJ and Shinji.
                      </div>
                      <div>
                        <span className="font-bold text-[#f30e00]">Season 3:</span> October 27 - December 7, 2024.
                        Larger facility and expanded cast, featuring Burt and Binx in the Las Vegas finale.
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: SEASON PASS ═══════════ */}
            {activeTab === "season-pass" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Subscriptions & Memberships
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Season Passes
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Become a full member of the community and enhance your viewing experience on tank.unenter.live.
                  </p>
                </header>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 not-prose my-6">
                  <div className="rounded-2xl border-2 border-slate-700 bg-slate-900/60 p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black text-white">Season Pass</h3>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-mono font-bold text-slate-300">
                          Standard
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                        Full chat access, bonus cameras, exclusive cliques, 600 $UNT tokens, and bonus item storage
                        space, and a 10% discount on TTS messages.
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-2xl font-black text-white font-mono">$60 <span className="text-xs text-slate-400 font-sans">/ 6 months</span></p>
                    </div>
                  </div>

                  <div className="rounded-2xl border-2 border-[#f30e00] bg-[#f30e00]/10 p-6 shadow-[0_0_24px_rgba(243,14,0,0.2)] flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black text-white">Season Pass XL</h3>
                        <span className="rounded-full bg-[#f30e00] px-3 py-1 text-xs font-mono font-bold text-white shadow">
                          VIP Tier
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                        For hardcore viewers: 2,200 $UNT tokens, TTS priority, rare Tankem generation, and +25%
                        extra XP multiplier on all activities.
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-2xl font-black text-white font-mono">$150 <span className="text-xs text-slate-400 font-sans">/ 6 months</span></p>
                    </div>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-4">
                  <h3 className="text-xl font-bold text-white">Billing & Supported Payment Methods</h3>
                  <p className="leading-relaxed">
                    We support seamless checkout via Credit Card (Stripe), Bank transfer (via Plaid with $5 credit
                    back), and Cash App Pay.
                  </p>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: TTS & SFX ═══════════ */}
            {activeTab === "tts-sfx" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    In-House Audio
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    TTS & SFX Playback
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Participate by sending text-to-speech messages and AI-generated sound effects played across
                    in-room speakers in real-time.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Text-To-Speech (TTS)</h2>
                    <p className="leading-relaxed">
                      Viewers can select specific rooms and voices (e.g. Brainrot, Badass Hero, Gnome, Grandpa,
                      Oldhead, Sexy Temptress, Alex B, Shouting Indian Woman, Rough Rider) to blast messages
                      directly to the residents.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">AI Sound Effects (SFX)</h2>
                    <p className="leading-relaxed">
                      Type any prompt describing a sound effect (e.g. <em>"creaking haunted door"</em> or{" "}
                      <em>"loud alarm siren"</em>) and the system generates and streams the audio buffer directly
                      into the chosen room within seconds.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: TANKTOYS & TRINKETS ═══════════ */}
            {activeTab === "tanktoys" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Interactions & Control
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Tanktoys, Trinkets & IRL Access
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Trigger room overrides, deploy chat war effects, and unlock in-person real-world experiences.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Tanktoys</h2>
                    <p className="leading-relaxed">
                      Spend tokens to physically affect conditions in the house: trigger strobe lights, activate
                      airhorns, drop care packages, or adjust room climates in real-time.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">Trinkets (Chat Warfare)</h2>
                    <p className="leading-relaxed">
                      Deploy combat items in chat against rival cliques: cast Text Shrink Rays, mute opposing
                      spokespersons, or drop Slime Bombs to temporarily slow enemy cooldowns.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">Big Tanktoys (IRL Experiences)</h2>
                    <p className="leading-relaxed">
                      High-tier real-world access packages: Book Tank B&B to crash at the house for a day, or Wine
                      and Dine a House Member of your choice.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: CHAT ═══════════ */}
            {activeTab === "chat" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Community Hub
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    24/7 Real-Time Live Chat
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Connect with fellow Tank fanatics, showcase medals, scheme with your clique, and track live house events.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <p className="leading-relaxed">
                    The live chat features sub-second WebSocket broadcasting, custom user color customization,
                    unlocked emoji reactions, rank badges, and dual console announcements.
                  </p>

                  <h3 className="text-xl font-bold text-white">Console Messages & Pinned Notices</h3>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs space-y-2 not-prose">
                    <div className="flex items-center gap-2 font-mono font-bold text-cyan-400">
                      <span>[SYSTEM CONSOLE]</span> <span>Scheduled maintenance & infrastructure notices</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono font-bold text-orange-400">
                      <span>🎃 [ADMIN ACTION]</span> <span>Minigame triggers, loot drops, and house events</span>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: XP & STREAKS ═══════════ */}
            {activeTab === "xp" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Progression
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    XP Progression & Daily Streaks
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Earn XP through watch time, chat activity, daily logins, and completing house quests.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Daily Streaks</h2>
                    <p className="leading-relaxed">
                      Claim bonus XP every 24 hours. Maintaining consecutive daily streaks multiplies your reward
                      output exponentially and unlocks exclusive medal badges.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">While You Were Gone (AFK Accrual)</h2>
                    <p className="leading-relaxed">
                      Random XP events and dividend distributions accumulate while you are offline, presented in a
                      summary modal upon your return.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: TANKEMS & CRAFTING ═══════════ */}
            {activeTab === "items" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Inventory & Synthesis
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Tankems, The Synthesizer & Crafting
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Collect, synthesize, and combine interactive items to trade or use during the live broadcast.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">The Synthesizer (Loot Generator)</h2>
                    <p className="leading-relaxed">
                      Every signed-in account can access and use its inventory. Generate random Tankems for 50 $UNT tokens;
                      Season Pass holders receive one free daily roll.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">Tankem Crafting & Alchemy</h2>
                    <p className="leading-relaxed">
                      Combine compatible items in your inventory to synthesize rare high-tier trinkets with enhanced
                      effects.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: CHORES & QUESTS ═══════════ */}
            {activeTab === "missions" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Daily Quests
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Chores & Directives
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Complete rotating daily directives to earn bonus tokens, XP, and unlock special achievements.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <p className="leading-relaxed">
                    Each day, viewers are assigned random Chores (e.g. <em>"Send 5 chat messages"</em>,{" "}
                    <em>"Watch 30 minutes of Director Mode"</em>, <em>"Cheer for your Click"</em>). Fulfilling them
                    rewards your account with instant token payouts and progression XP.
                  </p>
                </div>
              </article>
            )}

            {/* ═══════════ SECTION: CLICKS & ALLIANCES ═══════════ */}
            {activeTab === "clicks" && (
              <article className="space-y-8 animate-fadeIn">
                <header className="border-b border-white/10 pb-6">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f30e00]">
                    Factions & Groups
                  </span>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Clicks & Chat Alliances
                  </h1>
                  <p className="mt-3 text-base text-slate-400 leading-relaxed">
                    Find your circle, create a Click, and coordinate actions across the house and chat.
                  </p>
                </header>

                <div className="prose prose-invert max-w-none text-slate-300 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Creating & Joining Clicks</h2>
                    <p className="leading-relaxed">
                      Create or join faction circles to unlock private group channels, coordinate pooled token
                      actions, display your Click tag in public chat feeds, and enter a members-only realtime Click chat.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white">Click Invites</h2>
                    <p className="leading-relaxed">
                      When invited to join a faction, an alert badge appears in your user profile dropdown for instant acceptance.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ═══════════ FOOTER FEEDBACK TOOLBAR ═══════════ */}
            <div className="mt-16 border-t border-white/10 pt-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  <p className="text-xs text-slate-300">Was this section helpful?</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFeedback("yes")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      feedbackGiven[activeTab] === "yes"
                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> Yes
                  </button>
                  <button
                    onClick={() => handleFeedback("no")}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      feedbackGiven[activeTab] === "no"
                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> No
                  </button>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between text-xs text-slate-500 font-mono">
                <p>© {new Date().getFullYear()} tank.unenter.live • All rights reserved</p>
                <Link href="/" className="hover:text-white transition-colors">
                  Return to Live Console →
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default DocsPage;
