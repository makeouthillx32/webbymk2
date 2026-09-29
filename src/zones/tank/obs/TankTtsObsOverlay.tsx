"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { TankAudioPlaybackEvent } from "../contracts";
import { parseTankTtsOverlayConfig } from "./overlayConfig";
import styles from "./obsOverlay.module.css";

type QueuedTts = TankAudioPlaybackEvent & { requestId: string };

export function TankTtsObsOverlay() {
  const search = useSearchParams();
  const config = useMemo(() => parseTankTtsOverlayConfig(search), [search]);
  const [queue, setQueue] = useState<QueuedTts[]>([]);
  const [current, setCurrent] = useState<QueuedTts | null>(null);
  const [status, setStatus] = useState("connecting");
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const previousHtml = document.documentElement.style.background;
    const previousBody = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.background = previousHtml;
      document.body.style.background = previousBody;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const enqueue = useCallback(({ payload }: { payload: Partial<TankAudioPlaybackEvent> }) => {
    if (payload.kind !== "tts" || typeof payload.requestId !== "string") return;
    if (seen.current.has(payload.requestId)) return;
    seen.current.add(payload.requestId);
    setQueue((items) => [...items, {
      requestId: payload.requestId!,
      kind: "tts",
      message: typeof payload.message === "string" ? payload.message : null,
      voiceOrSoundKey: typeof payload.voiceOrSoundKey === "string" ? payload.voiceOrSoundKey : "default",
      audioUrl: typeof payload.audioUrl === "string" ? payload.audioUrl : null,
      targetRoomKey: typeof payload.targetRoomKey === "string" ? payload.targetRoomKey : null,
    }]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channels = [];
    if (config.scope === "website" || config.scope === "both") channels.push(supabase.channel("tank:audio:website"));
    if (config.scope === "room" || config.scope === "both") channels.push(supabase.channel(`tank:audio:room:${config.room}`));
    for (const channel of channels) channel.on("broadcast", { event: "play" }, enqueue).subscribe((next) => setStatus(next.toLowerCase()));
    return () => { for (const channel of channels) void supabase.removeChannel(channel); };
  }, [config.room, config.scope, enqueue]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    const done = () => { if (!cancelled) setCurrent(null); };

    if (current.audioUrl) {
      audio = new Audio(current.audioUrl);
      audio.volume = config.volume / 100;
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
      void audio.play().catch(done);
    } else if (current.message && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(current.message);
      utterance.volume = config.volume / 100;
      const requested = current.voiceOrSoundKey && current.voiceOrSoundKey !== "default"
        ? current.voiceOrSoundKey
        : config.fallbackVoice;
      if (requested && requested !== "default") {
        utterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.name.toLowerCase().includes(requested.toLowerCase())) ?? null;
      }
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    } else {
      done();
    }

    return () => {
      cancelled = true;
      if (audio) { audio.pause(); audio.src = ""; }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [config.fallbackVoice, config.volume, current]);

  return (
    <main className={styles.viewport} aria-live="polite">
      {config.debug ? <div className={styles.debug}>TTS · {config.scope} · {status} · Q{queue.length}</div> : null}
      {current && config.showCard ? (
        <section className={styles.ttsCard}>
          <div className={styles.ttsLabel}>Tank TTS</div>
          {config.captions && current.message ? <div className={styles.ttsText}>{current.message}</div> : null}
        </section>
      ) : null}
    </main>
  );
}
