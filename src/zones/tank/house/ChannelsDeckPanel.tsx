"use client";

import React from "react";
import { Radio, Users, Video, Globe, Eye, Sparkles } from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { channels } from "../fixtures";

export function ChannelsDeckPanel() {
  return (
    <div className="space-y-4">
      <ChromePanel
        withScrews
        className="shadow-2xl"
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded border border-sky-500/40 bg-sky-950/40 text-sky-400 shadow-inner">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-sm font-black uppercase tracking-wider text-white"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Channels & House Broadcast Nodes
              </h2>
              <p className="text-xs text-slate-400">
                Official show channels, creator identities, and multi-cam stream broadcasts.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="rounded border border-black/80 bg-[#16181d]/90 p-3.5 shadow-inner space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3
                    className="text-sm font-black uppercase text-white"
                    style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                  >
                    {channel.name}
                  </h3>
                  <p className="text-xs font-bold text-amber-400 font-mono">
                    {channel.handle}
                  </p>
                </div>
                <span
                  className={`rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                    channel.live
                      ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)] animate-pulse"
                      : "border-black/60 bg-black/60 text-slate-400"
                  }`}
                >
                  {channel.live ? "● LIVE" : "STANDBY"}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                {channel.bio}
              </p>

              <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[10px] font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  <Video className="h-3 w-3 text-sky-400" />
                  {channel.cameraIds.length} Camera Feed{channel.cameraIds.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1 text-slate-300">
                  <Users className="h-3 w-3 text-amber-400" />
                  {channel.followers.toLocaleString()} Followers
                </span>
              </div>
            </div>
          ))}
        </div>
      </ChromePanel>
    </div>
  );
}
