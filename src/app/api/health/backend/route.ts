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
// Two subsystems, probed in parallel, because they fail INDEPENDENTLY:
//
//   rest — PostgREST at /rest/v1/. Any HTTP status proves kong is routing.
//          This is what "content is fresh" depends on.
//   auth — GoTrue at /auth/v1/health. Requires a real 2xx: when GoTrue is
//          down, kong still answers with 502/503, so "any status" would
//          report a dead auth service as healthy.
//
// That distinction is the whole point of this revision (2026-07-27). The route
// previously probed ONLY /rest/v1/ while its own comment claimed it hit
// /auth/v1/health. GoTrue then crash-looped for hours — replaying an old
// migration against the modern auth schema — and this probe reported ok:true
// the entire time, because kong was up and PostgREST was fine. Sign-in was
// dead and nothing in the stack said so.
//
// Response shape (additive — `ok` stays the field consumers read):
//   { ok, services: { rest, auth }, degraded: "rest" | "auth" | "both" | null }
//
// Never throws, never 500s — a health probe that errors is itself a bad signal.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always live; never cached at build

// Per-probe. The probes run sequentially (see GET), so the route's worst case
// is two of these — kept tight enough that a fully dead backend still answers
// well inside any sane client timeout.
const TIMEOUT_MS = 2_500;

type ProbeResult = { up: boolean; status: number | null; detail?: string };

/**
 * Why a failed probe carries a `detail`: a transport failure and a bad HTTP
 * status are different incidents (DNS/refused/timeout vs. the service
 * answering badly), and "auth: false" alone sends you hunting. The message is
 * the error's own name/message — never a URL or key.
 */
function failure(cause: unknown): ProbeResult {
  const err = cause as { name?: string; message?: string; cause?: { code?: string } };
  const code = err?.cause?.code;
  const detail = [err?.name, code, err?.message].filter(Boolean).join(" · ").slice(0, 200);
  return { up: false, status: null, detail: detail || "unknown" };
}

/**
 * PostgREST root — the exact gateway path the app's own server queries use.
 * Requires the anon apikey (PostgREST rejects unkeyed requests), but ANY HTTP
 * response — even 401/404 — proves kong answered. Only a transport failure
 * (timeout / ECONNREFUSED / DNS) counts as an outage.
 */
async function probeRest(base: string, anon: string | undefined): Promise<ProbeResult> {
  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return { up: res.status > 0, status: res.status };
  } catch (cause) {
    return failure(cause);
  }
}

/**
 * GoTrue health — unauthenticated through kong, returns 200 + JSON when alive.
 * Unlike the REST probe this demands a 2xx: a 502/503 here means kong is fine
 * but GoTrue itself is not answering, which is exactly the outage we missed.
 */
async function probeAuth(base: string, anon: string | undefined): Promise<ProbeResult> {
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      // GoTrue's health route needs no key, but every other internal call to
      // the gateway carries one — keep this request shaped like the rest.
      headers: anon ? { apikey: anon } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return { up: res.ok, status: res.status };
  } catch (cause) {
    return failure(cause);
  }
}

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""); // server-side = http://kong:8000
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!base) {
    return NextResponse.json(
      { ok: false, reason: "no-url", services: { rest: false, auth: false }, degraded: "both" },
      { headers: noStore },
    );
  }

  // Sequential, deliberately. Firing both at once makes undici open a second
  // connection to the same origin, and on this host the parallel request never
  // reached kong at all — kong's access log recorded the /rest/v1/ probe and no
  // /auth/v1/ probe, while the auth fetch sat until its own 3s timeout. One
  // connection, reused, behaves. The cost is a worst case of 2 × TIMEOUT_MS on
  // a route nothing blocks on.
  const rest = await probeRest(base, anon);
  const auth = await probeAuth(base, anon);

  const degraded =
    !rest.up && !auth.up ? "both" : !rest.up ? "rest" : !auth.up ? "auth" : null;

  return NextResponse.json(
    {
      ok: rest.up && auth.up,
      degraded,
      services: {
        rest: rest.up,
        auth: auth.up,
      },
      status: {
        rest: rest.status,
        auth: auth.status,
      },
      ...(rest.detail || auth.detail
        ? { detail: { ...(rest.detail ? { rest: rest.detail } : {}), ...(auth.detail ? { auth: auth.detail } : {}) } }
        : {}),
    },
    { headers: noStore },
  );
}
