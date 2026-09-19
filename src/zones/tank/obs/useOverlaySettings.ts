"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { sanitizeSettings, type OverlaySettings } from "./overlaySettings";

/**
 * The stored settings for one overlay, kept live.
 *
 * This is what makes a browser source URL a permanent address: paste it into
 * OBS once, then change the caption from the staff console and watch it change
 * on air. No re-paste, and — because of the realtime subscription below — no
 * reload either.
 *
 * Two paths in, deliberately:
 *
 *  - a fetch on mount, which is what a browser source that has just been
 *    started (or has just reconnected) needs
 *  - a realtime broadcast, which is what an already-running source needs
 *
 * Neither alone is enough. Without the fetch, a source started after a change
 * would show the old configuration until the next save. Without the broadcast,
 * every change would require a reload, which is exactly the workflow this
 * exists to remove.
 *
 * FAILURE IS SILENT AND SAFE. If the fetch fails or realtime never connects,
 * the overlay renders with `{}` and its built-in defaults — the behaviour it had
 * before this table existed. An overlay must never show an error card: it is
 * composited over a live broadcast, where a stack trace is worse than a stale
 * caption.
 */
export function useOverlaySettings(overlayId: string, enabled = true): OverlaySettings {
  const [settings, setSettings] = useState<OverlaySettings>({});

  useEffect(() => {
    if (!enabled || !overlayId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/tank/overlay-settings", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;
        const forThis = body?.settings?.[overlayId];
        if (forThis) setSettings(sanitizeSettings(forThis));
      } catch {
        // Defaults stand. See the note above on silent failure.
      }
    };

    void load();

    const supabase = createClient();
    const channel = supabase.channel("tank:overlay:settings");
    channel
      .on("broadcast", { event: "overlay_settings_changed" }, (message) => {
        if (cancelled) return;
        const payload = message?.payload as { overlayId?: string; settings?: unknown } | undefined;
        // Every overlay hears every save, so ignore the ones that are not ours
        // rather than adopting another overlay's configuration.
        if (!payload || payload.overlayId !== overlayId) return;
        setSettings(sanitizeSettings(payload.settings));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [overlayId, enabled]);

  return settings;
}
