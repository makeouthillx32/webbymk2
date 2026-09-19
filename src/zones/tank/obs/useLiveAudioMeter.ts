"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { OverlayCamera } from "./overlayCamera";
import { endWhepSession, whepSessionUrl, type SessionHandle } from "../public/whepSession";

function getDirectorIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:stun.cloudflare.com:3478"] },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TANK_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((v) => v.trim()).filter(Boolean),
      ...(process.env.NEXT_PUBLIC_TANK_TURN_USERNAME
        ? { username: process.env.NEXT_PUBLIC_TANK_TURN_USERNAME }
        : {}),
      ...(process.env.NEXT_PUBLIC_TANK_TURN_CREDENTIAL
        ? { credential: process.env.NEXT_PUBLIC_TANK_TURN_CREDENTIAL }
        : {}),
    });
  }
  return servers;
}

function waitForUsableIceCandidates(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (pc.iceGatheringState === "complete" || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onStateChange);
      pc.removeEventListener("icecandidate", onCandidate);
      signal.removeEventListener("abort", finish);
      if (graceTimer) clearTimeout(graceTimer);
      if (hardTimer) clearTimeout(hardTimer);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && !graceTimer) {
        graceTimer = setTimeout(finish, 120);
      }
    };
    pc.addEventListener("icegatheringstatechange", onStateChange);
    pc.addEventListener("icecandidate", onCandidate);
    signal.addEventListener("abort", finish);
    hardTimer = setTimeout(finish, 800);
  });
}

export type LiveAudioReading = {
  currentDb: number | null;
  energyPercent: number;
  isLiveAudio: boolean;
  isSpeaking: boolean;
};

/**
 * Real-time audio visualizer & meter for the on-air camera feed.
 *
 * Taps directly into the on-air camera's live audio track via WebRTC (WHEP)
 * or HLS without outputting audio to speakers (no feedback/doubling in OBS).
 *
 * Ballistics:
 * - Instantaneous attack (spikes on loud speech or yells)
 * - Smooth analog decay (~35 dB/s)
 * - Fallback to vision worker telemetry or organic ambient room tone
 *   so the meter never flatlines at zero or displays "-- dB" in error.
 */
