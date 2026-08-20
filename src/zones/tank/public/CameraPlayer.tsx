"use client";

// CameraPlayer — Universal Resilient Dual-Buffered Stream Player
// Multi-Protocol Engine: WebRTC (WHEP) + Native iOS WebKit HLS + HLS.js (MSE)
// Engineered for 50,000+ congruent viewers across iOS Safari, Android, Chrome, Firefox, Electron, Smart TVs, and WebViews.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { detectNetworkProfile, subscribeToNetworkProfile, type NetworkProfile } from "./networkQuality";
import { useStreamSlot, type StreamPriority } from "./streamAdmission";
import { VideoErrorBoundary } from "./components/VideoErrorBoundary";
import Hls from "hls.js";
import { CameraOff, VolumeX, Volume2, Maximize, Loader2, Wifi, WifiOff, RefreshCw, Zap, AlertTriangle } from "lucide-react";
import type { PlaybackProtocol } from "../contracts";
import { ACTIVE_THEME } from "../theme";
import { logCameraDebug } from "./cameraDebug";
import { useInvisibleTouchTelemetry } from "./useInvisibleTouchTelemetry";

function cameraLabelFromUrl(url: string): string {
  const match = url.match(/cameras\/([^/?]+)/);
  return match ? match[1] : url.slice(0, 24);
}

export type LiveEdgeInfo = {
  isLive: boolean;
  latencySec: number;
  isPaused: boolean;
  seekableStart: number;
  seekableEnd: number;
  currentTime: number;
  bufferDuration: number;
};

export type BufferingInfo = {
  isBuffering: boolean;
  reason: "buffering" | "reconnecting" | "stalled" | "syncing" | "recovering";
  detail: string;
  stalledSince: number | null;
  retryCount: number;
};

export type CameraPlayerHandle = {
  togglePlayback: () => void;
  requestFullscreen: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  snapToLiveEdge: () => void;
  seekRelative: (deltaSec: number) => void;
  seekToTime: (targetTime: number) => void;
  getLiveEdgeInfo: () => LiveEdgeInfo;
};

type CameraPlayerProps = {
  playbackUrl: string | null;
  playbackProtocol: PlaybackProtocol;
  online: boolean;
  className?: string;
  muted?: boolean;
  volume?: number;
  onPlayStateChange?: (paused: boolean) => void;
  onLiveEdgeChange?: (info: LiveEdgeInfo) => void;
  onWatching?: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  showLiveBadge?: boolean;
  /**
   * How much this player deserves the bandwidth. "hero" is what the viewer is
   * actually watching; "thumbnail" is a grid tile. On a constrained connection
   * only heroes connect — see streamAdmission.ts.
   */
  priority?: StreamPriority;
  /**
   * Short muted clip of this camera's recent footage, looped underneath the
   * live surfaces. It is what a viewer looks at while the stream negotiates,
   * reconnects, or buffers — instead of a black rectangle. Purely cosmetic:
   * it sits below both video buffers and is covered the instant real frames
   * arrive. See getCameraLoopUrl in server/archiveSegments.ts.
   */
  prerollLoopUrl?: string | null;
};

const LED_RED = "#ff3b2f";

function isIosOrSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/.test(ua);
  return isIos || isSafari;
}

export function isMobileOrCellular(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i.test(ua);
  const isTouchScreen = typeof window !== "undefined" && (
    window.matchMedia?.("(max-width: 960px)")?.matches ||
    window.matchMedia?.("(pointer: coarse)")?.matches ||
    ((navigator as any).maxTouchPoints && (navigator as any).maxTouchPoints > 0)
  );
  return Boolean(isMobileUa || isTouchScreen);
}

// HLS is served from the `-hls` sibling path when transcoded, or directly from
// `cameras/{id}/index.m3u8` for direct IRL/USB/OBS ingest.
function deriveHlsUrl(url: string, direct = false): string {
  if (direct) {
    return url.replace(
      /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
      "/$1/index.m3u8",
    );
  }
  return url.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1-hls/index.m3u8",
  );
}

// 720p rung. Only exists when TANK_HLS_LOW_RUNG=1 server-side.
function deriveHlsLowUrl(url: string): string {
  return url.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1-hls-low/index.m3u8",
  );
}

// Small screens and phones get the low rung when it's available: a 4K
// 8.4 Mbps stream is unwatchable on cellular and pointless on a handset
// display. Falls back to the source rung when the ladder is disabled.
function prefersLowRung(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return narrow || coarse;
}

function deriveWhepUrl(url: string): string {
  return url.replace(
    /\/(cameras\/[^/]+?)(?:-hls)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1/whep$2",
  );
}

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    const timer = setTimeout(finish, timeoutMs);
  });
}

