"use client";

// Plays soundboard clips broadcast from the admin dashboard
// (src/app/api/tank/admin/soundboard/trigger) into every connected viewer's
// browser via Supabase Realtime — the same broadcast mechanism chat already
// uses (see useTankRealtimeChat.ts), just a dedicated site-wide channel
// instead of a per-room one. This is playback in the viewer's browser, not
// injected into the OBS/stream audio mix — that would need a separate
// pipeline (e.g. through NOALBS) and is a deliberate follow-up, not this.

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

const TANK_SOUNDBOARD_CHANNEL = "tank:soundboard";

type SoundboardPayload = {
  clipUrl?: unknown;
  clipName?: unknown;
};

export function useTankSoundboardPlayer(muted: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(TANK_SOUNDBOARD_CHANNEL);

    channel
      .on("broadcast", { event: "play" }, ({ payload }) => {
        const data = (payload ?? {}) as SoundboardPayload;
        if (typeof data.clipUrl !== "string" || !data.clipUrl) return;
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = data.clipUrl;
        audio.currentTime = 0;
        void audio.play().catch(() => {
          // Autoplay can be blocked before the viewer has interacted with
          // the page at all — nothing to recover from client-side here.
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
