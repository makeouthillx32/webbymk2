// src/ink/npm/hosts.ts
// Proxy host CRUD — list, find, enable, disable, delete.
// Handles v2 / v3 endpoint discovery and caches the result.

import { npmFetch, TIMEOUT_MS, SLOW_TIMEOUT_MS } from "./client.ts";
import { npmGetToken, clearTokenCache }           from "./auth.ts";
import type { NpmProxyHost }                      from "./types.ts";

// ── Endpoint discovery ────────────────────────────────────────────────────────
// NPM changed its API structure between major versions:
//   v2.x  →  /proxy-hosts
//   v3.x  →  /nginx/proxy-hosts

let cachedBase: string | null = null;

export async function resolveProxyHostsBase(token: string): Promise<string> {
  if (cachedBase) return cachedBase;

  for (const base of ["/nginx/proxy-hosts", "/proxy-hosts"]) {
    const res = await npmFetch(base, {}, token);
    if (res.status === 401) { clearTokenCache(); throw new Error("NPM token expired — re-auth required"); }
    if (res.status !== 404) { cachedBase = base; return base; }
  }
  throw new Error("NPM proxy-hosts endpoint not found (tried /nginx/proxy-hosts and /proxy-hosts)");
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** List all proxy hosts (with SSL cert details expanded when supported). */
export async function npmListHosts(token?: string): Promise<NpmProxyHost[]> {
  const t    = token ?? await npmGetToken();
  const base = await resolveProxyHostsBase(t);

  // ?expand=certificate gives richer response in v2.x; fall back to plain list.
  let res = await npmFetch(`${base}?expand=certificate`, {}, t);
  if (res.status === 401) { clearTokenCache(); throw new Error("NPM token expired — re-auth required"); }
  if (res.status === 404) res = await npmFetch(base, {}, t);

  if (!res.ok) throw new Error(`Failed to list proxy hosts (${res.status})`);
  return res.json() as Promise<NpmProxyHost[]>;
}

/** Find the proxy host for a specific domain, or null if not registered. */
export async function npmFindHost(
  domain: string,
  token?: string,
): Promise<NpmProxyHost | null> {
  const hosts = await npmListHosts(token);
  return hosts.find((h) => h.domain_names.includes(domain)) ?? null;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Enable a proxy host by id. */
export async function npmEnableHost(id: number, token?: string): Promise<void> {
  const t    = token ?? await npmGetToken();
  const base = await resolveProxyHostsBase(t);
  const res  = await npmFetch(`${base}/${id}/enable`, { method: "POST" }, t);
  if (!res.ok) throw new Error(`Enable failed (${res.status})`);
}

/** Disable a proxy host by id. */
export async function npmDisableHost(id: number, token?: string): Promise<void> {
  const t    = token ?? await npmGetToken();
  const base = await resolveProxyHostsBase(t);
  const res  = await npmFetch(`${base}/${id}/disable`, { method: "POST" }, t);
  if (!res.ok) throw new Error(`Disable failed (${res.status})`);
}

/** Delete a proxy host by id. */
export async function npmDeleteHost(id: number, token?: string): Promise<void> {
  const t    = token ?? await npmGetToken();
  const base = await resolveProxyHostsBase(t);
  const res  = await npmFetch(`${base}/${id}`, { method: "DELETE" }, t);
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// ── Schema filter (NPM v2.13+ additionalProperties:false) ────────────────────
// NPM's AJV schema rejects PUT/POST bodies with unknown fields.  Strip any key
// that isn't part of the proxy-host write schema before sending.
const PROXY_HOST_WRITE_KEYS = new Set([
  "domain_names", "forward_scheme", "forward_host", "forward_port",
  "access_list_id", "certificate_id", "ssl_forced", "caching_enabled",
  "block_exploits", "advanced_config", "allow_websocket_upgrade",
  "http2_support", "enabled", "locations", "hsts_enabled", "hsts_subdomains",
  "meta",
]);

function sanitize(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => PROXY_HOST_WRITE_KEYS.has(k)),
  );
}

/** PUT update a proxy host by id. Caller supplies the full payload; unknown
 *  fields are stripped automatically to satisfy NPM v2.13+ schema validation. */
export async function npmUpdateHost(
  id:      number,
  payload: Record<string, unknown>,
  token?:  string,
  slow?:   boolean,
): Promise<NpmProxyHost> {
  const t       = token ?? await npmGetToken();
  const base    = await resolveProxyHostsBase(t);
  const timeout = slow ? SLOW_TIMEOUT_MS : TIMEOUT_MS;
  const res     = await npmFetch(`${base}/${id}`, {
    method: "PUT",
    body:   JSON.stringify(sanitize(payload)),
  }, t, timeout);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Update failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<NpmProxyHost>;
}

/** POST create a new proxy host. Caller supplies the full payload; unknown
 *  fields are stripped automatically to satisfy NPM v2.13+ schema validation. */
export async function npmCreateHost(
  payload: Record<string, unknown>,
  token?:  string,
  slow?:   boolean,
): Promise<NpmProxyHost> {
  const t       = token ?? await npmGetToken();
  const base    = await resolveProxyHostsBase(t);
  const timeout = slow ? SLOW_TIMEOUT_MS : TIMEOUT_MS;
  const res     = await npmFetch(base, {
    method: "POST",
    body:   JSON.stringify(sanitize(payload)),
  }, t, timeout);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Create failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<NpmProxyHost>;
}