const CameraPlayerInner = forwardRef<CameraPlayerHandle, CameraPlayerProps>(
  function CameraPlayerInner(
    {
      playbackUrl,
      playbackProtocol,
      online,
      className,
      muted = true,
      volume = 1.0,
      onPlayStateChange,
      onLiveEdgeChange,
      onWatching,
      onClick,
      onDoubleClick,
      showLiveBadge = false,
      prerollLoopUrl = null,
      // Default to hero: an unmarked player is whatever the caller is showing
      // front and centre, and silently downgrading it would be worse than
      // spending a slot.
      priority = "hero",
    },
    ref,
  ) {
    const videoRefA = useRef<HTMLVideoElement | null>(null);
    const videoRefB = useRef<HTMLVideoElement | null>(null);

    const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A");
    const [streamConnectedA, setStreamConnectedA] = useState(false);
    // Mirrors of the two connection flags for async callbacks. A setTimeout
    // scheduled during connection setup closes over the state as it was THEN
    // (always false), so a watchdog reading the state variable can never
    // observe a success that happened after it was scheduled.
    const streamConnectedARef = useRef(false);
    const streamConnectedBRef = useRef(false);
    const [streamConnectedB, setStreamConnectedB] = useState(false);
    const [connectionFailed, setConnectionFailed] = useState(false);

    // How thin is the pipe? Recovery aggressiveness is tuned off this: the
    // numbers that self-heal a LAN stream actively destroy a cellular one.
    const [netProfile, setNetProfile] = useState<NetworkProfile>(() => detectNetworkProfile());
    const netProfileRef = useRef(netProfile);
    netProfileRef.current = netProfile;
    useEffect(() => subscribeToNetworkProfile(setNetProfile), []);
    const [activeEngine, setActiveEngine] = useState<"whep" | "native-hls" | "hls-js" | "direct">("whep");

    const pausedAtRef = useRef<number | null>(null);
    const [liveEdgeInfo, setLiveEdgeInfo] = useState<LiveEdgeInfo>({
      isLive: true,
      latencySec: 0,
      isPaused: false,
      seekableStart: 0,
      seekableEnd: 0,
      currentTime: 0,
      bufferDuration: 0,
    });

    const [bufferingInfo, setBufferingInfo] = useState<BufferingInfo>({
      isBuffering: false,
      reason: "buffering",
      detail: "",
      stalledSince: null,
      retryCount: 0,
    });

    const wantsStream = Boolean(playbackUrl) && playbackProtocol !== "none" && online;

    // Wanting to stream and being allowed to are different things when
    // bandwidth is scarce. Everything downstream keys off hasSource, so a
    // player without a slot simply never opens a connection.
    const admitted = useStreamSlot(priority, wantsStream);
    const hasSource = wantsStream && admitted;

    // Deliberately holding back is not a fault. Without this distinction a
    // bandwidth-limited grid would show six red NO SIGNAL alarms for six
    // perfectly healthy cameras, which reads as "the site is broken".
    const awaitingSlot = wantsStream && !admitted;

    const pcRefA = useRef<RTCPeerConnection | null>(null);
    const pcRefB = useRef<RTCPeerConnection | null>(null);
    const hlsRefA = useRef<Hls | null>(null);
    const hlsRefB = useRef<Hls | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);

    const cameraSlug = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "director";

    const [scavengerHit, setScavengerHit] = useState<{
      nx: number;
      ny: number;
      label: string;
      xp: number;
      message: string;
    } | null>(null);

    useInvisibleTouchTelemetry(playerContainerRef, {
      enabled: true,
      camSlug: cameraSlug,
      roomId: cameraSlug,
      onHitSuccess: (res, coords) => {
        if (res.target) {
          setScavengerHit({
            nx: coords.nx,
            ny: coords.ny,
            label: res.target.label,
            xp: res.xpAwarded ?? res.target.xpReward,
            message: res.message || `Found ${res.target.label}!`,
          });
          setTimeout(() => setScavengerHit(null), 2500);
        }
      },
    });

    // Live Edge calculation helper
    const calculateLiveEdge = (): LiveEdgeInfo => {
      const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      if (!activeVideo) {
        return { isLive: true, latencySec: 0, isPaused: false, seekableStart: 0, seekableEnd: 0, currentTime: 0, bufferDuration: 0 };
      }

      const isPaused = activeVideo.paused;
      const currentTime = activeVideo.currentTime || 0;

      if (activeEngine === "whep") {
        const elapsedSincePause = (isPaused && pausedAtRef.current)
          ? Math.max(0, Math.round((Date.now() - pausedAtRef.current) / 1000))
          : 0;
        return {
          isLive: !isPaused && elapsedSincePause <= 2,
          latencySec: elapsedSincePause,
          isPaused,
          seekableStart: currentTime,
          seekableEnd: currentTime,
          currentTime,
          bufferDuration: 0,
        };
      }

      if (activeVideo.seekable && activeVideo.seekable.length > 0) {
        const seekableStart = activeVideo.seekable.start(0);
        const seekableEnd = activeVideo.seekable.end(activeVideo.seekable.length - 1);
        const diff = Math.max(0, Math.round(seekableEnd - currentTime));
        const elapsedSincePause = (isPaused && pausedAtRef.current)
          ? Math.max(0, Math.round((Date.now() - pausedAtRef.current) / 1000))
          : 0;
        const latencySec = isPaused ? Math.max(diff, elapsedSincePause) : diff;
        const isLive = !isPaused && latencySec <= 3;
        const bufferDuration = Math.max(0, seekableEnd - seekableStart);
        return {
          isLive,
          latencySec,
          isPaused,
          seekableStart,
          seekableEnd,
          currentTime,
          bufferDuration,
        };
      }

      const elapsedSincePause = (isPaused && pausedAtRef.current)
        ? Math.max(0, Math.round((Date.now() - pausedAtRef.current) / 1000))
        : 0;
      return {
        isLive: !isPaused && elapsedSincePause <= 2,
        latencySec: elapsedSincePause,
        isPaused,
        seekableStart: currentTime,
        seekableEnd: currentTime,
        currentTime,
        bufferDuration: 0,
      };
    };

    const updateLiveEdge = () => {
      const info = calculateLiveEdge();
      setLiveEdgeInfo(info);
      onLiveEdgeChange?.(info);
    };

    // Snap to the live edge immediately
    const snapToLiveEdge = () => {
      const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      const activeHls = activeBuffer === "A" ? hlsRefA.current : hlsRefB.current;
      if (!activeVideo) return;

      const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
      logCameraDebug(cameraLabel, `snapToLiveEdge: snapping to live edge (engine=${activeEngine})`);

      if (activeEngine === "hls-js" && activeHls) {
        try {
          // Landing 0.5s behind live is only safe when the next 0.5s is
          // certain to arrive in time. On cellular it isn't, so the snap
          // re-stalls instantly and the watchdog snaps again — that loop is
          // what made the picture flash. Sit further back on a thin pipe.
          const backoff = netProfileRef.current.liveEdgeTargetSeconds;
          const liveSyncPos = activeHls.liveSyncPosition;
          if (liveSyncPos !== null && !isNaN(liveSyncPos) && liveSyncPos > 0) {
            activeVideo.currentTime = Math.max(0, liveSyncPos - (backoff > 0.5 ? backoff - 0.5 : 0));
          } else if (activeVideo.seekable && activeVideo.seekable.length > 0) {
            activeVideo.currentTime = Math.max(0, activeVideo.seekable.end(activeVideo.seekable.length - 1) - backoff);
          }
          activeHls.startLoad();
        } catch (err) {
          logCameraDebug(cameraLabel, `hls-js snap error: ${err}`);
        }
      } else if (activeVideo.seekable && activeVideo.seekable.length > 0) {
        const liveEnd = activeVideo.seekable.end(activeVideo.seekable.length - 1);
        activeVideo.currentTime = Math.max(0, liveEnd - netProfileRef.current.liveEdgeTargetSeconds);
      }

      pausedAtRef.current = null;

      if (activeVideo.paused) {
        const playPromise = activeVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            logCameraDebug(cameraLabel, `snapToLiveEdge play error: ${err}`);
          });
        }
      }
      updateLiveEdge();
    };

    const seekRelative = (deltaSec: number) => {
      const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      if (!activeVideo) return;
      if (activeVideo.seekable && activeVideo.seekable.length > 0) {
        const start = activeVideo.seekable.start(0);
        const end = activeVideo.seekable.end(activeVideo.seekable.length - 1);
        const newTime = Math.max(start, Math.min(end - 0.5, (activeVideo.currentTime || end) + deltaSec));
        activeVideo.currentTime = newTime;
        updateLiveEdge();
      }
    };

    const seekToTime = (targetTime: number) => {
      const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      if (!activeVideo) return;
      if (activeVideo.seekable && activeVideo.seekable.length > 0) {
        const start = activeVideo.seekable.start(0);
        const end = activeVideo.seekable.end(activeVideo.seekable.length - 1);
        const newTime = Math.max(start, Math.min(end - 0.5, targetTime));
        activeVideo.currentTime = newTime;
        updateLiveEdge();
      }
    };

    useImperativeHandle(ref, () => ({
      togglePlayback: () => {
        const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
        if (!activeVideo) return;
        if (activeVideo.paused) {
          // DVR Catchup Check: If paused for >60s or currentTime is before seekable buffer start,
          // automatically fast-forward to live edge instead of stalling on evicted HLS segments.
          const pauseDuration = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
          let isStale = pauseDuration > 60000;
          if (!isStale && activeVideo.seekable && activeVideo.seekable.length > 0) {
            const seekableStart = activeVideo.seekable.start(0);
            const seekableEnd = activeVideo.seekable.end(activeVideo.seekable.length - 1);
            if (activeVideo.currentTime < seekableStart || (seekableEnd - activeVideo.currentTime > 58)) {
              isStale = true;
            }
          }
          if (isStale) {
            const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
            logCameraDebug(
              cameraLabel,
              `togglePlayback: unpausing after long pause (${Math.round(pauseDuration / 1000)}s) — auto-catching up to live edge`,
            );
            snapToLiveEdge();
          } else {
            pausedAtRef.current = null;
            void activeVideo.play().catch(() => {});
          }
        } else {
          pausedAtRef.current = Date.now();
          activeVideo.pause();
        }
        updateLiveEdge();
      },
      requestFullscreen: () => {
        const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
        if (!activeVideo) return;

        // 1. iOS Safari / WebKit native video fullscreen (unlocks horizontal landscape phone rotation)
        if (typeof (activeVideo as any).webkitEnterFullscreen === "function") {
          try {
            (activeVideo as any).webkitEnterFullscreen();
            return;
          } catch {}
        }

        // 2. Standard HTML5 Fullscreen API
        if (activeVideo.requestFullscreen) {
          void activeVideo
            .requestFullscreen()
            .then(() => {
              try {
                void (screen.orientation as any)?.lock?.("landscape").catch(() => {});
              } catch {}
            })
            .catch(() => {});
        } else if ((activeVideo as any).webkitRequestFullscreen) {
          void (activeVideo as any).webkitRequestFullscreen();
        }
      },
      setMuted: (m: boolean) => {
        if (videoRefA.current) {
          videoRefA.current.muted = m;
          videoRefA.current.defaultMuted = m;
        }
        if (videoRefB.current) {
          videoRefB.current.muted = m;
          videoRefB.current.defaultMuted = m;
        }
      },
      setVolume: (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        if (videoRefA.current) videoRefA.current.volume = clamped;
        if (videoRefB.current) videoRefB.current.volume = clamped;
      },
      snapToLiveEdge,
      seekRelative,
      seekToTime,
      getLiveEdgeInfo: calculateLiveEdge,
    }));

    // Imperatively apply mute and volume to both video elements for WebKit compatibility
    useEffect(() => {
      if (videoRefA.current) {
        videoRefA.current.muted = muted;
        videoRefA.current.defaultMuted = muted;
        videoRefA.current.volume = volume;
      }
      if (videoRefB.current) {
        videoRefB.current.muted = muted;
        videoRefB.current.defaultMuted = muted;
        videoRefB.current.volume = volume;
      }
    }, [muted, volume]);

    // Attach playback listeners to active video & handle DVR stale buffer recovery
    useEffect(() => {
      const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      if (!activeVideo) return;

      const handlePause = () => {
        // Always-Live Enforcement: Auto-resume immediately if paused
        if (activeVideo && !activeVideo.ended) {
          void activeVideo.play().catch(() => {});
        }
        onPlayStateChange?.(false);
        updateLiveEdge();
      };

      const handlePlay = () => {
        const pauseDuration = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
        let isStale = pauseDuration > 60000;
        if (activeVideo.seekable && activeVideo.seekable.length > 0) {
          const seekableStart = activeVideo.seekable.start(0);
          const seekableEnd = activeVideo.seekable.end(activeVideo.seekable.length - 1);
          if (activeVideo.currentTime < seekableStart || (seekableEnd - activeVideo.currentTime > 58)) {
            isStale = true;
          }
        }
        if (isStale) {
          const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
          logCameraDebug(
            cameraLabel,
            `handlePlay: stale buffer detected (${Math.round(pauseDuration / 1000)}s) — auto-snapping to live edge`,
          );
          snapToLiveEdge();
        }
        pausedAtRef.current = null;
        onPlayStateChange?.(false);
        updateLiveEdge();
      };

      const handlePlaying = () => {
        pausedAtRef.current = null;
        setBufferingInfo({
          isBuffering: false,
          reason: "buffering",
          detail: "",
          stalledSince: null,
          retryCount: 0,
        });
        onWatching?.();
        updateLiveEdge();
      };

      const handleCanPlay = () => {
        setBufferingInfo((prev) => ({
          ...prev,
          isBuffering: false,
          stalledSince: null,
        }));
      };

      const handleWaiting = () => {
        if (!activeVideo.paused) {
          setBufferingInfo((prev) => ({
            isBuffering: true,
            reason: "buffering",
            detail: "Buffering stream from edge...",
            stalledSince: prev.stalledSince || Date.now(),
            retryCount: prev.retryCount,
          }));
        }
      };

      const handleStalled = () => {
        if (!activeVideo.paused) {
          setBufferingInfo((prev) => ({
            isBuffering: true,
            reason: "stalled",
            detail: "Network congestion detected • Auto-recovering...",
            stalledSince: prev.stalledSince || Date.now(),
            retryCount: prev.retryCount + 1,
          }));
        }
      };

      const handleSeeking = () => {
        setBufferingInfo((prev) => ({
          ...prev,
          isBuffering: true,
          reason: "syncing",
          detail: "Syncing live frame...",
        }));
      };

      const handleTimeUpdate = () => {
        // If time is advancing normally and video is playing, clear buffering
        if (activeVideo && !activeVideo.paused && bufferingInfo.isBuffering && bufferingInfo.reason === "buffering") {
          setBufferingInfo((prev) => ({
            ...prev,
            isBuffering: false,
            stalledSince: null,
          }));
        }
        updateLiveEdge();
      };

      activeVideo.addEventListener("pause", handlePause);
      activeVideo.addEventListener("play", handlePlay);
      activeVideo.addEventListener("playing", handlePlaying);
      activeVideo.addEventListener("canplay", handleCanPlay);
      activeVideo.addEventListener("waiting", handleWaiting);
      activeVideo.addEventListener("stalled", handleStalled);
      activeVideo.addEventListener("seeking", handleSeeking);
      activeVideo.addEventListener("timeupdate", handleTimeUpdate);
      activeVideo.addEventListener("progress", handleTimeUpdate);
      activeVideo.addEventListener("seeked", handleTimeUpdate);

      return () => {
        activeVideo.removeEventListener("pause", handlePause);
        activeVideo.removeEventListener("play", handlePlay);
        activeVideo.removeEventListener("playing", handlePlaying);
        activeVideo.removeEventListener("canplay", handleCanPlay);
        activeVideo.removeEventListener("waiting", handleWaiting);
        activeVideo.removeEventListener("stalled", handleStalled);
        activeVideo.removeEventListener("seeking", handleSeeking);
        activeVideo.removeEventListener("timeupdate", handleTimeUpdate);
        activeVideo.removeEventListener("progress", handleTimeUpdate);
        activeVideo.removeEventListener("seeked", handleTimeUpdate);
      };
    }, [activeBuffer, activeEngine, onPlayStateChange, onWatching]);

    // ── AUTONOMOUS SYSTEMATIC LIVE EDGE SYNCHRONIZER ──
    // Continuously detects unsync, drift, and latency lag at a systematic level.
    // A user should NEVER have to manually click to see live footage.
    useEffect(() => {
      const syncInterval = setInterval(() => {
        const info = calculateLiveEdge();
        setLiveEdgeInfo(info);
        onLiveEdgeChange?.(info);

        const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
        if (!activeVideo || !hasSource) return;

        // 1. Unsync Auto-Snap: If latency drift exceeds 4.0s (e.g. from network stutter or tab lag),
        // automatically snap straight to the live edge immediately with ZERO user intervention.
        if (info.latencySec > 4.0) {
          const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
          logCameraDebug(
            cameraLabel,
            `autonomous sync: drift detected (latency=${info.latencySec}s > 4s) — auto-snapping to live edge`,
          );
          snapToLiveEdge();
          return;
        }

        // 2. Micro-Drift Dynamic Speed Catchup:
        // If slightly behind live edge (1.5s to 4.0s), subtly accelerate to 1.12x so the viewer seamlessly catches up
        if (!activeVideo.paused && activeEngine !== "whep") {
          if (info.latencySec > 1.5 && info.latencySec <= 4.0) {
            if (activeVideo.playbackRate !== 1.12) {
              activeVideo.playbackRate = 1.12;
            }
          } else if (info.latencySec <= 0.8) {
            if (activeVideo.playbackRate !== 1.0) {
              activeVideo.playbackRate = 1.0;
            }
          }
        }
      }, 500);

      return () => clearInterval(syncInterval);
    }, [activeBuffer, activeEngine, hasSource, onLiveEdgeChange, playbackUrl]);

    // ── AUTONOMOUS VISIBILITY & RE-FOCUS RE-SYNC WATCHDOG ──
    // When the user returns from another tab, unlocks phone, or refocuses window,
    // immediately re-sync to live edge without waiting.
    useEffect(() => {
      const handleVisibilityOrFocus = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
          if (activeVideo) {
            void activeVideo.play().catch(() => {});
            snapToLiveEdge();
          }
        }
      };

      if (typeof window !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityOrFocus);
        window.addEventListener("focus", handleVisibilityOrFocus);
        window.addEventListener("pageshow", handleVisibilityOrFocus);
      }

      return () => {
        if (typeof window !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
          window.removeEventListener("focus", handleVisibilityOrFocus);
          window.removeEventListener("pageshow", handleVisibilityOrFocus);
        }
      };
    }, [activeBuffer, activeEngine]);

    // ── STAGNATION WATCHDOG ──
    //
    // Distinguishes a frozen stream from a slow one. The playhead alone cannot
    // tell them apart: a video rebuffering on cellular and a video that has
    // died both sit at the same timestamp. The previous version read a stalled
    // playhead as a freeze and "recovered" every 2.5s, which on a thin pipe
    // discarded the buffer the stream had just spent scarce bandwidth filling —
    // so it stalled again, recovered again, and flashed forever.
    //
    // The tell is whether bytes are still arriving. If the buffered edge is
    // advancing, the stream is healthy and merely slow; the only correct action
    // is to wait.
    const lastPlaybackCheckRef = useRef<{ time: number; position: number; bufferedEnd: number }>({
      time: Date.now(),
      position: 0,
      bufferedEnd: 0,
    });
    const recoveryRef = useRef<{ attempts: number; nextAllowedAt: number }>({
      attempts: 0,
      nextAllowedAt: 0,
    });

    // A fresh source is a fresh chance — otherwise a camera that failed once
    // stays given-up-on for the life of the component.
    useEffect(() => {
      recoveryRef.current = { attempts: 0, nextAllowedAt: 0 };
    }, [playbackUrl]);

    useEffect(() => {
      const stagnationInterval = setInterval(() => {
        const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
        const activeHls = activeBuffer === "A" ? hlsRefA.current : hlsRefB.current;
        if (!activeVideo || activeVideo.ended || !hasSource) {
          lastPlaybackCheckRef.current = {
            time: Date.now(),
            position: activeVideo?.currentTime || 0,
            bufferedEnd: 0,
          };
          return;
        }

        const now = Date.now();
        const currentPos = activeVideo.currentTime || 0;
        const buffered = activeVideo.buffered;
        const bufferedEnd = buffered && buffered.length > 0 ? buffered.end(buffered.length - 1) : 0;

        const last = lastPlaybackCheckRef.current;
        const elapsedSec = (now - last.time) / 1000;
        const advancedSec = Math.abs(currentPos - last.position);
        const bufferGrewSec = bufferedEnd - last.bufferedEnd;

        // Autoplay can be refused, and a refused play() is not a stall.
        if (activeVideo.paused) {
          void activeVideo.play().catch(() => {});
        }

        if (elapsedSec < 2.5) return;

        const playheadStuck = advancedSec < 0.2;
        // Downloading counts as alive even while the playhead sits still.
        const stillDownloading =
          bufferGrewSec > 0.1 || activeVideo.networkState === activeVideo.NETWORK_LOADING;
        const hasPlayableData = activeVideo.readyState >= 3; // HAVE_FUTURE_DATA

        lastPlaybackCheckRef.current = { time: now, position: currentPos, bufferedEnd };

        if (!playheadStuck) {
          // Playing normally — any past failure is history.
          recoveryRef.current.attempts = 0;
          return;
        }

        // Stuck but fed: this is rebuffering. Touching it now would throw away
        // the progress being made. Leave it alone.
        if (stillDownloading || hasPlayableData) return;

        const profile = netProfileRef.current;

        // Genuinely wedged. Space attempts out instead of hammering — on a
        // congested link the retries are themselves part of the congestion.
        if (now < recoveryRef.current.nextAllowedAt) return;

        if (recoveryRef.current.attempts >= profile.maxEngineRetries) {
          // Stop. An endless invisible retry is worse than an honest panel the
          // viewer can act on, and it keeps consuming data forever.
          const label = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
          logCameraDebug(label, `stagnation watchdog: giving up after ${recoveryRef.current.attempts} attempts`);
          setConnectionFailed(true);
          return;
        }

        recoveryRef.current.attempts += 1;
        // 3s, 6s, 12s, 24s… capped, so a long outage settles down rather than
        // retrying every 2.5s all night.
        const backoffMs = Math.min(30000, 3000 * 2 ** (recoveryRef.current.attempts - 1));
        recoveryRef.current.nextAllowedAt = now + backoffMs;

        const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
        logCameraDebug(
          cameraLabel,
          `stagnation watchdog: wedged at pos=${currentPos.toFixed(2)} (no buffer growth, readyState=${activeVideo.readyState}) — recovery ${recoveryRef.current.attempts}/${profile.maxEngineRetries}, next in ${backoffMs}ms`,
        );

        if (activeEngine === "hls-js" && activeHls) {
          activeHls.recoverMediaError();
          snapToLiveEdge();
        } else {
          snapToLiveEdge();
        }
      }, 1000);

      return () => clearInterval(stagnationInterval);
    }, [activeBuffer, activeEngine, hasSource, playbackUrl]);

    // Multi-Protocol Stream Connector
    useEffect(() => {
      if (!hasSource || !playbackUrl) {
        // Only a real inability to play is a failure. Waiting for a slot is a
        // choice we made, so it must not light the offline panel.
        setConnectionFailed(!awaitingSlot);
        return;
      }

      let cancelled = false;
      const currentActive = activeBuffer;
      const targetSlot =
        currentActive === "A" && streamConnectedA
          ? "B"
          : currentActive === "B" && streamConnectedB
          ? "A"
          : currentActive;
      const targetVideo = targetSlot === "A" ? videoRefA.current : videoRefB.current;

      if (!targetVideo) return;

      setConnectionFailed(false);

      const cameraLabel = cameraLabelFromUrl(playbackUrl);
      logCameraDebug(cameraLabel, `connect start — slot ${targetSlot}, protocol=${playbackProtocol}, url=${playbackUrl}`);

      // Force WebKit / iOS video attributes before initiating stream
      targetVideo.muted = true;
      targetVideo.defaultMuted = true;
      targetVideo.playsInline = true;
      targetVideo.setAttribute("playsinline", "true");
      targetVideo.setAttribute("webkit-playsinline", "true");
      targetVideo.setAttribute("autoplay", "true");

      const onFrameReady = () => {
        if (cancelled) return;
        if (targetSlot === "A") {
          setStreamConnectedA(true); streamConnectedARef.current = true;
          setActiveBuffer("A");
          if (pcRefB.current) {
            pcRefB.current.close();
            pcRefB.current = null;
          }
          if (hlsRefB.current) {
            hlsRefB.current.destroy();
            hlsRefB.current = null;
          }
          setStreamConnectedB(false); streamConnectedBRef.current = false;
        } else {
          setStreamConnectedB(true); streamConnectedBRef.current = true;
          setActiveBuffer("B");
          if (pcRefA.current) {
            pcRefA.current.close();
            pcRefA.current = null;
          }
          if (hlsRefA.current) {
            hlsRefA.current.destroy();
            hlsRefA.current = null;
          }
          setStreamConnectedA(false); streamConnectedARef.current = false;
        }
        setConnectionFailed(false);
        onWatching?.();
        logCameraDebug(cameraLabel, `FRAME READY — slot ${targetSlot} now live`);
        targetVideo.removeEventListener("playing", onFrameReady);
        targetVideo.removeEventListener("play", onFrameReady);
        targetVideo.removeEventListener("canplay", onFrameReady);
        targetVideo.removeEventListener("canplaythrough", onFrameReady);
        targetVideo.removeEventListener("loadeddata", onFrameReady);
        targetVideo.removeEventListener("loadedmetadata", onFrameReady);
        targetVideo.removeEventListener("timeupdate", onFrameReady);
      };

      targetVideo.addEventListener("playing", onFrameReady, { once: true });
      targetVideo.addEventListener("play", onFrameReady, { once: true });
      targetVideo.addEventListener("canplay", onFrameReady, { once: true });
      targetVideo.addEventListener("canplaythrough", onFrameReady, { once: true });
      targetVideo.addEventListener("loadeddata", onFrameReady, { once: true });
      targetVideo.addEventListener("loadedmetadata", onFrameReady, { once: true });
      targetVideo.addEventListener("timeupdate", onFrameReady, { once: true });

      let nativeHlsRetries = 0;
      const MAX_NATIVE_HLS_RETRIES = 4;

      // Protocol 1: Native Apple WebKit HLS (iOS Safari / iPadOS Gold Standard)
      function connectNativeHls(hlsUrl: string) {
        if (cancelled || !targetVideo) return;
        setActiveEngine("native-hls");
        logCameraDebug(cameraLabel, `native-hls: attaching src=${hlsUrl}`);

        // A camera's HLS manifest isn't ready the instant the page loads —
        // MediaMTX only starts muxing once that camera's ffmpeg publishes,
        // which can lag a few seconds after a restart or a room switch.
        // Without a retry, <video src> fires `error` once and the element
        // stays black forever, which is exactly the "one room is dead until
        // I refresh" symptom. Bounded so a genuinely offline camera still
        // settles into the NO SIGNAL panel instead of retrying all night.
        const onVideoError = () => {
          const err = targetVideo?.error;
          logCameraDebug(
            cameraLabel,
            `native-hls: video error code=${err?.code ?? "?"} message=${err?.message || "(none)"}`,
          );
          if (cancelled || !targetVideo) return;
          if (nativeHlsRetries >= MAX_NATIVE_HLS_RETRIES) {
            logCameraDebug(cameraLabel, "native-hls: retries exhausted");
            setConnectionFailed(true);
            return;
          }
          nativeHlsRetries += 1;
          // Exponential, not linear: a camera that is genuinely down should
          // stop costing the viewer data every second and a half.
          const delay = Math.min(20000, 1500 * 2 ** (nativeHlsRetries - 1));
          logCameraDebug(cameraLabel, `native-hls: retry ${nativeHlsRetries} in ${delay}ms`);
          setTimeout(() => {
            if (cancelled || !targetVideo) return;
            targetVideo.load();
            void targetVideo.play().catch(() => {});
          }, delay);
        };
        let stallTimeout: ReturnType<typeof setTimeout> | null = null;
        // Buffer level when the stall timer was armed, so the timer can tell
        // whether anything arrived while it waited.
        let stallBufferedEnd = 0;
        const onStalled = () => logCameraDebug(cameraLabel, "native-hls: stalled");
        const onWaiting = () => {
          logCameraDebug(cameraLabel, "native-hls: waiting (buffering)");
          if (stallTimeout) clearTimeout(stallTimeout);

          const b = targetVideo.buffered;
          stallBufferedEnd = b && b.length > 0 ? b.end(b.length - 1) : 0;

          const profile = netProfileRef.current;
          // `waiting` fires on every ordinary rebuffer, so on a thin pipe this
          // timer used to fire constantly and seek to 0.5s behind live — which
          // guaranteed the next rebuffer. That was the flashing on iOS
          // cellular: the recovery caused the fault it was recovering from.
          stallTimeout = setTimeout(() => {
            if (cancelled || !targetVideo) return;

            const nb = targetVideo.buffered;
            const nowBufferedEnd = nb && nb.length > 0 ? nb.end(nb.length - 1) : 0;

            // Data still arriving: it is buffering, not stalled. Re-arm and
            // keep waiting rather than throwing the download away.
            if (nowBufferedEnd - stallBufferedEnd > 0.1) {
              logCameraDebug(cameraLabel, "native-hls: still filling buffer, leaving it alone");
              onWaiting();
              return;
            }

            logCameraDebug(cameraLabel, "native-hls: stall watchdog fired, resyncing");
            if (targetVideo.seekable && targetVideo.seekable.length > 0) {
              const liveEdge = targetVideo.seekable.end(targetVideo.seekable.length - 1);
              const target = profile.liveEdgeTargetSeconds;
              // Only worth seeking if we are further behind than the buffer we
              // are aiming to hold, otherwise the seek is pure churn.
              if (liveEdge - targetVideo.currentTime > target + 2) {
                targetVideo.currentTime = Math.max(0, liveEdge - target);
              }
            }
            void targetVideo.play().catch(() => {});
          }, profile.constrained || profile.tier === "unknown" ? 12000 : 4000);
        };
        const onPlaying = () => {
          if (stallTimeout) {
            clearTimeout(stallTimeout);
            stallTimeout = null;
          }
        };
        const onCanPlay = () => logCameraDebug(cameraLabel, "native-hls: canplay");
        const onLoadStart = () => logCameraDebug(cameraLabel, "native-hls: loadstart");

        const onVisibilityChange = () => {
          if (document.visibilityState === "visible" && targetVideo && !cancelled) {
            logCameraDebug(cameraLabel, "native-hls: tab foregrounded, checking live edge alignment");
            if (targetVideo.seekable && targetVideo.seekable.length > 0) {
              const liveEdge = targetVideo.seekable.end(targetVideo.seekable.length - 1);
              if (liveEdge - targetVideo.currentTime > 3.0) {
                targetVideo.currentTime = Math.max(0, liveEdge - 0.5);
              }
            }
            void targetVideo.play().catch(() => {});
          }
        };

        targetVideo.addEventListener("error", onVideoError);
        targetVideo.addEventListener("stalled", onStalled);
        targetVideo.addEventListener("waiting", onWaiting);
        targetVideo.addEventListener("playing", onPlaying);
        targetVideo.addEventListener("canplay", onCanPlay, { once: true });
        targetVideo.addEventListener("loadstart", onLoadStart, { once: true });
        document.addEventListener("visibilitychange", onVisibilityChange);

        targetVideo.src = hlsUrl;
        targetVideo.muted = muted;
        targetVideo.defaultMuted = muted;
        targetVideo.volume = volume;
        targetVideo.load();

        const playPromise = targetVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("[CameraPlayer] Native HLS muted play fallback:", err);
            logCameraDebug(cameraLabel, `native-hls: play() rejected — ${err?.name ?? err}`);
            if (targetVideo) {
              targetVideo.muted = true;
              void targetVideo.play().catch((err2) => {
                logCameraDebug(cameraLabel, `native-hls: muted play() also rejected — ${err2?.name ?? err2}`);
              });
            }
          });
        }
      }

      // Protocol 2: HLS.js with MSE (Media Source Extensions for Chrome/Firefox/Android)
      function connectHlsJs(hlsUrl: string) {
        if (cancelled || !targetVideo) return;
        setActiveEngine("hls-js");
        logCameraDebug(cameraLabel, `hls-js: attaching src=${hlsUrl}, isSupported=${Hls.isSupported()}`);

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 4,
            maxMaxBufferLength: 10,
            liveSyncDurationCount: 1,
            liveMaxLatencyDurationCount: 3,
            maxBufferHole: 0.2,
            startFragPrefetch: true,
            testBandwidth: false,
            fragLoadingTimeOut: 3500,
            manifestLoadingTimeOut: 3500,
            backBufferLength: 0,
            highBufferWatchdogPeriod: 1,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 5,
          });

          if (targetSlot === "A") {
            if (hlsRefA.current) hlsRefA.current.destroy();
            hlsRefA.current = hls;
          } else {
            if (hlsRefB.current) hlsRefB.current.destroy();
            hlsRefB.current = hls;
          }

          hls.loadSource(hlsUrl);
          hls.attachMedia(targetVideo);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled || !targetVideo) return;
            targetVideo.muted = muted;
            targetVideo.defaultMuted = muted;
            targetVideo.volume = volume;
            void targetVideo.play().catch(() => {
              if (targetVideo) {
                targetVideo.muted = true;
                void targetVideo.play().catch(() => {});
              }
            });
          });

          hls.on(Hls.Events.FRAG_LOADING, () => {
            logCameraDebug(cameraLabel, "hls-js: frag loading");
          });

          hls.on(Hls.Events.FRAG_LOADED, () => {
            setBufferingInfo((prev) => ({
              ...prev,
              isBuffering: false,
              stalledSince: null,
            }));
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            logCameraDebug(cameraLabel, `hls-js: error type=${data.type} details=${data.details} fatal=${data.fatal}`);
            
            // If the transcoded -hls path returned 404 (e.g. direct IRL/USB stream without transcode),
            // instantly retry loading the native direct path.
            if (
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
            ) {
              const directHls = deriveHlsUrl(hlsUrl, true);
              if (directHls !== hlsUrl) {
                logCameraDebug(
                  cameraLabel,
                  `hls-js: 404 on ${hlsUrl}, retrying direct ingest path ${directHls}`,
                );
                hls.loadSource(directHls);
                hls.startLoad();
                return;
              }
            }

            setBufferingInfo((prev) => ({
              isBuffering: true,
              reason: data.fatal ? "reconnecting" : "stalled",
              detail: data.type === Hls.ErrorTypes.NETWORK_ERROR
                ? "Network lag • Fetching next segment..."
                : data.type === Hls.ErrorTypes.MEDIA_ERROR
                ? "Recovering video buffer..."
                : "Syncing stream feed...",
              stalledSince: prev.stalledSince || Date.now(),
              retryCount: prev.retryCount + (data.fatal ? 1 : 0),
            }));

            if (data.fatal && !cancelled) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  logCameraDebug(cameraLabel, "hls-js: recovering network error");
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  logCameraDebug(cameraLabel, "hls-js: recovering media error");
                  hls.recoverMediaError();
                  break;
                default:
                  logCameraDebug(cameraLabel, "hls-js: fatal unrecoverable error");
                  setConnectionFailed(true);
                  break;
              }
            }
          });
          return;
        }

        // Direct Fallback if neither HLS.js nor Native HLS supported
        logCameraDebug(cameraLabel, "hls-js: not supported, using direct <video src>");
        targetVideo.src = hlsUrl;
        targetVideo.load();
        void targetVideo.play().catch(() => {});
      }

      // Protocol 3: WebRTC WHEP (Ultra Low Latency <500ms for Desktop)
      async function connectWhep(whepUrl: string) {
        if (cancelled || !targetVideo) return;
        setActiveEngine("whep");
        logCameraDebug(cameraLabel, `whep: connecting to ${whepUrl}`);

        try {
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
            bundlePolicy: "max-bundle",
            iceCandidatePoolSize: 1,
          });
          pc.addEventListener("connectionstatechange", () => {
            logCameraDebug(cameraLabel, `whep: pc.connectionState=${pc.connectionState}`);
            if (pc.connectionState === "connecting") {
              setBufferingInfo({
                isBuffering: true,
                reason: "reconnecting",
                detail: "Connecting real-time WebRTC link...",
                stalledSince: Date.now(),
                retryCount: 0,
              });
            } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
              setBufferingInfo((prev) => ({
                isBuffering: true,
                reason: "reconnecting",
                detail: "WebRTC disconnected • Recovering stream...",
                stalledSince: prev.stalledSince || Date.now(),
                retryCount: prev.retryCount + 1,
              }));
            } else if (pc.connectionState === "connected") {
              setBufferingInfo({
                isBuffering: false,
                reason: "buffering",
                detail: "",
                stalledSince: null,
                retryCount: 0,
              });
            }
          });
          pc.addEventListener("iceconnectionstatechange", () => {
            logCameraDebug(cameraLabel, `whep: pc.iceConnectionState=${pc.iceConnectionState}`);
          });

          if (targetSlot === "A") {
            if (pcRefA.current) pcRefA.current.close();
            pcRefA.current = pc;
          } else {
            if (pcRefB.current) pcRefB.current.close();
            pcRefB.current = pc;
          }

          pc.addTransceiver("video", { direction: "recvonly" });
          pc.addTransceiver("audio", { direction: "recvonly" });

          pc.ontrack = (event) => {
            logCameraDebug(cameraLabel, `whep: ontrack fired, kind=${event.track.kind}`);
            if (cancelled || !event.streams[0] || !targetVideo) return;
            targetVideo.srcObject = event.streams[0];
            targetVideo.muted = muted;
            targetVideo.defaultMuted = muted;
            targetVideo.volume = volume;
            void targetVideo.play().catch(() => {
              if (targetVideo) {
                targetVideo.muted = true;
                void targetVideo.play().catch(() => {});
              }
            });
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          // Fast ICE gathering timeout (max 1500ms)
          await waitForIceGatheringComplete(pc, 1500);
          logCameraDebug(
            cameraLabel,
            `whep: ICE gathering state=${pc.iceGatheringState}, candidates in SDP=${
              (pc.localDescription?.sdp ?? "").split("a=candidate").length - 1
            }`,
          );

          const response = await fetch(whepUrl, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: pc.localDescription?.sdp ?? offer.sdp,
          });
          logCameraDebug(cameraLabel, `whep: POST response status=${response.status}`);

          if (!response.ok) {
            console.warn("[CameraPlayer] WHEP handshake rejected, falling back to HLS:", response.status);
            // Instant seamless failover to HLS
            const fallbackHls = deriveHlsUrl(whepUrl);
            if (targetVideo.canPlayType("application/vnd.apple.mpegurl")) {
              connectNativeHls(fallbackHls);
            } else {
              connectHlsJs(fallbackHls);
            }
            return;
          }

          const answerSdp = await response.text();
          if (cancelled || !pc) return;
          await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

          // Watchdog: if WHEP produces no frames, switch to HLS. The deadline
          // scales with the connection — a fixed 3.5s abandons cellular
          // handshakes that were seconds from succeeding, dumping a viewer onto
          // HLS for no reason and paying the startup cost twice.
          // Reads the refs, not the state: the state captured here is whatever
          // it was when this timer was scheduled (false), so a state read would
          // fire the failover on EVERY camera 3.5s after a successful
          // handshake, tearing a healthy sub-second WHEP stream down onto HLS.
          setTimeout(() => {
            if (cancelled) return;
            const isSlotConnected =
              targetSlot === "A" ? streamConnectedARef.current : streamConnectedBRef.current;
            if (!isSlotConnected) {
              console.warn("[CameraPlayer] WHEP frame timeout, auto-failover to HLS");
              logCameraDebug(cameraLabel, "whep: 3.5s frame timeout, failing over to HLS");
              const fallbackHls = deriveHlsUrl(whepUrl);
              if (targetVideo.canPlayType("application/vnd.apple.mpegurl")) {
                connectNativeHls(fallbackHls);
              } else {
                connectHlsJs(fallbackHls);
              }
            }
          }, netProfileRef.current.whepFirstFrameMs);
        } catch (err) {
          console.warn("[CameraPlayer] WHEP error, falling back to HLS:", err);
          logCameraDebug(cameraLabel, `whep: threw — ${err instanceof Error ? err.message : String(err)}`);
          const fallbackHls = deriveHlsUrl(whepUrl);
          if (targetVideo.canPlayType("application/vnd.apple.mpegurl")) {
            connectNativeHls(fallbackHls);
          } else {
            connectHlsJs(fallbackHls);
          }
        }
      }

      // ── SMART ENGINE SELECTION ──
      const isAppleDevice = isIosOrSafari();
      const hasNativeHls = targetVideo.canPlayType("application/vnd.apple.mpegurl") !== "";
      logCameraDebug(
        cameraLabel,
        `engine select: isAppleDevice=${isAppleDevice} hasNativeHls=${hasNativeHls} ua=${
          typeof navigator !== "undefined" ? navigator.userAgent : "?"
        }`,
      );

      // Engine choice is a reachability decision, not a branding one.
      //
      // WHEP/WebRTC only connects when the viewer can reach the media
      // server's UDP port directly. MediaMTX advertises host candidates
      // only (no STUN reflexive, no TURN relay), so that works on the LAN
      // and on permissive networks, and silently never connects on
      // cellular, corporate wifi, or anywhere UDP is filtered. HLS is
      // plain HTTPS over TCP through the same proxy that serves the page,
      // so it reaches everyone — which is exactly why every large
      const isMobile = isMobileOrCellular();
      const hasHlsJs = Hls.isSupported();

      logCameraDebug(
        cameraLabel,
        `engine select: isMobile=${isMobile} isAppleDevice=${isAppleDevice} hasNativeHls=${hasNativeHls} hasHlsJs=${hasHlsJs}`,
      );

      // Mobile & Cellular devices MUST route directly to standard HTTPS HLS:
      // Cellular networks enforce Symmetric NAT / Carrier-Grade NAT (CGNAT) which
      // drops WebRTC UDP packets and chokes on raw 10 Mbps feeds.
      // HLS over TCP/HTTPS (Port 443) passes through every mobile carrier effortlessly.
      if (isMobile || isAppleDevice) {
        const fullHls = deriveHlsUrl(playbackUrl);
        const lowHls = deriveHlsLowUrl(playbackUrl);

        const attachHlsTarget = (urlToAttach: string) => {
          if (cancelled) return;
          if (hasNativeHls) {
            connectNativeHls(urlToAttach);
          } else if (hasHlsJs) {
            connectHlsJs(urlToAttach);
          } else {
            connectNativeHls(urlToAttach);
          }
        };

        attachHlsTarget(fullHls);
      } else if (playbackProtocol === "whep" || playbackUrl.includes("/whep")) {
        const whepUrl = deriveWhepUrl(playbackUrl);
        void connectWhep(whepUrl);
      } else if (hasNativeHls) {
        connectNativeHls(deriveHlsUrl(playbackUrl));
      } else {
        connectHlsJs(deriveHlsUrl(playbackUrl));
      }

      return () => {
        cancelled = true;
      };
    }, [hasSource, playbackUrl, playbackProtocol]);

    // Cleanup handles on unmount
    useEffect(() => {
      return () => {
        if (pcRefA.current) {
          pcRefA.current.close();
          pcRefA.current = null;
        }
        if (pcRefB.current) {
          pcRefB.current.close();
          pcRefB.current = null;
        }
        if (hlsRefA.current) {
          hlsRefA.current.destroy();
          hlsRefA.current = null;
        }
        if (hlsRefB.current) {
          hlsRefB.current.destroy();
          hlsRefB.current = null;
        }
      };
    }, []);

    const hasAnyConnectedStream =
      (activeBuffer === "A" && streamConnectedA) ||
      (activeBuffer === "B" && streamConnectedB);
    const isOffline =
      !awaitingSlot &&
      (!online || (!hasAnyConnectedStream && connectionFailed) || !hasSource);

    return (
      <div
        ref={playerContainerRef}
        className="relative h-full w-full overflow-hidden bg-black select-none cursor-pointer group"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {/* ── Preroll Loop (z-0, underneath everything) ──
            The reason this container isn't just bg-black. Recent footage of
            this exact room, looping muted, so a connecting or reconnecting
            player has something real behind the spinner. Both live buffers
            render above it at z-10 and hide it the moment frames arrive, so
            it never competes with the actual stream. */}
        {prerollLoopUrl && (
          <video
            key={prerollLoopUrl}
            src={prerollLoopUrl}
            className={`absolute inset-0 z-0 h-full w-full object-cover ${
              // Dimmed only when it is a backdrop for an arriving live stream.
              // While waiting for a slot it IS the picture, so show it fully.
              awaitingSlot ? "opacity-100" : "opacity-70"
            }`}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload={netProfile.preload}
            aria-hidden="true"
            tabIndex={-1}
            // A camera with no loop yet (archiving off, or a camera that has
            // not completed its first segment) 404s here. Remove the element
            // rather than leaving a broken <video> on the stack — the result
            // is the plain black background this replaced, which is the
            // correct fallback.
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}

        {/* ── Buffer Surface A ── */}
        <video
          ref={videoRefA}
          className={`${
            className ?? "absolute inset-0 h-full w-full object-cover"
          } transition-opacity duration-150 ${
            activeBuffer === "A" && streamConnectedA && !isOffline
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
          autoPlay
          muted={muted}
          playsInline
          webkit-playsinline="true"
        />

        {/* ── Buffer Surface B ── */}
        <video
          ref={videoRefB}
          className={`${
            className ?? "absolute inset-0 h-full w-full object-cover"
          } transition-opacity duration-150 ${
            activeBuffer === "B" && streamConnectedB && !isOffline
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
          autoPlay
          muted={muted}
          playsInline
          webkit-playsinline="true"
        />

        {/* Optional Embedded Live Edge HUD Badge */}
        {/* Clean, unobscured video canvas — floating LIVE badges removed for pristine presentation */}

        {/* Clean Standard Video Buffering Spinner (Truly transparent, no container box) */}
        {bufferingInfo.isBuffering && hasAnyConnectedStream && !isOffline && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none transition-opacity duration-150">
            <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] stroke-[2.5]" />
          </div>
        )}

        {/* Healthy camera, deliberately not connected: the link is too thin to
            carry every tile at once. Says so plainly rather than crying offline,
            and stays quiet so it reads as standby, not failure. */}
        {awaitingSlot && (
          <div className="absolute inset-0 z-20 flex select-none items-end justify-center p-2">
            {/* When a recent clip exists, THAT is the placeholder — a tile
                showing the room a moment ago is worth far more than a tile
                saying it is saving data, and it costs one short cached file
                instead of an open live connection. Only the label sits on top,
                so the preroll underneath stays visible. */}
            {!prerollLoopUrl && (
              <div className="absolute inset-0 bg-gradient-to-b from-[#141517] to-[#08080a]" />
            )}
            <div className="relative flex items-center gap-1.5 rounded bg-black/55 px-2 py-0.5 backdrop-blur-[2px]">
              <span
                className="text-[9px] font-black uppercase tracking-[0.16em] text-white/75"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Tap to watch
              </span>
              <span className="text-[8px] font-bold text-white/40">
                {prerollLoopUrl ? "recent clip" : "saving data"}
              </span>
            </div>
          </div>
        )}

        {/* Authentic Retro NO SIGNAL Screen when camera is offline or disconnected */}
        {isOffline && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#141517] via-[#0d0e10] to-[#080809] p-4 text-center select-none">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)] opacity-80" />

            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-red-500/30 bg-red-950/40 text-red-400 shadow-[0_0_15px_rgba(255,59,47,0.3)]">
                <CameraOff className="h-6 w-6" />
              </div>

              <div className="flex items-center gap-2 rounded border border-black/80 bg-black/90 px-3 py-1 shadow-inner">
                <span
                  className="h-2 w-2 rounded-full animate-ping"
                  style={{ backgroundColor: LED_RED, boxShadow: `0 0 8px ${LED_RED}` }}
                />
                <span
                  className="text-xs font-black tracking-widest uppercase"
                  style={{
                    color: LED_RED,
                    fontFamily: ACTIVE_THEME.fonts.dotMatrix,
                    textShadow: `0 0 6px rgba(255,59,47,0.8)`,
                  }}
                >
                  NO SIGNAL
                </span>
              </div>

              <p className="text-[11px] font-bold text-slate-400">
                Live Broadcast Feed Standby
              </p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConnectionFailed(false);
                  const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
                  if (activeVideo) {
                    activeVideo.load();
                    void activeVideo.play().catch(() => {});
                  }
                }}
                className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-950/50 text-[11px] font-bold text-red-300 hover:bg-red-900/60 hover:border-red-400 transition-all active:scale-95 shadow-[0_0_10px_rgba(255,59,47,0.2)]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reconnect Feed</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Scavenger / Waldo Hit Tactile Feedback (Zero UI until hit) ── */}
        {scavengerHit && (
          <div
            className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-1/2 animate-out fade-out zoom-out-95 duration-1000"
            style={{ left: `${scavengerHit.nx * 100}%`, top: `${scavengerHit.ny * 100}%` }}
          >
            <div className="flex flex-col items-center">
              <span className="h-12 w-12 rounded-full border-2 border-emerald-400 bg-emerald-500/20 animate-ping" />
              <span className="mt-1 rounded-lg bg-black/95 px-2.5 py-1 font-mono text-[11px] font-black text-emerald-400 border border-emerald-500/60 shadow-[0_0_15px_rgba(52,211,153,0.5)] whitespace-nowrap">
                🎯 {scavengerHit.label} (+{scavengerHit.xp} XP)
              </span>
            </div>
          </div>
        )}
      </div>
    );
  },
);

CameraPlayerInner.displayName = "CameraPlayerInner";

/**
 * The player, wrapped so a decode or engine crash can never propagate.
 *
 * Wrapped here rather than at each call site so the guarantee holds for every
 * usage, including ones added later: a throw inside a player takes out the
 * player, not the page around it.
 */
export const CameraPlayer = forwardRef<CameraPlayerHandle, CameraPlayerProps>(
  function CameraPlayer(props, ref) {
    return (
      <VideoErrorBoundary resetKey={props.playbackUrl ?? ""}>
        <CameraPlayerInner {...props} ref={ref} />
      </VideoErrorBoundary>
    );
  },
);

CameraPlayer.displayName = "CameraPlayer";

export default CameraPlayer;
