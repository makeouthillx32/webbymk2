"use client";

// src/components/system/ZoneOfflineToast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Landing-side counterpart to the proxy's zone kill-switch. When
// proxy/server.js's resolveOfflineRedirect() catches a request for a zone
// marked offline (`zone off <key> "<reason>"` — see markZoneOffline() in
// src/ink/proxy-config.ts), it 302s the visitor to
// core/?zone_offline=<key>&reason=<reason> instead of silently falling
// through to core with no explanation. This component — mounted once in the
// root layout, same as its sibling MovedHereToast — reads those params on
// arrival, shows a toast naming the zone and why, then strips the params so
// a refresh or shared link doesn't re-fire it.
//
// Same query-param-not-cookie reasoning as MovedHereToast: scoped to this
// one navigation, self-clears, no cookie weight, renders through the same
// already-mounted <AppToaster>.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

const ZONE_PARAM = "zone_offline";
const REASON_PARAM = "reason";

export default function ZoneOfflineToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const zoneKey = params.get(ZONE_PARAM);
    if (!zoneKey) return;

    fired.current = true;

    const reason = params.get(REASON_PARAM)?.trim();
    const message = reason
      ? `"${zoneKey}" is temporarily offline — ${reason}`
      : `"${zoneKey}" is temporarily offline.`;

    toast(message, {
      icon: "🚧",
      duration: 8000,
      ariaProps: { role: "status", "aria-live": "polite" },
    });

    // Strip the params so refresh / share / back-forward doesn't re-toast.
    params.delete(ZONE_PARAM);
    params.delete(REASON_PARAM);
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(null, "", clean);
  }, []);

  return null;
}
