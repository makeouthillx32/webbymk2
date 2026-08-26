"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Hls from "hls.js";
import { useTankCameras } from "../public/useTankCameras";
import { useDirectorAttention } from "../director/useDirectorAttention";
import { useServerDirector } from "../director/useServerDirector";
import { useCameraAudioMetrics } from "../director/useCameraAudioMetrics";
import { CrtTransition } from "../public/components/CrtTransition";
import type { PlaybackProtocol } from "../contracts";

export function DirectorObsScene() {
  const searchParams = useSearchParams();

  // Query configuration (inspired by Polish-Kick-TTS OBS parameter standards)
  const enableAudio = searchParams.get("audio") !== "0" && searchParams.get("audio") !== "false";
  const rawVolume = parseFloat(searchParams.get("volume") || "100");
  const initialVolume = isNaN(rawVolume) ? 1.0 : Math.max(0, Math.min(1, rawVolume > 1 ? rawVolume / 100 : rawVolume));
  const showHud = searchParams.get("hud") !== "0" && searchParams.get("hud") !== "false";
  const showAttention = searchParams.get("attention") !== "0" && searchParams.get("attention") !== "false";
  const showVu = searchParams.get("vu") !== "0" && searchParams.get("vu") !== "false";
  const enableCrt = searchParams.get("crt") !== "0" && searchParams.get("crt") !== "false";
  const theme = searchParams.get("theme") || "cctv"; // "cctv" | "clean" | "minimal" | "cyber"
  const urlLock = searchParams.get("lock"); // e.g. "living-room"

  // Live platform hooks
  const { snapshot, liveById } = useTankCameras();
  const cameras = snapshot?.cameras ?? [];
  const {
    attentionLock,
    timeRemainingSeconds,
  } = useDirectorAttention();
  const { metricsMap } = useCameraAudioMetrics(cameras);

  // Active negotiated feed
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  const [activeReason, setActiveReason] = useState<string>("Initializing Director...");
  const [dwellSeconds, setDwellSeconds] = useState<number>(0);
  const lastSwitchTimeRef = useRef<number>(Date.now());

  // Dual-buffered video elements (Buffer A & Buffer B)
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const pcRefA = useRef<RTCPeerConnection | null>(null);
  const pcRefB = useRef<RTCPeerConnection | null>(null);
  const hlsRefA = useRef<Hls | null>(null);
  const hlsRefB = useRef<Hls | null>(null);

  const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A");
  const [isGlitching, setIsGlitching] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");

  // Clock tick for CCTV timecode
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        d.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Central Server Director State Attachment ──
  const serverDirector = useServerDirector();

  useEffect(() => {
    if (urlLock) {
      // Manual URL lock override for specific OBS scene setups
      const lockedCam = cameras.find((c) => c.roomKey === urlLock || c.id === urlLock);
      if (lockedCam && lockedCam.id !== activeCamId) {
        setActiveCamId(lockedCam.id);
        setActiveReason(`[OBS URL LOCK] Locked to ${lockedCam.name}`);
        setDwellSeconds(0);
      }
      return;
    }

    if (serverDirector.activeCameraId && serverDirector.activeCameraId !== activeCamId) {
      setActiveCamId(serverDirector.activeCameraId);
      setActiveReason(serverDirector.reason);
      setDwellSeconds(serverDirector.dwellSecondsRemaining);
    }
  }, [
    serverDirector.activeCameraId,
    serverDirector.reason,
    serverDirector.dwellSecondsRemaining,
    urlLock,
    cameras,
    activeCamId,
  ]);

  // Active camera object
  const activeCamera = useMemo(() => {
    return cameras.find((c) => c.id === activeCamId) ?? cameras[0] ?? null;
  }, [cameras, activeCamId]);

  const activeFeed = useMemo(() => {
    if (!activeCamera) return null;
    return liveById.get(activeCamera.id) ?? null;
  }, [activeCamera, liveById]);

  // Connect stream to video buffer helper
  const connectBuffer = async (
    buffer: "A" | "B",
    url: string,
    protocol: PlaybackProtocol,
    onReady: () => void
  ) => {
    const video = buffer === "A" ? videoRefA.current : videoRefB.current;
    if (!video) return;

    // Cleanup previous connection on this buffer
    if (buffer === "A") {
      if (pcRefA.current) { pcRefA.current.close(); pcRefA.current = null; }
      if (hlsRefA.current) { hlsRefA.current.destroy(); hlsRefA.current = null; }
    } else {
      if (pcRefB.current) { pcRefB.current.close(); pcRefB.current = null; }
      if (hlsRefB.current) { hlsRefB.current.destroy(); hlsRefB.current = null; }
    }

    video.muted = !enableAudio;
    video.volume = initialVolume;

    const handleLoaded = () => {
      video.play().catch(() => {});
      onReady();
    };

    video.onloadeddata = handleLoaded;

    if (protocol === "whep" && typeof RTCPeerConnection !== "undefined") {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          iceCandidatePoolSize: 1,
          bundlePolicy: "max-bundle",
        });

        if (buffer === "A") pcRefA.current = pc;
        else pcRefB.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        if (enableAudio) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }

        pc.ontrack = (event) => {
          if (event.streams[0]) {
            video.srcObject = event.streams[0];
            video.play().catch(() => {});
            onReady();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });

        if (res.ok) {
          const sdp = await res.text();
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
          return;
        }
      } catch (e) {
        console.warn(`[OBS Director] WHEP failed on buffer ${buffer}, falling back to HLS:`, e);
      }
    }

    // Fallback: HLS or Direct Video URL
    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      if (buffer === "A") hlsRefA.current = hls;
      else hlsRefB.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        onReady();
      });
    } else {
      video.src = url;
      video.load();
    }
  };

  // Perform seamless buffer swap when active camera stream changes
  useEffect(() => {
    if (!activeFeed?.playbackUrl) return;

    const incomingBuffer = activeBuffer === "A" ? "B" : "A";
    const url = activeFeed.playbackUrl;
    const protocol = activeFeed.playbackProtocol || "whep";

    connectBuffer(incomingBuffer, url, protocol, () => {
      if (enableCrt) {
        setIsGlitching(true);
        setTimeout(() => {
          setActiveBuffer(incomingBuffer);
          setTimeout(() => setIsGlitching(false), 250);
        }, 120);
      } else {
        setActiveBuffer(incomingBuffer);
      }
    });
  }, [activeFeed?.playbackUrl, activeFeed?.playbackProtocol, enableAudio, enableCrt, initialVolume]);

  // Audio metrics for active camera
  const currentMetric = activeCamera ? metricsMap.get(activeCamera.id) : null;
  const currentDb = currentMetric ? Math.round(currentMetric.decibels) : -45;
  const energyPercent = Math.min(100, Math.max(0, ((currentDb + 60) / 60) * 100));

  const formatTimer = (seconds: number | null) => {
    if (seconds === null) return "LOCK";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent select-none">
      {/* ═══════════ DUAL-BUFFER VIDEO STAGE ═══════════ */}
      <div className="absolute inset-0 bg-black">
        {/* Buffer A */}
        <video
          ref={videoRefA}
          autoPlay
          playsInline
          muted={!enableAudio}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            activeBuffer === "A" ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        />

        {/* Buffer B */}
        <video
          ref={videoRefB}
          autoPlay
          playsInline
          muted={!enableAudio}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            activeBuffer === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        />

        {/* CRT Glitch Transition */}
        {enableCrt && <CrtTransition triggerKey={activeCamId} />}
      </div>

      {/* ═══════════ BROADCAST OVERLAY SYSTEM ═══════════ */}
      {showHud && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-6">
          {/* Top Header: REC Badge, CCTV Room ID & Live Timecode */}
          <div className="flex items-center justify-between">
            {/* Left: CCTV Camera Tag & REC Indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded bg-black/80 backdrop-blur-md px-3 py-1.5 border border-white/20 shadow-2xl">
                <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_#ff0000]" />
                <span className="font-mono text-xs font-black uppercase tracking-widest text-white">
                  REC
                </span>
                <span className="text-white/40">|</span>
                <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-wide">
                  DIRECTOR FEED
                </span>
              </div>

              {activeCamera && (
                <div className="rounded bg-black/80 backdrop-blur-md px-3 py-1.5 border border-white/20 shadow-2xl">
                  <span className="font-mono text-xs font-black uppercase text-yellow-400">
                    {activeCamera.location ?? "TANK HOUSE"} • {activeCamera.name}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Real-Time Timestamp & Day */}
            <div className="flex items-center gap-2">
              <div className="rounded bg-black/80 backdrop-blur-md px-3 py-1.5 border border-white/20 shadow-2xl font-mono text-xs font-black tracking-widest text-white">
                <span>{currentTime}</span>
              </div>
            </div>
          </div>

          {/* Center-Top: Director Attention Lock Alert (when active) */}
          {showAttention && attentionLock.active && (
            <div className="self-center">
              <div className="flex items-center gap-2 rounded-full bg-orange-600/90 backdrop-blur-md px-4 py-1.5 text-black font-black uppercase text-xs tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.6)] animate-pulse border border-orange-300">
                <span>🎯 ATTENTION LOCKED: {attentionLock.targetLabel}</span>
                <span className="bg-black text-orange-400 px-2 py-0.5 rounded font-mono text-[11px]">
                  {formatTimer(timeRemainingSeconds)}
                </span>
              </div>
            </div>
          )}

          {/* Bottom Bar: Sound Energy Meter & Watermark */}
          <div className="flex items-end justify-between">
            {/* Left: Audio VU Meter */}
            {showVu && (
              <div className="flex items-center gap-2 rounded bg-black/80 backdrop-blur-md px-3 py-2 border border-white/20 shadow-2xl">
                <span className="font-mono text-[11px] font-bold text-slate-300 uppercase">
                  MIC:
                </span>
                <div className="h-2.5 w-28 rounded-full bg-slate-800 overflow-hidden relative border border-white/10">
                  <div
                    className={`h-full transition-all duration-150 ${
                      currentDb > -24
                        ? "bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500"
                        : currentDb > -32
                        ? "bg-gradient-to-r from-emerald-400 to-yellow-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${energyPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] font-bold text-slate-400">
                  {currentDb} dB
                </span>
              </div>
            )}

            {/* Right: Tank Branding Watermark */}
            <div className="rounded bg-black/80 backdrop-blur-md px-3 py-1 border border-white/10 shadow-2xl">
              <span className="font-black text-xs uppercase tracking-widest text-white">
                tank<span className="text-[#ff4d00]">®</span> live
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default DirectorObsScene;
