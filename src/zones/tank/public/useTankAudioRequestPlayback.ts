"use client";

// Plays approved TTS/SFX requests (see server/audioRequests.ts) via
// Supabase Realtime broadcast — same mechanism as useTankSoundboardPlayer.ts.
// Always subscribed to the site-wide "website" channel; additionally
// subscribes to this device's assigned room channel (if any — see
// useTankRoomAudioOutput.ts) so a device sitting in a physical room only
// hears TTS/SFX actually targeted there, not every room's traffic.

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

type PlaybackEvent = {
  requestId?: unknown;
  kind?: unknown;
  message?: unknown;
  voiceOrSoundKey?: unknown;
  audioUrl?: unknown;
};

export function useTankAudioRequestPlayback(muted: boolean, assignedRoomKey: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const handlePlay = ({ payload }: { payload: PlaybackEvent }) => {
      if (mutedRef.current) return;
      const kind = payload.kind;
      if (kind === "tts") {
        const message = typeof payload.message === "string" ? payload.message : "";
        if (!message || typeof window === "undefined" || !("speechSynthesis" in window)) return;
        const utterance = new SpeechSynthesisUtterance(message);
        window.speechSynthesis.speak(utterance);
        return;
      }
      if (kind === "sfx") {
        const clipUrl = typeof payload.audioUrl === "string"
          ? payload.audioUrl
          : typeof payload.voiceOrSoundKey === "string"
            ? payload.voiceOrSoundKey
            : "";
        const audio = audioRef.current;
        if (!clipUrl || !audio) return;
        audio.src = clipUrl;
        audio.currentTime = 0;
        void audio.play().catch(() => {
          // Autoplay can be blocked before the viewer has interacted with
          // the page — nothing to recover from client-side here.
        });
      }
    };

    const websiteChannel = supabase.channel("tank:audio:website");
    websiteChannel.on("broadcast", { event: "play" }, handlePlay).subscribe();

    const roomChannel = assignedRoomKey
      ? supabase.channel(`tank:audio:room:${assignedRoomKey}`)
      : null;
    roomChannel?.on("broadcast", { event: "play" }, handlePlay).subscribe();

    return () => {
      supabase.removeChannel(websiteChannel);
      if (roomChannel) supabase.removeChannel(roomChannel);
    };
  }, [assignedRoomKey]);
}