export function useLiveAudioMeter(
  camera: OverlayCamera | null,
  serverPeak: number | null,
): LiveAudioReading {
  const [reading, setReading] = useState<LiveAudioReading>({
    currentDb: -48,
    energyPercent: 20,
    isLiveAudio: false,
    isSpeaking: false,
  });

  const stateDbRef = useRef<number>(-48);
  const phaseRef = useRef<number>(Math.random() * 100);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const liveAudioActiveRef = useRef<boolean>(false);
  const lastLiveAudioSampleRef = useRef<number>(0);

  const sessionRef = useRef<string | null>(null);
  const sessionHandleRef = useRef<SessionHandle>({ current: null });
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Setup live audio capture for the active on-air camera
  useEffect(() => {
    if (typeof window === "undefined") return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (sessionHandleRef.current) {
      endWhepSession(sessionHandleRef.current);
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.src = "";
      } catch {}
      audioElRef.current = null;
    }
    analyserRef.current = null;
    liveAudioActiveRef.current = false;

    const playbackUrl = camera?.playbackUrl;
    const protocol = camera?.playbackProtocol ?? "whep";

    if (!playbackUrl) return;

    const attachMediaStream = (stream: MediaStream) => {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const ctx = audioCtxRef.current ?? new AudioCtxClass();
        audioCtxRef.current = ctx;

        if (ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.2;
        // Connect source to analyser, but NOT to ctx.destination
        // This ensures audio is measured silently without doubling in OBS!
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch (err) {
        console.warn("[VU Meter] Failed to attach MediaStream audio analyser:", err);
      }
    };

    if (protocol === "whep" && typeof RTCPeerConnection !== "undefined") {
      (async () => {
        try {
          const pc = new RTCPeerConnection({
            iceServers: getDirectorIceServers(),
            iceCandidatePoolSize: 1,
            bundlePolicy: "max-bundle",
          });
          pcRef.current = pc;

          // Request AUDIO ONLY: minimal network/CPU, zero video decode overhead
          pc.addTransceiver("audio", { direction: "recvonly" });

          pc.ontrack = (event) => {
            if (abort.signal.aborted || pc.signalingState === "closed") return;
            if (event.track.kind === "audio") {
              const stream = event.streams[0] ?? new MediaStream([event.track]);
              attachMediaStream(stream);
            }
          };

          const offer = await pc.createOffer();
          if (abort.signal.aborted) return pc.close();
          await pc.setLocalDescription(offer);
          if (abort.signal.aborted) return pc.close();

          await waitForUsableIceCandidates(pc, abort.signal);
          if (abort.signal.aborted) return pc.close();

          const res = await fetch(playbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: pc.localDescription?.sdp ?? offer.sdp,
            signal: abort.signal,
          });

          if (!res.ok || abort.signal.aborted) {
            pc.close();
            return;
          }

          sessionRef.current = whepSessionUrl(res, playbackUrl);
          sessionHandleRef.current.current = sessionRef.current;

          const sdp = await res.text();
          if (abort.signal.aborted) {
            endWhepSession(sessionHandleRef.current);
            pc.close();
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
        } catch (err) {
          if (!abort.signal.aborted) {
            console.warn("[VU Meter] WHEP audio connection failed, falling back:", err);
          }
        }
      })();
    } else if (protocol === "hls" && playbackUrl.includes(".m3u8") && Hls.isSupported()) {
      try {
        const audio = document.createElement("audio");
        audio.muted = true; // Muted in DOM, tapped via Web Audio
        audio.setAttribute("playsinline", "true");
        (audio as any).playsInline = true;
        audio.autoplay = true;
        audioElRef.current = audio;

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;

        hls.attachMedia(audio);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (abort.signal.aborted) return;
          hls.loadSource(playbackUrl);
        });

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const ctx = audioCtxRef.current ?? new AudioCtxClass();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.2;
          source.connect(analyser);
          analyserRef.current = analyser;
        }

        void audio.play().catch(() => {});
      } catch (err) {
        console.warn("[VU Meter] HLS audio connection failed:", err);
      }
    }

    return () => {
      abort.abort();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      endWhepSession(sessionHandleRef.current);
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (audioElRef.current) {
        try {
          audioElRef.current.pause();
          audioElRef.current.src = "";
        } catch {}
        audioElRef.current = null;
      }
      analyserRef.current = null;
      liveAudioActiveRef.current = false;
    };
  }, [camera?.playbackUrl, camera?.playbackProtocol]);

  // Real-time animation loop: 60 FPS analysis with fast attack and smooth decay
  useEffect(() => {
    let animId: number;
    const pcmData = new Float32Array(256);

    const tick = () => {
      const now = Date.now();
      const analyser = analyserRef.current;
      let rawDb: number | null = null;

      if (analyser) {
        try {
          analyser.getFloatTimeDomainData(pcmData);
          let sumSquares = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sumSquares += pcmData[i] * pcmData[i];
          }
          const rms = Math.sqrt(sumSquares / pcmData.length);

          // If RMS has active waveform data (not flatline zero)
          if (rms > 0.0002) {
            rawDb = Math.max(-60, Math.min(0, 20 * Math.log10(rms)));
            liveAudioActiveRef.current = true;
            lastLiveAudioSampleRef.current = now;
          }
        } catch {}
      }

      // Check if live audio was recently heard within 2 seconds
      const isLiveRecent = now - lastLiveAudioSampleRef.current < 2000;
      let currentDb = stateDbRef.current;

      if (rawDb !== null) {
        // Real-time live audio metering from microphone
        if (rawDb > currentDb) {
          // Fast Attack: immediate punch on speech/yell
          currentDb = currentDb + (rawDb - currentDb) * 0.7;
        } else {
          // Smooth decay: natural analog meter falloff (~1.2 dB per frame at 60fps = ~70 dB/s)
          currentDb = Math.max(-60, currentDb - 1.2);
        }
      } else if (serverPeak !== null && serverPeak > 0 && !isLiveRecent) {
        // Vision worker ebur128 telemetry fallback
        const targetDb = Math.round((serverPeak / 100) * 60 - 70);
        if (targetDb > currentDb) {
          currentDb += (targetDb - currentDb) * 0.4;
        } else {
          currentDb = Math.max(-60, currentDb - 0.8);
        }
      } else if (!isLiveRecent) {
        // Organic room tone ambience: gentle breathing between -48 dB and -43 dB
        phaseRef.current += 0.05;
        const ambient = -47 + Math.sin(phaseRef.current) * 3 + (Math.random() > 0.95 ? Math.random() * 4 : 0);
        if (ambient > currentDb) {
          currentDb += (ambient - currentDb) * 0.15;
        } else {
          currentDb = Math.max(-55, currentDb - 0.4);
        }
      } else {
        // Decaying after real audio
        currentDb = Math.max(-60, currentDb - 1.2);
      }

      stateDbRef.current = currentDb;

      // Map dB to 0-100% (-60 dB = 0%, 0 dB = 100%)
      const energyPercent = Math.max(0, Math.min(100, Math.round(((currentDb + 60) / 60) * 100)));
      const isSpeaking = currentDb > -30;

      setReading({
        currentDb: Math.round(currentDb),
        energyPercent,
        isLiveAudio: liveAudioActiveRef.current,
        isSpeaking,
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [serverPeak]);

  return reading;
}
