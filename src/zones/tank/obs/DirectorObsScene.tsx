"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Hls from "hls.js";
import { useTankCameras } from "../public/useTankCameras";
import { useServerDirector } from "../director/useServerDirector";
import { useBuildReload } from "./useBuildReload";
import type { PlaybackProtocol } from "../contracts";
import { hasNewDecodedPicture, readVideoPictureProbe } from "./directorPlayback";
import { useGimbalVideoDriver } from "../director/useGimbalVideoDriver";

export interface DirectorObsSceneProps {
  documentBuildId?: string | null;
}

export function DirectorObsScene({ documentBuildId }: DirectorObsSceneProps = {}) {
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(true);

  const searchParams = useSearchParams();

  // Query configuration (inspired by Polish-Kick-TTS OBS parameter standards)
  const enableAudio = searchParams.get("audio") !== "0" && searchParams.get("audio") !== "false";
  const rawVolume = parseFloat(searchParams.get("volume") || "100");
  const initialVolume = isNaN(rawVolume) ? 1.0 : Math.max(0, Math.min(1, rawVolume > 1 ? rawVolume / 100 : rawVolume));
  const urlLock = searchParams.get("lock"); // e.g. "living-room"

  // Live platform hooks
  const { snapshot, liveById } = useTankCameras();
  const cameras = snapshot?.cameras ?? [];

  // Active negotiated feed
  const [activeCamId, setActiveCamId] = useState<string | null>(null);

  // Dual-buffered video elements (Buffer A & Buffer B)
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const pcRefA = useRef<RTCPeerConnection | null>(null);
  const pcRefB = useRef<RTCPeerConnection | null>(null);
  const hlsRefA = useRef<Hls | null>(null);
  const hlsRefB = useRef<Hls | null>(null);

  const [activeBuffer, setActiveBuffer] = useState<"A" | "B">("A");
  // Timers and async callbacks read these instead of state, which would hand
  // them the value from whichever render scheduled them.
  const activeBufferRef = useRef<"A" | "B">("A");
  // Bumped on every connect or release of a buffer. A picture-wait, retry or
  // teardown carrying an older number belongs to a connection that has since
  // been replaced, and must do nothing.
  const bufferGeneration = useRef<Record<"A" | "B", number>>({ A: 0, B: 0 });

  // ── Central Server Director State Attachment ──
  const serverDirector = useServerDirector();

  useEffect(() => {
    if (urlLock) {
      // Manual URL lock override for specific OBS scene setups
      const lockedCam = cameras.find((c) => c.roomScope === urlLock || c.id === urlLock);
      if (lockedCam && lockedCam.id !== activeCamId) {
        setActiveCamId(lockedCam.id);
      }
      return;
    }

    if (serverDirector.activeCameraId && serverDirector.activeCameraId !== activeCamId) {
      setActiveCamId(serverDirector.activeCameraId);
    }
  }, [
    serverDirector.activeCameraId,
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
  // Held in a ref so scheduleRetry can call the connector without being
  // declared after it (and without capturing a stale closure).
  const connectBufferRef = useRef<
    ((buffer: "A" | "B", url: string, protocol: string, onReady: () => void) => void) | null
  >(null);

  // An unattended OBS browser source has nobody to press refresh, so every
  // failure path has to end in another attempt rather than a dark frame.
  const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({ A: null, B: null });
  const retryCounts = useRef<Record<string, number>>({ A: 0, B: 0 });

  const scheduleRetry = (
    buffer: "A" | "B",
    url: string,
    protocol: string,
    onReady: () => void,
  ) => {
    const generation = bufferGeneration.current[buffer];
    const attempt = (retryCounts.current[buffer] ?? 0) + 1;
    retryCounts.current[buffer] = attempt;
    // Backs off to 10s and stays there: a camera can be down for minutes and
    // the scene must still recover on its own when it returns.
    const delay = Math.min(10000, 1000 * attempt);
    if (retryTimers.current[buffer]) clearTimeout(retryTimers.current[buffer]!);
    console.warn(`[OBS Director] buffer ${buffer} retrying in ${delay}ms (attempt ${attempt})`);
    retryTimers.current[buffer] = setTimeout(() => {
      // A retry for a room the director has since left would reconnect it and
      // then swap the programme BACK to that stale room once it painted.
      if (bufferGeneration.current[buffer] !== generation) return;
      connectBufferRef.current?.(buffer, url, protocol, onReady);
    }, delay);
  };

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

    const generation = ++bufferGeneration.current[buffer];

    // Promote this buffer to programme only once it has painted a real frame.
    //
    // ontrack and MANIFEST_PARSED prove signalling, not decoding. Swapping on
    // them showed the incoming room before its first keyframe, so every room
    // change could put up to a full GOP (~2s on these cameras) of black or
    // frozen picture on every platform the multistream reaches. The outgoing
    // room now stays on air until the incoming one is genuinely moving.
    let awaitingPicture = false;
    const onFirstPicture = () => {
      if (awaitingPicture) return; // ontrack fires once per track
      awaitingPicture = true;
      const baseline = readVideoPictureProbe(video);
      const startedAt = Date.now();
      const poll = () => {
        if (bufferGeneration.current[buffer] !== generation) return;
        if (hasNewDecodedPicture(baseline, readVideoPictureProbe(video))) {
          onReady();
          return;
        }
        // Connected but never painting is a failed connect, not a slow one.
        if (Date.now() - startedAt > 15000) {
          scheduleRetry(buffer, url, protocol, onReady);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    };

    const handleLoaded = () => {
      video.play().catch(() => {});
      onFirstPicture();
    };

    // Any successful attach resets the backoff for this buffer.
    const markConnected = () => { retryCounts.current[buffer] = 0; };
    video.onloadeddata = handleLoaded;
    video.onloadeddata = () => { markConnected(); handleLoaded(); };
    if (protocol === "whep" && typeof RTCPeerConnection !== "undefined") {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          iceCandidatePoolSize: 1,
          bundlePolicy: "max-bundle",
        });

        if (buffer === "A") pcRefA.current = pc;
        else pcRefB.current = pc;

        // WHEP had no failure path once connected: a dropped peer left the
        // last frame frozen on air until someone refreshed the source in OBS.
        pc.onconnectionstatechange = () => {
          if (pc.connectionState !== "failed") return;
          if (bufferGeneration.current[buffer] !== generation) return;
          console.warn(`[OBS Director] WHEP peer failed on buffer ${buffer}, reconnecting`);
          scheduleRetry(buffer, url, protocol, onReady);
        };

        pc.addTransceiver("video", { direction: "recvonly" });
        if (enableAudio) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }

        pc.ontrack = (event) => {
          if (event.streams[0]) {
            video.srcObject = event.streams[0];
            video.play().catch(() => {});
            onFirstPicture();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });

        if (!res.ok) {
          // A non-OK answer (MediaMTX returns 404 "no stream is available"
          // the moment a source path is mid-restart) used to fall straight
          // through to the fallback below WITHOUT throwing, which then set
          // video.src to the WHEP endpoint itself. A WHEP URL is not a
          // decodable media file, so the scene went black permanently and
          // never retried -- surviving even after every camera recovered.
          throw new Error(`WHEP ${res.status} for ${url}`);
        }
        const sdp = await res.text();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
        return;
      } catch (e) {
        console.warn(`[OBS Director] WHEP failed on buffer ${buffer}, falling back to HLS:`, e);
      }
    }

    // A newer connect on this buffer closed our peer mid-handshake, which
    // throws into the catch above. Falling through would attach the room
    // the director already left.
    if (bufferGeneration.current[buffer] !== generation) return;

    // Fallback. The source here may be a WHEP endpoint we just failed on,
    // and a WHEP URL is not decodable media — assigning it to video.src is
    // what produced a permanently black programme feed. Derive the HLS
    // sibling instead, and only ever hand the element a real playlist.
    const playbackUrl = url.includes("/whep")
      ? url.replace(/\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/whep(\?.*)?$/, "/$1-hls/index.m3u8")
      : url;

    if (playbackUrl.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      if (buffer === "A") hlsRefA.current = hls;
      else hlsRefB.current = hls;

      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        onFirstPicture();
      });
      // Even HLS can be handed a path that is mid-restart. Without this the
      // scene stays dark until a human refreshes the browser source in OBS.
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data?.fatal) return;
        hls.destroy();
        if (buffer === "A") hlsRefA.current = null;
        else hlsRefB.current = null;
        scheduleRetry(buffer, url, protocol, onReady);
      });
    } else if (playbackUrl.includes(".m3u8")) {
      // Safari plays HLS natively; Hls.js reports unsupported there.
      video.src = playbackUrl;
      video.load();
    } else {
      scheduleRetry(buffer, url, protocol, onReady);
    }
  };

  connectBufferRef.current = connectBuffer;

  const releaseBuffer = (buffer: "A" | "B") => {
    bufferGeneration.current[buffer] += 1;
    if (retryTimers.current[buffer]) {
      clearTimeout(retryTimers.current[buffer]!);
      retryTimers.current[buffer] = null;
    }
    const pcRef = buffer === "A" ? pcRefA : pcRefB;
    const hlsRef = buffer === "A" ? hlsRefA : hlsRefB;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    const video = buffer === "A" ? videoRefA.current : videoRefB.current;
    if (video) {
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
  };

  // Perform seamless buffer swap when active camera stream changes
  useEffect(() => {
    if (!activeFeed?.playbackUrl) return;

    const incomingBuffer = activeBufferRef.current === "A" ? "B" : "A";
    const url = activeFeed.playbackUrl;
    const protocol = activeFeed.playbackProtocol || "whep";

    connectBuffer(incomingBuffer, url, protocol, () => {
      const outgoing = incomingBuffer === "A" ? "B" : "A";
      activeBufferRef.current = incomingBuffer;
      setActiveBuffer(incomingBuffer);

      // Release the outgoing room after the 200ms crossfade. It was never
      // closed, so from the first room change onward this source decoded two
      // 4K feeds at once -- measured 8.5 + 8.2 Mbps, both at full frame rate,
      // one of them at opacity 0 -- double the decode work for the browser
      // source that feeds every platform.
      const outgoingGeneration = bufferGeneration.current[outgoing];
      setTimeout(() => {
        if (activeBufferRef.current === outgoing) return;
        if (bufferGeneration.current[outgoing] !== outgoingGeneration) return;
        releaseBuffer(outgoing);
      }, 400);
    });
  }, [activeFeed?.playbackUrl, activeFeed?.playbackProtocol, enableAudio, initialVolume]);

  // Clean up any open streams when component unmounts
  useEffect(() => {
    return () => {
      bufferGeneration.current.A += 1;
      bufferGeneration.current.B += 1;
      for (const b of ["A", "B"] as const) {
        if (retryTimers.current[b]) clearTimeout(retryTimers.current[b]!);
      }
      if (pcRefA.current) { pcRefA.current.close(); pcRefA.current = null; }
      if (pcRefB.current) { pcRefB.current.close(); pcRefB.current = null; }
      if (hlsRefA.current) { hlsRefA.current.destroy(); hlsRefA.current = null; }
      if (hlsRefB.current) { hlsRefB.current.destroy(); hlsRefB.current = null; }
    };
  }, []);

  // The crop glides on the gimbal (director/gimbal.ts), written straight to the
  // two buffers -- not a style prop, which re-rendered this scene per update.
  useGimbalVideoDriver(serverDirector.ptzState, () => [videoRefA.current, videoRefB.current], {
    snapKey: serverDirector.activeCameraId,
  });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent select-none">
      {/* ═══════════ DUAL-BUFFER VIDEO STAGE (PROGRAMME FEED ONLY) ═══════════ */}
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
      </div>
    </div>
  );
}

export default DirectorObsScene;
