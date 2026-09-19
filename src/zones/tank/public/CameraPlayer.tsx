"use client";

// CameraPlayer — Universal Resilient Dual-Buffered Stream Player
// Multi-Protocol Engine: WebRTC (WHEP) + Native iOS WebKit HLS + HLS.js (MSE)
// Engineered for 50,000+ congruent viewers across iOS Safari, Android, Chrome, Firefox, Electron, Smart TVs, and WebViews.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { endWhepSession, whepSessionUrl } from "./whepSession";
import { TANK_HLS_STEADY, TANK_HLS_VIEWER } from "./hlsTuning";
import {
  catchUpPlaybackRate,
  whepLatencyFromStats,
  WHEP_SYNC_TARGET_SECONDS,
} from "./whepLatency";
import { detectNetworkProfile, getHydrationSafeNetworkProfile, subscribeToNetworkProfile, type NetworkProfile } from "./networkQuality";
import { useStreamSlot, useConnectDelay, type StreamPriority } from "./streamAdmission";
import { VideoErrorBoundary } from "./components/VideoErrorBoundary";
import { deriveHlsUrl, deriveHlsLowUrl, deriveWhepUrl, prefersLowRung } from "./playbackUrls";
import Hls from "hls.js";
import { CameraOff, VolumeX, Volume2, Maximize, Loader2, Wifi, WifiOff, RefreshCw, Zap, AlertTriangle } from "lucide-react";
import type { PlaybackProtocol } from "../contracts";
import { ACTIVE_THEME } from "../theme";
import { logCameraDebug } from "./cameraDebug";
import { hasNewDecodedPicture, readVideoPictureProbe } from "../obs/directorPlayback";
import { useGimbalVideoDriver } from "../director/useGimbalVideoDriver";
import type { VirtualPtzState } from "../director/ptzState";
import { useInvisibleTouchTelemetry, type TouchEventPayload } from "./useInvisibleTouchTelemetry";
import {
  hlsLevelForTankQuality,
  type TankPlayerQuality,
} from "./playerQuality";

function cameraLabelFromUrl(url: string): string {
  const match = url.match(/(?:cameras|obs)\/([^/?]+)/);
  if (match) {
    return match[1].replace(/-whep$/, "");
  }
  return url.slice(0, 24);
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

/**
 * How rough this stream's ride has actually been — real counters, not a
 * guess about the viewer's ISP. `bufferingInfo.retryCount` resets to 0 the
 * moment a stream recovers, which is right for deciding whether to retry
 * again but wrong for "has this camera been solid or flaky" — a camera that
 * drops and recovers every 30 seconds looks identical to one that's been
 * rock-solid the instant each drop clears. `reconnectCount` never resets for
 * the life of a given playbackUrl, so it answers that question instead.
 */
export type StreamStabilityInfo = {
  /** WHEP drops (pc.connectionState -> disconnected/failed) plus HLS engine
   *  recovery attempts, counted since this playbackUrl was first connected. */
  reconnectCount: number;
  isBuffering: boolean;
  bufferingReason: BufferingInfo["reason"] | null;
  lastEventAt: number | null;
};

export type CameraPlayerHandle = {
  /**
   * The video element currently on screen, for read-only frame sampling.
   *
   * Exists so the director console can run detection against footage it is
   * ALREADY decoding instead of opening a second stream per camera. Returns
   * null while the player holds no admitted stream or has not reached
   * readyState >= 2 — callers must treat that as "no frame this tick", never
   * as an error.
   *
   * Read-only by contract: `drawImage` off a playing video cannot disturb
   * playback. Nothing that mutates the element belongs behind this.
   */
  getActiveVideo: () => HTMLVideoElement | null;
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
  onStabilityChange?: (info: StreamStabilityInfo) => void;
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
   * Rendered on the director wall rather than to a viewer.
   *
   * Two differences, both because the wall is a monitoring surface: it uses
   * the steady buffer profile (eight tiles cannot hold the viewer profile's
   * four seconds without one always refilling), and it never draws the
   * buffering spinner. An operator judging which room to cut to, and a
   * detector sampling the same element, are both served by a frame that is
   * a little late over a spinner that is permanently up.
   */
  directorSurface?: boolean;
  /**
   * Short muted clip of this camera's recent footage, looped underneath the
   * live surfaces. It is what a viewer looks at while the stream negotiates,
   * reconnects, or buffers — instead of a black rectangle. Purely cosmetic:
   * it sits below both video buffers and is covered the instant real frames
   * arrive. See getCameraLoopUrl in server/archiveSegments.ts.
   */
  prerollLoopUrl?: string | null;
  videoStyle?: CSSProperties;
  /**
   * The Director's programme crop. Given, the player glides both live buffers
   * to it on the gimbal (director/useGimbalVideoDriver.ts) without re-rendering;
   * `ptzSnapKey` (the camera id) makes a cut land its crop instead of gliding.
   */
  ptzTarget?: VirtualPtzState | null;
  ptzSnapKey?: string | null;
  cameraSlug?: string;
  onTouchTap?: (payload: TouchEventPayload) => void;
  quality?: TankPlayerQuality;
};

const LED_RED = "#ff3b2f";

/**
 * Whether this browser can play an HLS playlist from a plain <video src>.
 *
 * NOT canPlayType("application/vnd.apple.mpegurl"): Chromium returns the
 * truthy string "maybe" for that and then fails to decode, so every branch
 * testing it sent Chrome down the native path, assigned the .m3u8 directly,
 * and got MEDIA_ERR_SRC_NOT_SUPPORTED — a black tile with no spinner and no
 * retry. Only Apple browsers genuinely do native HLS.
 */
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


function getIceServers(): RTCIceServer[] {
  const customTurnUrl = process.env.NEXT_PUBLIC_TANK_TURN_URL;
  const customTurnUser = process.env.NEXT_PUBLIC_TANK_TURN_USERNAME;
  const customTurnPass = process.env.NEXT_PUBLIC_TANK_TURN_CREDENTIAL;

  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:stun.cloudflare.com:3478"] },
  ];

  if (customTurnUrl) {
    servers.push({
      urls: customTurnUrl.split(",").map((u) => u.trim()),
      ...(customTurnUser ? { username: customTurnUser } : {}),
      ...(customTurnPass ? { credential: customTurnPass } : {}),
    });
  } else {
    // Public fallback TURN-over-TLS/TCP relay for strict UDP-filtered corporate and cellular firewalls
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return servers;
}

/**
 * Wait for ICE candidates that are actually worth sending — not for gathering
 * to finish.
 *
 * This used to wait for `iceGatheringState === "complete"` with a 1500 ms cap,
 * which in practice meant EVERY connection paid the full 1500 ms. Gathering
 * cannot complete until every configured server has answered, and the server
 * list includes three public TURN relays (openrelay.metered.ca, one of them
 * TURNS over TCP). A TLS handshake to a public relay does not finish in 1500 ms,
 * so the timeout was the outcome every single time — a flat 1.5 s added to every
 * room switch, on top of the stability gate, which is most of why switching
 * rooms felt like it took forever.
 *
 * The candidate we actually need arrives almost immediately: for a viewer on the
 * LAN a host candidate is available in single-digit milliseconds, and STUN
 * reflexive candidates typically land within ~100-200 ms. So resolve shortly
 * after the first candidate instead, and let gathering continue in the
 * background.
 *
 * THE TRADE, stated plainly: relay candidates will usually not make it into the
 * offer, so a viewer behind a strict UDP-filtering firewall loses the TURN path
 * on this attempt. That is survivable specifically because the WHEP watchdog
 * below already fails over to HLS when no frames arrive, and HLS reaches those
 * viewers over ordinary TCP/443. Trading a rare relay connection for 1.2 s off
 * every single switch is the right side of that bargain — but it IS a trade,
 * not a free win.
 */
function waitForUsableIceCandidates(
  pc: RTCPeerConnection,
  opts: { graceMs: number; timeoutMs: number },
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      pc.removeEventListener("icecandidate", onCandidate);
      if (graceTimer) clearTimeout(graceTimer);
      clearTimeout(hardTimer);
      resolve();
    };

    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };

    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      // A null candidate means gathering ended on its own.
      if (!event.candidate) return finish();
      // First real candidate: give siblings a brief window to arrive, then go.
      if (!graceTimer) graceTimer = setTimeout(finish, opts.graceMs);
    };

    pc.addEventListener("icegatheringstatechange", onChange);
    pc.addEventListener("icecandidate", onCandidate);
    const hardTimer = setTimeout(finish, opts.timeoutMs);
  });
}

