"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export type OverlayPlayerProps = {
  sceneId: string;
  sceneName: string;
};

type FiredEvent = {
  message: string;
  soundKey: string | null;
  displaySeconds: number;
};

// Generic OBS browser-source overlay — transparent background, subscribes
// to this scene's tank:overlay:<sceneId> Realtime channel, and renders
// whatever gets fired at it (see fireOverlayAction/broadcastOverlayEvent in
// server/overlays.ts). Any device with this URL open — an OBS browser
// source, or a viewer's own tab — plays the event locally, which is what
// "utilize all speakers that can play" means in practice: no central mixer,
// every open instance is its own output.
export function OverlayPlayer({ sceneId, sceneName }: OverlayPlayerProps) {
  const [active, setActive] = useState<FiredEvent | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`tank:overlay:${sceneId}`);

    channel
      .on("broadcast", { event: "fire" }, ({ payload }) => {
        const fired = payload as FiredEvent;
        setActive(fired);

        if (fired.soundKey) {
          const url = `https://db.unenter.live/storage/v1/object/public/tank-soundboard/${fired.soundKey}.mp3`;
          const audio = new Audio(url);
          audioRef.current = audio;
          void audio.play().catch(() => {});
        }

        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setActive(null), (fired.displaySeconds || 6) * 1000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [sceneId]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-transparent p-6">
      {active && (
        <div
          className="animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300 rounded-xl border-2 border-orange-400 bg-black/90 px-8 py-5 text-center shadow-2xl"
          style={{ boxShadow: "0 0 40px rgba(255,140,0,0.5)" }}
        >
          <p className="text-2xl font-black text-white drop-shadow-lg">{active.message}</p>
        </div>
      )}
      {!active && process.env.NODE_ENV !== "production" && (
        <p className="text-xs font-mono text-slate-600">
          [{sceneName}] overlay armed — waiting for a trigger to fire.
        </p>
      )}
    </div>
  );
}
export default OverlayPlayer;
