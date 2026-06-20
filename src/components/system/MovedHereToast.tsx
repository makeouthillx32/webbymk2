"use client";

// src/components/system/MovedHereToast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Destination-side counterpart to <MovedToZone>. When middleware promotes a
// Core path to a zone (e.g. unenter.live/shop → shop.unenter.live) it appends
// ?_moved=<corePath> to the redirect. This component — mounted once per zone via
// the shared layout — reads that param on arrival, shows a zone-aware toast
// ("this section moved here, you've been redirected"), then strips the param so
// a refresh or shared link doesn't re-fire it.
//
// Why a query param, not a cookie: the signal is scoped to THIS navigation,
// crosses the subdomain boundary for free, self-clears, and adds no cookie
// weight. The toast renders through the existing react-hot-toast <AppToaster>
// already mounted in every shared layout branch.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { CORE_DOMAIN } from "@/lib/multiZone";
import { useZone } from "@/components/providers/ZoneProvider";

const PARAM = "_moved";

export default function MovedHereToast() {
  const fired = useRef(false);
  const { zone, host } = useZone();

  useEffect(() => {
    if (fired.current || typeof window === "undefined") return;

    const params   = new URLSearchParams(window.location.search);
    const movedFrom = params.get(PARAM);
    if (!movedFrom) return;

    fired.current = true;

    // Zone-aware message: where it came from (Core path) → where they are now.
    const here = host || window.location.host; // e.g. "shop.unenter.live"
    const fromLabel = `${CORE_DOMAIN}${movedFrom === "/" ? "" : movedFrom}`;

    toast(
      `“${fromLabel}” moved to ${here} — you’ve been redirected to the ${zone}.`,
      { icon: "📦", duration: 6000, ariaProps: { role: "status", "aria-live": "polite" } },
    );

    // Strip the param so refresh / share / back-forward doesn't re-toast.
    params.delete(PARAM);
    const qs    = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(null, "", clean);
  }, [zone, host]);

  return null;
}
