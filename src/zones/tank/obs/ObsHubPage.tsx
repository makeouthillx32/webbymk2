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
  const [hud, setHud] = useState(true);
  const [attention, setAttention] = useState(true);
  const [vu, setVu] = useState(true);
  const [crt, setCrt] = useState(true);
  const [theme, setTheme] = useState("cctv");
  const [roomLock, setRoomLock] = useState<string>("auto");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("https://tank.unenter.live");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const generatedUrl = `${origin}/obs/director?audio=${audio ? 1 : 0}&volume=${volume}&hud=${
    hud ? 1 : 0
  }&attention=${attention ? 1 : 0}&vu=${vu ? 1 : 0}&crt=${crt ? 1 : 0}&theme=${theme}${
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
                Stream & Overlay Parameters
              </h2>
              <p className="text-xs text-[#555]">
                Configure audio, volume, CCTV timecodes, and transition preferences for your OBS scene.
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

              {/* CCTV HUD */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#241f14]">Broadcast CCTV HUD</p>
                  <p className="text-[10px] text-slate-600">
                    REC badge, room title & timecode overlay
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={hud}
                  onChange={(e) => setHud(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
              </div>

              {/* Attention Lock Banner */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#241f14]">
                    Director Attention Banner
                  </p>
                  <p className="text-[10px] text-slate-600">
                    Show countdown when room attention is locked
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={attention}
                  onChange={(e) => setAttention(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
              </div>

              {/* Sound VU Meter */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#241f14]">Live Decibel VU Meter</p>
                  <p className="text-[10px] text-slate-600">
                    Show microphone energy level on stream
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={vu}
                  onChange={(e) => setVu(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
              </div>

              {/* CRT Glitch Transition */}
              <div className="flex items-center justify-between rounded border border-black/15 bg-white/40 p-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#241f14]">
                    CRT CCTV Cut Glitch
                  </p>
                  <p className="text-[10px] text-slate-600">
                    Scanline & glitch flash when switching
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={crt}
                  onChange={(e) => setCrt(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
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
      </div>
    </main>
  );
}
export default ObsHubPage;
