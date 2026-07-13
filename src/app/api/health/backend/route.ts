// src/app/api/health/backend/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cheap backend liveness probe for the graceful-degradation toast.
//
// Why a dedicated route (chaos drill 2026-07-11): middleware's auth check only
// touches the backend for LOGGED-IN users — an anonymous visitor's getUser()
// returns "session missing" without a network call, so it can't see an outage.
// This route makes a real, session-independent request to the Supabase gateway
// (kong) so <BackendStatusToast> can detect an outage for EVERY visitor.
//
// It hits GoTrue's /auth/v1/health through the same internal URL the app uses,
// with a hard 3s timeout. Backend up → { ok: true }. Down/slow → { ok: false }.
// Never throws, never 500s — a health probe that errors is itself a bad signal.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always live; never cached at build

const TIMEOUT_MS = 3_000;

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL; // server-side = http://kong:8000
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!base) {
    return NextResponse.json({ ok: false, reason: "no-url" }, { headers: noStore });
  }

  try {
    // Probe the PostgREST root (/rest/v1/) — the exact gateway path the app's
    // own server queries use and that we've confirmed serves 200 through kong.
    // Requires the anon apikey (PostgREST rejects unkeyed requests). A 2xx (or
    // even a 401/404 that PROVES kong answered) means the gateway is alive; a
    // thrown fetch (timeout / ECONNREFUSED / DNS) means it's down.
    const res = await fetch(`${base.replace(/\/$/, "")}/rest/v1/`, {
      headers: anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : undefined,
      signal:  AbortSignal.timeout(TIMEOUT_MS),
      cache:   "no-store",
    });
    // Any HTTP response — even 4xx — means kong is up and routing. Only a
    // transport failure (caught below) counts as an outage.
    return NextResponse.json({ ok: res.status > 0 }, { headers: noStore });
  } catch {
    // Timeout / connection refused / DNS — the gateway is unreachable.
    return NextResponse.json({ ok: false, reason: "unreachable" }, { headers: noStore });
  }
}
