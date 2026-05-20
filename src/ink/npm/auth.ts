// src/ink/npm/auth.ts
// Token lifecycle: acquire, cache, invalidate, logout.
// Also: connectivity ping and full status probe.

import { NPM_HOST }                    from "../../config/stack.ts";
import { npmFetch }                    from "./client.ts";
import { npmListHosts }                from "./hosts.ts";
import type { NpmTokenResponse, NpmStatus } from "./types.ts";

// ── In-memory token cache ─────────────────────────────────────────────────────

let _cachedToken:  string | null = null;
let _tokenExpires: Date   | null = null;

function tokenValid(): boolean {
  if (!_cachedToken || !_tokenExpires) return false;
  // Expire 60s early to avoid edge races
  return new Date() < new Date(_tokenExpires.getTime() - 60_000);
}

export function clearTokenCache(): void {
  _cachedToken  = null;
  _tokenExpires = null;
}

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Return a valid Bearer token, using the in-memory cache when possible.
 * Throws a descriptive error if credentials are missing or NPM rejects them.
 */
export async function npmGetToken(): Promise<string> {
  if (tokenValid()) return _cachedToken!;

  if (!NPM_HOST.email || !NPM_HOST.password) {
    throw new Error(
      "NPM credentials missing.\n" +
      "  Add to .env:  NPM_EMAIL=admin@<your-domain>\n" +
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

  const data    = await res.json() as NpmTokenResponse;
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

// ── Connectivity ──────────────────────────────────────────────────────────────

/** Quick ping — does NOT authenticate. Returns false on any network error. */
export async function npmPing(): Promise<boolean> {
  try {
    const res = await npmFetch("/");
    return res.status < 500; // NPM returns 404 on /, which still means it's up
  } catch {
    return false;
  }
}

/**
 * Full status probe: reachability + auth + host count.
 * Used by the NPM panel header.
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
    // Auth succeeded but a subsequent call failed — API-level issue, not creds.
    return { status: "api_error", hostCount: 0, token: null, error: String(e) };
  }
}
