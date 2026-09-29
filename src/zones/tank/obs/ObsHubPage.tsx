"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Tv,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  Activity,
  Target,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";

export function ObsHubPage() {
  const [audio, setAudio] = useState(true);
  const [volume, setVolume] = useState(100);
  const [roomLock, setRoomLock] = useState<string>("auto");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("https://tank.unenter.live");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const generatedUrl = `${origin}/obs/director?audio=${audio ? 1 : 0}&volume=${volume}${
    roomLock !== "auto" ? `&lock=${roomLock}` : ""
  }`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <main className="min-h-screen min-h-[100dvh] bg-[#0d0e11] p-3 text-slate-200 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <header className="rounded-lg border border-[#2d3139] bg-gradient-to-r from-[#17191e] via-[#1b1e24] to-[#17191e] p-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded border border-orange-500/40 bg-orange-950/40 text-orange-400">
                <Tv className="h-5 w-5" />
              </div>
              <div>
                <h1
                  className="text-base font-black uppercase tracking-wider text-white md:text-xl"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  OBS STUDIO BROWSER SOURCE GENERATOR
                </h1>
                <p className="text-xs text-slate-400">
                  Embed live multi-camera Director feeds directly into OBS Studio / Streamlabs.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="rounded border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              Return to Broadcast
            </Link>
          </div>
        </header>

        {/* Configuration Matrix */}
        <ChromePanel withScrews>
          <div className="space-y-4">
            <div className="border-b border-black/15 pb-2">
              <h2 className="text-sm font-black uppercase tracking-wide text-[#241f14]">
                Director Program Feed (Clean Video & Audio)
              </h2>
              <p className="text-xs text-[#555]">
                Direct automated broadcast video and synchronized audio. No overlays are baked into this feed; add independent transparent overlays below.
              </p>
            </div>

            {/* URL Output Box */}
            <div className="rounded border border-black/20 bg-black/90 p-3 shadow-inner">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Generated OBS Browser Source URL:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedUrl}
                  className="flex-1 rounded bg-black/80 px-3 py-2 font-mono text-xs font-bold text-orange-400 border border-white/10 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 rounded px-4 py-2 text-xs font-black uppercase transition ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-orange-500 text-black hover:bg-orange-400"
                  }`}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy URL"}
                </button>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-8 w-8 place-items-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  title="Test in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Interactive Toggle Options */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Audio Toggle */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div className="flex items-center gap-2.5">
                  {audio ? (
                    <Volume2 className="h-5 w-5 text-orange-600" />
                  ) : (
                    <VolumeX className="h-5 w-5 text-slate-400" />
                  )}
                  <div>
                    <p className="text-xs font-black uppercase text-[#241f14]">OBS Stream Audio</p>
                    <p className="text-[10px] text-slate-600">
                      Auto-play audio feed in OBS mixer
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={audio}
                  onChange={(e) => setAudio(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
              </div>

              {/* Volume Slider */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div className="flex-1 pr-3">
                  <p className="text-xs font-black uppercase text-[#241f14]">
                    Master Volume ({volume}%)
                  </p>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full accent-orange-600"
                    disabled={!audio}
                  />
                </div>
              </div>
            </div>

            {/* Independent Transparent Overlays */}
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
                The director program feed is clean video and audio. Add each overlay element as an independent browser source in OBS so you can layer, resize, and toggle them per scene.
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
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick OBS Setup Instructions */}
            <div className="rounded border border-black/20 bg-white/60 p-3 text-xs text-[#241f14]">
              <p className="font-black uppercase tracking-wider mb-1">
                📋 OBS Studio Setup Steps:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] font-semibold text-[#444]">
                <li>In OBS Studio, click <strong>+ (Add Source)</strong> → <strong>Browser</strong>.</li>
                <li>Set Name: <strong>Tank Director</strong>.</li>
                <li>Paste the URL above into the <strong>URL</strong> field.</li>
                <li>Set <strong>Width: 1920</strong> and <strong>Height: 1080</strong>.</li>
                <li>Check <strong>Control audio via OBS</strong> (optional if you want to mix the audio track in OBS).</li>
                <li>Check <strong>Shutdown source when not visible</strong> and click <strong>OK</strong>.</li>
              </ol>
            </div>
          </div>
        </ChromePanel>

        <RoomOfflineSourcePanel origin={origin} />
      </div>
    </main>
  );
}

/**
 * Second browser source: the room-offline card.
 *
 * Kept as its own panel rather than more toggles on the director URL because
 * it is a different kind of source. The director source IS the scene; this one
 * sits on top of a scene and is invisible until something goes wrong, so it is
 * added once per room and then left alone.
 */
function RoomOfflineSourcePanel({ origin }: { origin: string }) {
  const [room, setRoom] = useState("game-room");
  const [on, setOn] = useState<"off" | "nosignal" | "both">("off");
  const [message, setMessage] = useState("ROOM OFFLINE");
  const [note, setNote] = useState("WE'LL BE RIGHT BACK");
  const [theme, setTheme] = useState<"cctv" | "clean">("cctv");
  const [copied, setCopied] = useState(false);

  const params = new URLSearchParams({ room, on, theme });
  if (message !== "ROOM OFFLINE") params.set("message", message);
  if (note !== "WE'LL BE RIGHT BACK") params.set("note", note);
  const url = `${origin}/obs/room-offline?${params.toString()}`;
  const previewUrl = `${url}&preview=1`;

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <ChromePanel withScrews>
      <div className="space-y-4">
        <div className="border-b border-black/15 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#241f14]">
            <Shield className="h-4 w-4" />
            Room Offline Overlay
          </h2>
          <p className="text-xs text-[#555]">
            Invisible while the room is live. Takes over the scene the moment the room is switched
            off in the staff console — no source toggling, no scene switching.
          </p>
        </div>

        <div className="rounded border border-black/20 bg-black/90 p-3 shadow-inner">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Generated OBS Browser Source URL:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="flex-1 select-all rounded border border-white/10 bg-black/80 px-3 py-2 font-mono text-xs font-bold text-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className={`flex items-center gap-1.5 rounded px-4 py-2 text-xs font-black uppercase transition ${
                copied ? "bg-emerald-600 text-white" : "bg-orange-500 text-black hover:bg-orange-400"
              }`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy URL"}
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="grid h-8 w-8 place-items-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Preview the card (forces it visible)"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-slate-500">
            The preview button adds <code className="text-slate-400">&amp;preview=1</code>, which
            forces the card on so you can position it in OBS without taking a real room down.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#241f14]">
              Room key
            </span>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value.trim().toLowerCase())}
              placeholder="game-room"
              className="w-full rounded border border-black/20 bg-white/70 px-3 py-2 font-mono text-xs font-bold text-[#241f14] focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-slate-600">
              Must match the room exactly: game-room, game-room-2, living-room, kitchen, foyer,
              makeup-room.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#241f14]">
              Show the card when
            </span>
            <select
              value={on}
              onChange={(e) => setOn(e.target.value as "off" | "nosignal" | "both")}
              className="w-full rounded border border-black/20 bg-white/70 px-3 py-2 text-xs font-bold text-[#241f14] focus:outline-none"
            >
              <option value="off">Room switched off by staff</option>
              <option value="nosignal">Camera has no feed</option>
              <option value="both">Either one</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#241f14]">
              Headline
            </span>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded border border-black/20 bg-white/70 px-3 py-2 text-xs font-bold text-[#241f14] focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#241f14]">
              Sub-line
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-black/20 bg-white/70 px-3 py-2 text-xs font-bold text-[#241f14] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
          <div>
            <p className="text-xs font-black uppercase text-[#241f14]">CCTV treatment</p>
            <p className="text-[10px] text-slate-600">
              Scanlines, chromatic split and noise. Turn off for a flat card.
            </p>
          </div>
          <input
            type="checkbox"
            checked={theme === "cctv"}
            onChange={(e) => setTheme(e.target.checked ? "cctv" : "clean")}
            className="h-4 w-4 accent-orange-600"
          />
        </div>

        <div className="rounded border border-black/20 bg-white/60 p-3 text-xs text-[#241f14]">
          <p className="mb-1 font-black uppercase tracking-wider">📋 How to use it:</p>
          <ol className="list-inside list-decimal space-y-1 text-[11px] font-semibold text-[#444]">
            <li>Add a <strong>Browser</strong> source to the room&apos;s scene, above the camera.</li>
            <li>Paste the URL, set <strong>1920 x 1080</strong>.</li>
            <li>
              Leave <strong>Shutdown source when not visible</strong> UNCHECKED — the overlay has to
              keep polling to notice the room going down.
            </li>
            <li>Leave it in the scene permanently. It shows itself only when needed.</li>
          </ol>
          <p className="mt-2 text-[11px] font-semibold text-slate-600">
            If the status check fails, the overlay stays hidden rather than risk covering a live
            feed — so a network blip never blacks out the stream.
          </p>
        </div>
      </div>
    </ChromePanel>
  );
}
export default ObsHubPage;
