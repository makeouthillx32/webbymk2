"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MonitorPlay, Sliders, Volume2 } from "lucide-react";
import type { DerivedRoom } from "../contracts";
import { buildDirectorBrowserSourceUrl } from "../obs/browserSourceUrl";
import { ChromePanel } from "../public/components/ChromePanel";

type HouseBroadcastSourcePanelProps = {
  rooms: DerivedRoom[];
};


export function HouseBroadcastSourcePanel({ rooms }: HouseBroadcastSourcePanelProps) {
  const [origin, setOrigin] = useState("https://tank.unenter.live");
  const [volume, setVolume] = useState(100);
  const [roomLock, setRoomLock] = useState("auto");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const generatedUrl = useMemo(
    () => buildDirectorBrowserSourceUrl(origin, { volume, roomLock }),
    [origin, roomLock, volume],
  );

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  };

  return (
    <ChromePanel withScrews>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/15 pb-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-orange-700/40 bg-black/85 text-orange-400 shadow-inner">
              <MonitorPlay className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-[#241f14]">
                Director Program Browser Source
              </h2>
              <p className="max-w-2xl text-[11px] font-semibold text-slate-600">
                This is the complete Tank Director picture for OBS. Change an option, copy the new URL,
                and paste it into one OBS Browser source. No stream keys or staff credentials are placed in the URL.
              </p>
            </div>
          </div>
          <span className="rounded border border-emerald-700/30 bg-emerald-950/90 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
            Render only
          </span>
        </div>

        <div className="rounded border border-black/25 bg-black/90 p-3 shadow-inner">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Generated OBS Browser Source URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={generatedUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/80 px-3 py-2 font-mono text-[11px] font-bold text-orange-300 outline-none"
            />
            <button
              type="button"
              onClick={copyUrl}
              className="flex items-center justify-center gap-1.5 rounded bg-orange-500 px-4 py-2 text-xs font-black uppercase text-black transition hover:bg-orange-400"
            >
              {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Select URL" : "Copy URL"}
            </button>
            <a
              href={generatedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded border border-white/15 bg-slate-800 px-3 py-2 text-xs font-black uppercase text-slate-200 transition hover:bg-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              Preview
            </a>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <label className="rounded border border-black/15 bg-white/45 p-3 lg:col-span-2">
            <span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-[#241f14]">
              <Sliders className="h-4 w-4 text-orange-700" />
              Camera selection
            </span>
            <select
              value={roomLock}
              onChange={(event) => setRoomLock(event.target.value)}
              className="w-full rounded border border-black/20 bg-white/80 px-2.5 py-2 text-xs font-bold text-[#241f14] outline-none"
            >
              <option value="auto">Director automation — follow live cuts</option>
              {rooms.map((room) => (
                <option key={room.roomKey} value={room.roomKey}>
                  Lock to {room.title}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded border border-black/15 bg-white/45 p-3">
            <span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-[#241f14]">
              <Volume2 className="h-4 w-4 text-orange-700" />
              Volume — {volume}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="w-full accent-orange-600"
            />
          </label>
        </div>

        {/* The five render switches that used to live here are gone on purpose.
            Each was a way for the one URL an operator pastes into OBS to come
            out wrong, and `audio` was the dangerous one: combined with the old
            standalone audio source it could put a different room's sound under
            the picture, or drift out of step with it. The source is one fixed
            thing now. */}
        <p className="rounded-lg border border-black/15 bg-white/50 p-3 text-[11px] font-semibold text-slate-700">
          Picture and sound only — always the room the Director is on, with the CRT
          cut built in because a transition has to fire with the swap.
          <span className="mt-1 block text-[10px] font-bold text-slate-600">
            No overlays are drawn on this source. Add the HUD, attention banner, VU
            meter and goal bar in OBS from the independent sources below, so you can
            position and toggle them per scene. Programme audio cannot be separated
            from the picture.
          </span>
        </p>

        <div className="rounded-lg border border-black/20 bg-white/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
              Independent Transparent Overlays (Modular OBS Sources)
            </span>
            <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-orange-800 border border-orange-500/30">
              Alpha / Transparent BG
            </span>
          </div>
          <p className="text-[10px] font-semibold text-slate-600">
            Before legacying the combined HUD, you can now add each element as an independent transparent browser source in OBS or the Director Studio Compositor.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { label: "CCTV HUD Overlay", path: "/obs/director/hud", desc: "REC badge, live timecode, camera name" },
              { label: "Attention Lock Banner", path: "/obs/director/attention", desc: "Active director lock & countdown" },
              { label: "Audio VU & Watermark", path: "/obs/director/vu", desc: "Live room dB meter & tank watermark" },
            ].map((item) => (
              <div key={item.path} className="rounded border border-black/15 bg-white/80 p-2.5 flex flex-col justify-between">
                <div>
                  <span className="block text-[11px] font-black uppercase text-[#241f14]">{item.label}</span>
                  <span className="block text-[9px] font-semibold text-slate-500 mt-0.5">{item.desc}</span>
                  <code className="block text-[9px] font-mono font-bold text-orange-700 bg-black/5 px-1.5 py-0.5 rounded mt-1.5 truncate">
                    {origin}{item.path}
                  </code>
                </div>
                <div className="mt-2 pt-1.5 border-t border-black/10 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${origin}${item.path}`);
                    }}
                    className="flex-1 rounded bg-black/10 hover:bg-black/20 px-2 py-1 text-[9px] font-black uppercase text-[#241f14] transition text-center"
                  >
                    Copy URL
                  </button>
                  <a
                    href={`${origin}${item.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-black/10 hover:bg-black/20 p-1 text-[#241f14] transition"
                    title="Open Preview"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-black/20 bg-white/60 p-3 text-[11px] font-semibold text-[#403a2d]">
          In OBS, add <strong>Browser</strong>, paste this URL, use <strong>1920 × 1080</strong>, and enable
          <strong> Control audio via OBS</strong>. Leave this source as the one program canvas; OBS then publishes
          that composed feed once to Tank for outbound fan-out.
        </div>
      </div>
    </ChromePanel>
  );
}