/**
 * True while the container actually occupies space on the page.
 *
 * WHY THIS EXISTS
 * ---------------
 * The landing page renders BOTH grids and lets CSS pick one: the desktop
 * roster is `hidden lg:flex`, the mobile grid is `block lg:hidden`. CSS hides
 * a subtree; it does not unmount it. So on a desktop the mobile grid stayed
 * mounted and every one of its players kept a live decoder running behind
 * `display:none`.
 *
 * Measured on tank.unenter.live: 8 zero-sized video elements decoding, one of
 * them 13,139 frames deep, alongside 14 visible ones — 22 concurrent decoders
 * for 8 tiles a viewer could see. That is what exhausted the decode pool and
 * left the visible tiles spinning.
 *
 * Deliberately keyed on box size, not on intersection: a tile scrolled out of
 * view still has a box and keeps its stream, so scrolling never costs a
 * reconnect. Only a genuinely hidden subtree (zero box) releases its slot.
 */
function useOccupiesLayout(ref: { current: HTMLElement | null }): boolean {
  // No ResizeObserver (jsdom, SSR) means no way to observe hiding — assume
  // visible so a missing API can never silently blank every player.
  const [visible, setVisible] = useState(
    () => typeof ResizeObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      setVisible(r.width > 0 && r.height > 0);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return visible;
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
      onStabilityChange,
      onWatching,
      onClick,
      onDoubleClick,
      showLiveBadge = false,
      prerollLoopUrl = null,
      videoStyle,
      ptzTarget,
      ptzSnapKey = null,
      cameraSlug: explicitCameraSlug,
      onTouchTap,
      quality,
      // Default to hero: an unmarked player is whatever the caller is showing
      // front and centre, and silently downgrading it would be worse than
      // spending a slot.
      priority = "hero",
      directorSurface = false,
    },
    ref,
  ) {
    const videoRefA = useRef<HTMLVideoElement | null>(null);
    const videoRefB = useRef<HTMLVideoElement | null>(null);
    const drivesPtz = ptzTarget !== undefined;
    useGimbalVideoDriver(ptzTarget ?? null, () => (drivesPtz ? [videoRefA.current, videoRefB.current] : []), {
      snapKey: ptzSnapKey,
    });

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
    const [netProfile, setNetProfile] = useState<NetworkProfile>(() => getHydrationSafeNetworkProfile());
    const netProfileRef = useRef(netProfile);
    netProfileRef.current = netProfile;
    useEffect(() => {
      setNetProfile(detectNetworkProfile());
      return subscribeToNetworkProfile(setNetProfile);
    }, []);
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

    // Counts real drops for THIS playbackUrl — never reset by a recovery, only
    // by a genuinely new source (see the [playbackUrl] reset effect below).
    const [reconnectCount, setReconnectCount] = useState(0);
    const wasConnectedRef = useRef(false);

    useEffect(() => {
      setReconnectCount(0);
      wasConnectedRef.current = false;
      setBufferingInfo({
        isBuffering: false,
        reason: "buffering",
        detail: "",
        stalledSince: null,
        retryCount: 0,
      });
    }, [playbackUrl]);

    useEffect(() => {
      onStabilityChange?.({
        reconnectCount,
        isBuffering: bufferingInfo.isBuffering,
        bufferingReason: bufferingInfo.isBuffering ? bufferingInfo.reason : null,
        lastEventAt: bufferingInfo.stalledSince,
      });
      // onStabilityChange is a caller-supplied setter; including it would
      // re-fire this on every parent render, not just on a real change here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reconnectCount, bufferingInfo]);

    const [isLiveStable, setIsLiveStable] = useState(false);
    const [userRequestedWatch, setUserRequestedWatch] = useState(false);

    // Declared here rather than beside the other element refs because the
    // admission calculation below depends on it.
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const occupiesLayout = useOccupiesLayout(playerContainerRef);

    const effectivePriority: StreamPriority = userRequestedWatch ? "hero" : priority;

    // A thumbnail takes the CHEAP rung, not merely a later turn at the
    // expensive one. Every grid tile was handed the source URL, so the public
    // wall opened six 3840x2160 decoders to paint tiles a few hundred pixels
    // wide -- nine times the pixels needed, and more than the decode pool has.
    // The 720p rung is already published and already advertised by
    // /api/tank/cameras; nothing consumed it (measured: 11 full-rung playlist
    // fetches, zero low-rung). An explicit `quality` from the caller still
    // wins, so the hero quality control keeps working.
    const effectiveQuality: TankPlayerQuality =
      quality ?? (effectivePriority === "thumbnail" ? "low" : "high");

    // A player inside a display:none subtree must not hold a decoder.
    const wantsStream =
      Boolean(playbackUrl) &&
      playbackProtocol !== "none" &&
      online &&
      occupiesLayout;

    // Wanting to stream and being allowed to are different things when
    // bandwidth is scarce. Everything downstream keys off hasSource, so a
    // player without a slot simply never opens a connection.
    const admitted = useStreamSlot(effectivePriority, wantsStream);

    // Being allowed to connect and being FIRST to connect are also different
    // things — see useConnectDelay. A thumbnail can be admitted immediately
    // and still wait a short, deliberate beat before it starts negotiating,
    // so the hero isn't racing it for ICE/decode time.
    const connectDelayMs = useConnectDelay(effectivePriority);
    const [staggerElapsed, setStaggerElapsed] = useState(connectDelayMs === 0);
    useEffect(() => {
      if (connectDelayMs === 0) {
        setStaggerElapsed(true);
        return;
      }
      setStaggerElapsed(false);
      const timer = setTimeout(() => setStaggerElapsed(true), connectDelayMs);
      return () => clearTimeout(timer);
    }, [connectDelayMs]);

    const hasSource = wantsStream && admitted && staggerElapsed;

    // Deliberately holding back is not a fault, whether that's no slot yet or
    // a thumbnail still in its stagger window. Without this distinction a
    // bandwidth-limited grid would show six red NO SIGNAL alarms for six
    // perfectly healthy cameras, which reads as "the site is broken".
    const awaitingSlot = wantsStream && (!admitted || !staggerElapsed);

    // Latest measured WHEP jitter-buffer delay, in seconds. Null until the
    // first frame is emitted — see whepLatency.ts on why that is not zero.
    const whepLatencyRef = useRef<number | null>(null);
    const pcRefA = useRef<RTCPeerConnection | null>(null);
    const pcRefB = useRef<RTCPeerConnection | null>(null);
    // WHEP session resource URLs, from each POST's Location header.
    //
    // A WHEP session ends when the client DELETEs it. This player never did,
    // and pc.close() only drops the local end — MediaMTX holds the reader until
    // ICE/DTLS time out tens of seconds later. Measured 2026-09-12: three
    // cameras each carrying two webRTCSessions while only one room was being
    // watched. Every fast room change left a live reader behind, and the cost
    // lands on the shared MediaMTX rather than in this tab, which is why
    // switching quickly degraded the OBS scene too.
    const whepSessionRefA = useRef<string | null>(null);
    const whepSessionRefB = useRef<string | null>(null);
    const hlsRefA = useRef<Hls | null>(null);
    const hlsRefB = useRef<Hls | null>(null);

    const cameraSlug = explicitCameraSlug || (playbackUrl ? cameraLabelFromUrl(playbackUrl) : "director");

    useInvisibleTouchTelemetry(playerContainerRef, {
      enabled: true,
      camSlug: cameraSlug,
      roomId: cameraSlug,
      onTouchTap,
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
        // A PLAYING WHEP tile used to report latencySec: 0 unconditionally, so
        // the drift check below could never fire and nothing ever corrected a
        // grid tile. A WebRTC jitter buffer grows under loss and never shrinks
        // on its own — independently per tile — which is how six cameras end up
        // showing six different burned-in clocks.
        const measured = whepLatencyRef.current;
        const liveLatency = measured !== null ? measured : 0;
        return {
          isLive: !isPaused && elapsedSincePause <= 2 && liveLatency < 2,
          latencySec: isPaused ? elapsedSincePause : liveLatency,
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
      getActiveVideo: () => {
        const activeVideo = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
        if (!activeVideo) return null;
        // readyState < 2 means no decoded frame yet; handing that back would
        // make the caller sample a blank element and report an empty room.
        if (activeVideo.readyState < 2) return null;
        if (!activeVideo.videoWidth || !activeVideo.videoHeight) return null;
        return activeVideo;
      },
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

    // Audio follows the on-air buffer: whichever buffer is active gets sound, the other is silent
    useEffect(() => {
      const onAir = activeBuffer === "A" ? videoRefA.current : videoRefB.current;
      const offAir = activeBuffer === "A" ? videoRefB.current : videoRefA.current;
      if (offAir) {
        offAir.muted = true;
        offAir.defaultMuted = true;
        offAir.volume = 0;
      }
      if (onAir) {
        onAir.muted = muted;
        onAir.defaultMuted = muted;
        onAir.volume = volume;
      }
    }, [activeBuffer, muted, volume]);

    // Periodic stream telemetry beaconing (every 30s during active playback).
    //
    // No client-measured bitrate exists anywhere in this component — WHEP/HLS
    // don't expose one cheaply — so bitrateKbps is left out rather than
    // invented. reconnectCount (real WHEP drops + HLS recovery attempts,
    // tracked above) is what this table's stall_count actually wants: real
    // rough-ride evidence, not a guess.
    useEffect(() => {
      if (!playbackUrl) return;
      const interval = setInterval(() => {
        const cameraId = cameraLabelFromUrl(playbackUrl);
        const protocol = activeEngine === "whep" ? "webrtc" : "hls";
        const latencyMs = liveEdgeInfo ? Math.round(liveEdgeInfo.latencySec * 1000) : undefined;
        void fetch("/api/tank/stream-telemetry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cameraId, protocol, latencyMs, stallCount: reconnectCount }),
          keepalive: true,
        }).catch(() => {});
      }, 30000);
      return () => clearInterval(interval);
    }, [playbackUrl, activeEngine, liveEdgeInfo, reconnectCount]);

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
        // If time is advancing normally and video is playing, clear buffering state
        if (activeVideo && !activeVideo.paused && activeVideo.readyState >= 2) {
          setBufferingInfo((prev) => {
            if (!prev.isBuffering) return prev;
            return {
              ...prev,
              isBuffering: false,
              stalledSince: null,
            };
          });
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

        // 1. Unsync Auto-Snap: WHEP should never sit behind live — sub-second
        // is the whole point, so >4s there really is broken. HLS is not the
        // same story: every source's actual keyframe interval is ~4s (both
        // OBS and real house cameras confirmed live 2026-08-22 — MediaMTX's
        // hlsSegmentDuration: 2s in mediamtx.yml is only a target, it can't
        // cut a segment without a keyframe), so hls.js/native HLS sitting
        // several seconds behind live is normal, healthy buffering, not
        // drift. Applying the WHEP threshold here meant latencySec almost
        // never dropped below 4s, so this fired on nearly every tick and
        // fought hls.js's own buffering — that fight WAS the stutter.
        const driftThresholdSec =
          activeEngine === "whep" ? 4.0 : Math.max(12, netProfileRef.current.liveEdgeTargetSeconds * 3);
        if (info.latencySec > driftThresholdSec) {
          const cameraLabel = playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown";
          logCameraDebug(
            cameraLabel,
            `autonomous sync: drift detected (latency=${info.latencySec}s > ${driftThresholdSec}s) — auto-snapping to live edge`,
          );
          snapToLiveEdge();
          return;
        }

        // 2. Micro-Drift Dynamic Speed Catchup:
        // If slightly behind live edge (1.5s to 4.0s), subtly accelerate to 1.12x so the viewer seamlessly catches up
        // WHEP: measure, then ease back. Seeking a live WebRTC stream is not
        // possible, so playing fractionally fast and letting the jitter buffer
        // drain is the only gentle lever. Sampled here rather than on its own
        // timer so it shares this tick's cadence.
        if (activeEngine === "whep") {
          const pc = activeBuffer === "A" ? pcRefA.current : pcRefB.current;
          if (pc) {
            void pc
              .getStats()
              .then((report) => {
                whepLatencyRef.current = whepLatencyFromStats(
                  report as unknown as Iterable<{ type?: string }>,
                );
              })
              .catch(() => {
                // A closed or renegotiating connection throws here. Leaving the
                // previous reading stands is better than treating it as 0 and
                // declaring the tile perfectly in sync.
              });
          }
          if (!activeVideo.paused) {
            const rate = catchUpPlaybackRate(whepLatencyRef.current);
            if (Math.abs(activeVideo.playbackRate - rate) > 0.001) {
              activeVideo.playbackRate = rate;
            }
          }
        }

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

    // ── REVEAL SAFETY NET ──
    //
    // `isLiveStable` has exactly one writer: promoteToLive(), which is guarded
    // by the connect effect's `cancelled` flag. If that effect re-runs while
    // the verification window is open — a reconnect, a protocol failover, a
    // camera swap — the pending promotion is cancelled and NOTHING re-arms it.
    // The stream then plays perfectly, forever, behind an opaque preroll clip:
    // the worst possible failure, because every other signal says it is fine.
    //
    // So the reveal does not depend solely on that path. If the active buffer
    // is demonstrably playing, it gets shown, whatever happened upstream.
    useEffect(() => {
      if (isLiveStable || !hasSource) return;

      let lastA = -1;
      let lastB = -1;
      const check = setInterval(() => {
        const vA = videoRefA.current;
        const vB = videoRefB.current;
        const tA = vA?.currentTime || 0;
        const tB = vB?.currentTime || 0;

        if (vB && lastB >= 0 && tB > lastB + 0.05 && vB.readyState >= 3 && !vB.paused) {
          logCameraDebug(
            playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown",
            "reveal safety net: buffer B is playing but was never promoted — revealing",
          );
          setActiveBuffer("B");
          setStreamConnectedB(true);
          streamConnectedBRef.current = true;
          setIsLiveStable(true);
          setBufferingInfo({
            isBuffering: false,
            reason: "buffering",
            detail: "",
            stalledSince: null,
            retryCount: 0,
          });
        } else if (vA && lastA >= 0 && tA > lastA + 0.05 && vA.readyState >= 3 && !vA.paused) {
          logCameraDebug(
            playbackUrl ? cameraLabelFromUrl(playbackUrl) : "unknown",
            "reveal safety net: buffer A is playing but was never promoted — revealing",
          );
          setActiveBuffer("A");
          setStreamConnectedA(true);
          streamConnectedARef.current = true;
          setIsLiveStable(true);
          setBufferingInfo({
            isBuffering: false,
            reason: "buffering",
            detail: "",
            stalledSince: null,
            retryCount: 0,
          });
        }
        lastA = tA;
        lastB = tB;
      }, 1000);

      return () => clearInterval(check);
    }, [isLiveStable, hasSource, playbackUrl]);

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
          setBufferingInfo((prev) => {
            if (!prev.isBuffering) return prev;
            return { ...prev, isBuffering: false, stalledSince: null };
          });
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
        setReconnectCount((n) => n + 1);
        // Same re-arm as the WHEP disconnect/failed branches above — this
        // only fires once buffered data has genuinely stopped growing (the
        // "stuck but fed" checks above already ruled out ordinary
        // rebuffering), so the picture really has frozen and the preroll
        // loop should cover it rather than leaving a static last frame up.
        setIsLiveStable(false);
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
      // connectNativeHls registers 5 element listeners plus a document-level
      // `visibilitychange` listener and never removed any of them — a real,
      // unbounded leak: it's called from every native-HLS fallback branch
      // (including re-entrantly within one connect cycle), and this whole
      // effect re-runs on every room switch / reconnect for the life of the
      // page. Confirmed 2026-08-25 by grep: zero matching removeEventListener
      // calls existed anywhere in this file. The document-level listener in
      // particular can never be garbage-collected on its own since document
      // itself never goes away — each stale closure keeps its own targetVideo
      // and retry state alive too. This is the exact class of "excessive
      // client memory pressure / lifecycle-resume leakage" the Brave Memory
      // Saver reproduction pointed at (vault/Core/
      // tank-ios-safari-persisted-site-data-forever-load.md).
      let detachNativeHlsListeners: (() => void) | null = null;
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
        if (cancelled || !targetVideo) return;
        if (targetSlot === "A") {
          setStreamConnectedA(true); streamConnectedARef.current = true;
        } else {
          setStreamConnectedB(true); streamConnectedBRef.current = true;
        }
        setConnectionFailed(false);

        // ── Live Stability Verification Gate ────────────────────
        // Resolve as soon as real decoded picture is confirmed.
        let verificationStart = performance.now();
        let initialTime = targetVideo.currentTime;
        let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        const baseline = readVideoPictureProbe(targetVideo);

        const cleanupStabilityListeners = () => {
          if (stabilityTimer) {
            clearTimeout(stabilityTimer);
            stabilityTimer = null;
          }
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          targetVideo.removeEventListener("waiting", onStallDuringWarmup);
          targetVideo.removeEventListener("stalled", onStallDuringWarmup);
          targetVideo.removeEventListener("timeupdate", checkStabilityProgress);
        };

        const promoteToLive = () => {
          if (cancelled) return;
          cleanupStabilityListeners();
          setActiveBuffer(targetSlot);
          setIsLiveStable(true);
          setBufferingInfo({
            isBuffering: false,
            reason: "buffering",
            detail: "",
            stalledSince: null,
            retryCount: 0,
          });

          // Teardown the outgoing buffer cleanly
          const outgoingSlot = targetSlot === "A" ? "B" : "A";
          const outgoingVideo = targetSlot === "A" ? videoRefB.current : videoRefA.current;
          const outgoingSessionRef = targetSlot === "A" ? whepSessionRefB : whepSessionRefA;
          endWhepSession(outgoingSessionRef);
          if (outgoingSlot === "B") {
            if (pcRefB.current) { pcRefB.current.close(); pcRefB.current = null; }
            if (hlsRefB.current) { hlsRefB.current.destroy(); hlsRefB.current = null; }
            setStreamConnectedB(false); streamConnectedBRef.current = false;
          } else {
            if (pcRefA.current) { pcRefA.current.close(); pcRefA.current = null; }
            if (hlsRefA.current) { hlsRefA.current.destroy(); hlsRefA.current = null; }
            setStreamConnectedA(false); streamConnectedARef.current = false;
          }
          if (outgoingVideo) {
            outgoingVideo.pause();
            outgoingVideo.srcObject = null;
            outgoingVideo.removeAttribute("src");
          }

          onWatching?.();
          logCameraDebug(cameraLabel, `FRAME READY & STABLE — slot ${targetSlot} verified live`);
        };

        const onStallDuringWarmup = () => {
          if (cancelled) return;
          const currentProbe = readVideoPictureProbe(targetVideo);
          if (hasNewDecodedPicture(baseline, currentProbe)) {
            promoteToLive();
          }
        };

        const checkStabilityProgress = () => {
          if (cancelled) return;
          const currentProbe = readVideoPictureProbe(targetVideo);
          if (hasNewDecodedPicture(baseline, currentProbe)) {
            promoteToLive();
            return;
          }
          const elapsed = performance.now() - verificationStart;
          const playheadAdvanced = targetVideo.currentTime - initialTime;
          if (elapsed >= 300 && playheadAdvanced >= 0.15) {
            promoteToLive();
          }
        };

        const deadlineReached = () => {
          if (cancelled) return;
          const currentProbe = readVideoPictureProbe(targetVideo);
          if (
            hasNewDecodedPicture(baseline, currentProbe) ||
            targetVideo.currentTime - initialTime >= 0.1 ||
            targetVideo.readyState >= 2
          ) {
            promoteToLive();
            return;
          }
          verificationStart = performance.now();
          initialTime = targetVideo.currentTime;
          stabilityTimer = setTimeout(deadlineReached, 600);
        };

        targetVideo.addEventListener("waiting", onStallDuringWarmup);
        targetVideo.addEventListener("stalled", onStallDuringWarmup);
        targetVideo.addEventListener("timeupdate", checkStabilityProgress);
        pollTimer = setInterval(checkStabilityProgress, 100);
        stabilityTimer = setTimeout(deadlineReached, 1200);

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
        // Called from several fallback branches and can re-enter within a
        // single connect cycle (e.g. transcode path fails -> direct path
        // retried) — detach whatever this same connect cycle registered
        // last time before adding a fresh set, instead of stacking both.
        detachNativeHlsListeners?.();
        detachNativeHlsListeners = null;
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

          // If the transcode path failed, immediately attempt the direct ingest path on retry 1
          if (nativeHlsRetries === 0 && hlsUrl.includes("-hls")) {
            const directHls = deriveHlsUrl(hlsUrl, true);
            if (directHls !== hlsUrl) {
              logCameraDebug(cameraLabel, `native-hls: failover to direct path ${directHls}`);
              nativeHlsRetries += 1;
              targetVideo.src = directHls;
              targetVideo.load();
              void targetVideo.play().catch(() => {});
              return;
            }
          }

          if (nativeHlsRetries >= MAX_NATIVE_HLS_RETRIES) {
            logCameraDebug(cameraLabel, "native-hls: retries exhausted");
            setConnectionFailed(true);
            setBufferingInfo((prev) => ({ ...prev, isBuffering: false }));
            targetVideo.removeAttribute("src");
            targetVideo.load();
            return;
          }
          nativeHlsRetries += 1;
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

        detachNativeHlsListeners = () => {
          if (stallTimeout) clearTimeout(stallTimeout);
          targetVideo.removeEventListener("error", onVideoError);
          targetVideo.removeEventListener("stalled", onStalled);
          targetVideo.removeEventListener("waiting", onWaiting);
          targetVideo.removeEventListener("playing", onPlaying);
          targetVideo.removeEventListener("canplay", onCanPlay);
          targetVideo.removeEventListener("loadstart", onLoadStart);
          document.removeEventListener("visibilitychange", onVisibilityChange);
        };

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

      // Retries across reconnect attempts, so it must NOT live inside
      // connectHlsJs — a counter reset by its own retry is an infinite loop.
      let hlsFatalRetries = 0;
      const MAX_HLS_FATAL_RETRIES = 6;

      // Protocol 2: HLS.js with MSE (Media Source Extensions for Chrome/Firefox/Android)
      function connectHlsJs(hlsUrl: string) {
        if (cancelled || !targetVideo) return;
        setActiveEngine("hls-js");
        logCameraDebug(cameraLabel, `hls-js: attaching src=${hlsUrl}, isSupported=${Hls.isSupported()}`);

        // Guards the direct-ingest fallback below to fire at most once per
        // connect cycle. Without this, a manifest error on the fallback path
        // itself re-derives and reloads the SAME url forever — hlsUrl is the
        // original -hls param, never updated, so `directHls !== hlsUrl` stays
        // true on every subsequent error. Confirmed live 2026-08-23: one
        // camera's fallback path errored persistently and produced 270+
        // unthrottled manifest requests in under a minute, which was also
        // starving the shared proxy enough to trip unrelated Tank API calls
        // into their own 502s.
        let firedDirectFallback = false;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // Shared with the programme source and every other viewer surface,
            // so two rooms on screen at once are the same distance behind live.
            ...(directorSurface ? TANK_HLS_STEADY : TANK_HLS_VIEWER),
            maxBufferHole: 0.5,
            startFragPrefetch: true,
            testBandwidth: false,
            fragLoadingTimeOut: 4500,
            manifestLoadingTimeOut: 4500,
            backBufferLength: 4,
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.2,
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
            const selectedLevel = hlsLevelForTankQuality(hls.levels, effectiveQuality);
            if (selectedLevel >= 0) {
              hls.autoLevelCapping = selectedLevel;
              hls.currentLevel = selectedLevel;
              hls.nextLevel = selectedLevel;
            }
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
            // instantly retry loading the native direct path. Only once per
            // connect cycle — see firedDirectFallback above.
            if (
              !firedDirectFallback &&
              (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT)
            ) {
              const directHls = deriveHlsUrl(hlsUrl, true);
              if (directHls !== hlsUrl) {
                firedDirectFallback = true;
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
                  // A grid tile has nobody to click it. This used to stop
                  // here forever, which is why a wall left open went black
                  // one tile at a time and only came back when the operator
                  // clicked each one — clicking re-runs this whole effect.
                  //
                  // Rebuild the player instead. Bounded, so a genuinely dead
                  // camera still settles into the failed state rather than
                  // reconnecting forever.
                  if (hlsFatalRetries < MAX_HLS_FATAL_RETRIES) {
                    hlsFatalRetries += 1;
                    const delay = Math.min(15000, 2000 * hlsFatalRetries);
                    logCameraDebug(
                      cameraLabel,
                      `hls-js: rebuilding in ${delay}ms (attempt ${hlsFatalRetries})`,
                    );
                    try { hls.destroy(); } catch { /* already gone */ }
                    setTimeout(() => {
                      if (!cancelled) connectHlsJs(hlsUrl);
                    }, delay);
                  } else {
                    setConnectionFailed(true);
                  }
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
            iceServers: getIceServers(),
            bundlePolicy: "max-bundle",
            iceCandidatePoolSize: 1,
          });
          pc.addEventListener("connectionstatechange", () => {
            logCameraDebug(cameraLabel, `whep: pc.connectionState=${pc.connectionState}`);
            if (pc.connectionState === "connecting") {
              if (!hasAnyConnectedStream || targetSlot === activeBuffer) {
                setBufferingInfo({
                  isBuffering: true,
                  reason: "reconnecting",
                  detail: "Connecting real-time WebRTC link...",
                  stalledSince: Date.now(),
                  retryCount: 0,
                });
              }
            } else if (pc.connectionState === "failed") {
              logCameraDebug(cameraLabel, "whep: connection failed (UDP likely filtered), triggering immediate HLS failover");
              if (wasConnectedRef.current) {
                wasConnectedRef.current = false;
                setReconnectCount((n) => n + 1);
                setIsLiveStable(false);
              }
              const fallbackHls = deriveHlsUrl(whepUrl);
              if (isIosOrSafari()) {
                connectNativeHls(fallbackHls);
              } else {
                connectHlsJs(fallbackHls);
              }
            } else if (pc.connectionState === "disconnected") {
              if (wasConnectedRef.current) {
                wasConnectedRef.current = false;
                setReconnectCount((n) => n + 1);
                setIsLiveStable(false);
              }
              if (!hasAnyConnectedStream || targetSlot === activeBuffer) {
                setBufferingInfo((prev) => ({
                  isBuffering: true,
                  reason: "reconnecting",
                  detail: "WebRTC disconnected • Recovering stream...",
                  stalledSince: prev.stalledSince || Date.now(),
                  retryCount: prev.retryCount + 1,
                }));
              }
            } else if (pc.connectionState === "connected") {
              wasConnectedRef.current = true;
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

          const inboundStream = new MediaStream();
          targetVideo.srcObject = inboundStream;

          pc.ontrack = (event) => {
            logCameraDebug(cameraLabel, `whep: ontrack fired, kind=${event.track.kind}`);
            if (cancelled || !targetVideo) return;
            const tracks = event.streams.flatMap((stream) => stream.getTracks());
            if (tracks.length === 0) tracks.push(event.track);
            for (const track of tracks) {
              if (!inboundStream.getTrackById(track.id)) inboundStream.addTrack(track);
            }
            targetVideo.muted = true;
            targetVideo.defaultMuted = true;
            void targetVideo.play().catch(() => {});
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          // Send as soon as we have something usable; do not wait out the
          // public TURN relays. See waitForUsableIceCandidates.
          await waitForUsableIceCandidates(pc, { graceMs: 250, timeoutMs: 1500 });
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

          // Remember the session so it can be released. Relative Locations are
          // legal, hence resolving against the request URL.
          const whepSessionRef = targetSlot === "A" ? whepSessionRefA : whepSessionRefB;
          whepSessionRef.current = whepSessionUrl(response, whepUrl);
          // Superseded while the handshake was in flight — release immediately
          // rather than leaving MediaMTX holding a reader nobody will read.
          if (cancelled) {
            endWhepSession(whepSessionRef);
            return;
          }

          if (!response.ok) {
            console.warn("[CameraPlayer] WHEP handshake rejected, falling back to HLS:", response.status);
            // Instant seamless failover to HLS
            const fallbackHls = deriveHlsUrl(whepUrl);
            if (isIosOrSafari()) {
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
          //
          // OBS rooms can arrive with broadcaster-controlled GOPs much longer
          // than Tank's camera rungs. The live Admin feed measured 8.33s
          // between IDRs on 2026-08-24. Abandoning WHEP at the normal camera
          // deadline sent the viewer onto an 8s HLS ladder just before the
          // WebRTC frame would have arrived, turning one wait into two. Keep
          // the fast camera deadline, but give an OBS sibling one full long-GOP
          // window while older publishers/configurations age out.
          const firstFrameDeadlineMs = whepUrl.includes("/obs/")
            ? Math.max(10_000, netProfileRef.current.whepFirstFrameMs)
            : netProfileRef.current.whepFirstFrameMs;
          setTimeout(() => {
            if (cancelled) return;
            const isSlotConnected =
              targetSlot === "A" ? streamConnectedARef.current : streamConnectedBRef.current;
            if (!isSlotConnected) {
              console.warn("[CameraPlayer] WHEP frame timeout, auto-failover to HLS");
              logCameraDebug(cameraLabel, `whep: ${firstFrameDeadlineMs}ms frame timeout, failing over to HLS`);
              const fallbackHls = deriveHlsUrl(whepUrl);
              if (isIosOrSafari()) {
                connectNativeHls(fallbackHls);
              } else {
                connectHlsJs(fallbackHls);
              }
            }
          }, firstFrameDeadlineMs);
        } catch (err) {
          console.warn("[CameraPlayer] WHEP error, falling back to HLS:", err);
          logCameraDebug(cameraLabel, `whep: threw — ${err instanceof Error ? err.message : String(err)}`);
          const fallbackHls = deriveHlsUrl(whepUrl);
          if (isIosOrSafari()) {
            connectNativeHls(fallbackHls);
          } else {
            connectHlsJs(fallbackHls);
          }
        }
      }

      // ── SMART ENGINE SELECTION ──
      const isAppleDevice = isIosOrSafari();
      const hasNativeHls = isIosOrSafari();
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
      if (effectiveQuality !== "high") {
        const hlsTarget =
          effectiveQuality === "low"
            ? deriveHlsLowUrl(playbackUrl)
            : deriveHlsUrl(playbackUrl);
        if (hasNativeHls) {
          connectNativeHls(hlsTarget);
        } else if (hasHlsJs) {
          connectHlsJs(hlsTarget);
        } else {
          connectNativeHls(hlsTarget);
        }
      } else if (isMobile || isAppleDevice) {
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
        detachNativeHlsListeners?.();
        // If this connection attempt was cancelled before it promoted to live
        // (e.g. rapid camera cuts or director handoffs), release only the slot
        // it was preparing. Never tear down the on-air buffer that is actively
        // holding the live video feed for the viewer.
        const pendingSessionRef = targetSlot === "A" ? whepSessionRefA : whepSessionRefB;
        endWhepSession(pendingSessionRef);
        if (targetSlot === "A" && (activeBuffer !== "A" || !streamConnectedARef.current)) {
          if (pcRefA.current) {
            pcRefA.current.close();
            pcRefA.current = null;
          }
          if (hlsRefA.current) {
            hlsRefA.current.destroy();
            hlsRefA.current = null;
          }
          setStreamConnectedA(false);
          streamConnectedARef.current = false;
        } else if (targetSlot === "B" && (activeBuffer !== "B" || !streamConnectedBRef.current)) {
          if (pcRefB.current) {
            pcRefB.current.close();
            pcRefB.current = null;
          }
          if (hlsRefB.current) {
            hlsRefB.current.destroy();
            hlsRefB.current = null;
          }
          setStreamConnectedB(false);
          streamConnectedBRef.current = false;
        }
      };
    }, [hasSource, playbackUrl, playbackProtocol, effectiveQuality]);

    // Cleanup handles on unmount
    useEffect(() => {
      return () => {
        endWhepSession(whepSessionRefA);
        endWhepSession(whepSessionRefB);
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

    // Every tile — hero or thumbnail — renders the preroll loop when one is
    // available. Was briefly restricted to hero-only (2026-09-01, see the
    // comment below) after a HAR capture showed six simultaneous thumbnail
    // loads starving the real live feed. Reverted 2026-09-02: that capture
    // was against the OLD uncached, ~120s-source clips; roomLoopRefresher.ts
    // now uploads with `cacheControl: immutable` and a content-addressed
    // (timestamped) filename per refresh, so a repeat view of the same clip
    // is served from cache, not re-fetched, and a fresh one is a few MB, not
    // tens. A blank grid tile reads as "the site is broken" — worse than the
    // bandwidth cost this now actually carries.
    const showPrerollVideo = Boolean(prerollLoopUrl);

    return (
      <div
        ref={playerContainerRef}
        className="relative h-full w-full overflow-hidden bg-black select-none cursor-pointer group"
        style={{
          backgroundColor: "var(--tank-color-dark, #000000)",
          backgroundImage: "var(--tank-texture-inner-panel, none)",
        }}
        onClick={(e) => {
          if (awaitingSlot) {
            setUserRequestedWatch(true);
          }
          onClick?.();
        }}
        onDoubleClick={onDoubleClick}
      >
        {/* ── Preroll Loop (z-0, underneath everything) ──
            The reason this container isn't just bg-black. Recent footage of
            this exact room, looping muted, so a connecting or reconnecting
            player has something real behind the spinner — hero AND
            thumbnail tiles alike, so a room grid never shows a blank tile.
            Both live buffers render above it at z-10 and hide it the moment
            frames arrive, so it never competes with the actual stream.

            Briefly hero-only (2026-09-01→02): a HAR capture (vault/Tank/
            har-analysis-tank-vs-twitch-vs-kick-2026-09-01.md) had caught six
            simultaneous thumbnail loads against the OLD uncached, ~120s
            source clips starving the real live feed ("1.4 minutes to load a
            room"). Reverted once the real fix landed at the source:
            roomLoopRefresher.ts now uploads each refresh with
            `cacheControl: immutable` under a content-addressed (timestamped)
            filename, so repeat views of the same clip are served from cache
            and a fresh one is a few MB, not tens. Blocking thumbnails
            outright was treating the symptom; a visibly blank grid tile is a
            worse failure mode than the bandwidth this now actually costs. */}
        {showPrerollVideo && (
          <video
            key={prerollLoopUrl}
            src={prerollLoopUrl}
            className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-500 ${
              // Fully visible while waiting, verifying, or offline; fades smoothly once live is stable.
              awaitingSlot || !isLiveStable || isOffline ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            style={videoStyle}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload={netProfile.preload}
            aria-hidden="true"
            tabIndex={-1}
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
          } transition-opacity duration-500 ${
            activeBuffer === "A" && streamConnectedA && isLiveStable && !isOffline
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
          style={videoStyle}
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
          } transition-opacity duration-500 ${
            activeBuffer === "B" && streamConnectedB && isLiveStable && !isOffline
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
          style={videoStyle}
          autoPlay
          muted={muted}
          playsInline
          webkit-playsinline="true"
        />

        {/* Optional Embedded Live Edge HUD Badge */}
        {/* Clean, unobscured video canvas — floating LIVE badges removed for pristine presentation */}

        {/* Clean Standard Video Buffering Spinner (Truly transparent, no container box) */}
        {!directorSurface && bufferingInfo.isBuffering && hasAnyConnectedStream && isLiveStable && !isOffline && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none transition-opacity duration-150">
            <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] stroke-[2.5]" />
          </div>
        )}

        {/* Standby surface.
            
            The machinery underneath is unchanged: a tile may be holding back
            for a stream slot, or warming a live buffer behind the cached clip
            until it is verified stable. None of that is the viewer's problem,
            so none of it is labelled — no "tap to watch", no "verifying". The
            recent clip simply plays, and the live feed dissolves in over it
            when it is genuinely ready.

            Tapping still promotes this tile to a stream slot; it is just no
            longer advertised. Only the case with no clip to show gets a
            surface at all, and it is a plain dark panel rather than a notice. */}
        {(awaitingSlot || (!isLiveStable && hasSource && !isOffline)) && (
          <div
            className="absolute inset-0 z-20 select-none"
            onClick={(e) => {
              if (awaitingSlot) {
                e.stopPropagation();
                setUserRequestedWatch(true);
              }
            }}
          >
            {!showPrerollVideo && (
              <div className="absolute inset-0 bg-gradient-to-b from-[#141517] to-[#08080a]" />
            )}
          </div>
        )}

        {/* Authentic Retro NO SIGNAL Screen when camera is offline or disconnected AND no preroll loop is available */}
        {isOffline && !showPrerollVideo && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#141517] via-[#0d0e10] to-[#080809] p-4 text-center select-none"
            style={{
              backgroundColor: "var(--tank-color-dark, #080809)",
              backgroundImage: "var(--tank-texture-inner-panel, none)",
            }}
          >
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
                style={{
                  fontFamily: ACTIVE_THEME.fonts.label,
                  borderRadius: "var(--tank-border-radius, 0.5rem)",
                }}
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reconnect Feed</span>
              </button>
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
