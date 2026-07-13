"use client";

// src/components/system/BackendStatusToast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Non-intrusive "our backend is unreachable — data may not be fresh" toast.
// Renders nothing until a real outage is detected; no page takeover.
//
// Detection (chaos drill 2026-07-11): mounted once per zone via ClientLayout,
// it probes /api/health/backend on mount — a session-independent server route
// that pings the Supabase gateway (kong). This works for EVERY visitor, unlike
// the middleware auth check which only touches the backend for logged-in users.
//
// The toast fires through the existing react-hot-toast <AppToaster> already in
// every zone's layout, so it rides the same cross-zone toast system as
// <MovedHereToast>. Deduped by a stable id; probes are throttled across
// navigations so we don't hammer the route.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import toast from "react-hot-toast";

const TOAST_ID  = "backend-degraded";
const THROTTLE_MS = 60_000; // don't re-probe within a minute of the last check

// Module-level: survives client-side navigations (component remounts) so we
// probe at most once per THROTTLE_MS window per tab.
let lastProbeAt = 0;

export default function BackendStatusToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = Date.now();
    if (now - lastProbeAt < THROTTLE_MS) return;
    lastProbeAt = now;

    let cancelled = false;

    (async () => {
      try {
        const res  = await fetch("/api/health/backend", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean };
        if (cancelled) return;

        if (data?.ok === false) {
          toast(
            "We're having trouble reaching our servers — some content may not be up to date. We're on it; please check back shortly.",
            {
              id: TOAST_ID, // stable id ⇒ never stacks across navigations
              icon: "⚠️",
              duration: 8000,
              ariaProps: { role: "status", "aria-live": "polite" },
            },
          );
        } else {
          // Backend healthy again — clear any lingering outage toast.
          toast.dismiss(TOAST_ID);
        }
      } catch {
        // The probe route itself failed to load — treat as an app-level issue,
        // not a backend outage; stay silent rather than cry wolf.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}
