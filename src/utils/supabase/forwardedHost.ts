// utils/supabase/forwardedHost.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tell GoTrue which public host its email links belong to.
//
// GoTrue v2 builds every confirmation, invite and recovery link from the
// X-Forwarded-Proto + X-Forwarded-Host pair on the request — NOT from
// API_EXTERNAL_URL, which it only falls back to when that pair is absent.
//
// Server-side Supabase calls go over the compose network to http://kong:8000
// (deliberately — see the comment in admin.ts about the hairpin outage of
// 2026-09-02). Kong regenerates those headers from the incoming Host, so GoTrue
// was told the host was `kong` and every signup email linked to
//
//     http://kong/auth/v1/verify?token=...
//
// which no browser can resolve. It failed with DNS_PROBE_POSSIBLE, and it made
// every email signup unverifiable — two real accounts were stranded before
// anyone traced it.
//
// Sending the pair ourselves fixes it without moving internal traffic onto the
// public edge. Kong forwards them because the compose subnet is in
// KONG_TRUSTED_IPS; from outside that subnet they are ignored, so this cannot
// be used to forge a link host.
// ─────────────────────────────────────────────────────────────────────────────

/** The public origin Supabase is reachable at, e.g. https://db.unenter.live */
export function publicSupabaseOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.API_EXTERNAL_URL ||
    "https://db.unenter.live";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://db.unenter.live";
  }
}

/**
 * Headers that make GoTrue emit public, https email links.
 *
 * Returns {} when the client already targets the public origin — there is
 * nothing to correct then, and overriding what the edge set would be worse
 * than leaving it alone.
 */
export function forwardedHostHeaders(supabaseUrl: string): Record<string, string> {
  let target: URL;
  try {
    target = new URL(supabaseUrl);
  } catch {
    return {};
  }

  const publicOrigin = new URL(publicSupabaseOrigin());
  if (target.host === publicOrigin.host) return {};

  return {
    "X-Forwarded-Host": publicOrigin.host,
    "X-Forwarded-Proto": publicOrigin.protocol.replace(":", ""),
  };
}
