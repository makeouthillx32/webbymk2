"use client";

import { useEffect, useRef, useState } from "react";
import { safeStorage } from "@/lib/safeStorage";
import { createClient } from "@/utils/supabase/client";

// Counts everyone watching the feed, signed in or not.
//
// A heartbeat to our own server rather than Supabase Realtime presence,
// deliberately: presence is a client-side claim, and the server is the only
// place that can see a viewer's real connection. It also keeps the count
// working while realtime is unavailable.

const VIEWER_KEY_STORAGE = "tank_viewer_key";
const DEFAULT_INTERVAL_SECONDS = 20;

export type ViewerPresence = {
  online: number;
  members: number;
  anonymous: number;
  automated: number;
  onCellular: number;
  groups: { label: string | null; viewers: number }[];
};

export type ViewerIdentity = { name: string; isAnonymous: boolean } | null;

/**
 * A stable per-device id. This — not the IP — is what identifies a viewer:
 * carrier NAT means many unrelated phones share one address, so keying on IP
 * would collapse every cellular viewer into one person.
 */
function getViewerKey(): string {
  const existing = safeStorage.getItem(VIEWER_KEY_STORAGE);
  if (existing) return existing;

  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  safeStorage.setItem(VIEWER_KEY_STORAGE, key);
  return key;
}

/**
 * Best-effort connection type. `navigator.connection.type` is Chromium-only, so
 * Safari and Firefox report nothing and correctly come back "unknown" — the
 * server treats this as a hint, never as a fact.
 */
function detectConnectionType(): string {
  if (typeof navigator === "undefined") return "unknown";
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return "unknown";

  if (typeof conn.type === "string" && conn.type) {
    if (conn.type === "cellular" || conn.type === "wifi" || conn.type === "ethernet") return conn.type;
  }

  // Fallback: effectiveType describes speed, not medium, so it can only ever
  // suggest cellular. A slow café wifi looks the same as 3G from here — which
  // is why this never overrides an explicit conn.type.
  if (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g" || conn.effectiveType === "3g") {
    return "cellular";
  }

  return "unknown";
}

export function useViewerPresence(roomSlug: string) {
  const [presence, setPresence] = useState<ViewerPresence | null>(null);
  const [identity, setIdentity] = useState<ViewerIdentity>(null);
  const roomRef = useRef(roomSlug);
  roomRef.current = roomSlug;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const viewerKey = getViewerKey();

    const beat = async () => {
      try {
        const res = await fetch("/api/tank/presence/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewerKey,
            roomSlug: roomRef.current,
            connectionType: detectConnectionType(),
          }),
          // Presence is disposable — never let it sit in a cache.
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.success) return;

        setPresence(json.presence ?? null);
        setIdentity(json.you ?? null);
      } catch {
        // Offline or mid-deploy: keep the last known count rather than
        // flashing the viewer down to zero.
      } finally {
        if (!cancelled) {
          timer = setTimeout(beat, DEFAULT_INTERVAL_SECONDS * 1000);
        }
      }
    };

    void beat();

    // Live pushes between our own beats. The heartbeat still governs whether
    // WE are counted, but the NUMBER should move the instant anyone joins or
    // leaves rather than lagging up to a full interval behind. The server only
    // broadcasts when the count actually changes, so this costs nothing while
    // the audience is stable.
    const supabase = createClient();
    const presenceChannel = supabase
      .channel("tank:presence")
      .on("broadcast", { event: "presence" }, ({ payload }) => {
        if (!cancelled && payload && typeof payload.online === "number") {
          setPresence(payload as ViewerPresence);
        }
      })
      .subscribe();

    // A backgrounded tab is throttled hard, so the viewer would time out and
    // reappear on return. Beat immediately when the tab comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(presenceChannel);
    };
  }, []);

  return { presence, identity };
}

export default useViewerPresence;
