// src/ink/npm/certs.ts
// Certificate listing and domain-match lookup.
// Handles v2 / v3 endpoint discovery. Never requests new certs — that is
// the caller's responsibility (zone.ts uses certificate_id: "new" only
// as a last resort; dev.ts never requests new certs at all).

import { npmFetch }                from "./client.ts";
import { npmGetToken, clearTokenCache } from "./auth.ts";
import type { NpmCertificate, OnLine }  from "./types.ts";

// ── Endpoint discovery ────────────────────────────────────────────────────────
// v2.x  →  /certificates
// v3.x  →  /nginx/certificates

let cachedBase: string | null = null;

async function resolveCertsBase(token: string): Promise<string> {
  if (cachedBase) return cachedBase;

  for (const base of ["/nginx/certificates", "/certificates"]) {
    const res = await npmFetch(base, {}, token);
    if (res.status === 401) { clearTokenCache(); throw new Error("NPM token expired"); }
    if (res.status !== 404) { cachedBase = base; return base; }
  }
  throw new Error("NPM certificates endpoint not found (tried /nginx/certificates and /certificates)");
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** List all certificates stored in NPM. */
export async function npmListCerts(token?: string): Promise<NpmCertificate[]> {
  const t    = token ?? await npmGetToken();
  const base = await resolveCertsBase(t);
  const res  = await npmFetch(base, {}, t);
  if (!res.ok) throw new Error(`Failed to list certs (${res.status})`);
  return res.json() as Promise<NpmCertificate[]>;
}

/**
 * Find the best existing cert in NPM that covers `domain`.
 *
 * Match strategy (in priority order):
 *   1. Exact:    cert.domain_names includes "dev.unenter.live"
 *   2. Wildcard: cert.domain_names includes "*.unenter.live"
 *
 * Among multiple matches, picks the one with the latest expiry so we always
 * attach the longest-lived certificate available.
 *
 * Logs progress via onLine — caller sees what was found without digging
 * through logs.  Returns null if no match exists.
 */
export async function npmFindCertForDomain(
  domain: string,
  token?: string,
  onLine?: OnLine,
): Promise<NpmCertificate | null> {
  let certs: NpmCertificate[];
  try {
    certs = await npmListCerts(token);
  } catch (e) {
    onLine?.(`⚠ Could not list NPM certs: ${String(e)}`);
    return null;
  }

  onLine?.(`  Found ${certs.length} cert(s) in NPM — scanning for match...`);

  const dotIdx   = domain.indexOf(".");
  const wildcard = dotIdx >= 0 ? `*${domain.slice(dotIdx)}` : null;

  const matches = certs.filter((c) =>
    c.domain_names.includes(domain) ||
    (wildcard !== null && c.domain_names.includes(wildcard))
  );

  if (matches.length === 0) {
    onLine?.(`  No existing cert covers "${domain}"${wildcard ? ` or "${wildcard}"` : ""}`);
    return null;
  }

  const best = matches.reduce((a, c) => {
    const aExp = a.expires_on ? new Date(a.expires_on).getTime() : 0;
    const cExp = c.expires_on ? new Date(c.expires_on).getTime() : 0;
    return cExp > aExp ? c : a;
  });

  onLine?.(`  Found ${matches.length} matching cert(s) — using #${best.id} "${best.nice_name}"`);
  return best;
}
