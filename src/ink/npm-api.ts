// tui/npm-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Nginx Proxy Manager REST API client.
//
// NPM's API is partially documented — the full schema lives at:
//   https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/schema/swagger.json
//
// Endpoints used here:
//   POST   /api/tokens                 — login → Bearer token
//   GET    /api/tokens                 — renew existing token
//   DELETE /api/tokens                 — logout
//   GET    /api/proxy-hosts            — list all proxy hosts
//   POST   /api/proxy-hosts            — create proxy host
//   PUT    /api/proxy-hosts/:id        — update proxy host
//   DELETE /api/proxy-hosts/:id        — delete proxy host
//   POST   /api/proxy-hosts/:id/enable — enable a disabled host
//   POST   /api/proxy-hosts/:id/disable— disable a host
//   GET    /api/certificates           — list all SSL certs
//
// Credentials are read from .env:
//   NPM_EMAIL=admin@unenter.live
//   NPM_PASSWORD=your-npm-password
//   NPM_LE_EMAIL=admin@unenter.live     (optional, defaults to NPM_EMAIL)
//
// Token is cached in memory with its expiry so the TUI doesn't re-auth on
// every operation. The cache is invalidated if a 401 is received.
// ─────────────────────────────────────────────────────────────────────────────

import { STACK_HOST, NPM_HOST } from "../config/stack.ts";
import type { Zone }            from "../config/zones.ts";

export type OnLine = (line: string) => void;

// ── API response types ────────────────────────────────────────────────────────

export interface NpmTokenResponse {
  token:   string;
  expires: string;  // ISO-8601
}

export interface NpmProxyHost {
  id:                     number;
  created_on:             string;
  modified_on:            string;
  domain_names:           string[];
  forward_scheme:         "http" | "https";
  forward_host:           string;
  forward_port:           number;
  forward_path:           string;
  enabled:                number;   // 1 | 0
  ssl_forced:             number;
  http2_support:          number;
  hsts_enabled:           number;
  allow_websocket_upgrade:number;
  block_exploits:         number;
  caching_enabled:        number;
  certificate_id:         number | string | null;
  certificate?:           NpmCertificate | null;
  access_list_id:         number | string;
  advanced_config:        string;
  meta:                   Record<string, unknown>;
  locations:              unknown[];
}

export interface NpmCertificate {
  id:         number;
  created_on: string;
  modified_on:string;
  provider:   "letsencrypt" | "other";
  nice_name:  string;
  domain_names: string[];
  expires_on: string | null;
  meta:       Record<string, unknown>;
}

export type NpmConnectStatus =
  | "connected"
  | "auth_error"
  | "api_error"
  | "unreachable"
  | "no_credentials";

export interface NpmStatus {
  status:     NpmConnectStatus;
  hostCount:  number;
  token:      string | null;
  error?:     string;
}

// ── In-memory token cache ─────────────────────────────────────────────────────

let _cachedToken:  string | null = null;
let _tokenExpires: Date   | null = null;

function tokenValid(): boolean {
  if (!_cachedToken || !_tokenExpires) return false;
  // Treat token as expired 60 s before actual expiry to avoid edge races
  return new Date() < new Date(_tokenExpires.getTime() - 60_000);
}

