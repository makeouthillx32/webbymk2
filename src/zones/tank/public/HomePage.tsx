"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Grid,
  Heart,
  Maximize,
  MessageSquare,
  Pause,
  Radio,
  Send,
  Settings,
  Shield,
  Signal,
  Users,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";
import { PublicShell } from "./PublicShell";
import { useTankRealtimeChat } from "./useTankRealtimeChat";

type FeedItem = {
  id: string;
  name: string;
  location: string;
  description: string;
  online: boolean;
  degraded: boolean;
  bitrateKbps: number;
  protocol: string;
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
  };
}

export default function TankHomePage() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

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
    bitrateKbps: 0,
    protocol: "director",
    isDirectorProgram: true,
  };

  const feeds = [directorFeed, ...cameraFeeds];
  const [activeFeedId, setActiveFeedId] = useState<string>("director-program");
  const [chatInput, setChatInput] = useState("");
  const [following, setFollowing] = useState(false);

  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? feeds[0];
  const activeIsLive = activeFeed.isDirectorProgram
    ? anyOnline
    : activeFeed.online || activeFeed.degraded;

  const { messages, sending, error: chatError, postMessage } =
    useTankRealtimeChat("room-program");

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || sending) return;
    const ok = await postMessage(chatInput);
    if (ok) setChatInput("");
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
              {anyOnline ? "Live house" : "House offline"}
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
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold hover:bg-muted"
            >
              <Shield className="h-3.5 w-3.5" />
              Backstage
            </Link>
          </div>
        </div>
      </div>

      {/* Main Director Command Center: Dominant Big Screen Center + Multi-Cam Surrounding Mosaic + Live Chat */}
      <div className="grid min-h-[calc(100vh-8.5rem)] xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Center Main Screen & Surrounding Camera Grid */}
        <div className="flex flex-col min-w-0 p-4 lg:p-6 space-y-6">
          {/* Dominant Center Player Screen */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
            <section
              className={`relative aspect-video w-full overflow-hidden ${
                activeIsLive
                  ? "bg-gradient-to-br from-cyan-500/45 via-sky-900/40 to-slate-950"
                  : "bg-slate-950"
              }`}
              aria-label={`${activeFeed.name} main viewer display`}
            >
              {activeIsLive && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(255,255,255,.22),transparent_16%),radial-gradient(circle_at_68%_55%,rgba(45,212,191,.22),transparent_18%),linear-gradient(110deg,transparent_30%,rgba(255,255,255,.05)_50%,transparent_70%)]" />
              )}

              {/* Feed Header Badge */}
              <div className="absolute left-4 top-4 flex gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black uppercase tracking-wider text-white ${activeIsLive ? "bg-red-600" : "bg-slate-700"}`}
                >
                  {activeIsLive && (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  )}
                  {activeIsLive ? "ON AIR" : "NO SIGNAL"}
                </span>
                {!activeFeed.isDirectorProgram && (
                  <span className="rounded-md bg-black/65 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                    {activeFeed.location}
                  </span>
                )}
              </div>

              {/* Center Feed Title Overlay */}
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-2xl border border-white/15 bg-black/30 p-6 text-center text-white backdrop-blur-md max-w-sm">
                  {activeIsLive ? (
                    <Radio className="mx-auto h-10 w-10 opacity-90 text-primary animate-pulse" />
                  ) : (
                    <CameraOff className="mx-auto h-10 w-10 opacity-60" />
                  )}
                  <h2 className="mt-3 text-lg font-bold">{activeFeed.name}</h2>
                  <p className="mt-1 text-xs text-white/70">
                    {activeFeed.description}
                  </p>
                  {activeIsLive && (
                    <p className="mt-3 text-[11px] font-semibold text-emerald-300">
                      Signal active
                    </p>
                  )}
                </div>
              </div>

              {/* Player Controls Bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-5 pb-4 pt-16 text-white">
                <button aria-label="Pause">
                  <Pause className="h-5 w-5 hover:text-primary transition" />
                </button>
                <span
                  className={`text-xs font-bold tracking-wider ${activeIsLive ? "text-emerald-400" : "text-slate-400"}`}
                >
                  {activeIsLive ? "LIVE" : "OFFLINE"}
                </span>
                <button aria-label="Settings" className="ml-auto">
                  <Settings className="h-5 w-5 hover:text-primary transition" />
                </button>
                <button aria-label="Fullscreen">
                  <Maximize className="h-5 w-5 hover:text-primary transition" />
                </button>
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

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No messages yet — be the first.
              </p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="text-sm">
                <span className="mr-2 text-[11px] text-muted-foreground">
                  {message.time}
                </span>
                <strong
                  className={
                    message.role === "moderator" || message.role === "admin"
                      ? "text-primary"
                      : message.role === "member"
                        ? "text-cyan-500"
                        : ""
                  }
                >
                  {message.user}
                </strong>
                <span className="text-muted-foreground">: </span>
                <span className="leading-6">{message.body}</span>
              </div>
            ))}
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
      </div>
    </PublicShell>
  );
}
