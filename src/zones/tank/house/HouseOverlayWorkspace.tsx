"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DerivedRoom } from "../contracts";
import { ChromePanel } from "../public/components/ChromePanel";
import { HouseBroadcastSourcePanel } from "./HouseBroadcastSourcePanel";
import { HouseObsOverlaySourcePanel } from "./HouseObsOverlaySourcePanel";
import { OverlaysPanel } from "./OverlaysPanel";
import { DirectorOverlayWorkshopPanel } from "./DirectorOverlayWorkshopPanel";
import { getDirectorOverlay } from "./directorOverlayWorkshop";
import {
  HOUSE_OVERLAY_WORKSPACE,
  type HouseOverlayWorkspaceId,
} from "./overlayWorkspaceCatalog";

type Props = {
  rooms: DerivedRoom[];
  operatorRole: "admin" | "moderator";
};

export function HouseOverlayWorkspace({ rooms, operatorRole }: Props) {
  // The selected overlay lives in the URL for the same reason the deck does:
  // a reload used to bounce the operator back to the first card, and there was
  // no way to link someone straight to the overlay under discussion. It is
  // also what lets the OBS Studio deck send you here with one already open.
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("overlay");
  const [activeOverlay, setActiveOverlayState] = useState<HouseOverlayWorkspaceId>(() =>
    HOUSE_OVERLAY_WORKSPACE.some((entry) => entry.id === fromUrl)
      ? (fromUrl as HouseOverlayWorkspaceId)
      : "program",
  );

  const setActiveOverlay = (id: HouseOverlayWorkspaceId) => {
    setActiveOverlayState(id);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("overlay", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <ChromePanel withScrews>
        <div className="space-y-3">
          <div className="border-b border-black/15 pb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
              Staff broadcast toolkit
            </p>
            <h2 className="mt-1 text-base font-black uppercase tracking-wide text-[#241f14]">
              Overlay Workshop
            </h2>
            <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-relaxed text-slate-600">
              Each browser source has its own configuration surface and URL contract. Adding another
              overlay means registering one card and mounting its editor here—not expanding Director Studio.
            </p>
          </div>

          <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overlay source types">
            {HOUSE_OVERLAY_WORKSPACE.map((entry) => {
              const selected = entry.id === activeOverlay;
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveOverlay(entry.id)}
                  aria-pressed={selected}
                  className={`rounded border p-3 text-left transition active:scale-[0.99] ${
                    selected
                      ? "border-orange-600 bg-orange-950/90 text-white shadow-lg ring-2 ring-orange-500/30"
                      : "border-black/15 bg-white/50 text-[#241f14] hover:border-orange-600/40 hover:bg-white/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded ${selected ? "bg-orange-500 text-black" : "bg-black/10 text-orange-700"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                      entry.status === "ready"
                        ? "border-emerald-600/30 bg-emerald-500/15 text-emerald-600"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-600"
                    }`}>
                      {entry.status}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xs font-black uppercase">{entry.title}</h3>
                  <p className={`mt-1 text-[10px] leading-snug ${selected ? "text-slate-300" : "text-slate-600"}`}>
                    {entry.description}
                  </p>
                  <code className={`mt-2 block text-[9px] font-bold ${selected ? "text-orange-300" : "text-slate-500"}`}>
                    {entry.routeLabel}
                  </code>
                </button>
              );
            })}
          </nav>
        </div>
      </ChromePanel>

      {/* The five director overlays all share one editor, rendered from
          DIRECTOR_OVERLAY_WORKSHOP, so a sixth needs a catalogue entry and
          nothing else. */}
      {getDirectorOverlay(activeOverlay) ? (
        <DirectorOverlayWorkshopPanel
          rooms={rooms}
          overlayId={activeOverlay as Parameters<typeof DirectorOverlayWorkshopPanel>[0]["overlayId"]}
        />
      ) : null}

      {activeOverlay === "program" ? <HouseBroadcastSourcePanel rooms={rooms} /> : null}
      {activeOverlay === "chat" ? <HouseObsOverlaySourcePanel rooms={rooms} mode="chat" /> : null}
      {activeOverlay === "tts" ? <HouseObsOverlaySourcePanel rooms={rooms} mode="tts" /> : null}
      {activeOverlay === "triggered" ? <OverlaysPanel operatorRole={operatorRole} /> : null}
    </div>
  );
}