function clearTokenCache() {
  _cachedToken  = null;
  _tokenExpires = null;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

// Default timeout for fast NPM operations (auth, list, delete, enable/disable).
const TIMEOUT_MS = 6_000;

// Longer timeout for operations that can synchronously trigger Let's Encrypt
// issuance on the NPM side (create proxy host with certificate_id: "new",
// certificate create, cert renew).  LE HTTP-01 challenges + OCSP + save can
// easily take 30-60s on a cold run — 6s is nowhere near enough.
const SLOW_TIMEOUT_MS = 90_000;

async function npmFetch(
  path:    string,
  init:    RequestInit = {},
  token?:  string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${NPM_HOST.apiUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Return a valid Bearer token, using the cache when possible.
 * Throws a descriptive error if credentials are missing or NPM rejects them.
 */
export async function npmGetToken(): Promise<string> {
  if (tokenValid()) return _cachedToken!;

  if (!NPM_HOST.email || !NPM_HOST.password) {
    throw new Error(
      "NPM credentials missing.\n" +
      "  Add to .env:  NPM_EMAIL=admin@unenter.live\n" +
      "                NPM_PASSWORD=your-password"
    );
  }

  const res = await npmFetch("/tokens", {
    method: "POST",
    body:   JSON.stringify({ identity: NPM_HOST.email, secret: NPM_HOST.password }),
  });

  if (res.status === 401) {
    throw new Error("NPM rejected credentials — check NPM_EMAIL / NPM_PASSWORD in .env");
  }
  if (!res.ok) {
    throw new Error(`NPM auth failed (HTTP ${res.status})`);
  }

  const data = await res.json() as NpmTokenResponse;
  _cachedToken  = data.token;
  _tokenExpires = new Date(data.expires);
  return _cachedToken;
}

/** Invalidate cached token and log out from NPM (best-effort). */
export async function npmLogout(): Promise<void> {
  const t = _cachedToken;
  clearTokenCache();
  if (t) {
    await npmFetch("/tokens", { method: "DELETE" }, t).catch(() => {});
  }
}

// ── Connectivity check ────────────────────────────────────────────────────────

/**
 * Quick ping: is NPM reachable at all?
 * Does NOT authenticate — just hits the API root.
 */
export async function npmPing(): Promise<boolean> {
  try {
    const res = await npmFetch("/");
    // NPM returns 404 on /, which still means it's up
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Full NPM status: reachability + auth + host count.
 * Used by the NPM panel to render its header.
 */
export async function npmGetStatus(): Promise<NpmStatus> {
  if (!NPM_HOST.email || !NPM_HOST.password) {
    return { status: "no_credentials", hostCount: 0, token: null,
             error: "NPM_EMAIL / NPM_PASSWORD not set in .env" };
  }

  const reachable = await npmPing();
  if (!reachable) {
    return { status: "unreachable", hostCount: 0, token: null,
             error: `Cannot reach NPM at ${NPM_HOST.apiUrl}` };
  }

  let token: string;
  try {
    token = await npmGetToken();
  } catch (e) {
    clearTokenCache();
    return { status: "auth_error", hostCount: 0, token: null, error: String(e) };
  }

  try {
    const hosts = await npmListHosts(token);
    return { status: "connected", hostCount: hosts.length, token };
  } catch (e) {
    // Auth succeeded but a subsequent API call failed (e.g. 404 from /proxy-hosts).
    // This is an API-level error, not a credential error — show it as api_error so
    // the user knows their credentials are fine but something else is wrong
    // (NPM version mismatch, incomplete initialization, wrong path, etc.).
    return { status: "api_error", hostCount: 0, token: null, error: String(e) };
  }
}

// ── Proxy host operations ─────────────────────────────────────────────────────

// Cached base path for proxy-host endpoints.  NPM changed its API structure
// between major versions:
//   v2.x  →  /proxy-hosts
//   v3.x  →  /nginx/proxy-hosts    (entire nginx resource group moved)
// We discover once on first use and reuse for all subsequent calls so that
// list / create / enable / disable / delete all agree on the same base.
let cachedProxyHostsBase: string | null = null;

/**
 * Discover and cache the proxy-hosts base path for this NPM instance.
 * Probes with GET so we never accidentally create anything during discovery.
 */
async function resolveProxyHostsBase(token: string): Promise<string> {
  if (cachedProxyHostsBase) return cachedProxyHostsBase;

  const candidates = ["/nginx/proxy-hosts", "/proxy-hosts"];
  for (const base of candidates) {
    const res = await npmFetch(base, {}, token);
    if (res.status === 401) { clearTokenCache(); throw new Error("NPM token expired — re-auth required"); }
    if (res.status !== 404) { cachedProxyHostsBase = base; return base; }
  }
  throw new Error("NPM proxy-hosts endpoint not found (tried /nginx/proxy-hosts and /proxy-hosts)");
}

/** List all proxy hosts (with SSL cert details expanded when supported). */
export async function npmListHosts(token?: string): Promise<NpmProxyHost[]> {
  const t    = token ?? await npmGetToken();
  const base = await resolveProxyHostsBase(t);

  // Try ?expand=certificate first (v2.x richer response); fall back to plain.
  let res = await npmFetch(`${base}?expand=certificate`, {}, t);
  if (res.status === 401) { clearTokenCache(); throw new Error("NPM token expired — re-auth required"); }
  if (res.status === 404) res = await npmFetch(base, {}, t);

  if (!res.ok) throw new Error(`Failed to list proxy hosts (${res.status})`);
  return res.json() as Promise<NpmProxyHost[]>;
}

/** Find the proxy host entry for a specific domain, or null if not found. */
export async function npmFindHost(
  domain: string,
  token?: string
): Promise<NpmProxyHost | null> {
  const hosts = await npmListHosts(token);
  return hosts.find((h) => h.domain_names.includes(domain)) ?? null;
}

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

/** List all certificates. */
export async function npmListCerts(token?: string): Promise<NpmCertificate[]> {
  const t   = token ?? await npmGetToken();
  const res = await npmFetch("/certificates", {}, t);
  if (!res.ok) throw new Error(`Failed to list certs (${res.status})`);
  return res.json() as Promise<NpmCertificate[]>;
}

// ── Zone registration ─────────────────────────────────────────────────────────

/**
 * Register a zone in NPM:
 *   - Creates a proxy host: zone.domain → P0W3R:3080
 *   - Requests a Let's Encrypt certificate via NPM inline
 *   - Enables SSL forced redirect + HTTP/2 + WebSocket upgrade
 *
 * Idempotent: if the domain already has a host, reports it and exits cleanly.
 * Streams progress to onLine so the TUI overlay stays live.
 */
export async function npmAddZone(
  zone:   Zone,
  onLine: OnLine
): Promise<number> {
  const domain = zone.domain;

  onLine(`NPM      →  ${NPM_HOST.ip}:${NPM_HOST.port}`);
  onLine(`Zone     →  ${domain}`);
  onLine(`Forward  →  ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
  onLine("");

  // 1. Credential check
  if (!NPM_HOST.email || !NPM_HOST.password) {
    onLine("✗ NPM_EMAIL and NPM_PASSWORD must be set in .env");
    onLine(`  Open: ${NPM_HOST.uiUrl}`);
    return 1;
  }

  // 2. Connectivity
  onLine("Checking NPM connectivity...");
  const reachable = await npmPing();
  if (!reachable) {
    onLine(`✗ Cannot reach NPM at ${NPM_HOST.apiUrl}`);
    onLine("  Is L0VE (192.168.50.75) online?");
    return 1;
  }
  onLine("✓ NPM reachable");

  // 3. Authenticate
  onLine("Authenticating...");
  let token: string;
  try {
    token = await npmGetToken();
    onLine("✓ Token obtained");
  } catch (e) {
    onLine(`✗ ${String(e)}`);
    return 1;
  }

  // 4. Idempotency check
  onLine(`Checking if ${domain} is already registered...`);
  let existing: NpmProxyHost | null;
  try {
    existing = await npmFindHost(domain, token);
  } catch (e) {
    onLine(`✗ ${String(e)}`);
    return 1;
  }

  if (existing) {
    const sslLabel = existing.certificate_id ? "SSL ✓" : "no cert";
    const enabledLabel = existing.enabled ? "enabled" : "DISABLED";
    onLine(`✓ Already registered (host #${existing.id})  ·  ${sslLabel}  ·  ${enabledLabel}`);
    onLine(`  Review: ${NPM_HOST.uiUrl}`);
    return 0;
  }

  onLine(`Not found — creating proxy host...`);

  // 5. Cert email required for Let's Encrypt
  const leEmail = NPM_HOST.letsencryptEmail;
  if (!leEmail) {
    onLine("✗ NPM_LE_EMAIL or NPM_EMAIL must be set for Let's Encrypt");
    return 1;
  }

  // 6. Create
  //
  // NOTE on payload shape — NPM's backend validator (ajv w/ additionalProperties:
  // false) rejects any field not in its create schema.  Things to watch:
  //   · forward_path is NOT a create field (derived from scheme+host+port).
  //   · certificate_id: "new" triggers auto-Let's Encrypt issuance.
  //   · boolean flags are accepted but NPM internally stores as 0/1.
  //   · access_list_id must be a numeric id (0 = no list).
  const payload = {
    domain_names:            [domain],
    forward_scheme:          "http",
    forward_host:            STACK_HOST.ip,
    forward_port:            STACK_HOST.proxyPort,
    certificate_id:          "new",
    meta: {
      letsencrypt_email:     leEmail,
      letsencrypt_agree:     true,
      dns_challenge:         false,
    },
    ssl_forced:              true,
    http2_support:           true,
    allow_websocket_upgrade: true,
    block_exploits:          true,
    caching_enabled:         false,
    hsts_enabled:            false,
    hsts_subdomains:         false,
    access_list_id:          0,
    advanced_config:         "",
    locations:               [],
  };

  onLine("  (this may take 30-60s — Let's Encrypt HTTP-01 challenge runs server-side)");
  let createRes: Response;
  try {
    const base = await resolveProxyHostsBase(token);
    createRes = await npmFetch(base, {
      method: "POST",
      body:   JSON.stringify(payload),
    }, token, SLOW_TIMEOUT_MS);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("AbortError")) {
      onLine(`✗ Request timed out after ${SLOW_TIMEOUT_MS / 1000}s`);
      onLine("  NPM may still be processing — check the UI, the host might appear shortly.");
    } else {
      onLine(`✗ Network error: ${msg}`);
    }
    return 1;
  }

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    onLine(`✗ NPM error (${createRes.status}): ${text}`);
    onLine("");
    if (createRes.status === 400) {
      // Schema-validation errors from NPM's ajv — almost always a payload mismatch
      // between what we send and what NPM's proxy-host create schema allows.
      onLine("Schema validation failed — payload shape likely wrong for this NPM version.");
      onLine("Fields we sent: " + Object.keys(payload).join(", "));
    } else {
      onLine("Common causes:");
      onLine("  · DNS for this domain not yet pointing to NPM's IP");
      onLine("  · Let's Encrypt rate limit — wait or use staging");
      onLine(`  · Review NPM logs: ${NPM_HOST.uiUrl}`);
    }
    return 1;
  }

  const created = await createRes.json() as NpmProxyHost;
  onLine(`✓ Proxy host created  (id #${created.id})`);
  onLine(`✓ Let's Encrypt cert requested`);
  onLine("");
  onLine(`  ${domain}  →  ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
  onLine("  SSL forced · HTTP/2 · WebSocket upgrade · exploit blocking");
  onLine("");
  onLine(`  Review: ${NPM_HOST.uiUrl}`);
  return 0;
}
