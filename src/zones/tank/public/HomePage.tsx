"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Expand,
  Grid,
  Heart,
  Info,
  Maximize,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Signal,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";
import { PublicShell } from "./PublicShell";
import { SeasonPassOverlay, type SeasonPassVariant } from "./components/SeasonPassOverlay";
import { useTankRealtimeChat } from "./useTankRealtimeChat";
import { TankChatBody } from "./TankChatEmoji";

type FeedItem = {
  id: string;
  name: string;
  location: string;
  description: string;
  online: boolean;
  degraded: boolean;
  bitrateKbps: number;
  protocol: string;
  audioSourceName?: string;
  isDirectorProgram?: boolean;
};

function toFeed(camera: DiscoveredCamera): FeedItem {
  return {
    id: camera.id,
    name: camera.name,
    location: camera.reason,
    description: `${camera.protocol.toUpperCase()} · camera key ${camera.id}`,
    online: camera.presence === "online",
    degraded: camera.presence === "degraded",
    bitrateKbps: camera.bitrateKbps,
    protocol: camera.protocol,
    audioSourceName: camera.audioSourceName,
  };
}

export default function TankHomePage() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [activeFeedId, setActiveFeedId] = useState<string>("director-program");
  const [chatInput, setChatInput] = useState("");
  const [following, setFollowing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [showStats, setShowStats] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [liveEdgeSynced, setLiveEdgeSynced] = useState(true);
  const [seasonPassOpen, setSeasonPassOpen] = useState(false);
  const [seasonPassVariant, setSeasonPassVariant] = useState<SeasonPassVariant>("get");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("unavailable");
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) {
          setSnapshot(next);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const cameraFeeds = useMemo(
    () => (snapshot?.cameras ?? []).map(toFeed),
    [snapshot],
  );
  const anyOnline = cameraFeeds.some((feed) => feed.online || feed.degraded);

  const directorFeed: FeedItem = {
    id: "director-program",
    name: "Director Program",
    location: "Main program mix",
    description: anyOnline
      ? "Curated cut, live from connected house cameras."
      : "No house cameras are connected yet.",
    online: anyOnline,
    degraded: false,
    bitrateKbps: anyOnline ? 9850 : 0,
    protocol: "webrtc",
    audioSourceName: "House Master Audio",
    isDirectorProgram: true,
  };

  const feeds = [directorFeed, ...cameraFeeds];
  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? feeds[0];
  const activeIsLive = activeFeed.isDirectorProgram
    ? anyOnline
    : activeFeed.online || activeFeed.degraded;

  const { messages, sending, error: chatError, postMessage } =
    useTankRealtimeChat("global");

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || sending) return;
    const ok = await postMessage(chatInput);
    if (ok) setChatInput("");
  };

  const handleSyncLiveEdge = () => {
    setLiveEdgeSynced(false);
    setTimeout(() => setLiveEdgeSynced(true), 400);
  };

  return (
    <PublicShell>
      {/* Top Director Command Header */}
      <div className="border-b border-border/80 bg-card/60 px-4 py-3 backdrop-blur-md">
        <div className="container flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm ${anyOnline ? "bg-red-600" : "bg-slate-600"}`}
            >
              <span
                className={`h-2 w-2 rounded-full bg-white ${anyOnline ? "animate-pulse" : ""}`}
              />
              {anyOnline ? "Live 24/7 House" : "House offline"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                Active Feed:
              </span>
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                {activeFeed.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            {!activeFeed.isDirectorProgram && (
              <>
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-emerald-400" />
                  {activeIsLive ? `${activeFeed.bitrateKbps} Kbps` : "No signal"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Signal className="h-3.5 w-3.5 text-cyan-400" />
                  {activeFeed.protocol.toUpperCase()}
                </span>
              </>
            )}
            <button
              onClick={() => {
                setSeasonPassVariant("get");
                setSeasonPassOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#f26d4b] to-[#d64b27] hover:from-[#f57a5b] hover:to-[#e05430] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-sm active:scale-95 transition"
            >
              Get Season Pass
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                showStats
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-muted text-muted-foreground"
              }`}
            >
              <Info className="h-3.5 w-3.5" />
              Stats for Nerds
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold hover:bg-muted text-foreground"
            >
              <Shield className="h-3.5 w-3.5" />
              Backstage
            </Link>
          </div>
        </div>
      </div>

      {/* Main Director Command Center Layout */}
      <div
        className={`grid min-h-[calc(100vh-8.5rem)] transition-all ${
          theaterMode ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_380px]"
        }`}
      >
        {/* Center Main Screen & Surrounding Camera Grid */}
        <div className="flex flex-col min-w-0 p-4 lg:p-6 space-y-6">
          {/* Dominant Center Player Screen */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
            <section
              className={`relative aspect-video w-full overflow-hidden ${
                activeIsLive
                  ? "bg-gradient-to-br from-cyan-950/70 via-slate-900 to-slate-950"
                  : "bg-slate-950"
              }`}
              aria-label={`${activeFeed.name} main viewer display`}
            >
              {activeIsLive && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(6,182,212,.18),transparent_24%),radial-gradient(circle_at_72%_65%,rgba(59,130,246,.15),transparent_28%),linear-gradient(110deg,transparent_30%,rgba(255,255,255,.03)_50%,transparent_70%)]" />
              )}

              {/* Feed Header Badge */}
              <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-md ${
                    activeIsLive ? "bg-red-600" : "bg-slate-700"
                  }`}
                >
                  {activeIsLive && (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  )}
                  {activeIsLive ? "ON AIR" : "NO SIGNAL"}
                </span>

                <span className="rounded-md bg-black/75 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur-md border border-white/10">
                  {activeFeed.location}
                </span>

                {activeFeed.audioSourceName && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-md border border-emerald-500/20">
                    <Mic className="h-3 w-3" />
                    {activeFeed.audioSourceName}
                  </span>
                )}
              </div>

              {/* Center Feed Visual Presentation */}
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-2xl border border-white/15 bg-black/40 p-6 text-center text-white backdrop-blur-md max-w-sm shadow-xl">
                  {activeIsLive ? (
                    <div className="relative mx-auto w-12 h-12 flex items-center justify-center">
                      <Radio className="h-10 w-10 text-primary animate-pulse" />
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
                      </span>
                    </div>
                  ) : (
                    <CameraOff className="mx-auto h-10 w-10 opacity-60 text-slate-400" />
                  )}
                  <h2 className="mt-3 text-lg font-bold tracking-tight">{activeFeed.name}</h2>
                  <p className="mt-1 text-xs text-white/75 leading-relaxed">
                    {activeFeed.description}
                  </p>
                  {activeIsLive && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Ultra Low-Latency WebRTC Feed Active
                    </div>
                  )}
                </div>
              </div>

              {/* Stats for Nerds Diagnostic HUD */}
              {showStats && (
                <div className="absolute top-16 left-4 z-20 w-80 rounded-2xl border border-cyan-500/40 bg-black/85 p-4 text-xs text-white shadow-2xl backdrop-blur-md font-mono space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-sans">
                    <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      Stats for Nerds (Telemetry HUD)
                    </span>
                    <button
                      onClick={() => setShowStats(false)}
                      className="text-white/60 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                    <span className="text-white/60">Delivery:</span>
                    <span className="text-emerald-400 font-bold">WebRTC (WHEP)</span>
                    <span className="text-white/60">Bitrate:</span>
                    <span className="text-white font-bold">{activeFeed.bitrateKbps || 9850} Kbps</span>
                    <span className="text-white/60">Resolution:</span>
                    <span className="text-white">1080p @ 60fps</span>
                    <span className="text-white/60">Buffer Cache:</span>
                    <span className="text-cyan-300">RAM Ring (/dev/shm)</span>
                    <span className="text-white/60">Latency:</span>
                    <span className="text-emerald-300">~120 ms (Live Edge)</span>
                    <span className="text-white/60">Dropped Frames:</span>
                    <span className="text-emerald-400">0 (0.00%)</span>
                    <span className="text-white/60">Audio Source:</span>
                    <span className="text-white truncate">{activeFeed.audioSourceName || "Native Audio"}</span>
                  </div>
                </div>
              )}

              {/* Player Controls Bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-5 pb-4 pt-16 text-white z-10">
                {/* Play / Pause Toggle */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="hover:text-primary transition"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                {/* Volume & Mute Controls */}
                <div className="flex items-center gap-2 group">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                    className="hover:text-primary transition"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-5 w-5 text-red-400" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      setIsMuted(false);
                    }}
                    className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-primary group-hover:w-20 transition-all"
                  />
                </div>

                {/* Right Aligned Player Actions */}
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setShowStats(!showStats)}
                    aria-label="Toggle Stats"
                    className="hover:text-primary transition"
                    title="Stats for Nerds"
                  >
                    <Activity className={`h-5 w-5 ${showStats ? "text-primary" : ""}`} />
                  </button>

                  <button
                    onClick={() => setTheaterMode(!theaterMode)}
                    aria-label="Theater mode"
                    className="hover:text-primary transition"
                    title="Theater Mode"
                  >
                    <Expand className={`h-5 w-5 ${theaterMode ? "text-primary" : ""}`} />
                  </button>

                  <button
                    onClick={() => {
                      const video = document.querySelector("video");
                      if (video && typeof (video as any).webkitEnterFullscreen === "function") {
                        try {
                          (video as any).webkitEnterFullscreen();
                          return;
                        } catch {}
                      }

                      const el = document.fullscreenElement || (document as any).webkitFullscreenElement;
                      if (!el) {
                        const target = document.documentElement;
                        if (target.requestFullscreen) {
                          void target.requestFullscreen().then(() => {
                            try {
                              void (screen.orientation as any)?.lock?.("landscape").catch(() => {});
                            } catch {}
                          }).catch(() => {});
                        } else if ((target as any).webkitRequestFullscreen) {
                          void (target as any).webkitRequestFullscreen();
                        }
                      } else {
                        if (document.exitFullscreen) {
                          void document.exitFullscreen();
                        } else if ((document as any).webkitExitFullscreen) {
                          void (document as any).webkitExitFullscreen();
                        }
                        try {
                          void (screen.orientation as any)?.unlock?.();
                        } catch {}
                      }
                    }}
                    aria-label="Fullscreen"
                    className="hover:text-primary transition"
                    title="Fullscreen"
                  >
                    <Maximize className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Active Feed Info & Follow Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{activeFeed.name}</h2>
                  {activeIsLive && (
                    <CheckCircle2 className="h-4 w-4 fill-primary text-primary-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeFeed.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFollowing(!following)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${following ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}
              >
                <Heart className={`h-4 w-4 ${following ? "fill-current" : ""}`} />
                {following ? "Following" : "Follow Event"}
              </button>
            </div>
          </div>

          {/* Surrounding Camera Mosaic Bar — Click any to render in the Big Center Screen */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-[.14em] text-muted-foreground">
                  Select Camera Feed (Click to Switch Center Screen)
                </h3>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                {failed
                  ? "Directory reconnecting…"
                  : `${cameraFeeds.length} camera key${cameraFeeds.length === 1 ? "" : "s"} configured`}
              </span>
            </div>

            {cameraFeeds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
                <CameraOff className="mx-auto h-7 w-7 text-muted-foreground" />
                <h3 className="mt-3 font-bold">No house cameras are connected</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Provision a camera in the SRT receiver app — USB/ethernet SRT,
                  SRTLA, or mobile/IRL Pro — and it appears here automatically
                  as soon as it sends a valid signal.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {feeds.map((feed) => {
                  const isActive = activeFeed.id === feed.id;
                  const feedLive = feed.isDirectorProgram
                    ? anyOnline
                    : feed.online || feed.degraded;
                  return (
                    <button
                      key={feed.id}
                      onClick={() => setActiveFeedId(feed.id)}
                      className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                        isActive
                          ? "border-primary ring-4 ring-primary/25 shadow-lg scale-[1.02]"
                          : "border-border hover:border-primary/50 hover:shadow-md"
                      }`}
                    >
                      <div
                        className={`aspect-[16/9] w-full p-3 flex flex-col justify-between ${
                          feedLive
                            ? "bg-gradient-to-br from-cyan-500/35 via-blue-950/50 to-slate-950"
                            : "bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white ${
                              feed.isDirectorProgram ? "bg-cyan-600" : "bg-black/60"
                            }`}
                          >
                            {feed.isDirectorProgram ? "Program" : "Camera"}
                          </span>
                          {isActive && (
                            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                              ACTIVE IN CENTER
                            </span>
                          )}
                        </div>
                        <div className="text-white">
                          <p className="text-xs font-bold truncate">{feed.name}</p>
                          <p className="text-[10px] opacity-75 truncate">
                            {feedLive ? feed.location : "No signal"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-card p-3.5 text-xs">
                        <span className="font-semibold text-muted-foreground truncate">
                          {feedLive ? `${feed.bitrateKbps} kbps` : "Offline"}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            feed.online
                              ? "bg-emerald-500 animate-pulse"
                              : feed.degraded
                                ? "bg-amber-500"
                                : "bg-slate-600"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Embedded Live Chat */}
        {!theaterMode && (
          <aside className="flex min-h-[560px] flex-col border-l border-border bg-card/55 xl:sticky xl:top-16 xl:h-[calc(100vh-8.5rem)]">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="font-bold">Live Room Chat</h2>
              </div>
              <button aria-label="Chat options">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No messages yet — be the first.
                </p>
              )}
              {messages.map((message) => {
                const isSystemMsg = message.messageType === "system" || message.user === "SYSTEM";
                const isHouseEvent =
                  message.messageType === "house_event" ||
                  message.messageType === "trivia" ||
                  message.messageType === "scavenger" ||
                  message.user === "HOUSE EVENT" ||
                  message.body.includes("[HOUSE EVENT]");
                const isLevelUp = message.messageType === "level_up" || message.body.includes("[LEVEL UP]");

                if (isSystemMsg) {
                  return (
                    <div key={message.id} className="my-2 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-black/85 to-cyan-950/40 p-3 text-xs shadow-[0_0_15px_rgba(6,182,212,0.12)] animate-in fade-in duration-200">
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-cyan-500/20">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-cyan-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                          <span>📟 [SYSTEM CONSOLE]</span>
                        </div>
                        {message.time && (
                          <span className="text-[10px] text-cyan-400/50 font-mono">
                            {message.time}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-100 font-medium leading-relaxed break-words">
                        <TankChatBody text={message.body} />
                      </div>
                    </div>
                  );
                }

                if (isHouseEvent) {
                  const isTrivia = message.messageType === "trivia" || message.body.includes("TRIVIA");
                  const badgeText = isTrivia ? "📟 [HOUSE TRIVIA]" : "⚡ [HOUSE EVENT]";

                  return (
                    <div key={message.id} className="my-2 rounded-xl border border-white/10 bg-[#13161c]/90 p-3 text-xs shadow-sm text-left animate-in fade-in duration-150">
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-white/10">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-300 uppercase tracking-widest text-[10px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-ping" />
                          <span>{badgeText}</span>
                        </div>
                        {message.time && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {message.time}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-200 font-normal leading-relaxed whitespace-pre-wrap">
                        <TankChatBody text={message.body.replace(/^🧠\s*\[HOUSE TRIVIA\]\s*/i, "").replace(/^⚡\s*\[HOUSE EVENT\]\s*/i, "")} />
                      </div>
                    </div>
                  );
                }

                if (isLevelUp) {
                  return (
                    <div key={message.id} className="my-2 rounded-xl border border-white/10 bg-[#14161a]/90 p-2.5 text-xs shadow-sm text-left animate-in fade-in duration-150">
                      <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-white/10">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-amber-300 uppercase tracking-widest text-[10px]">
                          <span>🎉</span> [LEVEL UP]
                        </div>
                        {message.time && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {message.time}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-200 font-medium leading-relaxed">
                        <TankChatBody text={message.body.replace(/^🎉\s*\[LEVEL UP\]\s*/i, "")} />
                      </div>
                    </div>
                  );
                }

                const level = message.level ?? 1;
                const rank = message.rank || (level >= 30 ? "Legend" : level >= 15 ? "VIP" : level >= 5 ? "Regular" : "Newbie");

                return (
                  <div key={message.id} className="group relative flex gap-2 rounded-xl border border-white/5 bg-black/40 p-2.5 text-xs transition hover:bg-black/60">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Level Badge */}
                        <span className="rounded bg-red-950/80 px-1 py-0.2 text-[9px] font-black text-red-400 border border-red-500/60">
                          Lvl {level}
                        </span>

                        {/* Rank Badge */}
                        {rank === "Legend" && (
                          <span className="rounded bg-amber-950/80 px-1.5 py-0.2 text-[9px] font-black uppercase text-amber-300 border border-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                            👑 Legend
                          </span>
                        )}
                        {rank === "VIP" && (
                          <span className="rounded bg-purple-950/80 px-1.5 py-0.2 text-[9px] font-black uppercase text-purple-300 border border-purple-500">
                            ⭐ VIP
                          </span>
                        )}
                        {rank === "Regular" && (
                          <span className="rounded bg-cyan-950/80 px-1.5 py-0.2 text-[9px] font-black uppercase text-cyan-400 border border-cyan-600">
                            ⚡ Regular
                          </span>
                        )}
                        {rank === "Newbie" && (
                          <span className="rounded bg-slate-800/80 px-1.5 py-0.2 text-[9px] font-black uppercase text-slate-300 border border-slate-700">
                            🌱 Newbie
                          </span>
                        )}

                        {/* Staff Roles */}
                        {message.role === "admin" && (
                          <span className="rounded bg-amber-500 px-1 py-0.2 text-[9px] font-black uppercase text-black">
                            ADMIN
                          </span>
                        )}
                        {message.role === "moderator" && (
                          <span className="rounded bg-emerald-500 px-1 py-0.2 text-[9px] font-black uppercase text-black">
                            MOD
                          </span>
                        )}

                        <strong className="font-bold text-white tracking-wide">{message.user}</strong>
                        <span className="text-[10px] text-muted-foreground ml-auto">{message.time}</span>
                      </div>
                      <div className="mt-1 text-slate-200 leading-relaxed break-words font-medium">
                        <TankChatBody text={message.body} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {chatError && (
              <div className="px-4 py-1.5 text-xs font-semibold text-red-500 bg-red-500/10">
                {chatError}
              </div>
            )}

            <form onSubmit={handleSendChat} className="border-t border-border p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{anyOnline ? "Live house stream" : "House is offline"}</span>
                <Users className="h-3.5 w-3.5" />
              </div>
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Send a message..."
                  disabled={sending}
                  className="focus:ring-primary/30 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !chatInput.trim()}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>

      {/* Season Pass Modal (Get vs Required Variants) */}
      <SeasonPassOverlay
        isOpen={seasonPassOpen}
        variant={seasonPassVariant}
        onClose={() => setSeasonPassOpen(false)}
      />
    </PublicShell>
  );
}
