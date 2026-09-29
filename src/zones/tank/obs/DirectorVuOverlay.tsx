"use client";

import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTankCameras } from "../public/useTankCameras";
import { useServerDirector } from "../director/useServerDirector";
import type { OverlayCamera } from "./overlayCamera";
import { useObsTransparentPage } from "./useObsTransparentPage";
import { useBuildReload } from "./useBuildReload";
import { resolveBoolean, resolveText } from "./overlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "./overlaySkin";
import { useOverlaySettings } from "./useOverlaySettings";
import { useOverlayFx } from "./useOverlayFx";

import { useLiveAudioMeter } from "./useLiveAudioMeter";

type Props = {
  camera?: OverlayCamera | null;
  standalone?: boolean;
  showVu?: boolean;
  showWatermark?: boolean;
};

export function DirectorVuOverlay({
  camera: propCamera,
  standalone = true,
  showVu: propShowVu,
  showWatermark: propShowWatermark,
}: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings(standalone ? "vu" : "director", true);
  const showVu =
    propShowVu ?? resolveBoolean("vu", searchParams, stored, true).value;
  const showWatermark =
    propShowWatermark ?? resolveBoolean("watermark", searchParams, stored, true).value;
  // A live chaos fx (inventory item) overrides the configured texture until
  // it expires; a texture pinned in the URL keeps its authority.
  const fx = useOverlayFx();
  const resolvedTexture = resolveText("texture", searchParams, stored, "clean");
  const skin = resolveOverlaySkin(
    fx && resolvedTexture.from !== "query" ? fx.texture : resolvedTexture.value,
  );

  const { snapshot } = useTankCameras();
  const cameras = useMemo(() => {
    const liveCameraIds = new Set((snapshot?.rooms ?? []).flatMap((room) => room.cameraIds));
    return (snapshot?.cameras ?? []).filter((cam) => liveCameraIds.has(cam.id));
  }, [snapshot]);

  const serverDirector = useServerDirector();

  // Dynamically resolve whichever camera/room is currently on air
  const activeCamera = useMemo<OverlayCamera | null>(() => {
    if (propCamera) return propCamera;
    const allCams = snapshot?.cameras ?? [];

    const paramCamera = searchParams.get("camera");
    const paramRoom = searchParams.get("room");
    if (paramCamera) {
      const match = allCams.find((c) => c.id === paramCamera || c.roomScope === paramCamera);
      if (match) return match;
    }
    if (paramRoom) {
      const match = allCams.find((c) => c.roomScope === paramRoom || c.id === paramRoom);
      if (match) return match;
    }

    if (serverDirector.activeCameraId) {
      const match = allCams.find(
        (c) => c.id === serverDirector.activeCameraId || c.roomScope === serverDirector.activeCameraId
      );
      if (match) return match;
    }
    if (serverDirector.activeRoomKey) {
      const match = allCams.find(
        (c) => c.roomScope === serverDirector.activeRoomKey || c.id === serverDirector.activeRoomKey
      );
      if (match) return match;
    }
    return cameras[0] ?? (allCams[0] ?? null);
  }, [propCamera, searchParams, serverDirector.activeCameraId, serverDirector.activeRoomKey, cameras, snapshot?.cameras]);

  // Real-time audio visualizer connected directly to the room on air's microphone/stream
  const { currentDb, energyPercent, isLiveAudio, isSpeaking } = useLiveAudioMeter(
    activeCamera,
    serverDirector.programAudio?.peak ?? null,
  );

  // One owner for the transparency trick; see useObsTransparentPage for why it
  // must never run when this overlay is composed inside another page.
  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  const content = (
    <div className="flex w-full items-end justify-between gap-3 select-none pointer-events-none">
      {/* Left: Audio VU Meter */}
      {showVu ? (
        <div className="flex items-center gap-2.5 px-3 py-2" style={skin.panel}>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isSpeaking
                  ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse"
                  : isLiveAudio
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                    : "bg-amber-400"
              }`}
              title={isLiveAudio ? "Live Stream Audio Connected" : "Connecting audio..."}
            />
            <span
              className="text-[12px] uppercase"
              style={{ fontFamily: TANK_OVERLAY_FONTS.label, color: skin.inkMuted, textShadow: skin.textShadow }}
            >
              MIC:
            </span>
          </div>
          <div
            className="h-2.5 w-28 sm:w-36 rounded-full overflow-hidden relative"
            style={{
              backgroundColor: skin.isLight ? "rgba(0,0,0,0.35)" : "#1e293b",
              border: `1px solid ${skin.isLight ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.1)"}`,
            }}
          >
            <div
              className={`h-full transition-all duration-75 ${
                (currentDb ?? -60) > -24
                  ? "bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500"
                  : (currentDb ?? -60) > -36
                  ? "bg-gradient-to-r from-emerald-400 to-yellow-400"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${energyPercent}%` }}
            />
          </div>
          <span
            className="text-[11px] min-w-[44px] text-right font-mono"
            style={{ fontFamily: TANK_OVERLAY_FONTS.dotMatrix, color: skin.inkMuted, textShadow: skin.textShadow }}
          >
            {currentDb === null ? "--" : `${currentDb} dB`}
          </span>
        </div>
      ) : <div />}

      {/* Right: Tank Branding Watermark */}
      {showWatermark ? (
        <div className="px-3 py-1.5" style={skin.panel}>
          <span
            className="text-sm uppercase tracking-widest"
            style={{ fontFamily: TANK_OVERLAY_FONTS.stamp, color: skin.ink, textShadow: skin.textShadow }}
          >
            tank<span style={{ color: skin.accent }}>®</span> live
          </span>
        </div>
      ) : null}
    </div>
  );

  if (!standalone) {
    return content;
  }

  return (
    <main className="fixed inset-x-0 bottom-0 p-4 sm:p-6 bg-transparent pointer-events-none select-none z-30">
      {content}
    </main>
  );
}

export default DirectorVuOverlay;
