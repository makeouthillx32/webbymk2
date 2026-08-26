"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Heart,
  Maximize,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Radio,
  Send,
  Settings,
  Share2,
  Signal,
  Users,
} from "lucide-react";
import type {
  CameraDirectorySnapshot,
  DiscoveredCamera,
  TankCamera,
  TankChannel,
  TankRoom,
} from "../contracts";
import { CameraDirectoryClient } from "./CameraDirectoryClient";
import { useTankRealtimeChat } from "./useTankRealtimeChat";
import { TankChatBody } from "./TankChatEmoji";

export function RoomExperience({
  room,
  channel,
  roomCameras,
}: {
  room: TankRoom;
  channel: TankChannel;
  roomCameras: TankCamera[];
}) {
  const [selectedId, setSelectedId] = useState(room.featuredCameraId);
  const [following, setFollowing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const isDirector = room.slug === "director";

  // Live overlay: the room/camera cards below are static identity only —
  // whether a camera is actually on air comes from the receiver-manager
  // snapshot, polled the same way the camera directory does.
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) setSnapshot(next);
      } catch {
        // keep the last known snapshot rather than flashing an error state
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const liveById = useMemo(() => {
    const map = new Map<string, DiscoveredCamera>();
    for (const camera of snapshot?.cameras ?? []) map.set(camera.id, camera);
    return map;
  }, [snapshot]);

  const isOnline = (id: string) => {
    const live = liveById.get(id);
    return live?.presence === "online" || live?.presence === "degraded";
  };

  const { messages, sending, error: chatError, postMessage } =
    useTankRealtimeChat(room.id);

  const selected = useMemo(
    () =>
      roomCameras.find((camera) => camera.id === selectedId) ?? roomCameras[0],
    [roomCameras, selectedId],
  );

  if (!selected) return null;

  const selectedOnline = isOnline(selected.id);
  const anyLive = roomCameras.some((camera) => isOnline(camera.id));
  const heroLive = isDirector ? anyLive : selectedOnline;

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || sending) return;
    const ok = await postMessage(chatInput);
    if (ok) setChatInput("");
  };

  return (
    <div className="grid min-h-[calc(100vh-4rem)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <section
          className={`relative aspect-video max-h-[74vh] w-full overflow-hidden ${
            heroLive
              ? "bg-gradient-to-br from-cyan-500/35 via-blue-950/60 to-slate-950"
              : "bg-slate-950"
          }`}
          aria-label={`${isDirector ? "Director program" : selected.name} video placeholder`}
        >
          {heroLive && (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(255,255,255,.2),transparent_16%),radial-gradient(circle_at_68%_55%,rgba(45,212,191,.22),transparent_18%),linear-gradient(110deg,transparent_30%,rgba(255,255,255,.05)_50%,transparent_70%)]" />
          )}
          <div className="absolute left-4 top-4 flex gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black uppercase tracking-wider text-white ${heroLive ? "bg-red-600" : "bg-slate-700"}`}
            >
              {heroLive && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              )}
              {heroLive ? "Live" : "No signal"}
            </span>
          </div>
          <div className="absolute inset-0 grid place-items-center">
            <div className="rounded-2xl border border-white/15 bg-black/25 p-5 text-center text-white backdrop-blur-sm">
              {heroLive ? (
                <Radio className="mx-auto h-8 w-8 opacity-85" />
              ) : (
                <CameraOff className="mx-auto h-8 w-8 opacity-60" />
              )}
              <p className="mt-2 text-sm font-bold">
                {isDirector
                  ? anyLive
                    ? "Director program output"
                    : "No connected cameras to cut to yet"
                  : selectedOnline
                    ? `${selected.name} — live`
                    : `${selected.name} — camera not connected`}
              </p>
              <p className="mt-1 text-xs text-white/65">
                {heroLive
                  ? "WebRTC low-latency stream player"
                  : "Provision this camera in the SRT app to bring it online"}
              </p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-4 pt-14 text-white">
            <button aria-label="Pause">
              <Pause className="h-5 w-5" />
            </button>
            <span className="text-xs font-semibold">
              {heroLive ? "LIVE" : "OFFLINE"}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-300">
              {heroLive && <Signal className="h-4 w-4" />}
            </span>
            <button aria-label="Settings">
              <Settings className="h-5 w-5" />
            </button>
            <button aria-label="Fullscreen">
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </section>

        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl p-4 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Link
                href={`/channels/${channel.slug}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"
              >
                <Radio className="h-6 w-6" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {room.title}
                  </h1>
                  <CheckCircle2 className="h-4 w-4 fill-primary text-primary-foreground" />
                </div>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {channel.name} · {channel.category}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {room.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setFollowing((value) => !value)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${following ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}
                >
                  <Heart
                    className={`h-4 w-4 ${following ? "fill-current" : ""}`}
                  />
                  {following ? "Following" : "Follow"}
                </button>
                <button
                  className="rounded-xl border border-border p-2.5 hover:bg-muted"
                  aria-label="Share"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <button
                  className="rounded-xl border border-border p-2.5 hover:bg-muted"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            {isDirector ? (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-[.14em] text-muted-foreground">
                      Individual camera feeds
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                      Director is the curated program feed. Every connected
                      house camera also gets its own room and chat.
                    </p>
                  </div>
                  <Link
                    href="/cameras"
                    className="shrink-0 text-sm font-bold text-primary hover:underline"
                  >
                    All cameras
                  </Link>
                </div>
                <CameraDirectoryClient compact />
              </div>
            ) : (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[.14em] text-muted-foreground">
                    Choose a camera
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {roomCameras.map((camera) => {
                    const online = isOnline(camera.id);
                    return (
                      <button
                        key={camera.id}
                        onClick={() => setSelectedId(camera.id)}
                        className={`overflow-hidden rounded-xl border text-left transition ${selected.id === camera.id ? "ring-primary/20 border-primary ring-2" : "hover:border-primary/40 border-border"}`}
                      >
                        <div
                          className={`aspect-[16/7] ${online ? "bg-gradient-to-br from-cyan-500/35 via-blue-950/50 to-slate-950" : "bg-slate-900"}`}
                        />
                        <div className="flex items-center justify-between bg-card p-3">
                          <span>
                            <strong className="block text-sm">
                              {camera.name}
                            </strong>
                            <span className="text-xs text-muted-foreground">
                              {online ? camera.location : "No signal"}
                            </span>
                          </span>
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-600"}`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="flex min-h-[560px] flex-col border-l border-border bg-card/55 xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)]">
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="font-bold">Live Chat</h2>
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
                <div key={message.id} className="my-2 rounded-xl border border-cyan-500/40 bg-cyan-950/30 p-2.5 text-xs shadow-md">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-cyan-400 mb-1">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>[SYSTEM CONSOLE]</span>
                  </div>
                  <div className="text-slate-200 font-medium leading-relaxed">
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
        <form onSubmit={handleSend} className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{heroLive ? "Live house chat" : "House is offline"}</span>
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
  );
}
