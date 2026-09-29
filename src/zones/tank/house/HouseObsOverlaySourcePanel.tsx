"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageSquareText, Volume2 } from "lucide-react";
import type { DerivedRoom } from "../contracts";
import { buildChatBrowserSourceUrl, buildTtsBrowserSourceUrl } from "../obs/browserSourceUrl";
import { ChromePanel } from "../public/components/ChromePanel";
import { HouseLiveChatConsole } from "./HouseLiveChatConsole";

type Props = {
  rooms: DerivedRoom[];
  mode?: "chat" | "tts" | "both";
};

function CopyableUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="rounded border border-black/25 bg-black/90 p-3">
      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded border border-white/10 bg-black/80 px-3 py-2 font-mono text-[10px] font-bold text-orange-300 outline-none" />
        <button type="button" onClick={copy} className="flex items-center justify-center gap-1.5 rounded bg-orange-500 px-3 py-2 text-xs font-black uppercase text-black hover:bg-orange-400">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded border border-white/15 bg-slate-800 px-3 py-2 text-xs font-black uppercase text-slate-200 hover:bg-slate-700">
          <ExternalLink className="h-4 w-4" /> Preview
        </a>
      </div>
    </div>
  );
}

export function HouseObsOverlaySourcePanel({ rooms, mode = "both" }: Props) {
  const [origin, setOrigin] = useState("https://tank.unenter.live");
  const [chatRoom, setChatRoom] = useState("global");
  const [chatEvents, setChatEvents] = useState(true);
  const [chatMessageCount, setChatMessageCount] = useState(4);
  const [chatLifetime, setChatLifetime] = useState(20);
  const [ttsScope, setTtsScope] = useState<"website" | "room" | "both">("website");
  const [ttsRoom, setTtsRoom] = useState("global");
  const [volume, setVolume] = useState(80);
  const [captions, setCaptions] = useState(true);
  useEffect(() => setOrigin(window.location.origin), []);

  const chatUrl = useMemo(() => buildChatBrowserSourceUrl(origin, {
    room: chatRoom, layout: "bottom-up", theme: "tank", limit: chatMessageCount, ttlSeconds: chatLifetime,
    avatars: true, badges: true, events: chatEvents, replies: true,
  }), [chatEvents, chatLifetime, chatMessageCount, chatRoom, origin]);
  const ttsUrl = useMemo(() => buildTtsBrowserSourceUrl(origin, {
    scope: ttsScope, room: ttsRoom, volume, voice: "default", showCard: true, captions,
  }), [captions, origin, ttsRoom, ttsScope, volume]);

  const roomOptions = [
    { roomKey: "global", title: "Global chat" },
    ...rooms.filter((room) => room.roomKey !== "director"),
  ];

  return (
    <ChromePanel withScrews>
      <div className="space-y-4">
        <div className="border-b border-black/15 pb-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-[#241f14]">
            {mode === "chat" ? "Tank Chat Browser Source" : mode === "tts" ? "TTS Browser Source" : "OBS Chat & TTS Browser Sources"}
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold text-slate-600">Configure this transparent overlay, copy its URL, and add it as a separate OBS Browser source. The URL can listen and render; it cannot authorize a user or trigger an item.</p>
        </div>
        <div className={`grid gap-4 ${mode === "both" ? "xl:grid-cols-2" : "grid-cols-1"}`}>
          {mode !== "tts" ? (
          <section className="space-y-3 rounded border border-black/20 bg-white/45 p-3">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-[#241f14]"><MessageSquareText className="h-4 w-4 text-orange-700" /> Tank chat overlay</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Room<select value={chatRoom} onChange={(event) => setChatRoom(event.target.value)} className="mt-1 w-full rounded border border-black/20 bg-white/90 px-2 py-2 text-xs normal-case">{roomOptions.map((room) => <option key={room.roomKey} value={room.roomKey}>{room.title}</option>)}</select></label>
              <label className="flex items-end gap-2 rounded border border-black/15 bg-white/60 p-2 text-[10px] font-black uppercase text-[#4c4630]"><input type="checkbox" checked={chatEvents} onChange={(event) => setChatEvents(event.target.checked)} className="h-4 w-4 accent-orange-600" /> Include House events</label>
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Messages on screen<select value={chatMessageCount} onChange={(event) => setChatMessageCount(Number(event.target.value))} className="mt-1 w-full rounded border border-black/20 bg-white/90 px-2 py-2 text-xs normal-case"><option value={2}>2 messages</option><option value={3}>3 messages</option><option value={4}>4 messages</option><option value={5}>5 messages</option><option value={6}>6 messages</option><option value={8}>8 messages</option><option value={10}>10 messages</option></select></label>
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Disappear after<select value={chatLifetime} onChange={(event) => setChatLifetime(Number(event.target.value))} className="mt-1 w-full rounded border border-black/20 bg-white/90 px-2 py-2 text-xs normal-case"><option value={8}>8 seconds</option><option value={12}>12 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>1 minute</option><option value={0}>Never</option></select></label>
            </div>
            <p className="text-[10px] font-semibold text-slate-600">New chats build into a rolling stack. The oldest message leaves when the stack reaches its limit, and each remaining message disappears after the selected time.</p>
            <CopyableUrl label="Chat browser source URL" url={chatUrl} />
            <div className="mt-4 pt-4 border-t border-black/15">
              <HouseLiveChatConsole
                rooms={rooms}
                operatorName="Staff"
                operatorRole="admin"
                initialRoom={chatRoom}
              />
            </div>
          </section>
          ) : null}
          {mode !== "chat" ? (
          <section className="space-y-3 rounded border border-black/20 bg-white/45 p-3">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-[#241f14]"><Volume2 className="h-4 w-4 text-orange-700" /> TTS overlay</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Listen to<select value={ttsScope} onChange={(event) => setTtsScope(event.target.value as typeof ttsScope)} className="mt-1 w-full rounded border border-black/20 bg-white/90 px-2 py-2 text-xs normal-case"><option value="website">Website-wide TTS</option><option value="room">One room</option><option value="both">Website + one room</option></select></label>
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Room<select disabled={ttsScope === "website"} value={ttsRoom} onChange={(event) => setTtsRoom(event.target.value)} className="mt-1 w-full rounded border border-black/20 bg-white/90 px-2 py-2 text-xs normal-case disabled:opacity-50">{roomOptions.map((room) => <option key={room.roomKey} value={room.roomKey}>{room.title}</option>)}</select></label>
              <label className="text-[10px] font-black uppercase text-[#4c4630]">Volume — {volume}%<input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="mt-2 w-full accent-orange-600" /></label>
              <label className="flex items-center gap-2 rounded border border-black/15 bg-white/60 p-2 text-[10px] font-black uppercase text-[#4c4630]"><input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)} className="h-4 w-4 accent-orange-600" /> Show caption card</label>
            </div>
            <CopyableUrl label="TTS browser source URL" url={ttsUrl} />
          </section>
          ) : null}
        </div>
        <p className="rounded border border-amber-700/25 bg-amber-50/70 p-3 text-[11px] font-semibold text-amber-950">
          OBS setup: use 1920 × 1080 and a transparent background.
          {mode !== "chat" ? <> Enable <strong>Control audio via OBS</strong> for TTS. The current fallback uses the browser voice only when a generated audio file is absent; Fish Speech should become the authoritative audio file before final launch.</> : null}
        </p>
      </div>
    </ChromePanel>
  );
}
